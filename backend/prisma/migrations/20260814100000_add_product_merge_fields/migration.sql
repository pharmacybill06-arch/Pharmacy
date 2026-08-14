-- P2: Merge Products tool — audit trail for duplicate catalog entries merged into a
-- survivor. Archive, never delete: the duplicate row stays in place with isActive=false
-- and mergedIntoProductId pointing at the survivor.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "mergedIntoProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_mergedIntoProductId_fkey"
  FOREIGN KEY ("mergedIntoProductId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Product_mergedIntoProductId_idx" ON "Product"("mergedIntoProductId");
