require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { PrismaClient } = require('@prisma/client');

// Tests (and any local Postgres) talk to the database directly. Production on Neon
// goes through the serverless websocket adapter below.
if (process.env.PRISMA_DRIVER === 'native') {
  module.exports = new PrismaClient();
  return;
}

const { Pool, neonConfig } = require('@neondatabase/serverless');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ws = require('ws');

// Configure Neon to use the standard ws library for WebSockets
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Neon drops idle connections when the database auto-suspends or restarts. When that
// happens to a connection sitting idle in this pool, the pool emits 'error' — and an
// 'error' event with no listener is an uncaught exception that takes the whole server
// down. Log it instead; the pool discards the dead client and opens a fresh one on the
// next query.
pool.on('error', (err) => {
  console.warn('[DB] Idle database connection dropped (pool will reconnect):', err.message);
});

const adapter = new PrismaNeon(pool);

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
