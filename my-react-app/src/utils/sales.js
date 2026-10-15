/**
 * Sales helpers shared by the web sales pages. Mirrors the mobile QuickSell /
 * DailySaleRegister helpers so quantities and dates read identically on both clients.
 */

export const SCHEDULE_LABEL = { h1: 'H1', nrx: 'NRX' };

export function isScheduled(product) {
  return product?.scheduleFlag === 'h1' || product?.scheduleFlag === 'nrx';
}

export function round3(n) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Mirrors batchService.formatQuantity so the UI reads the same as the register. */
export function formatQuantity(quantityBase, product = {}) {
  const { packSize = 1, packLabel = 'pack', baseUnit = 'unit' } = product || {};
  const qty = round3(quantityBase || 0);
  const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;

  if (!packSize || packSize <= 1) return plural(qty, baseUnit);
  if (qty < 0) return plural(qty, baseUnit);

  const packs = Math.floor(qty / packSize);
  const loose = round3(qty - packs * packSize);
  if (packs === 0) return plural(loose, baseUnit);
  if (loose === 0) return plural(packs, packLabel);
  return `${plural(packs, packLabel)} + ${plural(loose, baseUnit)}`;
}

/** Batch expiry is stored as a UTC calendar date — read it back in UTC or it shifts a day. */
export function formatBatchExpiry(value) {
  if (!value) return 'No expiry';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `Exp ${mm}/${String(d.getUTCFullYear()).slice(-2)}`;
}

export function todayLocalIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function shiftDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
