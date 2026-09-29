/**
 * One definition of "this invoice is already in the books", shared by every path that
 * creates a Bill — the app's save/convert endpoints and the email importer.
 *
 * It lives here rather than in billController because the email importer writes bills
 * directly via prisma.bill.create and would otherwise silently bypass the check, which
 * is exactly how the same invoice ends up counted into stock twice.
 */

const prisma = require('../models/prisma');

/**
 * Invoice numbers are compared case-insensitively and ignoring separators, so
 * "A017863", "a017863" and "A-017863" are recognised as the same invoice.
 */
function normalizeInvoiceNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Find an already-saved bill with the same invoice number from the same distributor.
 *
 * Scoped to the distributor on purpose: invoice numbers are only unique within one
 * supplier's own series, so two distributors legitimately issuing "A017863" must both be
 * saveable. Bills with no distributor resolved are compared against the user's other
 * distributor-less bills only.
 *
 * @param {string} userId
 * @param {string|null} distributorId
 * @param {string|null} invoiceNumber
 * @param {string|null} excludeBillId - skip this bill (used when editing it)
 * @returns {Promise<object|null>} the existing bill, or null
 */
async function findDuplicateBill(userId, distributorId, invoiceNumber, excludeBillId = null) {
  const normalized = normalizeInvoiceNumber(invoiceNumber);
  if (!normalized) return null; // No invoice number to match on — nothing to dedupe.

  // Prisma can't index on a normalized form here, so narrow by the indexed columns
  // first and compare the normalized values in JS.
  const candidates = await prisma.bill.findMany({
    where: {
      userId,
      distributorId: distributorId || null,
      invoiceNumber: { not: null },
      ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
    },
    select: { id: true, invoiceNumber: true, invoiceDate: true, grandTotal: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return candidates.find((b) => normalizeInvoiceNumber(b.invoiceNumber) === normalized) || null;
}

module.exports = { normalizeInvoiceNumber, findDuplicateBill };
