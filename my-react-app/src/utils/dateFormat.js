/**
 * One date format for the whole app: DD-MM-YYYY.
 *
 * Kept byte-identical to frontend/utils/dateFormat.js (the mobile app) so both clients
 * render the same stored date the same way — see WEB_MOBILE_PARITY.md.
 *
 * Every screen used to format dates its own way — "5 Jan 2026", bare
 * toLocaleDateString() (which follows device locale and shows M/D/YYYY on a US-locale
 * phone), and a few UTC-anchored variants. Route all of them through here instead.
 *
 * Timezone rule: a calendar date (invoice date, due date, expiry) is stored as UTC
 * midnight, so reading it with local getters shifts it back a day anywhere west of UTC.
 * Those are read in UTC. Real timestamps (createdAt, editedAt) are instants and are read
 * in local time, which is what the user expects to see.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Is this a calendar date rather than an instant? */
function isCalendarDate(value) {
  if (typeof value !== 'string') return false;
  // "2026-03-09" or "2026-03-09T00:00:00.000Z"
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z?$/.test(value);
}

/**
 * Format any date-ish value as DD-MM-YYYY. Returns '' for null/invalid input so callers
 * can render it directly without guarding.
 */
export function formatDDMMYYYY(value) {
  if (value === null || value === undefined || value === '') return '';

  if (isCalendarDate(value)) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}-${m}-${y}`;
  }

  // Already DD-MM-YYYY or DD/MM/YYYY — normalise the separator, don't re-parse.
  if (typeof value === 'string') {
    const dmy = value.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmy) return `${pad(dmy[1])}-${pad(dmy[2])}-${dmy[3]}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/**
 * Same as formatDDMMYYYY but falls back to a placeholder instead of an empty string,
 * for table cells and detail rows that need to show something.
 */
export function formatDDMMYYYYOr(value, fallback = '—') {
  return formatDDMMYYYY(value) || fallback;
}

/**
 * Parse a user-typed DD-MM-YYYY date into the ISO `YYYY-MM-DD` the API expects.
 *
 * Deliberately tolerant of how people actually type: `9-3-2026`, `09/03/2026` and
 * `9.3.2026` all work. The five hand-rolled copies this replaces each demanded exactly
 * two digits, so a pharmacist typing a single-digit day got a silent "invalid date".
 *
 * Returns null for anything it cannot read confidently — including real nonsense like
 * 31-02-2026, which must not be rolled forward into March.
 */
export function ddmmyyyyToIso(value) {
  const m = String(value || '').trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject overflow (31-02) rather than letting Date roll it into the next month.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Stored date -> the DD-MM-YYYY shown in an editable field. Same function as
 * formatDDMMYYYY; named separately because that is how the screens refer to it.
 */
export const isoToDdmmyyyy = formatDDMMYYYY;

/**
 * Which date to show for a bill, and — crucially — what that date actually is.
 *
 * A bill has two different dates and they are not interchangeable: the date printed on
 * the invoice by the distributor, and the date it was added to this app. Some screens
 * were silently falling back from one to the other, so a bill with no readable invoice
 * date appeared to have one; others showed nothing at all. Both are misleading in
 * different directions, which is why the source is returned alongside the text.
 *
 * @returns {{ text: string, source: 'invoice'|'uploaded'|'none', label: string }}
 */
export function billDisplayDate(bill) {
  const invoice = formatDDMMYYYY(bill?.invoiceDate);
  if (invoice) return { text: invoice, source: 'invoice', label: 'Invoice date' };

  const uploaded = formatDDMMYYYY(bill?.createdAt);
  if (uploaded) return { text: uploaded, source: 'uploaded', label: 'Added to app' };

  return { text: '—', source: 'none', label: 'No date' };
}

/**
 * Compact one-line form for list rows, where a second line will not fit. An upload date
 * is always marked, so it can never be mistaken for the date on the bill.
 */
export function billDisplayDateShort(bill) {
  const d = billDisplayDate(bill);
  return d.source === 'uploaded' ? `${d.text} (added)` : d.text;
}

export default formatDDMMYYYY;
