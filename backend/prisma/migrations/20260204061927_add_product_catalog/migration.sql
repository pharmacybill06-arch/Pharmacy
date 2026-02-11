-- AlterTable
ALTER TABLE "BillItem" ADD COLUMN     "isProductMatched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "manufacturer" TEXT,
    "hsnCode" TEXT,
    "defaultMrp" DOUBLE PRECISION,
    "defaultRate" DOUBLE PRECISION,
    "gstPercent" DOUBLE PRECISION,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_userId_idx" ON "Product"("userId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_nameNormalized_idx" ON "Product"("nameNormalized");

-- CreateIndex
CREATE INDEX "Product_lastUsedAt_idx" ON "Product"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_userId_nameNormalized_key" ON "Product"("userId", "nameNormalized");

-- CreateIndex
CREATE INDEX "BillItem_productId_idx" ON "BillItem"("productId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
