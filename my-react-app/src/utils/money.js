/**
 * Indian-rupee formatting shared by the ledger, payments, sales and expiry pages.
 * Mirrors the mobile app's formatAmount so the same figure reads the same on both.
 */
export function formatINR(amount, { decimals = 2 } = {}) {
  const n = parseFloat(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: decimals })}`;
}

/** Whole-rupee form for summary tiles, where paise are noise. */
export function formatINRShort(amount) {
  return formatINR(amount, { decimals: 0 });
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Payment modes — same keys and labels as the mobile app and the backend VALID_MODES. */
export const PAYMENT_MODES = [
  { key: 'upi', label: 'UPI' },
  { key: 'cash', label: 'Cash' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'neft_rtgs', label: 'NEFT/RTGS' },
  { key: 'credit_note', label: 'Credit Note' },
];

export const PAYMENT_MODE_LABEL = Object.fromEntries(PAYMENT_MODES.map((m) => [m.key, m.label]));

export const REFERENCE_LABEL = {
  upi: 'UPI Reference / UTR No.',
  neft_rtgs: 'UTR Number',
  cheque: 'Cheque Number',
  credit_note: 'Credit Note No.',
  cash: 'Reference (optional)',
};

/** Bill payment status → badge class + label, as the ledger and mobile show them. */
export const BILL_STATUS = {
  unpaid: { label: 'Unpaid', badge: 'badge-primary' },
  partial: { label: 'Partial', badge: 'badge-warning' },
  paid: { label: 'Paid', badge: 'badge-success' },
  overdue: { label: 'Overdue', badge: 'badge-danger' },
};

/**
 * Mirrors the backend's FIFO allocation, for an on-screen preview of where a payment
 * will land. Same algorithm as mobile RecordPaymentScreen.autoAllocateFifo.
 */
export function autoAllocateFifo(amount, targets) {
  let remaining = round2(amount);
  const plan = [];
  for (const target of targets) {
    if (remaining <= 0.005) break;
    const take = round2(Math.min(remaining, target.remaining));
    if (take <= 0.005) continue;
    plan.push({ ...target, amount: take });
    remaining = round2(remaining - take);
  }
  return { plan, onAccount: remaining > 0.005 ? remaining : 0 };
}

export function allocationKey(target) {
  return target.allocationType === 'opening_balance' ? 'opening_balance' : target.billId;
}
