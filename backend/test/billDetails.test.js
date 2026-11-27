const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const USER = 'user_details';

test.before(async () => {
  await h.startServer();
  await h.resetDb();
  await h.createUser(USER);
  h.clock.setNow(h.istInstant('2026-11-27T11:00:00'));
});
test.after(h.stopServer);

test('scan save: invoice number + date mandatory', async () => {
  const r = await h.saveBill(USER, { invoiceNumber: '', invoiceDate: '', grandTotal: 10 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field), ['invoiceNumber', 'invoiceDate']);
});

test('old date asks to confirm, then saves; due before invoice blocked; expiry warning only', async () => {
  let r = await h.saveBill(USER, { invoiceNumber: 'OLD1', invoiceDate: '01-08-2025', grandTotal: 10 });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'CONFIRM_OLD_INVOICE_DATE');
  r = await h.saveBill(USER, { invoiceNumber: 'OLD1', invoiceDate: '01-08-2025', grandTotal: 10, confirmOldDate: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));

  r = await h.saveBill(USER, { invoiceNumber: 'DUE1', invoiceDate: '20-11-2026', dueDate: '10-11-2026', grandTotal: 10 });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'INVALID_BILL_DETAILS');
  assert.equal(r.body.errors[0].field, 'dueDate');

  r = await h.saveBill(USER, {
    invoiceNumber: 'EXP1', invoiceDate: '20-11-2026', dueDate: '20-01-2027', grandTotal: 10,
    items: [{ name: 'Paracetamol', batchNumber: 'B1', expiryDate: '10/26', quantity: 5, humanVerified: true }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.warnings[0].code, 'EXPIRY_BEFORE_INVOICE');
});

test('email import: missing/future details -> saved as needs_details, counted, not auto-allocated, completable', async () => {
  const { saveBillFromParsedData } = require('../src/services/emailInvoiceService');
  const nd = await saveBillFromParsedData(USER, { pharmacyName: 'Mail Pharma', invoiceNumber: null, invoiceDate: '15-07-2026', grandTotal: 400, items: [] }, '');
  assert.equal(nd.status, 'needs_details');
  const fut = await saveBillFromParsedData(USER, { pharmacyName: 'Mail Pharma', invoiceNumber: 'MP-FUT', invoiceDate: '01-12-2026', grandTotal: 50, items: [] }, '');
  assert.equal(fut.status, 'needs_details');
  const ok = await saveBillFromParsedData(USER, { pharmacyName: 'Mail Pharma', invoiceNumber: 'MP-1', invoiceDate: '16-07-2026', grandTotal: 300, items: [] }, '');
  assert.equal(ok.status, 'completed');
  const distributorId = ok.distributorId;

  // Home badge list (includes older complete-status bills missing a number, too)
  await h.prisma.bill.create({ data: { userId: USER, distributorId, fileName: 'x', filePath: 'x', fileSize: 0, mimeType: 'image/jpeg', invoiceDate: new Date('2026-06-01'), grandTotal: 20, status: 'completed' } });
  const list = await h.api('GET', `/bills/user/${USER}/needs-details`);
  assert.equal(list.body.count, 3);

  // Counted in outstanding
  let l = (await h.api('GET', `/ledger/distributor/${distributorId}`)).body;
  assert.equal(l.distributor.outstanding, 400 + 50 + 300 + 20);

  // Skipped by FIFO even though it is the oldest
  const preview = (await h.api('GET', `/ledger/distributor/${distributorId}/allocation-preview?amount=1000&paymentDate=2026-07-31`)).body;
  assert.deepEqual(preview.plan.map((p) => p.label), ['MP-1']);
  assert.equal(preview.onAccount, 700);
  await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, { amount: 1000, paymentDate: '2026-07-31', mode: 'cash' });

  // Fill in details -> completed, and the app is asked to offer the advance
  const r = await h.api('PATCH', `/bills/${nd.id}/header`, { invoiceNumber: 'MP-0', invoiceDate: '15-07-2026' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.bill.status, 'completed');
  assert.equal(r.body.onAccountPrompt.adjustableAmount, 400);
  l = (await h.api('GET', `/ledger/distributor/${distributorId}`)).body;
  assert.equal(l.bills.find((b) => b.invoiceNumber === 'MP-0').paidAmount, 0, 'never auto-adjusted');

  // Future date on completion is blocked
  const bad = await h.api('PATCH', `/bills/${fut.id}/header`, { invoiceDate: '02-12-2026' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.message, 'Bill ki date future me nahi ho sakti');
});

test('archived duplicate transaction -> offer restore instead of "already recorded"', async () => {
  await h.saveBill(USER, { distributor: 'Txn Pharma', invoiceNumber: 'T1', invoiceDate: '01-11-2026', grandTotal: 200 });
  const distributorId = (await h.prisma.distributor.findFirst({ where: { name: 'Txn Pharma' } })).id;
  const first = await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, {
    amount: 200, paymentDate: '2026-11-02', mode: 'upi', transactionId: '612345678901',
  });
  assert.equal(first.status, 201);
  await h.api('POST', `/ledger/payments/${first.body.payment.id}/archive`);

  const again = await h.api('POST', `/ledger/user/${USER}/distributor/${distributorId}/payments`, {
    amount: 200, paymentDate: '2026-11-02', mode: 'upi', transactionId: '612345678901',
  });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ARCHIVED_DUPLICATE_TRANSACTION');
  assert.equal(again.body.error, 'Ye payment archive me hai, wapas laayein?');

  const restored = await h.api('POST', `/ledger/payments/${again.body.existingPaymentId}/unarchive`);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.payment.isArchived, false);
  const l = (await h.api('GET', `/ledger/distributor/${distributorId}`)).body;
  assert.equal(l.bills[0].status, 'paid');
});
