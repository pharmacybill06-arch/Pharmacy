#!/usr/bin/env node
/**
 * READ-ONLY report: every payment allocation where the bill's invoice date is AFTER
 * the payment date (compared as IST calendar days).
 *
 * Some of these are correct (an advance deliberately adjusted against a later bill),
 * so this only LISTS them. It never updates or deletes anything.
 *
 * Usage (from backend/):
 *   DATABASE_URL=... node scripts/report-bill-after-payment.js            # all shops, CSV to stdout
 *   DATABASE_URL=... node scripts/report-bill-after-payment.js <userId>   # one shop
 *   ... > bill-after-payment.csv
 *
 * Same data is available per shop from the API:
 *   GET /api/ledger/user/:userId/reports/bill-after-payment[?format=csv]
 */
const prisma = require('../src/models/prisma');
const { getLateBillAllocationsReport } = require('../src/services/ledgerService');
const { toCsv } = require('../src/utils/csv');

(async () => {
  const userId = process.argv[2] || undefined;
  const rows = await getLateBillAllocationsReport({ userId });
  process.stdout.write(toCsv(rows));
  console.error(`${rows.length} allocation(s) where bill date > payment date${userId ? ` for user ${userId}` : ''}. Nothing was changed.`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
