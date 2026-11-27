/**
 * The acceptance scenarios from the spec, end to end over HTTP against real Postgres.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const USER = 'user_bhalla';
let distributorId;

const allocSummary = (allocs) =>
  allocs
    .map((a) => `${a.allocationType}:${a.bill?.invoiceNumber || a.billId || '-'}:${a.allocatedAmount}`)
    .sort();

async function ledger() {
  return (await h.api('GET', `/ledger/distributor/${distributorId}`)).body;
}
function billByNumber(l, n) {
  return l.bills.find((b) => b.invoiceNumber === n);
}

test.before(async () => {
  await h.startServer();
  await h.resetDb();
  await h.createUser(USER);
  h.clock.setNow(h.istInstant('2026-11-27T11:00:00')); // today = 27-11-2026 IST
});
test.after(h.stopServer);

test('Bhalla: ₹3,888 on 27-07 -> ₹3,263 on the 13-07 bill, ₹625 on account, 10-08 untouched', async () => {
  let r = await h.saveBill(USER, { invoiceNumber: 'TS002548', invoiceDate: '13-07-2026', grandTotal: 3263 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await h.saveBill(USER, { invoiceNumber: 'TS002900', invoiceDate: '10-08-2026', grandTotal: 1500 });
  assert.equal(r.status, 201, JSON.stringify(r.body));

  distributorId = (await h.prisma.distributor.findFirst({ where: { userId: USER } })).id;

  const preview = (await h.api('GET', `/ledger/distributor/${distributorId}/allocation-preview?amount=3888&paymentDate=2026-07-27`)).body;
  assert.deepEqual(preview.plan.map((p) => [p.label, p.allocatedAmount]), [['TS002548', 3263]]);
  assert.equal(preview.onAccount, 625);
  // every target carries its date; 10-08 is flagged as after the payment
  const aug = preview.targets.find((t) => t.label === 'TS002900');
  assert.equal(aug.afterPaymentDate, true);
  assert.ok(preview.targets.every((t) => t.allocationType !== 'bill' || t.invoiceDate));

  r = await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, {
    amount: 3888, paymentDate: '2026-07-27', mode: 'upi',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const saved = r.body.payment.allocations.map((a) => ({ allocationType: a.allocationType, billId: a.billId, allocatedAmount: a.allocatedAmount }));
  assert.deepEqual(
    saved.sort((a, b) => a.allocationType.localeCompare(b.allocationType)),
    preview.allocations.slice().sort((a, b) => a.allocationType.localeCompare(b.allocationType)),
    'save must store exactly what the preview showed'
  );

  const l = await ledger();
  assert.equal(billByNumber(l, 'TS002548').status, 'paid');
  assert.equal(billByNumber(l, 'TS002900').paidAmount, 0);
  assert.equal(l.distributor.onAccountAvailable, 625);
});

test('Then a ₹625 bill dated 20-07 -> prompt, "Haan" -> bill paid, outstanding right', async () => {
  const r = await h.saveBill(USER, { invoiceNumber: 'TS002601', invoiceDate: '20-07-2026', grandTotal: 625 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const prompt = r.body.onAccountPrompt;
  assert.ok(prompt, 'should ask about the advance');
  assert.equal(prompt.adjustableAmount, 625);
  assert.match(prompt.message, /₹625 advance pada hai, is bill me adjust karein\?/);

  // Never adjusted on its own
  let l = await ledger();
  assert.equal(billByNumber(l, 'TS002601').paidAmount, 0);

  const apply = await h.api('POST', `/ledger/bills/${prompt.billId}/apply-on-account`, {});
  assert.equal(apply.status, 200, JSON.stringify(apply.body));
  assert.equal(apply.body.applied, 625);

  l = await ledger();
  assert.equal(billByNumber(l, 'TS002601').status, 'paid');
  assert.equal(billByNumber(l, 'TS002900').paidAmount, 0);
  assert.equal(l.distributor.onAccountAvailable, 0);
  assert.equal(l.distributor.outstanding, 3263 + 1500 + 625 - 3888); // 1500 = the 10-08 bill
});

test('"Na" leaves everything as it is', async () => {
  // A second distributor with an advance; saving a bill only asks.
  await h.saveBill(USER, { distributor: 'Na Pharma', invoiceNumber: 'NP1', invoiceDate: '01-07-2026', grandTotal: 100 });
  const naId = (await h.prisma.distributor.findFirst({ where: { name: 'Na Pharma' } })).id;
  await h.api('POST', `/ledger/user/${USER}/distributor/${naId}/payments`, { amount: 300, paymentDate: '2026-07-05', mode: 'cash' });
  const r = await h.saveBill(USER, { distributor: 'Na Pharma', invoiceNumber: 'NP2', invoiceDate: '10-07-2026', grandTotal: 150 });
  assert.equal(r.body.onAccountPrompt.adjustableAmount, 150);
  const l = (await h.api('GET', `/ledger/distributor/${naId}`)).body;
  assert.equal(l.bills.find((b) => b.invoiceNumber === 'NP2').paidAmount, 0);
  assert.equal(l.distributor.onAccountAvailable, 200);
});

test('Edit the same payment -> both bills ticked; save unchanged -> nothing changes', async () => {
  const payment = await h.prisma.payment.findFirst({ where: { distributorId }, include: { allocations: { include: { bill: true } } } });
  const before = allocSummary(payment.allocations);
  assert.deepEqual(before, ['bill:TS002548:3263', 'bill:TS002601:625']);

  const preview = (await h.api('GET', `/ledger/distributor/${distributorId}/allocation-preview?amount=3888&paymentDate=2026-07-27&paymentId=${payment.id}`)).body;
  // opens with the CURRENT allocation, not a fresh FIFO
  assert.deepEqual(preview.currentAllocations.map((a) => `${a.label}:${a.allocatedAmount}`).sort(), ['TS002548:3263', 'TS002601:625']);
  // the payment's own (fully paid) bills are in the Customize list, pre-ticked
  const ticked = preview.targets.filter((t) => t.currentAllocated > 0).map((t) => `${t.label}:${t.currentAllocated}`).sort();
  assert.deepEqual(ticked, ['TS002548:3263', 'TS002601:625']);

  // 1) Save with no allocation change (what the screen sends when untouched)
  let r = await h.api('PUT', `/ledger/payments/${payment.id}`, { amount: 3888, paymentDate: '2026-07-27', mode: 'upi', notes: null });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(allocSummary(r.body.payment.allocations), before);

  // 2) Save from Customize with the pre-ticked rows untouched — server must accept them
  const allocations = preview.targets
    .filter((t) => t.currentAllocated > 0)
    .map((t) => ({ allocationType: t.allocationType, billId: t.billId, allocatedAmount: t.currentAllocated }));
  r = await h.api('PUT', `/ledger/payments/${payment.id}`, { amount: 3888, paymentDate: '2026-07-27', mode: 'upi', allocations });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(allocSummary(r.body.payment.allocations), before);

  const l = await ledger();
  assert.equal(billByNumber(l, 'TS002548').status, 'paid');
  assert.equal(billByNumber(l, 'TS002601').status, 'paid');
});

test('Customize can put money on a bill dated after the payment (advance adjust) and the report lists it', async () => {
  const r = await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, {
    amount: 500, paymentDate: '2026-07-30', mode: 'cash',
    allocations: [{ allocationType: 'bill', billId: (await h.prisma.bill.findFirst({ where: { invoiceNumber: 'TS002900' } })).id, allocatedAmount: 500 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));

  const before = await h.prisma.paymentAllocation.count();
  const rep = await h.api('GET', `/ledger/user/${USER}/reports/bill-after-payment`);
  assert.equal(rep.status, 200);
  assert.deepEqual(rep.body.rows.map((x) => [x.invoiceNumber, x.invoiceDate, x.paymentDate, x.allocatedAmount]), [
    ['TS002900', '2026-08-10', '2026-07-30', 500],
  ]);
  const csv = await h.api('GET', `/ledger/user/${USER}/reports/bill-after-payment?format=csv`);
  assert.match(csv.body, /TS002900/);
  assert.equal(await h.prisma.paymentAllocation.count(), before, 'report must not change data');
});

test('Raat 12:30: today\'s bill saves; tomorrow\'s is blocked', async () => {
  h.clock.setNow(h.istInstant('2026-11-28T00:30:00')); // server UTC clock still says 27-11
  let r = await h.saveBill(USER, { invoiceNumber: 'MID1', invoiceDate: '28-11-2026', grandTotal: 10 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await h.saveBill(USER, { invoiceNumber: 'MID2', invoiceDate: '29-11-2026', grandTotal: 10 });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, 'Bill ki date future me nahi ho sakti');
  h.clock.setNow(h.istInstant('2026-11-27T11:00:00'));
});

test('Tomorrow\'s cheque saves as post-dated; tomorrow\'s UPI is blocked', async () => {
  let r = await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, {
    amount: 100, paymentDate: '2026-11-28', mode: 'cheque', referenceNumber: '000123', allocations: [],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.payment.isPostDated, true);

  r = await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, {
    amount: 100, paymentDate: '2026-11-28', mode: 'upi',
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'FUTURE_PAYMENT_DATE');
});
