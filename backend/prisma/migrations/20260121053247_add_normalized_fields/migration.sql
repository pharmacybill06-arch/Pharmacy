/*
  Warnings:

  - Added the required column `itemTotal` to the `BillItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `BillItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rate` to the `BillItem` table without a default value. This is not possible if the table is not empty.
  - Made the column `quantity` on table `BillItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `unit` on table `BillItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Bill_billDate_idx";

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "aiParser" TEXT,
ADD COLUMN     "amountPaid" DOUBLE PRECISION,
ADD COLUMN     "balanceAmount" DOUBLE PRECISION,
ADD COLUMN     "cgst" DOUBLE PRECISION,
ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "discountAmount" DOUBLE PRECISION,
ADD COLUMN     "doctorName" TEXT,
ADD COLUMN     "grandTotal" DOUBLE PRECISION,
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "ocrEngine" TEXT,
ADD COLUMN     "paymentType" TEXT,
ADD COLUMN     "phoneNumbers" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "rawOcrText" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "roundOff" DOUBLE PRECISION,
ADD COLUMN     "sgst" DOUBLE PRECISION,
ADD COLUMN     "shopAddress" TEXT,
ADD COLUMN     "subtotal" DOUBLE PRECISION,
ADD COLUMN     "totalGst" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BillItem" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "cgstPercent" DOUBLE PRECISION,
ADD COLUMN     "discount" DOUBLE PRECISION,
ADD COLUMN     "expiryDate" TEXT,
ADD COLUMN     "freeQuantity" DOUBLE PRECISION,
ADD COLUMN     "gstPercent" DOUBLE PRECISION,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "itemTotal" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "mrp" DOUBLE PRECISION,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "rate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "serialNumber" INTEGER,
ADD COLUMN     "sgstPercent" DOUBLE PRECISION,
ALTER COLUMN "itemName" DROP NOT NULL,
ALTER COLUMN "quantity" SET NOT NULL,
ALTER COLUMN "unit" SET NOT NULL,
ALTER COLUMN "unit" SET DEFAULT 'units';

-- CreateIndex
CREATE INDEX "Bill_invoiceDate_idx" ON "Bill"("invoiceDate");

-- CreateIndex
CREATE INDEX "Bill_pharmacyName_idx" ON "Bill"("pharmacyName");

-- CreateIndex
CREATE INDEX "Bill_invoiceNumber_idx" ON "Bill"("invoiceNumber");

-- CreateIndex
CREATE INDEX "BillItem_name_idx" ON "BillItem"("name");
