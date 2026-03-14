require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Creating table...');
  await sql`
    CREATE TABLE IF NOT EXISTS "EmailProcessingLog" (
      "id" TEXT NOT NULL,
      "messageId" TEXT NOT NULL,
      "subject" TEXT,
      "sender" TEXT,
      "emailDate" TIMESTAMP(3),
      "attachments" INTEGER NOT NULL DEFAULT 0,
      "billsCreated" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'processed',
      "errorMessage" TEXT,
      "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmailProcessingLog_pkey" PRIMARY KEY ("id")
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "EmailProcessingLog_messageId_key" ON "EmailProcessingLog"("messageId");`;
  await sql`CREATE INDEX IF NOT EXISTS "EmailProcessingLog_messageId_idx" ON "EmailProcessingLog"("messageId");`;
  await sql`CREATE INDEX IF NOT EXISTS "EmailProcessingLog_processedAt_idx" ON "EmailProcessingLog"("processedAt");`;
  console.log("Table created!");
}

main().catch(console.error);
