-- P5: whole-bill edit — append-only audit trail. One row per changed field per edit,
-- never updated or deleted (archive-never-delete applies to history too).

CREATE TABLE "BillEditLog" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "billItemId" TEXT,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillEditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillEditLog_billId_editedAt_idx" ON "BillEditLog"("billId", "editedAt");
CREATE INDEX "BillEditLog_billItemId_idx" ON "BillEditLog"("billItemId");

ALTER TABLE "BillEditLog"
  ADD CONSTRAINT "BillEditLog_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "Bill"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillEditLog"
  ADD CONSTRAINT "BillEditLog_billItemId_fkey"
  FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
