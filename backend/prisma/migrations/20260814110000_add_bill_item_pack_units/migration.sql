-- P3: Dual-unit capture (Unit 1 / Unit 2 / conversion) at bill entry, mirroring
-- Product.packLabel/baseUnit/packSize. Nullable — older bills predate this and keep
-- using the legacy free-text BillItem.unit column.

ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "packLabel" TEXT;
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "baseUnit" TEXT;
ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "packSize" INTEGER;
