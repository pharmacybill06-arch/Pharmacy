-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "distributorId" TEXT;

-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "gstin" TEXT,
    "dlNumber" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Distributor_userId_idx" ON "Distributor"("userId");

-- CreateIndex
CREATE INDEX "Distributor_name_idx" ON "Distributor"("name");

-- CreateIndex
CREATE INDEX "Distributor_gstin_idx" ON "Distributor"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_userId_name_gstin_key" ON "Distributor"("userId", "name", "gstin");

-- CreateIndex
CREATE INDEX "Bill_distributorId_idx" ON "Bill"("distributorId");

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
