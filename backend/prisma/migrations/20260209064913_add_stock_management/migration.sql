-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "billType" TEXT NOT NULL DEFAULT 'purchase';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "minStock" DOUBLE PRECISION,
ADD COLUMN     "mrp" DOUBLE PRECISION,
ADD COLUMN     "purchaseRate" DOUBLE PRECISION,
ADD COLUMN     "sellingRate" DOUBLE PRECISION,
ADD COLUMN     "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'units';

-- CreateIndex
CREATE INDEX "Bill_billType_idx" ON "Bill"("billType");
