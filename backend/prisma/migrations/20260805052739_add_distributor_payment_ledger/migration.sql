-- Distributor Payments (Khata) — Phase 1
-- Adds opening balance to Distributor, due date to Bill, ledger fields to Payment,
-- and a PaymentAllocation join table linking payments to bills (or opening_balance/on_account).

-- Distributor: opening balance carried over from before the app was adopted
ALTER TABLE "Distributor" ADD COLUMN IF NOT EXISTS "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Distributor" ADD COLUMN IF NOT EXISTS "openingBalanceNote" TEXT;
ALTER TABLE "Distributor" ADD COLUMN IF NOT EXISTS "openingBalanceUpdatedAt" TIMESTAMP(3);

-- Bill: due date drives overdue logic
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Bill_dueDate_idx" ON "Bill"("dueDate");

-- Payment: ledger fields (reference number, attachment source, archive-only soft delete)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "attachmentSource" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Payment_isArchived_idx" ON "Payment"("isArchived");

-- PaymentAllocation: join table between Payment and Bill
CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billId" TEXT,
    "allocationType" TEXT NOT NULL DEFAULT 'bill',
    "allocatedAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_billId_idx" ON "PaymentAllocation"("billId");

DO $$ BEGIN
    ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey"
        FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_billId_fkey"
        FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
