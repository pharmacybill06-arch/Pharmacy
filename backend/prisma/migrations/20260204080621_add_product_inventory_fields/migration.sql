-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "ptr" DOUBLE PRECISION,
ADD COLUMN     "purchaseDate" TEXT,
ADD COLUMN     "quantity" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Product_expiryDate_idx" ON "Product"("expiryDate");
