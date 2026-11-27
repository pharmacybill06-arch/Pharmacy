/**
 * Integration-test harness: real Express app + real Postgres (PRISMA_DRIVER=native).
 * Run with `npm test` (see package.json); needs TEST_DATABASE_URL pointing at a
 * throwaway database whose schema is pushed (`npx prisma db push`).
 */
process.env.PRISMA_DRIVER = 'native';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!/localhost|127\.0\.0\.1|host=\//.test(process.env.DATABASE_URL || '')) {
  throw new Error('Refusing to run tests against a non-local database. Set TEST_DATABASE_URL to a local Postgres.');
}

const prisma = require('../src/models/prisma');
const clock = require('../src/utils/clock');

let server;
let baseUrl;

async function startServer() {
  const app = require('../src/app');
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  return baseUrl;
}

async function stopServer() {
  clock.setNow(null);
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}

async function resetDb() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  );
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
    );
  }
}

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function createUser(id = 'user_test') {
  return prisma.user.create({ data: { id, email: `${id}@test.local`, name: 'Test', phone: `+91${Date.now()}` } });
}

/** Save a bill the way the app's scan review screen does. */
function saveBill(userId, { distributor = 'Bhalla Medical', invoiceNumber, invoiceDate, dueDate, grandTotal, items, confirmOldDate }) {
  return api('POST', `/bills/${userId}/save`, {
    parsedData: { pharmacyName: distributor, invoiceNumber, invoiceDate, dueDate, grandTotal, items },
    confirmOldDate,
  });
}

/** IST wall-clock time -> the UTC instant the server sees. */
function istInstant(isoLocal) {
  return new Date(new Date(`${isoLocal}Z`).getTime() - (5 * 60 + 30) * 60 * 1000);
}

module.exports = { prisma, clock, startServer, stopServer, resetDb, api, createUser, saveBill, istInstant };
