/**
 * Whole-bill edit (P5) — a saved Bill's header and BillItem lines are editable, not
 * just at OCR-confirm time. Date/batch-string edits don't touch stock math directly but
 * do flow through to the corresponding ProductBatch (expiry/batch-number correction);
 * quantity edits adjust ProductBatch.quantityBase transactionally with a negative-stock
 * warning (never a block) if the batch was already sold from. Every edit writes a
 * BillEditLog row — archive-never-delete applies to history: this table is only ever
 * inserted into.
 */

const prisma = require('../models/prisma');
const { parseExpiryToUtcDate } = require('../utils/dateUtils');
const { normalizeBatchNumber, round3, syncProductStock } = require('./batchService');

function toLogValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Diff `changes` against `current`, returning [{ field, oldValue, newValue }] for
 * fields that actually changed. Only fields present as keys in `changes` are compared.
 */
function diffFields(current, changes, fields) {
  const diffs = [];
  for (const field of fields) {
    if (!(field in changes)) continue;
    const oldVal = toLogValue(current[field]);
    const newVal = toLogValue(changes[field]);
    if (oldVal !== newVal) {
      diffs.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return diffs;
}

/**
 * Edit the bill header — invoiceNumber, invoiceDate, dueDate, distributorId.
 * Date correction is the most common real-world edit, so this is deliberately a single
 * cheap call: pass just `{ invoiceDate: '...' }` for the fast path.
 *
 * Matches the rest of billController's existing bill-specific routes (PUT /:billId,
 * DELETE /:billId, etc.), which scope by billId alone with no separate userId filter —
 * this doesn't introduce a stricter model than the rest of the app already has.
 */
async function updateBillHeader(billId, changes) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');

  const data = {};
  if ('invoiceNumber' in changes) data.invoiceNumber = changes.invoiceNumber?.trim() || null;
  if ('invoiceDate' in changes) {
    data.invoiceDate = changes.invoiceDate ? new Date(changes.invoiceDate) : null;
  }
  if ('dueDate' in changes) {
    data.dueDate = changes.dueDate ? new Date(changes.dueDate) : null;
  }
  if ('distributorId' in changes) data.distributorId = changes.distributorId || null;

  const diffs = diffFields(bill, data, ['invoiceNumber', 'invoiceDate', 'dueDate', 'distributorId']);
  if (diffs.length === 0) {
    return { bill, diffs: [] };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBill = await tx.bill.update({ where: { id: billId }, data });
    await tx.billEditLog.createMany({
      data: diffs.map((d) => ({ billId, field: d.field, oldValue: d.oldValue, newValue: d.newValue })),
    });
    return updatedBill;
  });

  // Ledger status (paid/overdue) is computed live from Bill.dueDate on every read
  // (see ledgerService.computeBillStatus) — no cache to invalidate here.
  return { bill: updated, diffs };
}

/**
 * Edit a single BillItem — name, productId (re-link to a different catalog product),
 * batchNumber, expiryDate, quantity, mrp, rate.
 * Propagates batch/expiry corrections and quantity deltas to the linked ProductBatch
 * (matched via the item's CURRENT batch number, before the edit) inside one transaction.
 */
async function updateBillItem(billItemId, changes) {
  const billItem = await prisma.billItem.findUnique({
    where: { id: billItemId },
    include: { bill: true, product: true },
  });
  if (!billItem) throw new Error('Bill item not found');

  const data = {};
  if ('name' in changes) data.name = changes.name?.trim() || billItem.name;
  if ('manufacturer' in changes) data.manufacturer = changes.manufacturer?.trim() || null;
  if ('productId' in changes) data.productId = changes.productId || null;
  if ('batchNumber' in changes) data.batchNumber = changes.batchNumber?.trim() || null;
  if ('expiryDate' in changes) data.expiryDate = changes.expiryDate?.trim() || null;
  if ('quantity' in changes) data.quantity = changes.quantity != null ? parseFloat(changes.quantity) : billItem.quantity;
  if ('mrp' in changes) data.mrp = changes.mrp != null ? parseFloat(changes.mrp) : null;
  if ('rate' in changes) data.rate = changes.rate != null ? parseFloat(changes.rate) : billItem.rate;

  let newProduct = null;
  if ('productId' in changes && data.productId) {
    newProduct = await prisma.product.findFirst({
      where: { id: data.productId, userId: billItem.bill.userId },
    });
    if (!newProduct) throw new Error('Selected product not found');
  }

  const diffs = diffFields(billItem, data, ['name', 'manufacturer', 'productId', 'batchNumber', 'expiryDate', 'quantity', 'mrp', 'rate']);
  if (diffs.length === 0) {
    return { billItem, diffs: [], warnings: [] };
  }

  // Log the product re-link by name, not by cuid — that's what a human reads in the
  // edit history.
  const productDiff = diffs.find((d) => d.field === 'productId');
  if (productDiff) {
    productDiff.oldValue = billItem.product?.name || '(no linked product)';
    productDiff.newValue = newProduct?.name || '(unlinked)';
  }

  const warnings = [];
  const productChanged = 'productId' in changes && data.productId !== billItem.productId;
  const batchChanged = 'batchNumber' in changes && data.batchNumber !== billItem.batchNumber;
  const expiryChanged = 'expiryDate' in changes && data.expiryDate !== billItem.expiryDate;
  const quantityChanged = 'quantity' in changes && data.quantity !== billItem.quantity;

  const result = await prisma.$transaction(async (tx) => {
    // ── Re-link to a different catalog product: move this line's own contribution off
    // the old product's batch and onto the new product's (matching) batch. Mirrors
    // productMergeService's batch-move convention, scoped to just this one purchase line. ──
    let workingProductId = billItem.productId;
    if (productChanged) {
      const oldNormalized = normalizeBatchNumber(billItem.batchNumber);
      const oldProduct = billItem.product;
      const itemBaseQty = round3((billItem.quantity || 0) * (oldProduct?.packSize || 1));

      const oldLinkedBatch = billItem.productId && oldNormalized
        ? await tx.productBatch.findUnique({
            where: { productId_batchNumberNormalized: { productId: billItem.productId, batchNumberNormalized: oldNormalized } },
          })
        : null;

      if (oldLinkedBatch) {
        const ownedSolelyByThisItem = oldLinkedBatch.sourceBillItemId === billItem.id;

        if (data.productId) {
          const destBatch = oldNormalized
            ? await tx.productBatch.findUnique({
                where: { productId_batchNumberNormalized: { productId: data.productId, batchNumberNormalized: oldNormalized } },
              })
            : null;

          if (ownedSolelyByThisItem) {
            // Whole batch is this item's own purchase — reparent it entirely.
            if (destBatch) {
              await tx.saleItem.updateMany({
                where: { productBatchId: oldLinkedBatch.id },
                data: { productId: data.productId, productBatchId: destBatch.id },
              });
              await tx.productBatch.update({
                where: { id: destBatch.id },
                data: {
                  quantityBase: { increment: oldLinkedBatch.quantityBase },
                  expiryDate: destBatch.expiryDate ?? oldLinkedBatch.expiryDate,
                  mrp: destBatch.mrp ?? oldLinkedBatch.mrp,
                  purchaseRate: destBatch.purchaseRate ?? oldLinkedBatch.purchaseRate,
                },
              });
              await tx.productBatch.update({
                where: { id: oldLinkedBatch.id },
                data: { isArchived: true, quantityBase: 0, sourceBillItemId: null },
              });
            } else {
              await tx.productBatch.update({ where: { id: oldLinkedBatch.id }, data: { productId: data.productId } });
              await tx.saleItem.updateMany({ where: { productBatchId: oldLinkedBatch.id }, data: { productId: data.productId } });
            }
          } else {
            // Shared batch — pull only this item's own contribution across.
            const projected = round3(oldLinkedBatch.quantityBase - itemBaseQty);
            await tx.productBatch.update({ where: { id: oldLinkedBatch.id }, data: { quantityBase: projected } });
            if (projected < 0) {
              warnings.push(
                `Moving "${billItem.name}" off batch ${oldLinkedBatch.batchNumber} pushed the old product's stock below zero ` +
                `(${projected}) — it was already sold from beyond this line's share. Stock is not blocked, but review it.`
              );
            }

            if (destBatch) {
              await tx.productBatch.update({
                where: { id: destBatch.id },
                data: {
                  quantityBase: { increment: itemBaseQty },
                  expiryDate: destBatch.expiryDate ?? oldLinkedBatch.expiryDate,
                  mrp: destBatch.mrp ?? oldLinkedBatch.mrp,
                  purchaseRate: destBatch.purchaseRate ?? oldLinkedBatch.purchaseRate,
                },
              });
            } else {
              await tx.productBatch.create({
                data: {
                  productId: data.productId,
                  batchNumber: oldLinkedBatch.batchNumber,
                  batchNumberNormalized: oldNormalized,
                  expiryDate: oldLinkedBatch.expiryDate,
                  quantityBase: itemBaseQty,
                  mrp: oldLinkedBatch.mrp,
                  purchaseRate: oldLinkedBatch.purchaseRate,
                  sourceBillItemId: billItem.id,
                },
              });
            }
          }
        } else if (ownedSolelyByThisItem) {
          // Unlinking entirely (productId cleared) and this item owned the batch outright.
          await tx.productBatch.update({ where: { id: oldLinkedBatch.id }, data: { isArchived: true, quantityBase: 0 } });
        } else {
          const projected = round3(oldLinkedBatch.quantityBase - itemBaseQty);
          await tx.productBatch.update({ where: { id: oldLinkedBatch.id }, data: { quantityBase: projected } });
        }
      } else if (data.productId && billItem.batchNumber?.trim()) {
        // Item wasn't linked to a batch before (e.g. no product was linked at all) —
        // bring its existing batch/expiry/qty onto the newly-selected product.
        const destBatch = oldNormalized
          ? await tx.productBatch.findUnique({
              where: { productId_batchNumberNormalized: { productId: data.productId, batchNumberNormalized: oldNormalized } },
            })
          : null;

        if (destBatch) {
          await tx.productBatch.update({
            where: { id: destBatch.id },
            data: {
              quantityBase: { increment: itemBaseQty },
              expiryDate: destBatch.expiryDate ?? parseExpiryToUtcDate(billItem.expiryDate),
              mrp: destBatch.mrp ?? billItem.mrp,
              purchaseRate: destBatch.purchaseRate ?? billItem.rate,
            },
          });
        } else {
          await tx.productBatch.create({
            data: {
              productId: data.productId,
              batchNumber: billItem.batchNumber.trim(),
              batchNumberNormalized: oldNormalized,
              expiryDate: parseExpiryToUtcDate(billItem.expiryDate),
              quantityBase: itemBaseQty,
              mrp: billItem.mrp ?? null,
              purchaseRate: billItem.rate || null,
              sourceBillItemId: billItem.id,
            },
          });
        }
      }

      await syncProductStock(tx, [billItem.productId, data.productId].filter(Boolean));
      workingProductId = data.productId;
    }

    // ── Propagate batch-number/expiry/quantity corrections to the linked ProductBatch,
    // matched via the item's batch number BEFORE this edit (that's the physical batch
    // this purchase line actually fed) — using the product it now belongs to. ──
    if (workingProductId && (batchChanged || expiryChanged || quantityChanged)) {
      const oldNormalized = normalizeBatchNumber(billItem.batchNumber);
      const linkedBatch = oldNormalized
        ? await tx.productBatch.findUnique({
            where: { productId_batchNumberNormalized: { productId: workingProductId, batchNumberNormalized: oldNormalized } },
          })
        : null;

      if (linkedBatch) {
        const batchUpdate = {};

        if (quantityChanged) {
          // Use the ORIGINAL product's pack size for both sides of the delta — the
          // physical unit count already moved (in the re-link step above, if any) was
          // computed the same way, so this must stay consistent with it.
          const product = billItem.product;
          const oldBase = round3((billItem.quantity || 0) * (product?.packSize || 1));
          const newBase = round3((data.quantity || 0) * (product?.packSize || 1));
          const delta = round3(newBase - oldBase);
          const projected = round3(linkedBatch.quantityBase + delta);
          batchUpdate.quantityBase = { increment: delta };
          if (projected < 0) {
            warnings.push(
              `Quantity correction pushes "${billItem.name}" batch ${linkedBatch.batchNumber} below zero ` +
              `(${projected}) — it was already sold from beyond the corrected amount. Stock is not blocked, but review it.`
            );
          }
        }

        if (expiryChanged) {
          batchUpdate.expiryDate = parseExpiryToUtcDate(data.expiryDate);
        }

        if (batchChanged) {
          const newNormalized = normalizeBatchNumber(data.batchNumber);
          const collision = newNormalized
            ? await tx.productBatch.findUnique({
                where: { productId_batchNumberNormalized: { productId: workingProductId, batchNumberNormalized: newNormalized } },
              })
            : null;

          if (collision && collision.id !== linkedBatch.id) {
            // Renaming onto an existing batch — merge, same convention as the P1 dedupe
            // script: survivor is the pre-existing collision row, sum quantity, gap-fill,
            // repoint sale history, archive the loser.
            const mergedQty = round3(collision.quantityBase + linkedBatch.quantityBase + (batchUpdate.quantityBase?.increment || 0));
            await tx.saleItem.updateMany({ where: { productBatchId: linkedBatch.id }, data: { productBatchId: collision.id } });
            await tx.productBatch.update({
              where: { id: collision.id },
              data: {
                quantityBase: mergedQty,
                expiryDate: collision.expiryDate ?? (batchUpdate.expiryDate ?? linkedBatch.expiryDate),
              },
            });
            await tx.productBatch.update({ where: { id: linkedBatch.id }, data: { isArchived: true, quantityBase: 0 } });
          } else {
            await tx.productBatch.update({
              where: { id: linkedBatch.id },
              data: { ...batchUpdate, batchNumber: data.batchNumber, batchNumberNormalized: newNormalized },
            });
          }
        } else if (Object.keys(batchUpdate).length > 0) {
          await tx.productBatch.update({ where: { id: linkedBatch.id }, data: batchUpdate });
        }

        await syncProductStock(tx, [workingProductId]);
      } else {
        warnings.push(`No matching batch found for "${billItem.name}" — only the bill line was corrected, stock was not adjusted.`);
      }
    }

    // rate/mrp: only refresh the batch's own pricing if this line item is what created
    // it (sourceBillItemId match) — otherwise the batch's aggregate price may reflect a
    // different purchase and must not be silently overwritten.
    if (('mrp' in changes || 'rate' in changes) && workingProductId) {
      const sourcedBatch = await tx.productBatch.findFirst({ where: { sourceBillItemId: billItem.id } });
      if (sourcedBatch) {
        await tx.productBatch.update({
          where: { id: sourcedBatch.id },
          data: {
            ...('mrp' in changes && { mrp: data.mrp }),
            ...('rate' in changes && { purchaseRate: data.rate }),
          },
        });
      }
    }

    const updatedItem = await tx.billItem.update({ where: { id: billItemId }, data });

    await tx.billEditLog.createMany({
      data: diffs.map((d) => ({
        billId: billItem.billId,
        billItemId,
        field: d.field,
        oldValue: d.oldValue,
        newValue: d.newValue,
        note: warnings.length > 0 && d.field === 'quantity' ? warnings[warnings.length - 1] : null,
      })),
    });

    return updatedItem;
  });

  return { billItem: result, diffs, warnings };
}

/**
 * Full before/after audit trail for a bill (header + every line item edit), newest first.
 */
async function getBillEditHistory(billId) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');

  return prisma.billEditLog.findMany({
    where: { billId },
    include: { billItem: { select: { name: true } } },
    orderBy: { editedAt: 'desc' },
  });
}

module.exports = { updateBillHeader, updateBillItem, getBillEditHistory };
