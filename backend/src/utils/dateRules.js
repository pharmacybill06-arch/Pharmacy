/**
 * Date rules for bills and payments.
 *
 * Principle: block what cannot happen, only warn about what is merely odd.
 *   - Invoice date in the future           -> BLOCK (unattended import: bill goes to "Needs details")
 *   - Invoice date older than 12 months    -> WARN (user confirms and saves)
 *   - Due date before invoice date         -> BLOCK (or the user clears the due date)
 *   - Due date / expiry in the future      -> never checked (they are supposed to be)
 *   - Item expiry before invoice date      -> WARN on that line
 *   - Payment date in the future           -> BLOCK for cash/UPI/NEFT/credit note,
 *                                             ALLOW for cheque (post-dated cheque)
 *
 * All comparisons are between IST calendar days (see istDate.js).
 */

const clock = require('./clock');
const { parseInvoiceDate, parseExpiryToUtcDate } = require('./dateUtils');
const { istDayKey, todayIstKey, addMonthsToKey, isFutureIst } = require('./istDate');

const MESSAGES = {
  MISSING_INVOICE_NUMBER: 'Invoice number zaroori hai',
  MISSING_INVOICE_DATE: 'Invoice date zaroori hai',
  INVALID_INVOICE_DATE: 'Invoice date samajh nahi aayi (DD-MM-YYYY)',
  FUTURE_INVOICE_DATE: 'Bill ki date future me nahi ho sakti',
  OLD_INVOICE_DATE: 'Bill ki date 12 mahine se purani hai. Sahi hai to confirm karke save karein.',
  DUE_BEFORE_INVOICE: 'Due date invoice date se pehle nahi ho sakti. Sahi karein ya khali chhod dein.',
  EXPIRY_BEFORE_INVOICE: 'Is item ki expiry bill ki date se pehle ki hai',
  FUTURE_PAYMENT_DATE: 'Payment ki date future me nahi ho sakti (sirf cheque post-dated ho sakta hai)',
};

function asDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  return parseInvoiceDate(value);
}

/**
 * Validate a bill's header + item dates.
 * input: { invoiceNumber, invoiceDate, dueDate, items: [{ expiryDate }] }
 *   invoiceDate/dueDate may be DD-MM-YYYY, ISO, or Date.
 * opts: { now, requireDetails = true }
 * Returns { errors: [{ field, code, message }], warnings: [{ field, code, message, itemIndex? }] }
 */
function validateBillDates(input = {}, { now = clock.now(), requireDetails = true } = {}) {
  const errors = [];
  const warnings = [];

  const invoiceNumber = input.invoiceNumber != null ? String(input.invoiceNumber).trim() : '';
  const rawInvoiceDate = input.invoiceDate;
  const invoiceDate = asDate(rawInvoiceDate);
  const dueDate = asDate(input.dueDate);

  if (requireDetails && !invoiceNumber) {
    errors.push({ field: 'invoiceNumber', code: 'MISSING_INVOICE_NUMBER', message: MESSAGES.MISSING_INVOICE_NUMBER });
  }

  if (rawInvoiceDate && !invoiceDate) {
    errors.push({ field: 'invoiceDate', code: 'INVALID_INVOICE_DATE', message: MESSAGES.INVALID_INVOICE_DATE });
  } else if (!invoiceDate) {
    if (requireDetails) {
      errors.push({ field: 'invoiceDate', code: 'MISSING_INVOICE_DATE', message: MESSAGES.MISSING_INVOICE_DATE });
    }
  } else if (isFutureIst(invoiceDate, now)) {
    errors.push({ field: 'invoiceDate', code: 'FUTURE_INVOICE_DATE', message: MESSAGES.FUTURE_INVOICE_DATE });
  } else if (istDayKey(invoiceDate) < addMonthsToKey(todayIstKey(now), -12)) {
    warnings.push({ field: 'invoiceDate', code: 'OLD_INVOICE_DATE', message: MESSAGES.OLD_INVOICE_DATE });
  }

  if (invoiceDate && dueDate && istDayKey(dueDate) < istDayKey(invoiceDate)) {
    errors.push({ field: 'dueDate', code: 'DUE_BEFORE_INVOICE', message: MESSAGES.DUE_BEFORE_INVOICE });
  }

  if (invoiceDate && Array.isArray(input.items)) {
    const invoiceKey = istDayKey(invoiceDate);
    input.items.forEach((item, itemIndex) => {
      const expiry = item && item.expiryDate ? parseExpiryToUtcDate(item.expiryDate) : null;
      if (expiry && istDayKey(expiry) < invoiceKey) {
        warnings.push({
          field: 'expiryDate',
          code: 'EXPIRY_BEFORE_INVOICE',
          message: MESSAGES.EXPIRY_BEFORE_INVOICE,
          itemIndex,
        });
      }
    });
  }

  return { errors, warnings };
}

/**
 * Why a SAVED bill is not complete. Empty list = complete.
 * A bill only counts as complete when it has both an invoice number and an invoice
 * date, and the date is a possible one.
 */
function billDetailIssues(bill, { now = clock.now() } = {}) {
  const { errors } = validateBillDates(
    { invoiceNumber: bill.invoiceNumber, invoiceDate: bill.invoiceDate, dueDate: bill.dueDate },
    { now, requireDetails: true }
  );
  return errors.map((e) => e.code);
}

function isBillComplete(bill, opts) {
  return bill.status !== 'needs_details' && billDetailIssues(bill, opts).length === 0;
}

/**
 * Payment date rule. Returns { error?, isPostDated }.
 */
function validatePaymentDate(mode, paymentDate, { now = clock.now() } = {}) {
  const future = isFutureIst(paymentDate, now);
  if (!future) return { isPostDated: false };
  if (mode === 'cheque') return { isPostDated: true };
  return {
    isPostDated: false,
    error: { field: 'paymentDate', code: 'FUTURE_PAYMENT_DATE', message: MESSAGES.FUTURE_PAYMENT_DATE },
  };
}

function isPostDatedCheque(payment, { now = clock.now() } = {}) {
  return payment.paymentMethod === 'cheque' && isFutureIst(payment.paymentDate, now);
}

module.exports = {
  MESSAGES,
  validateBillDates,
  billDetailIssues,
  isBillComplete,
  validatePaymentDate,
  isPostDatedCheque,
};
