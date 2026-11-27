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

// Payment FIFO lives ONLY on the server now (backend allocationEngine.planFifo); the
// payment form shows the server's allocation-preview instead of a local copy.

export function allocationKey(target) {
  return target.allocationType === 'opening_balance' ? 'opening_balance' : target.billId;
}
