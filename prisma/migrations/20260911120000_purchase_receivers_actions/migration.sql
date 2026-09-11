-- AlterTable
ALTER TABLE "PurchaseSpend" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'reserved',
ADD COLUMN "releasedAt" TIMESTAMP(3),
ADD COLUMN "releaseNote" TEXT;

-- AlterTable
ALTER TABLE "PurchaseAccount" ADD COLUMN "authKind" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "paymentKind" TEXT NOT NULL DEFAULT 'card';

-- AlterTable
ALTER TABLE "PurchaseJob" ADD COLUMN "ownerConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PurchaseReceiver" (
    "id" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "receiverDoc" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "purchaseJobId" TEXT,
    "deliveryOrderId" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiver_storeKey_receiverDoc_key" ON "PurchaseReceiver"("storeKey", "receiverDoc");

-- CreateIndex
CREATE INDEX "OpsAction_status_expiresAt_idx" ON "OpsAction"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "OpsAction_purchaseJobId_idx" ON "OpsAction"("purchaseJobId");

-- CreateIndex
CREATE INDEX "OpsAction_deliveryOrderId_idx" ON "OpsAction"("deliveryOrderId");
