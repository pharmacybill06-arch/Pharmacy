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

module.exports = { parseExpiryDate, daysUntil, formatDDMMYYYY };
