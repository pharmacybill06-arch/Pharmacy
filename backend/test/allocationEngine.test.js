const test = require('node:test');
const assert = require('node:assert/strict');
const { planFifo } = require('../src/services/allocationEngine');
const { istDayKey, isFutureIst } = require('../src/utils/istDate');
const { validateBillDates, validatePaymentDate } = require('../src/utils/dateRules');

const d = (s) => new Date(`${s}T00:00:00.000Z`);
const bill = (id, date, remaining, extra = {}) => ({
  allocationType: 'bill', billId: id, label: id, invoiceDate: d(date), remaining, isComplete: true, ...extra,
});

test('FIFO only touches bills dated on/before the payment; rest goes on account', () => {
  const targets = [bill('aug10', '2026-08-10', 2000), bill('jul13', '2026-07-13', 3263)];
  const { allocations, onAccount } = planFifo(3888, d('2026-07-27'), targets);
  assert.deepEqual(allocations, [
    { allocationType: 'bill', billId: 'jul13', allocatedAmount: 3263 },
    { allocationType: 'on_account', billId: null, allocatedAmount: 625 },
  ]);
  assert.equal(onAccount, 625);
});

test('same-day bill is eligible', () => {
  const { allocations } = planFifo(100, d('2026-07-27'), [bill('same', '2026-07-27', 100)]);
  assert.deepEqual(allocations, [{ allocationType: 'bill', billId: 'same', allocatedAmount: 100 }]);
});

test('opening balance first, needs-details bills skipped', () => {
  const targets = [
    bill('nd', '2026-07-01', 500, { isComplete: false }),
    bill('ok', '2026-07-02', 500),
    { allocationType: 'opening_balance', billId: null, label: 'Opening balance', remaining: 200, isComplete: true },
  ];
  const { allocations } = planFifo(600, d('2026-07-27'), targets);
  assert.deepEqual(allocations.map((a) => [a.allocationType, a.billId, a.allocatedAmount]), [
    ['opening_balance', null, 200],
    ['bill', 'ok', 400],
  ]);
});

test('IST day keys: 00:30 IST is already the next day', () => {
  const instant = new Date('2026-11-27T19:00:00.000Z'); // 28-11 00:30 IST
  assert.equal(istDayKey(instant), '2026-11-28');
  assert.equal(isFutureIst(d('2026-11-28'), instant), false);
  assert.equal(isFutureIst(d('2026-11-29'), instant), true);
});

test('bill date rules: block future + due<invoice, warn old + expiry<invoice, ignore future due/expiry', () => {
  const now = new Date('2026-11-27T05:00:00.000Z');
  const future = validateBillDates({ invoiceNumber: 'A1', invoiceDate: '28-11-2026' }, { now });
  assert.equal(future.errors[0].code, 'FUTURE_INVOICE_DATE');
  assert.equal(future.errors[0].message, 'Bill ki date future me nahi ho sakti');

  const old = validateBillDates({ invoiceNumber: 'A1', invoiceDate: '01-10-2025' }, { now });
  assert.deepEqual(old.errors, []);
  assert.equal(old.warnings[0].code, 'OLD_INVOICE_DATE');

  const due = validateBillDates({ invoiceNumber: 'A1', invoiceDate: '20-11-2026', dueDate: '19-11-2026' }, { now });
  assert.equal(due.errors[0].code, 'DUE_BEFORE_INVOICE');

  const ok = validateBillDates(
    { invoiceNumber: 'A1', invoiceDate: '20-11-2026', dueDate: '20-12-2027', items: [{ expiryDate: '08/29' }, { expiryDate: '10/26' }] },
    { now }
  );
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings.map((w) => [w.code, w.itemIndex]), [['EXPIRY_BEFORE_INVOICE', 1]]);

  const missing = validateBillDates({ invoiceNumber: '', invoiceDate: '' }, { now });
  assert.deepEqual(missing.errors.map((e) => e.code), ['MISSING_INVOICE_NUMBER', 'MISSING_INVOICE_DATE']);
});

test('payment date: future blocked for UPI/cash/NEFT, allowed (post-dated) for cheque', () => {
  const now = new Date('2026-11-27T05:00:00.000Z');
  const tomorrow = d('2026-11-28');
  for (const mode of ['upi', 'cash', 'neft_rtgs']) {
    assert.equal(validatePaymentDate(mode, tomorrow, { now }).error.code, 'FUTURE_PAYMENT_DATE');
  }
  assert.deepEqual(validatePaymentDate('cheque', tomorrow, { now }), { isPostDated: true });
  assert.deepEqual(validatePaymentDate('upi', d('2026-11-27'), { now }), { isPostDated: false });
});
