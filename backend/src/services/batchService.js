const prisma = require('../models/prisma');
const { parseExpiryToUtcDate } = require('../utils/dateUtils');

/**
 * Batch Service
 * Batch-level stock (ProductBatch) — the source of truth for FEFO picking and
 * recall traceability.
 *
 * Core rules (project-wide, do not violate):
 *   - All stock math is in BASE units (tablets/ml/pieces). Packs are display only.
 *   - Batch numbers are stored verbatim; never auto-corrected, auto-filled or cleaned.
 *   - Stock may go negative: a mismatch warns, it never blocks a sale at the counter.
 *   - Archive, never delete.
 */

// Floating-point base units (loose sale of 2.5ml is legitimate) need rounding on every
// write, or repeated deductions drift into 4.999999999 territory.
function round3(n) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

// Matching/dedup key only — never displayed. batchNumber itself always stays verbatim.
function normalizeBatchNumber(batchNumber) {
  return (batchNumber || '').trim().toLowerCase();
}

/**
 * FEFO order: earliest expiry first, undated batches last (they can't be ranked, so
 * they must never jump ahead of a batch with a known expiry), oldest row as tiebreak.
 */
function compareFefo(a, b) {
  const aExp = a.expiryDate ? new Date(a.expiryDate).getTime() : null;
  const bExp = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
  if (aExp !== null && bExp !== null && aExp !== bExp) return aExp - bExp;
  if (aExp !== null && bExp === null) return -1;
  if (aExp === null && bExp !== null) return 1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/**
 * Render a base-unit quantity the way the pharmacist counts it on the shelf.
 * Loose quantities stay loose: 5 tablets out of a 10-tablet strip reads "5 tablets",
 * never "0.5 strip".
 */
function formatQuantity(quantityBase, { packSize = 1, packLabel = 'pack', baseUnit = 'unit' } = {}) {
  const qty = round3(quantityBase || 0);
  const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;

  if (!packSize || packSize <= 1) return plural(qty, baseUnit);

  // Negative (stock mismatch) reads far clearer as a plain base-unit shortfall
  if (qty < 0) return plural(qty, baseUnit);

  const packs = Math.floor(qty / packSize);
  const loose = round3(qty - packs * packSize);

  if (packs === 0) return plural(loose, baseUnit);
  if (loose === 0) return plural(packs, packLabel);
  return `${plural(packs, packLabel)} + ${plural(loose, baseUnit)}`;
}

/**
 * All non-archived batches for a product in FEFO order, each with its remaining quantity.
 * The pharmacist must always be able to see which physical strip to pick from, so batches
 * are never hidden — empty ones are returned too, just flagged.
 */
async function getProductBatches(productId, { includeArchived = false } = {}) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true, name: true, packSize: true, packLabel: true, baseUnit: true,
      scheduleFlag: true, mrp: true, defaultMrp: true, sellingRate: true,
    },
  });
  if (!product) throw new Error('Product not found');

  const batches = await prisma.productBatch.findMany({
    where: { productId, ...(includeArchived ? {} : { isArchived: false }) },
  });

  const packInfo = {
    packSize: product.packSize,
    packLabel: product.packLabel,
    baseUnit: product.baseUnit,
  };

  const sorted = batches.sort(compareFefo).map((batch) => ({
    ...batch,
    quantityBase: round3(batch.quantityBase),
    quantityLabel: formatQuantity(batch.quantityBase, packInfo),
    isEmpty: batch.quantityBase <= 0,
  }));

  const totalStock = round3(sorted.reduce((sum, b) => sum + b.quantityBase, 0));

  return {
    product: {
      ...product,
      totalStock,
      stockLabel: formatQuantity(totalStock, packInfo),
    },
    batches: sorted,
  };
}

/**
 * Plan how a requested quantity is drawn from a product's batches, FEFO by default.
 *
 * - `preferredBatchId` (the pharmacist overriding the FEFO suggestion) is drawn first,
 *   then the remainder continues down the FEFO chain.
 * - If demand outruns every batch that has stock, the shortfall lands on the last batch
 *   drawn from, pushing it negative. That is deliberate: a blocked sale means the
 *   pharmacist stops using the app. The caller surfaces the warning.
 *
 * Returns { allocations: [{ productBatchId, quantityBase, ... }], warnings: [] }.
 */
async function planAllocation(productId, quantityBase, { preferredBatchId = null } = {}) {
  const requested = round3(quantityBase);
  if (!(requested > 0)) throw new Error('Quantity must be greater than zero');

  const { product, batches } = await getProductBatches(productId);

  if (batches.length === 0) {
    throw new Error(
      `"${product.name}" has no batches on record. Add a batch (or confirm a purchase bill) before selling it.`
    );
  }

  // Draw from the override first, then everything else in FEFO order.
  const ordered = preferredBatchId
    ? [
        ...batches.filter((b) => b.id === preferredBatchId),
        ...batches.filter((b) => b.id !== preferredBatchId),
      ]
    : batches;

  if (preferredBatchId && !batches.some((b) => b.id === preferredBatchId)) {
    throw new Error('Selected batch does not belong to this product');
  }

  const allocations = [];
  const warnings = [];
  let remaining = requested;

  for (const batch of ordered) {
    if (remaining <= 0) break;
    const available = batch.quantityBase;
    if (available <= 0) continue; // never auto-draw from an already-empty batch

    const take = round3(Math.min(available, remaining));
    allocations.push({
      productBatchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantityBase: take,
      availableBefore: available,
    });
    remaining = round3(remaining - take);
  }

  if (remaining > 0) {
    // Oversell. Push the shortfall onto the batch we were last drawing from, or — if
    // every batch was already empty — onto the FEFO-first batch.
    const target = allocations[allocations.length - 1];
    if (target) {
      target.quantityBase = round3(target.quantityBase + remaining);
    } else {
      const fallback = ordered[0];
      allocations.push({
        productBatchId: fallback.id,
        batchNumber: fallback.batchNumber,
        expiryDate: fallback.expiryDate,
        quantityBase: remaining,
        availableBefore: fallback.quantityBase,
      });
    }
    warnings.push(
      `Stock mismatch: ${product.name} is short by ${formatQuantity(remaining, product)} — update purchase bills.`
    );
  }

  return {
    product,
    allocations,
    warnings,
    isSplit: allocations.length > 1,
  };
}

/**
 * Apply a set of {productBatchId, quantityBase} deductions.
 * `sign` is -1 to deduct (sale) and +1 to restore (archive).
 * Must be called with a transaction client so stock movement and the sale commit together.
 */
async function applyBatchDeltas(tx, allocations, sign) {
  for (const allocation of allocations) {
    // Atomic increment rather than read-then-write: two sales of the same batch
    // committing at once would otherwise lose one of the deductions. A negative
    // increment is a decrement, and the column is deliberately allowed to go below
    // zero (stock mismatch warns, never blocks).
    await tx.productBatch.update({
      where: { id: allocation.productBatchId },
      data: { quantityBase: { increment: round3(sign * allocation.quantityBase) } },
    });
  }
}

/**
 * Recompute the derived Product.stock display value from its batches.
 * Sales code never writes Product.stock directly — it only ever lands here.
 */
async function syncProductStock(tx, productIds) {
  const unique = [...new Set(productIds)];
  for (const productId of unique) {
    const aggregate = await tx.productBatch.aggregate({
      where: { productId, isArchived: false },
      _sum: { quantityBase: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: { stock: round3(aggregate._sum.quantityBase || 0) },
    });
  }
}

/**
 * Bill confirm hook: bring purchased quantities into batch-level stock.
 *
 * Matches on (productId, batchNumber) and ADDS the purchased quantity, so re-buying the
 * same batch tops it up instead of creating a duplicate. Batch numbers are used exactly
 * as they came off the bill — no cleaning, no auto-fill.
 *
 * Quantity on a purchase line is in packs, so it is converted to base units via packSize.
 */
async function upsertBatchesFromBillItems(userId, billItems) {
  const results = { created: 0, toppedUp: 0, skipped: 0, errors: [] };
  const touchedProductIds = [];

  for (const item of billItems) {
    // A batch row is meaningless without a batch number — that is the physical identity
    // the pharmacist reads off the strip, and we are not allowed to invent one.
    const batchNumber = (item.batchNumber || '').trim();
    if (!item.productId || !batchNumber) {
      results.skipped++;
      continue;
    }

    try {
      const product = await prisma.product.findFirst({
        where: { id: item.productId, userId },
        select: { id: true, packSize: true },
      });
      if (!product) {
        results.skipped++;
        continue;
      }

      const packs = Number(item.quantity) || 0;
      const free = Number(item.freeQuantity) || 0;
      const quantityBase = round3((packs + free) * (product.packSize || 1));
      const expiryDate = parseExpiryToUtcDate(item.expiryDate);
      const batchNumberNormalized = normalizeBatchNumber(batchNumber);

      const existing = await prisma.productBatch.findUnique({
        where: { productId_batchNumberNormalized: { productId: product.id, batchNumberNormalized } },
      });

      if (existing) {
        await prisma.productBatch.update({
          where: { id: existing.id },
          data: {
            // Atomic, so re-confirming two bills at once cannot lose a top-up
            quantityBase: { increment: quantityBase },
            // Only fill gaps — never overwrite data the user may have corrected by hand
            expiryDate: existing.expiryDate ?? expiryDate,
            mrp: existing.mrp ?? (item.mrp ?? null),
            purchaseRate: existing.purchaseRate ?? (item.rate || null),
          },
        });
        results.toppedUp++;
      } else {
        await prisma.productBatch.create({
          data: {
            productId: product.id,
            batchNumber, // verbatim
            batchNumberNormalized,
            expiryDate,
            quantityBase,
            mrp: item.mrp ?? null,
            purchaseRate: item.rate || null,
            sourceBillItemId: item.id || null,
          },
        });
        results.created++;
      }

      touchedProductIds.push(product.id);
    } catch (error) {
      results.errors.push({ itemName: item.name, error: error.message });
    }
  }

  if (touchedProductIds.length > 0) {
    await syncProductStock(prisma, touchedProductIds);
  }

  return results;
}

/**
 * Create or update a batch by hand (user override — always available).
 */
async function upsertBatchManually(userId, productId, data) {
  const product = await prisma.product.findFirst({ where: { id: productId, userId } });
  if (!product) throw new Error('Product not found');

  const batchNumber = (data.batchNumber || '').trim();
  if (!batchNumber) throw new Error('Batch number is required');
  const batchNumberNormalized = normalizeBatchNumber(batchNumber);

  const expiryDate = data.expiryDate ? parseExpiryToUtcDate(data.expiryDate) : null;
  const quantityBase = data.quantityBase !== undefined ? round3(Number(data.quantityBase) || 0) : 0;

  const batch = await prisma.productBatch.upsert({
    where: { productId_batchNumberNormalized: { productId, batchNumberNormalized } },
    create: {
      productId,
      batchNumber,
      batchNumberNormalized,
      expiryDate,
      quantityBase,
      mrp: data.mrp != null ? Number(data.mrp) : null,
      purchaseRate: data.purchaseRate != null ? Number(data.purchaseRate) : null,
    },
    update: {
      ...(data.expiryDate !== undefined && { expiryDate }),
      ...(data.quantityBase !== undefined && { quantityBase }),
      ...(data.mrp !== undefined && { mrp: data.mrp != null ? Number(data.mrp) : null }),
      ...(data.purchaseRate !== undefined && {
        purchaseRate: data.purchaseRate != null ? Number(data.purchaseRate) : null,
      }),
    },
  });

  await syncProductStock(prisma, [productId]);
  return batch;
}

/**
 * Archive a batch (never delete — sold-from batches must stay traceable).
 */
async function archiveBatch(batchId, isArchived = true) {
  const batch = await prisma.productBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error('Batch not found');

  const updated = await prisma.productBatch.update({
    where: { id: batchId },
    data: { isArchived },
  });
  await syncProductStock(prisma, [batch.productId]);
  return updated;
}

module.exports = {
  round3,
  normalizeBatchNumber,
  compareFefo,
  formatQuantity,
  getProductBatches,
  planAllocation,
  applyBatchDeltas,
  syncProductStock,
  upsertBatchesFromBillItems,
  upsertBatchManually,
  archiveBatch,
};
