/**
 * Single source of "now" for date RULES (future-date block, 12-month warning, IST
 * today). Tests pin it to e.g. 00:30 IST to prove today's bill is not "future".
 */
let fixedNow = null;

function now() {
  return fixedNow ? new Date(fixedNow.getTime()) : new Date();
}

function setNow(value) {
  fixedNow = value ? new Date(value) : null;
}

module.exports = { now, setNow };
