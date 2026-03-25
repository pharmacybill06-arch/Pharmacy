-- CreateTable
CREATE TABLE "BillDetectionCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT,
    "isBill" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "billType" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "BillDetectionCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillDetectionCache_cacheKey_key" ON "BillDetectionCache"("cacheKey");

-- CreateIndex
CREATE INDEX "BillDetectionCache_cacheKey_idx" ON "BillDetectionCache"("cacheKey");

-- CreateIndex
CREATE INDEX "BillDetectionCache_expiresAt_idx" ON "BillDetectionCache"("expiresAt");

-- CreateIndex
CREATE INDEX "BillDetectionCache_lastHitAt_idx" ON "BillDetectionCache"("lastHitAt");
