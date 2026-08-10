-- Quick Sell + Daily Sale Register — Phase 1
-- Moves stock from a single Product.stock/batchNumber/expiryDate triple down to batch level
-- (ProductBatch), and adds the Sale/SaleItem tables that deduct from it.
--
-- The old Product.batchNumber / Product.expiryDate / Product.stock columns are intentionally
-- NOT dropped — they are marked deprecated in schema.prisma and left in place for rollback
-- safety. Product.stock becomes a derived display value = SUM(batches.quantityBase).

-- ============================================================
-- Product: pack/unit definition + regulatory schedule flag
-- ============================================================
-- All stock math is in base units; packs are a display conversion only.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "packSize" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "baseUnit" TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "packLabel" TEXT NOT NULL DEFAULT 'pack';
-- none | h1 | nrx — h1/nrx force a billed sale with customer + doctor captured
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "scheduleFlag" TEXT NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS "Product_scheduleFlag_idx" ON "Product"("scheduleFlag");

-- ============================================================
-- ProductBatch: batch-level stock (FEFO source of truth)
-- ============================================================
CREATE TABLE IF NOT EXISTS "ProductBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    -- Stored exactly as entered/extracted. Never auto-corrected or auto-filled.
    "batchNumber" TEXT NOT NULL,
    -- Proper date type (month-only inputs are parsed to the last day of that month)
    "expiryDate" TIMESTAMP(3),
    -- Base units (tablets/ml/pieces), never strips. May go negative on stock mismatch.
    "quantityBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseRate" DOUBLE PRECISION,
    "mrp" DOUBLE PRECISION,
    "sourceBillItemId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductBatch_productId_batchNumber_key" ON "ProductBatch"("productId", "batchNumber");
CREATE INDEX IF NOT EXISTS "ProductBatch_productId_expiryDate_idx" ON "ProductBatch"("productId", "expiryDate");
CREATE INDEX IF NOT EXISTS "ProductBatch_sourceBillItemId_idx" ON "ProductBatch"("sourceBillItemId");

DO $$ BEGIN
    ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_sourceBillItemId_fkey"
        FOREIGN KEY ("sourceBillItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Sale: one counter sale (quick = unbilled, billed = has a Bill)
-- ============================================================
CREATE TABLE IF NOT EXISTS "Sale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'quick',
    "billId" TEXT,
    -- Mandatory only for Schedule H1 / NRX sales
    "customerName" TEXT,
    "doctorName" TEXT,
    "customerPhone" TEXT,
    "totalAmount" DOUBLE PRECISION,
    -- Archive, never delete — archiving restores stock to the batches
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_billId_key" ON "Sale"("billId");
CREATE INDEX IF NOT EXISTS "Sale_userId_saleDate_idx" ON "Sale"("userId", "saleDate");
CREATE INDEX IF NOT EXISTS "Sale_userId_status_idx" ON "Sale"("userId", "status");
CREATE INDEX IF NOT EXISTS "Sale_isArchived_idx" ON "Sale"("isArchived");

DO $$ BEGIN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_billId_fkey"
        FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SaleItem: one sale line, always pinned to its exact batch
-- ============================================================
CREATE TABLE IF NOT EXISTS "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    -- Mandatory: the recall-traceability hook
    "productBatchId" TEXT NOT NULL,
    "quantityBase" DOUBLE PRECISION NOT NULL,
    "pricePerBase" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "SaleItem_productId_idx" ON "SaleItem"("productId");
CREATE INDEX IF NOT EXISTS "SaleItem_productBatchId_idx" ON "SaleItem"("productBatchId");

DO $$ BEGIN
    ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey"
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Restrict: a product that has been sold can never be hard-deleted out from under history
DO $$ BEGIN
    ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Restrict: likewise for the batch — recall traceability must survive
DO $$ BEGIN
    ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productBatchId_fkey"
        FOREIGN KEY ("productBatchId") REFERENCES "ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
