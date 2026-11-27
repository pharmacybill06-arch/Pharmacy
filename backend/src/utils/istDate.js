/**
 * India-time calendar helpers.
 *
 * The server runs on UTC, the pharmacies run on IST (UTC+5:30). Between 00:00 and
 * 05:30 IST the UTC date is still "yesterday", so `new Date()` compared against a
 * bill dated today made today's bill look like a future bill. Every date RULE in the
 * app (future-date block, 12-month warning, FIFO "bill date <= payment date") goes
 * through these helpers so the comparison is always between IST calendar days.
 *
 * A "day key" is the string 'YYYY-MM-DD' of the IST calendar day a value falls on.
 * Stored calendar dates (invoiceDate, dueDate, paymentDate) are UTC midnight of the
 * calendar day; adding 5:30 keeps them on the same day. Real instants (createdAt,
 * a paymentDate defaulted to `new Date()`) land on the IST day they happened.
 * Older rows saved at IST midnight (18:30Z the day before) also map back correctly.
 */

const clock = require('./clock');

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' of the IST calendar day `value` falls on, or null. */
function istDayKey(value) {
  const d = toDate(value);
  if (!d) return null;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's IST day key. `now` is injectable for tests. */
function todayIstKey(now = clock.now()) {
  return istDayKey(now);
}

/** The IST calendar day of `value`, as a UTC-midnight Date (the shape calendar columns use). */
function istCalendarDate(value) {
  const key = istDayKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

/** Shift a day key by whole months (clamped to month end), e.g. for the 12-month rule. */
function addMonthsToKey(key, months) {
  const [y, m, d] = key.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function isFutureIst(value, now = clock.now()) {
  const key = istDayKey(value);
  return !!key && key > todayIstKey(now);
}

/** true when a <= b as IST calendar days. Nulls are never "on or before". */
function isOnOrBeforeIst(a, b) {
  const ka = istDayKey(a);
  const kb = istDayKey(b);
  return !!ka && !!kb && ka <= kb;
}

/** DD-MM-YYYY of the IST day, for messages. */
function formatIstDDMMYYYY(value) {
  const key = istDayKey(value);
  if (!key) return null;
  const [y, m, d] = key.split('-');
  return `${d}-${m}-${y}`;
}

module.exports = {
  IST_OFFSET_MS,
  istDayKey,
  todayIstKey,
  istCalendarDate,
  addMonthsToKey,
  isFutureIst,
  isOnOrBeforeIst,
  formatIstDDMMYYYY,
};
