/**
 * On-screen mirror of the backend date rules (backend/src/utils/dateRules.js; same file as frontend/utils/dateRules.js) so the
 * review screens can mark a field red BEFORE the user taps save. The server is still
 * the one that enforces them; this only gives instant feedback.
 *
 * All "today" checks use India time (IST), not the phone's or server's clock zone.
 */
import { ddmmyyyyToIso } from './dateFormat';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** DD-MM-YYYY (what users type) or YYYY-MM-DD (an <input type="date">) -> ISO, or null. */
export function toIso(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return ddmmyyyyToIso(text);
}

export const DATE_MESSAGES = {
  missingNumber: 'Invoice number zaroori hai',
  missingDate: 'Invoice date zaroori hai',
  badDate: 'Date DD-MM-YYYY me likhein',
  futureInvoice: 'Bill ki date future me nahi ho sakti',
  oldInvoice: 'Bill ki date 12 mahine se purani hai. Sahi hai to confirm karke save karein.',
  dueBeforeInvoice: 'Due date invoice date se pehle nahi ho sakti. Sahi karein ya khali chhod dein.',
  expiryBeforeInvoice: 'Expiry bill ki date se pehle ki hai',
  futurePayment: 'Payment ki date future me nahi ho sakti (sirf cheque post-dated ho sakta hai)',
  postDatedCheque: 'Post-dated cheque',
};

/** Today's date in India as 'YYYY-MM-DD'. */
export function todayIstIso(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's date in India as DD-MM-YYYY (default for date fields). */
export function todayIstDDMMYYYY(now = new Date()) {
  const [y, m, d] = todayIstIso(now).split('-');
  return `${d}-${m}-${y}`;
}

function shiftMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Expiry 'MM/YY' | 'MM/YYYY' | 'DD-MM-YYYY' -> ISO of the last valid day, or null. */
export function expiryToIso(value) {
  const text = String(value || '').trim();
  let m = text.match(/^(\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (month < 1 || month > 12) return null;
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  return ddmmyyyyToIso(text);
}

/**
 * Header check for the scan review / edit bill screens.
 * Returns { errors: { invoiceNumber?, invoiceDate?, dueDate? }, oldDateWarning: bool }
 */
export function checkBillHeader({ invoiceNumber, invoiceDate, dueDate }, now = new Date()) {
  const errors = {};
  let oldDateWarning = false;
  if (!String(invoiceNumber || '').trim()) errors.invoiceNumber = DATE_MESSAGES.missingNumber;

  const invText = String(invoiceDate || '').trim();
  const invIso = invText ? toIso(invText) : null;
  const today = todayIstIso(now);
  if (!invText) errors.invoiceDate = DATE_MESSAGES.missingDate;
  else if (!invIso) errors.invoiceDate = DATE_MESSAGES.badDate;
  else if (invIso > today) errors.invoiceDate = DATE_MESSAGES.futureInvoice;
  else if (invIso < shiftMonths(today, -12)) oldDateWarning = true;

  const dueText = String(dueDate || '').trim();
  if (dueText) {
    const dueIso = toIso(dueText);
    if (!dueIso) errors.dueDate = DATE_MESSAGES.badDate;
    else if (invIso && dueIso < invIso) errors.dueDate = DATE_MESSAGES.dueBeforeInvoice;
  }
  return { errors, oldDateWarning };
}

/** Line warning: does this item's expiry fall before the bill date? */
export function isExpiryBeforeInvoice(expiryDate, invoiceDate) {
  const exp = expiryToIso(expiryDate);
  const inv = toIso(invoiceDate);
  return !!exp && !!inv && exp < inv;
}

/** Payment date (ISO) rule: future blocked except cheque. */
export function checkPaymentDate(mode, isoDate, now = new Date()) {
  if (!isoDate) return { error: null, isPostDated: false };
  const future = isoDate > todayIstIso(now);
  if (!future) return { error: null, isPostDated: false };
  if (mode === 'cheque') return { error: null, isPostDated: true };
  return { error: DATE_MESSAGES.futurePayment, isPostDated: false };
}

/** Is a stored calendar date after another (both ISO-ish)? Used for "payment ke baad ka bill". */
export function isAfterDay(a, b) {
  if (!a || !b) return false;
  const ka = new Date(new Date(a).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  const kb = new Date(new Date(b).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return ka > kb;
}
