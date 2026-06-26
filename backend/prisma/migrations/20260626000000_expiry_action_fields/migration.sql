-- Add expiry action management fields to BillItem
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "remainingQty" DOUBLE PRECISION;
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "expiryStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "firstEnteredWindowAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BillItem_expiryStatus_idx" ON "BillItem"("expiryStatus");
