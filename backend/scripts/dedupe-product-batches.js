/**
 * Dedup: merge ProductBatch rows that are the same physical batch but differ only by
 * case/whitespace in batchNumber (e.g. "V2600095" vs "v2600095 ").
 *
 * Context: ProductBatch.batchNumber matching used to be a case-sensitive exact-string
 * lookup (Postgres default collation), so an OCR/manual re-entry of the same batch with
 * different casing silently created a second ProductBatch row instead of topping up the
 * existing one — see backend/scripts/diagnose-embeta50.js for the investigation that
 * found this. As of migration 20260814090000_normalize_batch_numbers, matching goes
 * through a normalized (trim + lowercase) column with its own unique constraint, so this
 * class of duplicate can no longer be created going forward. This script is for any
 * duplicates that predate that fix.
 *
 * For each duplicate group (same productId + normalized batch number):
 *   - The earliest-created row survives, keeping its own batchNumber casing (never
 *     rewritten — batch numbers are stored verbatim, first-entered wins).
 *   - Its quantityBase becomes the SUM across the group (archived rows excluded from the
 *     sum only if BOTH the row is archived AND its quantity is 0 — an archived row that
 *     still carries quantity is a real discrepancy, not just bookkeeping, so it's folded
 *     in and flagged for review rather than silently dropped).
 *   - Gaps (null expiryDate/mrp/purchaseRate) on the survivor are filled from the other
 *     rows, never overwriting a value the survivor already has.
 *   - Any SaleItem pointing at a losing row is repointed to the survivor first (required —
 *     SaleItem.productBatchId is onDelete: Restrict, so a sold-from batch can't be
 *     removed out from under its sale history).
 *   - Losing rows are archived (isArchived: true, quantityBase: 0) — never deleted, so
 *     their id and sourceBillItemId stay resolvable for anything that already reference
 *     them.
 *   - Product.stock is resynced afterward for every touched product.
 *
 * Usage:
 *   node scripts/dedupe-product-batches.js           # apply
 *   node scripts/dedupe-product-batches.js --dry-run  # report only, no writes
 */

const prisma = require('../src/models/prisma');
const { normalizeBatchNumber, round3, syncProductStock } = require('../src/services/batchService');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[dedupe-batches] Starting${DRY_RUN ? ' (DRY RUN — no writes)' : ''}...`);

  const allBatches = await prisma.productBatch.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map(); // `${productId}::${normalized}` -> rows[]
  for (const batch of allBatches) {
    const key = `${batch.productId}::${normalizeBatchNumber(batch.batchNumber)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(batch);
  }

  const stats = { groupsScanned: groups.size, duplicateGroups: 0, rowsMerged: 0, saleItemsRepointed: 0 };
  const touchedProductIds = new Set();

  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    stats.duplicateGroups++;

    const [survivor, ...losers] = rows; // earliest createdAt first
    const mergedQuantity = round3(rows.reduce((sum, r) => sum + r.quantityBase, 0));

    console.log(`\n[dedupe-batches] Merging ${rows.length} rows for product ${survivor.productId}, batch "${survivor.batchNumber}":`);
    console.log(`   survivor: id=${survivor.id} batchNumber="${survivor.batchNumber}" qty=${survivor.quantityBase}`);
    for (const loser of losers) {
      console.log(`   merging in: id=${loser.id} batchNumber="${loser.batchNumber}" qty=${loser.quantityBase} archived=${loser.isArchived}`);
    }
    console.log(`   -> merged quantity: ${mergedQuantity}`);

    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        for (const loser of losers) {
          const repointed = await tx.saleItem.updateMany({
            where: { productBatchId: loser.id },
            data: { productBatchId: survivor.id },
          });
          stats.saleItemsRepointed += repointed.count;
        }

        await tx.productBatch.update({
          where: { id: survivor.id },
          data: {
            quantityBase: mergedQuantity,
            expiryDate: survivor.expiryDate ?? losers.find((l) => l.expiryDate)?.expiryDate ?? null,
            mrp: survivor.mrp ?? losers.find((l) => l.mrp != null)?.mrp ?? null,
            purchaseRate: survivor.purchaseRate ?? losers.find((l) => l.purchaseRate != null)?.purchaseRate ?? null,
          },
        });

        for (const loser of losers) {
          await tx.productBatch.update({
            where: { id: loser.id },
            data: { isArchived: true, quantityBase: 0 },
          });
        }
      });
    }

    touchedProductIds.add(survivor.productId);
    stats.rowsMerged += losers.length;
  }

  if (!DRY_RUN && touchedProductIds.size > 0) {
    await syncProductStock(prisma, [...touchedProductIds]);
  }

  console.log('\n[dedupe-batches] ===== SUMMARY =====');
  console.log(`  Batch groups scanned:      ${stats.groupsScanned}`);
  console.log(`  Duplicate groups found:    ${stats.duplicateGroups}`);
  console.log(`  Rows merged away:          ${stats.rowsMerged}`);
  console.log(`  SaleItem rows repointed:   ${stats.saleItemsRepointed}`);
  console.log('\n[dedupe-batches] Done.');
}

main()
  .catch((error) => {
    console.error('[dedupe-batches] FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
