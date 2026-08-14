-- P1 fix: ProductBatch batch-number matching was case-sensitive (Postgres default
-- collation), so a case/whitespace variant of the same physical batch (e.g. OCR reads
-- "V2600095" once and "v2600095" the next purchase) could silently create a second
-- ProductBatch row instead of topping up the existing one.
--
-- Adds a normalized (trim + lowercase) matching key. batchNumber itself is untouched —
-- still stored verbatim, never auto-corrected — batchNumberNormalized is a matching/dedup
-- key only, never displayed.

ALTER TABLE "ProductBatch" ADD COLUMN IF NOT EXISTS "batchNumberNormalized" TEXT;

UPDATE "ProductBatch" SET "batchNumberNormalized" = lower(trim("batchNumber"))
WHERE "batchNumberNormalized" IS NULL;

ALTER TABLE "ProductBatch" ALTER COLUMN "batchNumberNormalized" SET NOT NULL;

-- Drop the old case-sensitive unique constraint and its backing index, replace with the
-- normalized one. (No existing duplicates as of this migration — verified against
-- production data before writing this migration — so this is a plain rename-in-place,
-- not a merge. backend/scripts/dedupe-product-batches.js exists for any that show up later.)
DROP INDEX IF EXISTS "ProductBatch_productId_batchNumber_key";
CREATE UNIQUE INDEX "ProductBatch_productId_batchNumberNormalized_key"
  ON "ProductBatch"("productId", "batchNumberNormalized");
