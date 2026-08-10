/**
 * Acceptance tests for Data Export to Excel/CSV (spec §5).
 *
 * Builds the invoice A008562 fixture from the spec, generates real workbooks, then
 * reads them back with ExcelJS to assert what Excel would actually show.
 *
 * Usage: node scripts/test-exports.js
 */

const ExcelJS = require('exceljs');
const prisma = require('../src/models/prisma');
const exportService = require('../src/services/exportService');
const { parseExpiryToUtcDate } = require('../src/utils/dateUtils');

const RUN_ID = Date.now();
let userId = null;
let distributorId = null;
let secondDistributorId = null;

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`   ✓ ${label}: ${a}`);
    passed++;
  } else {
    console.log(`   ✗ ${label}: expected ${e}, got ${a}`);
    failed++;
  }
}

function checkTrue(label, condition, detail = '') {
  if (condition) {
    console.log(`   ✓ ${label}${detail ? `: ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`   ✗ ${label}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

/** Read a generated xlsx buffer back the way Excel would. */
async function readWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function rowsOf(sheet) {
  const headers = sheet.getRow(1).values.slice(1);
  const out = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row.getCell(i + 1).value; });
    out.push(obj);
  });
  return out;
}

// ============================================================
// SETUP — invoice A008562 from the spec
// ============================================================
async function setup() {
  const user = await prisma.user.create({
    data: { phone: `+9166${String(RUN_ID).slice(-8)}`, name: 'Export Test User' },
  });
  userId = user.id;

  const distributor = await prisma.distributor.create({
    data: {
      userId,
      name: `Laksh Pharma ${RUN_ID}`,
      gstin: '03AABCL1234M1Z5',
      address: 'Ludhiana',
    },
  });
  distributorId = distributor.id;

  const distributor2 = await prisma.distributor.create({
    data: { userId, name: `Bhalla Medical ${RUN_ID}`, gstin: '03AABCB9999M1Z2' },
  });
  secondDistributorId = distributor2.id;

  // Invoice A008562 — December 2025. Taxable 163.52, CGST 4.09, SGST 4.09, total 172.
  const bill = await prisma.bill.create({
    data: {
      userId,
      distributorId,
      billType: 'purchase',
      status: 'completed',
      fileName: 'A008562.jpg',
      filePath: '/uploads/A008562.jpg',
      fileSize: 0,
      mimeType: 'image/jpeg',
      invoiceNumber: 'A008562',
      invoiceDate: new Date(Date.UTC(2025, 11, 14)),
      subtotal: 163.52,
      cgst: 4.09,
      sgst: 4.09,
      totalGst: 8.18,
      roundOff: 0.3,
      grandTotal: 172,
      items: {
        create: [
          {
            serialNumber: 1,
            name: 'Restonite Spray 15ml',
            manufacturer: 'Alkem',
            batchNumber: 'RSL25001',
            expiryDate: '8/26',
            hsnCode: '30049099',
            quantity: 2,
            freeQuantity: null,
            unit: '15ML',
            mrp: 95,
            rate: 62.5,
            discount: 10,
            gstPercent: 5,
            itemTotal: 112.5,
          },
          {
            serialNumber: 2,
            name: 'Nichophylline Tab',
            // Deliberately missing HSN and MFR — acceptance test 5
            batchNumber: 'C3NIC001',
            expiryDate: '3/27',
            quantity: 1,
            unit: '10*10',
            mrp: 40,
            rate: 26.02,
            gstPercent: 5,
            itemTotal: 26.02,
          },
          {
            serialNumber: 3,
            name: 'Propibeat-40 SR',
            manufacturer: 'Intas',
            // Leading-zero / scientific-notation trap — acceptance test 2
            batchNumber: '5P10775',
            expiryDate: '3/27',
            hsnCode: '30049011',
            quantity: 1,
            unit: '10*10',
            mrp: 38,
            rate: 25,
            gstPercent: 12,
            itemTotal: 25,
          },
        ],
      },
    },
    include: { items: true },
  });

  // A bill outside the range, to prove date filtering works
  await prisma.bill.create({
    data: {
      userId,
      distributorId: secondDistributorId,
      billType: 'purchase',
      status: 'completed',
      fileName: 'B001.jpg', filePath: '/x', fileSize: 0, mimeType: 'image/jpeg',
      invoiceNumber: 'B00199',
      invoiceDate: new Date(Date.UTC(2026, 4, 2)),
      subtotal: 500, cgst: 12.5, sgst: 12.5, totalGst: 25, grandTotal: 525,
      items: {
        create: [{
          serialNumber: 1, name: 'Other Med', batchNumber: 'OTH01',
          expiryDate: '1/28', quantity: 5, unit: '10*10', rate: 100,
          gstPercent: 5, itemTotal: 500,
        }],
      },
    },
  });

  // Products + batches for the expiry export, across two distributors
  const products = [
    { name: 'Restonite Spray 15ml', batch: 'RSL25001', expiry: '31-08-2026', qty: 2, dist: 1 },
    { name: 'Propibeat-40 SR', batch: '5P10775', expiry: '31-03-2027', qty: 20, dist: 1 },
    { name: 'Other Med', batch: 'OTH01', expiry: '31-01-2028', qty: 5, dist: 2 },
  ];
  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        userId,
        name: p.name,
        nameNormalized: `${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}${RUN_ID}`,
        baseUnit: 'unit',
      },
    });
    // Link the batch to its purchase line so the export can resolve the distributor
    const sourceItem = await prisma.billItem.findFirst({
      where: { bill: { userId }, batchNumber: p.batch },
    });
    await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: p.batch,
        expiryDate: parseExpiryToUtcDate(p.expiry),
        quantityBase: p.qty,
        sourceBillItemId: sourceItem?.id || null,
      },
    });
  }

  console.log(`Setup complete (user ${userId})\n`);
  return bill;
}

// ============================================================
// TESTS
// ============================================================

// 1. December 2025 purchases export → A008562 rows + GST Summary totals
async function test1() {
  console.log('TEST 1 — Purchases export for December 2025');
  const { buffer, fileName, rowCount } = await exportService.generateExport(
    userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'xlsx'
  );

  check('row count (A008562 only)', rowCount, 3);
  check('file name', fileName, 'Setu_Purchases_01122025-31122025.xlsx');

  const workbook = await readWorkbook(buffer);
  check('sheet names', workbook.worksheets.map((s) => s.name), ['Purchase Items', 'GST Summary']);

  const items = rowsOf(workbook.getWorksheet('Purchase Items'));
  const restonite = items.find((r) => r['Product Name'] === 'Restonite Spray 15ml');
  const nicho = items.find((r) => r['Product Name'] === 'Nichophylline Tab');
  const propi = items.find((r) => r['Product Name'] === 'Propibeat-40 SR');

  check('Restonite batch', restonite['Batch No'], 'RSL25001');
  check('Restonite raw expiry', restonite['Expiry'], '8/26');
  check(
    'Restonite normalized expiry',
    new Date(restonite['Expiry (Date)']).toISOString().slice(0, 10),
    '2026-08-31'
  );
  check('Restonite rate', restonite['Rate'], 62.5);
  check('Restonite GST %', restonite['GST %'], 5);
  check('Restonite MRP', restonite['MRP'], 95);
  check('Nichophylline batch', nicho['Batch No'], 'C3NIC001');
  check('Propibeat batch', propi['Batch No'], '5P10775');
  check('Propibeat GST %', propi['GST %'], 12);
  check('invoice no on every row', [...new Set(items.map((r) => r['Invoice No']))], ['A008562']);
  check('distributor GSTIN', restonite['Distributor GSTIN'], '03AABCL1234M1Z5');

  // GST Summary
  const gst = rowsOf(workbook.getWorksheet('GST Summary'));
  const billRow = gst.find((r) => r['Invoice No'] === 'A008562');
  check('GST taxable', billRow['Taxable Value'], 163.52);
  check('GST CGST', billRow['CGST'], 4.09);
  check('GST SGST', billRow['SGST'], 4.09);
  check('GST grand total', billRow['Grand Total'], 172);

  // Rate-wise subtotals for ITC matching
  const rate5 = gst.find((r) => r['Invoice No'] === 'GST 5%');
  const rate12 = gst.find((r) => r['Invoice No'] === 'GST 12%');
  checkTrue('5% subtotal row present', !!rate5, rate5 && `taxable ${rate5['Taxable Value']}`);
  checkTrue('12% subtotal row present', !!rate12, rate12 && `taxable ${rate12['Taxable Value']}`);
  check('5% taxable = 112.5 + 26.02', rate5['Taxable Value'], 138.52);
  check('12% taxable = 25', rate12['Taxable Value'], 25);
  checkTrue('TOTAL row present', !!gst.find((r) => r['Invoice No'] === 'TOTAL'));
}

// 2. Batch "5P10775" survives as text, not scientific notation
async function test2() {
  console.log('TEST 2 — Batch numbers stay text in Excel');
  const { buffer } = await exportService.generateExport(
    userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'xlsx'
  );
  const workbook = await readWorkbook(buffer);
  const sheet = workbook.getWorksheet('Purchase Items');

  const batchCol = sheet.getRow(1).values.slice(1).indexOf('Batch No') + 1;
  let found = null;
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    if (row.getCell(batchCol).value === '5P10775') found = row.getCell(batchCol);
  });

  checkTrue('5P10775 present', !!found);
  check('stored as string', typeof found.value, 'string');
  check('exact value preserved', found.value, '5P10775');
  check('cell explicitly text-formatted', found.numFmt, '@');
  checkTrue('not scientific notation', !String(found.value).includes('E+'), String(found.value));
}

// 3. CSV opens in Excel on Windows with ₹ and Hindi intact
async function test3() {
  console.log('TEST 3 — CSV carries a UTF-8 BOM');
  // A product name with Devanagari and a rupee sign
  const bill = await prisma.bill.findFirst({ where: { userId, invoiceNumber: 'A008562' } });
  await prisma.billItem.create({
    data: {
      billId: bill.id, serialNumber: 4, name: 'पैरासिटामोल ₹50 Tab',
      batchNumber: 'HIN001', expiryDate: '5/27', quantity: 1, unit: '10*10',
      rate: 50, gstPercent: 5, itemTotal: 50,
    },
  });

  const { buffer } = await exportService.generateExport(
    userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'csv'
  );

  check('starts with UTF-8 BOM', buffer.slice(0, 3).toString('hex'), 'efbbbf');

  const text = buffer.toString('utf8');
  checkTrue('Devanagari intact', text.includes('पैरासिटामोल'));
  checkTrue('rupee sign intact', text.includes('₹50'));
  checkTrue('header row present', text.includes('Invoice No,Invoice Date'));
  checkTrue('batch verbatim in CSV', text.includes('5P10775'));
  checkTrue('CRLF line endings for Excel', text.includes('\r\n'));

  // Clean up so later tests keep their expected row counts
  await prisma.billItem.deleteMany({ where: { batchNumber: 'HIN001' } });
}

// 4. Expiry export grouped by distributor → one sheet each, days-left correct
async function test4() {
  console.log('TEST 4 — Expiry export grouped by distributor');
  const { buffer, rowCount } = await exportService.generateExport(
    userId, 'expiry', { groupByDistributor: true }, 'xlsx'
  );

  check('all batches included', rowCount, 3);

  const workbook = await readWorkbook(buffer);
  const sheetNames = workbook.worksheets.map((s) => s.name);
  check('one sheet per distributor', sheetNames.length, 2);
  checkTrue('Laksh sheet present', sheetNames.some((n) => n.startsWith('Laksh Pharma')), sheetNames.join(', '));
  checkTrue('Bhalla sheet present', sheetNames.some((n) => n.startsWith('Bhalla Medical')));

  const lakshSheet = workbook.worksheets.find((s) => s.name.startsWith('Laksh Pharma'));
  const lakshRows = rowsOf(lakshSheet);
  check('Laksh batch count', lakshRows.length, 2);

  // days-left must be correct against today
  const restonite = lakshRows.find((r) => r['Batch No'] === 'RSL25001');
  const expiry = new Date(restonite['Expiry']);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expectedDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  check('days left correct vs today', restonite['Days Left'], expectedDays);
  check('quantity carried', restonite['Quantity'], 2);
  check('distributor resolved', restonite['Distributor'], `Laksh Pharma ${RUN_ID}`);

  // withinDays filter
  const soon = await exportService.previewExport(userId, 'expiry', { withinDays: 400 });
  checkTrue('withinDays filter narrows results', soon.rowCount < 3, `${soon.rowCount} of 3`);
}

// 5. Missing HSN/MFR export as blank cells, never "null"
async function test5() {
  console.log('TEST 5 — Missing fields export blank, not "null"');
  const { buffer } = await exportService.generateExport(
    userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'xlsx'
  );
  const workbook = await readWorkbook(buffer);
  const items = rowsOf(workbook.getWorksheet('Purchase Items'));
  const nicho = items.find((r) => r['Product Name'] === 'Nichophylline Tab');

  check('missing HSN is blank', nicho['HSN'] ?? null, null);
  check('missing MFR is blank', nicho['MFR'] ?? null, null);
  check('missing Free Qty is blank', nicho['Free Qty'] ?? null, null);

  const asText = JSON.stringify(items);
  checkTrue('no "null" strings anywhere', !asText.includes('"null"'), '');
  checkTrue('no "undefined" strings anywhere', !asText.includes('"undefined"'));

  // CSV must also leave them empty rather than writing the word null
  const { buffer: csv } = await exportService.generateExport(
    userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'csv'
  );
  const csvText = csv.toString('utf8');
  checkTrue('CSV has no "null" text', !/,null,/.test(csvText));
  checkTrue('CSV has no "undefined" text', !/undefined/.test(csvText));
}

// 6. (Share sheet is client-side.) Verify the file is a valid, openable workbook.
async function test6() {
  console.log('TEST 6 — Generated file is a valid workbook with correct metadata');
  const { buffer, fileName, mimeType } = await exportService.generateExport(
    userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'xlsx'
  );

  // xlsx is a zip — must start with the PK magic bytes or mobile Excel won't open it
  check('valid xlsx magic bytes', buffer.slice(0, 2).toString('utf8'), 'PK');
  check('mime type', mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  checkTrue('file name matches Setu_ convention', /^Setu_Purchases_\d{8}-\d{8}\.xlsx$/.test(fileName), fileName);

  const workbook = await readWorkbook(buffer);
  const sheet = workbook.getWorksheet('Purchase Items');
  checkTrue('header row is bold', sheet.getRow(1).font?.bold === true);
  checkTrue('header row frozen', sheet.views?.[0]?.state === 'frozen', JSON.stringify(sheet.views?.[0]));
  checkTrue('columns have widths', sheet.columns.every((c) => c.width > 0));

  // Dates must be real dates and numbers real numbers, or ERP imports break
  const dateCol = sheet.getRow(1).values.slice(1).indexOf('Invoice Date') + 1;
  const qtyCol = sheet.getRow(1).values.slice(1).indexOf('Qty') + 1;
  checkTrue('invoice date is a real Date', sheet.getRow(2).getCell(dateCol).value instanceof Date);
  check('qty is a real number', typeof sheet.getRow(2).getCell(qtyCol).value, 'number');
}

// 7. Zero matching records → "No data in this range", no empty file
async function test7() {
  console.log('TEST 7 — Empty range produces no file');
  let threw = false;
  let message = '';
  let isNoData = false;
  try {
    await exportService.generateExport(userId, 'purchases', { from: '2020-01-01', to: '2020-01-31' }, 'xlsx');
  } catch (error) {
    threw = true;
    message = error.message;
    isNoData = !!error.isNoData;
  }

  checkTrue('generation refused', threw);
  check('message', message, 'No data in this range');
  checkTrue('flagged as no-data (maps to 404)', isNoData);

  const preview = await exportService.previewExport(userId, 'purchases', { from: '2020-01-01', to: '2020-01-31' });
  check('preview row count', preview.rowCount, 0);
  check('preview summary', preview.summary, 'No data in this range');
}

// 8. Preview counts, export log, and the immutability rule
async function test8() {
  console.log('TEST 8 — Preview, audit log, and no mutation');
  const preview = await exportService.previewExport(userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' });
  check('preview summary text', preview.summary, '3 items from 1 bill');

  const before = await prisma.billItem.findMany({
    where: { bill: { userId } },
    select: { id: true, batchNumber: true, quantity: true },
    orderBy: { id: 'asc' },
  });

  await exportService.generateExport(userId, 'purchases', { from: '2025-12-01', to: '2025-12-31' }, 'xlsx');

  const after = await prisma.billItem.findMany({
    where: { bill: { userId } },
    select: { id: true, batchNumber: true, quantity: true },
    orderBy: { id: 'asc' },
  });
  check('export mutated nothing', after, before);

  const logs = await prisma.exportLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  checkTrue('export logged', logs.length > 0, `${logs.length} log rows`);
  check('log type', logs[0].exportType, 'purchases');
  check('log row count', logs[0].rowCount, 3);
  checkTrue('log records the filters', !!logs[0].filters, JSON.stringify(logs[0].filters));
}

// ============================================================
// TEARDOWN
// ============================================================
async function teardown() {
  if (!userId) return;
  await prisma.exportLog.deleteMany({ where: { userId } });
  await prisma.saleItem.deleteMany({ where: { sale: { userId } } });
  await prisma.sale.deleteMany({ where: { userId } });
  await prisma.productBatch.deleteMany({ where: { product: { userId } } });
  await prisma.billItem.deleteMany({ where: { bill: { userId } } });
  await prisma.bill.deleteMany({ where: { userId } });
  await prisma.product.deleteMany({ where: { userId } });
  await prisma.distributor.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  console.log('\nTest data cleaned up.');
}

async function main() {
  console.log('===== Export acceptance tests (spec §5) =====\n');
  await setup();

  await test1();
  await test2();
  await test3();
  await test4();
  await test5();
  await test6();
  await test7();
  await test8();

  console.log(`\n===== ${passed} passed, ${failed} failed =====`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('\nTEST RUN FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await teardown().catch((e) => console.error('Teardown error:', e.message));
    await prisma.$disconnect();
  });
