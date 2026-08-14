/**
 * Merge Products — for duplicate catalog entries that are the same physical drug
 * (e.g. "EMBETA XR 50 mg Tablet (30 Tab)" and "EMBETA XR 50MG - 30 TAB", created by two
 * distributors' differently-worded OCR text; Product.nameNormalized only catches
 * case/whitespace variants, not wording differences like a missing "Tablet").
 *
 * The user picks a surviving product and a duplicate. Every ProductBatch on the
 * duplicate moves to the survivor (topping up if the survivor already has a matching
 * batch, same convention as batchService's purchase-line upserts). Every BillItem/
 * SaleItem referencing the duplicate is remapped. The duplicate is archived — isActive
 * set to false, never deleted — with mergedIntoProductId/mergedAt recording the merge
 * for audit purposes.
 */

const prisma = require('../models/prisma');
const { syncProductStock } = require('./batchService');

async function mergeProducts(userId, survivorId, duplicateId) {
  if (survivorId === duplicateId) {
    throw new Error('Cannot merge a product into itself');
  }

  const [survivor, duplicate] = await Promise.all([
    prisma.product.findFirst({ where: { id: survivorId, userId } }),
    prisma.product.findFirst({ where: { id: duplicateId, userId } }),
  ]);

  if (!survivor) throw new Error('Surviving product not found');
  if (!duplicate) throw new Error('Duplicate product not found');
  if (!survivor.isActive) throw new Error('Surviving product is archived — pick an active product to keep');
  if (!duplicate.isActive) throw new Error('Duplicate product is already archived (possibly from a previous merge)');

  const result = await prisma.$transaction(async (tx) => {
    const [survivorBatches, duplicateBatches] = await Promise.all([
      tx.productBatch.findMany({ where: { productId: survivorId } }),
      tx.productBatch.findMany({ where: { productId: duplicateId } }),
    ]);

    const survivorBatchByNorm = new Map(survivorBatches.map((b) => [b.batchNumberNormalized, b]));

    let batchesMoved = 0;
    let batchesToppedUp = 0;
    let saleItemsRepointed = 0;

    for (const dupBatch of duplicateBatches) {
      const match = survivorBatchByNorm.get(dupBatch.batchNumberNormalized);

      if (match) {
        // Same physical batch already exists on the survivor — top it up rather than
        // creating a second row, same convention as batchService.upsertBatchesFromBillItems.
        await tx.productBatch.update({
          where: { id: match.id },
          data: {
            quantityBase: { increment: dupBatch.quantityBase },
            expiryDate: match.expiryDate ?? dupBatch.expiryDate,
            mrp: match.mrp ?? dupBatch.mrp,
            purchaseRate: match.purchaseRate ?? dupBatch.purchaseRate,
          },
        });

        const repointed = await tx.saleItem.updateMany({
          where: { productBatchId: dupBatch.id },
          data: { productId: survivorId, productBatchId: match.id },
        });
        saleItemsRepointed += repointed.count;

        await tx.productBatch.update({
          where: { id: dupBatch.id },
          data: { isArchived: true, quantityBase: 0 },
        });
        batchesToppedUp++;
      } else {
        // No collision — just reparent the batch row itself, no data movement needed.
        await tx.productBatch.update({
          where: { id: dupBatch.id },
          data: { productId: survivorId },
        });
        const repointed = await tx.saleItem.updateMany({
          where: { productBatchId: dupBatch.id },
          data: { productId: survivorId },
        });
        saleItemsRepointed += repointed.count;
        batchesMoved++;
      }
    }

    const billItemsRepointed = await tx.billItem.updateMany({
      where: { productId: duplicateId },
      data: { productId: survivorId },
    });

    // Catch-all: any SaleItem still pointing at the duplicate (shouldn't remain after
    // the batch loop above, but cheap and harmless to guarantee no reference survives).
    const remainingSaleItems = await tx.saleItem.updateMany({
      where: { productId: duplicateId },
      data: { productId: survivorId },
    });
    saleItemsRepointed += remainingSaleItems.count;

    await tx.product.update({
      where: { id: duplicateId },
      data: {
        isActive: false,
        mergedIntoProductId: survivorId,
        mergedAt: new Date(),
      },
    });

    await syncProductStock(tx, [survivorId, duplicateId]);

    const updatedSurvivor = await tx.product.findUnique({ where: { id: survivorId } });

    return {
      survivor: updatedSurvivor,
      stats: {
        batchesMoved,
        batchesToppedUp,
        saleItemsRepointed,
        billItemsRepointed: billItemsRepointed.count,
      },
    };
  });

  return result;
}

/**
 * Suggest merge candidates: active products whose nameNormalized values are close
 * enough to plausibly be the same drug (same prefix, or one contains the other) but
 * not already identical (identical nameNormalized can't happen — that's enforced by
 * the unique constraint). Deliberately cheap/heuristic — this is a starting point for
 * the user to review, never an automatic merge.
 */
async function suggestMergeCandidates(userId) {
  const products = await prisma.product.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, nameNormalized: true, stock: true },
    orderBy: { name: 'asc' },
  });

  const suggestions = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];
      if (a.nameNormalized === b.nameNormalized) continue; // can't happen, defensive
      const shorter = a.nameNormalized.length <= b.nameNormalized.length ? a : b;
      const longer = shorter === a ? b : a;
      if (longer.nameNormalized.includes(shorter.nameNormalized) && shorter.nameNormalized.length >= 6) {
        suggestions.push({ a, b });
      }
    }
  }
  return suggestions;
}

module.exports = { mergeProducts, suggestMergeCandidates };
