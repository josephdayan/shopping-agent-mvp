-- CreateTable
CREATE TABLE "PixPayout" (
    "id" TEXT NOT NULL,
    "purchaseJobId" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "amountCents" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "txid" TEXT,
    "receiverDoc" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "providerPayoutId" TEXT,
    "endToEndId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PixPayout_purchaseJobId_key" ON "PixPayout"("purchaseJobId");
CREATE UNIQUE INDEX "PixPayout_idempotencyKey_key" ON "PixPayout"("idempotencyKey");
CREATE UNIQUE INDEX "PixPayout_providerPayoutId_key" ON "PixPayout"("providerPayoutId");
CREATE UNIQUE INDEX "PixPayout_endToEndId_key" ON "PixPayout"("endToEndId");
CREATE INDEX "PixPayout_status_submittedAt_idx" ON "PixPayout"("status", "submittedAt");
CREATE INDEX "PixPayout_deliveryOrderId_idx" ON "PixPayout"("deliveryOrderId");
