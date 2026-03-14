
// Load environment variables early
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// Prisma client singleton pattern to avoid multiple instances
const { PrismaClient } = require('@prisma/client');

let prisma;

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  return client;
}

// Use global to prevent multiple instances in dev (hot reload)
if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
