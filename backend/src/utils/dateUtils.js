/**
 * Defensive date parsing for the free-text expiry-date strings stored on
 * BillItem (formats vary across invoices: dd-mm-yyyy, mm/yy, mm-yyyy, etc).
 * Shared by expiryController.js and the product aggregation service so both
 * treat ambiguous/unparseable dates identically.
 */

function parseExpiryDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  // mm/yy or mm-yyyy (month/year only) — treat as the last day of that month
  let m = text.match(/^(\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }

  // dd/mm/yyyy, dd-mm-yy, etc — heuristic day/month swap if first part > 12
  m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return new Date(year, month - 1, day);
  }

  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse an expiry string into a timezone-stable UTC calendar date, for columns that
 * store expiry as a real DateTime (ProductBatch.expiryDate).
 *
 * parseExpiryDate builds dates at LOCAL midnight, which is correct for the day-math the
 * expiry screens do, but writing one to a timestamp column shifts it a day backwards in
 * any timezone east of UTC (local midnight 30-11-2027 IST => 29-11-2027T18:30Z). Expiry
 * is a calendar date, not an instant, so we re-anchor the same Y/M/D at UTC midnight.
 *
 * "8/26" -> 2026-08-31T00:00:00Z (last day of that month).
 */
function parseExpiryToUtcDate(value) {
  const local = parseExpiryDate(value);
  if (!local) return null;
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/**
 * Parse an invoice/due date into a timezone-stable UTC calendar date.
 *
 * Indian invoices — and the DD-MM-YYYY the AI prompts ask for — are ALWAYS day-first, so
 * this is deliberately stricter than parseExpiryDate: "09-03-2026" is 9 March, never
 * 3 September. Never hand these strings to `new Date(str)`, which reads a dashed date as
 * US MM-DD-YYYY (silently wrong) and rejects slashed DD/MM/YYYY outright (silently null).
 *
 * Accepts DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, 2-digit years, and ISO YYYY-MM-DD.
 * Returns null for anything it cannot read confidently, rather than guessing.
 */
function parseInvoiceDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const text = String(value).trim();
  if (!text) return null;

  const utc = (y, m, d) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    // Reject overflow like 31-02-2026, which JS would roll into March.
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
  };

  // ISO first — unambiguous, and what a DB round-trip hands back.
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY, 2- or 4-digit year. Day first, always.
  m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return utc(year, month, day);
  }

  return null;
}

/**
 * Format a stored invoice/due date as DD-MM-YYYY using its UTC parts.
 *
 * formatDDMMYYYY reads local parts, which shifts a UTC-midnight calendar date back a day
 * west of UTC. Dates written by parseInvoiceDate are UTC-anchored, so they must be read
 * back the same way.
 */
function formatInvoiceDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getUTCFullYear()}`;
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function formatDDMMYYYY(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

module.exports = {
  parseExpiryDate,
  parseExpiryToUtcDate,
  parseInvoiceDate,
  formatInvoiceDate,
  daysUntil,
  formatDDMMYYYY,
};
