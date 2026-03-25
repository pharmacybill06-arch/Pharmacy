-- CreateTable
CREATE TABLE "EmailInboxConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zoho',
    "emailAddress" TEXT,
    "displayName" TEXT,
    "accountId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "apiDomain" TEXT NOT NULL DEFAULT 'https://mail.zoho.in',
    "accountsBaseUrl" TEXT NOT NULL DEFAULT 'https://accounts.zoho.in',
    "folderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "tokenUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailInboxConnection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EmailProcessingLog"
ADD COLUMN "userId" TEXT,
ADD COLUMN "connectionId" TEXT,
ADD COLUMN "folderId" TEXT;

-- Backfill userId from existing environment default if available.
-- Rows without a matching user will remain nullable until your app re-processes new emails.
UPDATE "EmailProcessingLog"
SET "userId" = NULL
WHERE "userId" IS NULL;

-- DropIndex
DROP INDEX IF EXISTS "EmailProcessingLog_messageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "EmailInboxConnection_userId_provider_key" ON "EmailInboxConnection"("userId", "provider");
CREATE INDEX "EmailInboxConnection_userId_isActive_idx" ON "EmailInboxConnection"("userId", "isActive");
CREATE INDEX "EmailProcessingLog_userId_idx" ON "EmailProcessingLog"("userId");
CREATE UNIQUE INDEX "EmailProcessingLog_connectionId_messageId_key" ON "EmailProcessingLog"("connectionId", "messageId");

-- AddForeignKey
ALTER TABLE "EmailInboxConnection"
ADD CONSTRAINT "EmailInboxConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailProcessingLog"
ADD CONSTRAINT "EmailProcessingLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailProcessingLog"
ADD CONSTRAINT "EmailProcessingLog_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "EmailInboxConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
