/**
 * "Needs details" bills and bill-date enforcement.
 *
 * A purchase bill is COMPLETE only when it has an invoice number AND a valid invoice
 * date. Where the user is in front of the screen (scan review, edit) an incomplete or
 * impossible header is blocked. Where nobody is watching (email import) the bill is
 * still saved — stock goes in, the amount counts in the distributor's outstanding —
 * but with status "needs_details", which keeps it out of FIFO auto-allocation until
 * the details are filled in.
 */

const prisma = require('../models/prisma');
const { validateBillDates, billDetailIssues } = require('../utils/dateRules');

function httpError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Interactive save/edit check. Throws:
 *   400 INVALID_BILL_DETAILS       — missing number/date, future date, due < invoice
 *   422 CONFIRM_OLD_INVOICE_DATE   — invoice date > 12 months old and not yet confirmed
 * Returns { warnings } (line-level expiry warnings, etc.) when the save may go ahead.
 */
function assertInteractiveBill(input, { confirmOldDate = false, requireDetails = true, now } = {}) {
  const { errors, warnings } = validateBillDates(input, { requireDetails, now });
  if (errors.length > 0) {
    throw httpError(400, 'INVALID_BILL_DETAILS', errors[0].message, { errors, warnings });
  }
  const oldDate = warnings.find((w) => w.code === 'OLD_INVOICE_DATE');
  if (oldDate && !confirmOldDate) {
    throw httpError(422, 'CONFIRM_OLD_INVOICE_DATE', oldDate.message, { errors: [], warnings });
  }
  return { warnings };
}

/** Status an UNATTENDED import should save with: needs_details when anything is missing/impossible. */
function unattendedStatus(input, { now } = {}) {
  const { errors } = validateBillDates(input, { requireDetails: true, now });
  return errors.length > 0 ? 'needs_details' : 'completed';
}

/** Status a saved bill should have after an edit, given its merged header. */
function statusAfterEdit(currentStatus, mergedHeader) {
  if (currentStatus === 'draft') return 'draft';
  return billDetailIssues(mergedHeader).length > 0 ? 'needs_details' : 'completed';
}

/**
 * Every purchase bill missing details — the new "needs_details" ones AND older bills
 * saved before this rule existed without a number or date.
 */
async function listBillsNeedingDetails(userId) {
  const bills = await prisma.bill.findMany({
    where: {
      userId,
      billType: 'purchase',
      status: { not: 'draft' },
      OR: [{ status: 'needs_details' }, { invoiceNumber: null }, { invoiceNumber: '' }, { invoiceDate: null }],
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      grandTotal: true,
      status: true,
      filePath: true,
      mimeType: true,
      pharmacyName: true,
      createdAt: true,
      distributor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // A needs_details bill may already have both fields but an impossible date (future);
  // keep those, plus anything genuinely missing.
  return bills
    .map((b) => ({ ...b, detailIssues: billDetailIssues(b) }))
    .filter((b) => b.status === 'needs_details' || b.detailIssues.length > 0);
}

async function countBillsNeedingDetails(userId) {
  return (await listBillsNeedingDetails(userId)).length;
}

module.exports = {
  httpError,
  assertInteractiveBill,
  unattendedStatus,
  statusAfterEdit,
  listBillsNeedingDetails,
  countBillsNeedingDetails,
};
