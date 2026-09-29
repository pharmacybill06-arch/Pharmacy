/**
 * One date format for the whole app: DD-MM-YYYY.
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

export default formatDDMMYYYY;
