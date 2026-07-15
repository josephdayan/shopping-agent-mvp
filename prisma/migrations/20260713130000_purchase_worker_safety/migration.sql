-- One lease per authenticated retailer browser context. It serializes jobs that
-- share a physical cart even when workflows run on separate serverless workers.
CREATE TABLE "PurchaseWorkerLease" (
    "accountKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseWorkerLease_pkey" PRIMARY KEY ("accountKey")
);

CREATE INDEX "PurchaseWorkerLease_expiresAt_idx" ON "PurchaseWorkerLease"("expiresAt");

-- A durable workflow retry with the same key must observe its first attempt instead
-- of submitting a second order to the retailer.
CREATE UNIQUE INDEX "PurchaseAttempt_purchaseJobId_idempotencyKey_key"
ON "PurchaseAttempt"("purchaseJobId", "idempotencyKey");
