-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "distributorId" TEXT,
    "transactionId" TEXT,
    "upiRefNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "payeeName" TEXT,
    "payeeUpiId" TEXT,
    "payerName" TEXT,
    "payerUpiId" TEXT,
    "paymentApp" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'upi',
    "paymentDate" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL DEFAULT 'success',
    "rawSharedText" TEXT,
    "screenshotPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_distributorId_idx" ON "Payment"("distributorId");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE INDEX "Payment_transactionId_idx" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_paymentApp_idx" ON "Payment"("paymentApp");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_userId_key" ON "Payment"("transactionId", "userId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
