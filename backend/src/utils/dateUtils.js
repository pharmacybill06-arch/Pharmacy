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

module.exports = { parseExpiryDate, parseExpiryToUtcDate, daysUntil, formatDDMMYYYY };
