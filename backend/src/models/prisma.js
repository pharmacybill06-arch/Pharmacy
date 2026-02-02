// Prisma client singleton pattern to avoid multiple instances
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    console.log(`[${e.duration}ms] ${e.query}`);
  });
}

module.exports = prisma;
