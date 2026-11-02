/**
 * Batch expiry — mirrors mobile's parser (app/(tabs)/index.js) exactly, so both clients
 * show the same "days left" for the same line. MM/YY expires at the end of that month.
 */
export function parseExpiryDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  let m = text.match(/^(\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }
  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(year, month - 1, day);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
