/**
 * The ONE place the FIFO payment-allocation rule lives.
 *
 * Both the on-screen preview (GET /ledger/distributor/:id/allocation-preview) and the
 * save (recordPayment) call planFifo with the same targets, so what the user sees in
 * the preview is exactly what gets stored. The apps no longer carry their own copy.
 *
 * Rule:
 *   1. Opening balance first (it predates every bill in the app).
 *   2. Then bills oldest-first, but ONLY bills whose invoice date is on or before the
 *      payment date (same day counts), compared as IST calendar days.
 *   3. Bills still missing details (no invoice number/date, status "needs_details")
 *      are never auto-allocated.
 *   4. Whatever is left goes "on account". It is never put on a bill dated after the
 *      payment automatically; the user can do that by hand in Customize (advance adjust).
 */

const { istDayKey } = require('../utils/istDate');

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function targetKey(target) {
  return target.allocationType === 'opening_balance' ? 'opening_balance' : target.billId;
}

/** Is this bill dated after the payment (IST days)? Undated bills are not "after". */
function isAfterPaymentDate(invoiceDate, paymentDate) {
  const b = istDayKey(invoiceDate);
  const p = istDayKey(paymentDate);
  return !!b && !!p && b > p;
}

function isAutoEligible(target, paymentDate) {
  if (target.allocationType === 'opening_balance') return true;
  if (target.allocationType !== 'bill') return false;
  if (!target.isComplete) return false;
  const billKey = istDayKey(target.invoiceDate);
  const payKey = istDayKey(paymentDate);
  if (!billKey || !payKey) return false;
  return billKey <= payKey;
}

/** Oldest first: opening balance, then invoice date, then upload time. */
function sortTargets(targets) {
  return [...targets].sort((a, b) => {
    if (a.allocationType === 'opening_balance') return -1;
    if (b.allocationType === 'opening_balance') return 1;
    const ka = istDayKey(a.invoiceDate) || '9999-12-31';
    const kb = istDayKey(b.invoiceDate) || '9999-12-31';
    if (ka !== kb) return ka < kb ? -1 : 1;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ca - cb;
  });
}

/**
 * amount: payment amount
 * paymentDate: Date | ISO string
 * targets: [{ allocationType, billId, label, invoiceDate, remaining, isComplete, createdAt }]
 *
 * Returns {
 *   allocations: [{ allocationType, billId, allocatedAmount }]  // exactly what gets saved
 *   plan: same rows + label / invoiceDate for display
 *   onAccount: number
 * }
 */
function planFifo(amount, paymentDate, targets) {
  let remaining = round2(amount);
  const plan = [];

  for (const target of sortTargets(targets)) {
    if (remaining <= 0.005) break;
    if (!isAutoEligible(target, paymentDate)) continue;
    const take = round2(Math.min(remaining, target.remaining));
    if (take <= 0.005) continue;
    plan.push({
      allocationType: target.allocationType,
      billId: target.billId || null,
      label: target.label,
      invoiceDate: target.invoiceDate || null,
      allocatedAmount: take,
    });
    remaining = round2(remaining - take);
  }

  const onAccount = remaining > 0.005 ? remaining : 0;
  const allocations = plan.map(({ allocationType, billId, allocatedAmount }) => ({
    allocationType,
    billId,
    allocatedAmount,
  }));
  if (onAccount > 0) {
    allocations.push({ allocationType: 'on_account', billId: null, allocatedAmount: onAccount });
  }

  return { allocations, plan, onAccount };
}

module.exports = {
  round2,
  targetKey,
  isAfterPaymentDate,
  isAutoEligible,
  sortTargets,
  planFifo,
};
