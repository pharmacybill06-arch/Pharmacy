/**
 * Acceptance tests for Quick Sell + Daily Sale Register (spec §8).
 *
 * Runs the ten scenarios from the feature spec against the real database using a
 * throwaway user, then removes everything it created.
 *
 * Usage: node scripts/test-quick-sell.js
 */

const prisma = require('../src/models/prisma');
const saleService = require('../src/services/saleService');
const batchService = require('../src/services/batchService');
const { parseExpiryToUtcDate } = require('../src/utils/dateUtils');

const RUN_ID = Date.now();
let userId = null;
let restonite = null;
let propibeat = null;

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

// Scoped to this run's throwaway user — real backfilled data can carry the same
// batch numbers (they come off real invoices), so a global lookup is ambiguous.
const findBatch = async (batchNumber) => {
  const rows = await prisma.productBatch.findMany({
    where: { batchNumber, product: { userId } },
  });
  if (rows.length !== 1) {
    throw new Error(`Expected exactly 1 batch "${batchNumber}" for test user, found ${rows.length}`);
  }
  return rows[0];
};

const batchQty = async (batchNumber) => (await findBatch(batchNumber)).quantityBase;
const batchId = async (batchNumber) => (await findBatch(batchNumber)).id;

// ============================================================
// SETUP (spec §8)
// ============================================================
async function setup() {
  const user = await prisma.user.create({
    data: { phone: `+9199${String(RUN_ID).slice(-8)}`, name: 'Acceptance Test User' },
  });
  userId = user.id;

  restonite = await prisma.product.create({
    data: {
      userId,
      name: 'Restonite Spray 15ml',
      nameNormalized: `restonitespray15ml${RUN_ID}`,
      packSize: 1,
      baseUnit: 'unit',
      packLabel: 'bottle',
    },
  });

  propibeat = await prisma.product.create({
    data: {
      userId,
      name: 'Propibeat-40 SR',
      nameNormalized: `propibeat40sr${RUN_ID}`,
      packSize: 10,
      baseUnit: 'tablet',
      packLabel: 'strip',
    },
  });

  await resetBatches();
  console.log(`Setup complete (user ${userId})\n`);
}

/** Restore the exact starting stock from the spec so tests that state absolute numbers hold. */
async function resetBatches() {
  const seed = [
    { product: restonite, batchNumber: 'RSL25001', expiry: '31-08-2026', qty: 2 },
    { product: propibeat, batchNumber: 'ALA01CPA', expiry: '31-03-2027', qty: 20 },
    { product: propibeat, batchNumber: 'ALA09ZZZ', expiry: '31-12-2026', qty: 10 },
  ];

  for (const s of seed) {
    await prisma.productBatch.upsert({
      where: { productId_batchNumber: { productId: s.product.id, batchNumber: s.batchNumber } },
      create: {
        productId: s.product.id,
        batchNumber: s.batchNumber,
        expiryDate: parseExpiryToUtcDate(s.expiry),
        quantityBase: s.qty,
      },
      update: { quantityBase: s.qty },
    });
  }
  await batchService.syncProductStock(prisma, [restonite.id, propibeat.id]);
}

// ============================================================
// TESTS
// ============================================================

// 1. FEFO: sell 5 tabs Propibeat -> auto-picks ALA09ZZZ (earlier expiry), NOT ALA01CPA
async function test1() {
  console.log('TEST 1 — FEFO auto-pick');
  const result = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, quantityBase: 5 }],
  });

  check('batch picked', result.sale.items[0].batchNumber, 'ALA09ZZZ');
  check('ALA09ZZZ remaining', await batchQty('ALA09ZZZ'), 5);
  check('ALA01CPA untouched', await batchQty('ALA01CPA'), 20);
  return result.sale.id;
}

// 2. Loose sale: 5 tabs left reads "5 tablets", never "0.5 strip"
async function test2() {
  console.log('TEST 2 — Loose sale labelling');
  const { batches } = await batchService.getProductBatches(propibeat.id);
  const ala09 = batches.find((b) => b.batchNumber === 'ALA09ZZZ');

  check('batch label', ala09.quantityLabel, '5 tablets');
  checkTrue('no fractional pack shown', !ala09.quantityLabel.includes('strip'), ala09.quantityLabel);

  const register = await saleService.getDailyRegister(
    userId, new Date().toISOString().slice(0, 10), 0
  );
  const line = register.sales[0].items[0];
  check('register line label', line.quantityLabel, '5 tablets');
}

// 3. Auto-split: sell 8 tabs -> 5 from ALA09ZZZ + 3 from ALA01CPA, shown before save
async function test3() {
  console.log('TEST 3 — Auto-split across FEFO batches');
  // Preview shown to the user before saving
  const plan = await batchService.planAllocation(propibeat.id, 8);
  check('preview split count', plan.allocations.length, 2);
  check(
    'preview split',
    plan.allocations.map((a) => `${a.quantityBase} from ${a.batchNumber}`),
    ['5 from ALA09ZZZ', '3 from ALA01CPA']
  );
  checkTrue('flagged as split', plan.isSplit === true);

  const result = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, quantityBase: 8 }],
  });
  check('sale lines created', result.sale.items.length, 2);
  check('ALA09ZZZ drained', await batchQty('ALA09ZZZ'), 0);
  check('ALA01CPA reduced', await batchQty('ALA01CPA'), 17);
}

// 4. Override: manually switch to ALA01CPA — allowed, deducts from it
async function test4() {
  console.log('TEST 4 — Manual batch override');
  await resetBatches();

  const result = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, productBatchId: await batchId('ALA01CPA'), quantityBase: 5 }],
  });

  check('overridden batch used', result.sale.items[0].batchNumber, 'ALA01CPA');
  check('ALA01CPA deducted', await batchQty('ALA01CPA'), 15);
  check('ALA09ZZZ untouched despite earlier expiry', await batchQty('ALA09ZZZ'), 10);
}

// 5. Negative stock: sell 5 units Restonite (only 2) -> saves, batch -3, warning shown
async function test5() {
  console.log('TEST 5 — Negative stock warns, never blocks');
  const result = await saleService.createSale(userId, {
    items: [{ productId: restonite.id, quantityBase: 5 }],
  });

  checkTrue('sale saved', !!result.sale.id, result.sale.id);
  check('batch went negative', await batchQty('RSL25001'), -3);
  checkTrue('warning surfaced', result.warnings.length > 0, result.warnings[0]);
  checkTrue(
    'warning mentions stock mismatch',
    /stock mismatch/i.test(result.warnings[0] || '')
  );
}

// 6. H1 force: quick save blocked, doctor + customer required, bill created, badge shown
async function test6() {
  console.log('TEST 6 — Schedule H1 forced flow');
  const h1Product = await prisma.product.create({
    data: {
      userId,
      name: 'Alprax 0.5mg',
      nameNormalized: `alprax05mg${RUN_ID}`,
      packSize: 10,
      baseUnit: 'tablet',
      packLabel: 'strip',
      scheduleFlag: 'h1',
    },
  });
  await prisma.productBatch.create({
    data: {
      productId: h1Product.id,
      batchNumber: 'ALP77001',
      expiryDate: parseExpiryToUtcDate('31-12-2027'),
      quantityBase: 30,
    },
  });

  // Quick save (no customer/doctor) must be rejected
  let blocked = false;
  let message = '';
  try {
    await saleService.createSale(userId, {
      items: [{ productId: h1Product.id, quantityBase: 10 }],
    });
  } catch (error) {
    blocked = true;
    message = error.message;
  }
  checkTrue('quick save blocked', blocked, message);
  checkTrue('error names both required fields', /customer name and doctor name/i.test(message));

  // With both names it goes through, billed immediately
  const result = await saleService.createSale(userId, {
    items: [{ productId: h1Product.id, quantityBase: 10, pricePerBase: 5 }],
    customerName: 'Ramesh Kumar',
    doctorName: 'Dr. Mehta',
  });

  check('status is billed, not queued', result.sale.status, 'billed');
  checkTrue('bill created immediately', !!result.sale.billId, result.sale.billId);
  checkTrue('H1 badge flag set', result.sale.hasScheduledItem === true);

  const bill = await prisma.bill.findUnique({ where: { id: result.sale.billId } });
  check('bill is a sale bill', bill.billType, 'sale');
  check('bill carries doctor name', bill.doctorName, 'Dr. Mehta');
  check('stock deducted', await batchQty('ALP77001'), 20);

  // Never lands in the convert queue
  const pending = await saleService.getPendingSales(userId);
  checkTrue(
    'not in pending queue',
    !pending.sales.some((s) => s.id === result.sale.id)
  );
}

// 7. Convert queue: two quick sales -> convert both -> billed, Bills exist, stock unchanged
async function test7() {
  console.log('TEST 7 — Convert-to-bill queue');
  await resetBatches();

  const saleA = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, quantityBase: 2, pricePerBase: 4 }],
  });
  const saleB = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, quantityBase: 3 }],
  });

  const pending = await saleService.getPendingSales(userId);
  const pendingIds = pending.sales.map((s) => s.id);
  checkTrue('both sales queued', pendingIds.includes(saleA.sale.id) && pendingIds.includes(saleB.sale.id));
  checkTrue(
    'queue is oldest-first',
    new Date(pending.sales[0].saleDate) <= new Date(pending.sales[pending.sales.length - 1].saleDate)
  );

  const stockBefore = { ala09: await batchQty('ALA09ZZZ'), ala01: await batchQty('ALA01CPA') };

  const convertedA = await saleService.convertToBill(saleA.sale.id, { customerName: 'Walk-in' });
  const convertedB = await saleService.convertToBill(saleB.sale.id, {
    items: saleB.sale.items.map((i) => ({ saleItemId: i.id, pricePerBase: 6 })),
  });

  check('sale A billed', convertedA.sale.status, 'billed');
  check('sale B billed', convertedB.sale.status, 'billed');
  checkTrue('bill A linked', !!convertedA.billId);
  checkTrue('bill B linked', !!convertedB.billId);

  const billA = await prisma.bill.findUnique({ where: { id: convertedA.billId }, include: { items: true } });
  check('bill A is a sale bill', billA.billType, 'sale');
  check('bill A keeps the locked batch', billA.items[0].batchNumber, saleA.sale.items[0].batchNumber);
  check('bill A keeps the locked quantity', billA.items[0].quantity, saleA.sale.items[0].quantityBase);
  check('price edit applied to bill B', convertedB.sale.totalAmount, 18);

  const stockAfter = { ala09: await batchQty('ALA09ZZZ'), ala01: await batchQty('ALA01CPA') };
  check('stock unchanged by conversion', stockAfter, stockBefore);

  const pendingAfter = await saleService.getPendingSales(userId);
  checkTrue(
    'queue drained',
    !pendingAfter.sales.some((s) => [saleA.sale.id, saleB.sale.id].includes(s.id))
  );
}

// 8. Archive restores stock: archive test 1's sale -> ALA09ZZZ back to 10 tabs
async function test8() {
  console.log('TEST 8 — Archive restores stock');
  await resetBatches();

  const sale = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, quantityBase: 5 }],
  });
  check('after sale', await batchQty('ALA09ZZZ'), 5);

  const archived = await saleService.archiveSale(sale.sale.id);
  check('stock restored', await batchQty('ALA09ZZZ'), 10);
  checkTrue('sale marked archived', archived.isArchived === true);
  checkTrue('archivedAt stamped', !!archived.archivedAt);

  // Archived sales drop out of the register but the row still exists (never deleted)
  const register = await saleService.getDailyRegister(userId, new Date().toISOString().slice(0, 10), 0);
  checkTrue('hidden from register', !register.sales.some((s) => s.id === sale.sale.id));
  checkTrue('row still exists', !!(await prisma.sale.findUnique({ where: { id: sale.sale.id } })));

  // Restoring deducts again
  await saleService.unarchiveSale(sale.sale.id);
  check('stock deducted again on restore', await batchQty('ALA09ZZZ'), 5);
}

// 9. Register search: "Propibeat" -> all its sales across dates with batch numbers visible
async function test9() {
  console.log('TEST 9 — Cross-date register search');

  // Backdate one sale so the search genuinely spans multiple days
  const old = await saleService.createSale(userId, {
    items: [{ productId: propibeat.id, quantityBase: 1 }],
    saleDate: '2026-07-01T10:00:00.000Z',
  });

  const result = await saleService.searchSalesByProduct(userId, 'Propibeat');
  const group = result.products.find((p) => p.productId === propibeat.id);

  checkTrue('product found', !!group, group?.productName);
  checkTrue('multiple sales returned', group.saleCount > 1, `${group.saleCount} sales`);
  checkTrue(
    'every row shows its batch number',
    group.sales.every((s) => !!s.batchNumber)
  );
  checkTrue(
    'spans dates back to July',
    new Date(group.firstSoldAt).toISOString().slice(0, 10) === '2026-07-01',
    new Date(group.firstSoldAt).toISOString().slice(0, 10)
  );
  checkTrue(
    'backdated sale included',
    group.sales.some((s) => s.saleId === old.sale.id)
  );
}

// 10. Backfill: existing product with old string expiry "3/27" -> batch expiry 31-03-2027
async function test10() {
  console.log('TEST 10 — Backfill parses legacy string expiry');
  const legacy = await prisma.product.create({
    data: {
      userId,
      name: 'Legacy Product',
      nameNormalized: `legacyproduct${RUN_ID}`,
      batchNumber: 'LEG001',
      expiryDate: '3/27', // legacy free-text field
      stock: 12,
    },
  });

  // Mirrors exactly what scripts/backfill-product-batches.js does
  const batch = await prisma.productBatch.create({
    data: {
      productId: legacy.id,
      batchNumber: legacy.batchNumber,
      expiryDate: parseExpiryToUtcDate(legacy.expiryDate),
      quantityBase: legacy.stock,
    },
  });

  check('expiry parsed to last day of month', batch.expiryDate.toISOString().slice(0, 10), '2027-03-31');
  check('batch number copied verbatim', batch.batchNumber, 'LEG001');
  check('stock carried over', batch.quantityBase, 12);

  const unparseable = parseExpiryToUtcDate('not-a-date');
  check('unparseable expiry left null for review', unparseable, null);
}

// ============================================================
// TEARDOWN
// ============================================================
async function teardown() {
  if (!userId) return;
  // SaleItem -> Sale -> ProductBatch ordering matters: the FKs are RESTRICT by design
  await prisma.saleItem.deleteMany({ where: { sale: { userId } } });
  await prisma.sale.deleteMany({ where: { userId } });
  await prisma.productBatch.deleteMany({ where: { product: { userId } } });
  await prisma.billItem.deleteMany({ where: { bill: { userId } } });
  await prisma.bill.deleteMany({ where: { userId } });
  await prisma.product.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  console.log('\nTest data cleaned up.');
}

async function main() {
  console.log('===== Quick Sell acceptance tests (spec §8) =====\n');
  await setup();

  await test1();
  await test2();
  await test3();
  await test4();
  await test5();
  await test6();
  await test7();
  await test8();
  await test9();
  await test10();

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
