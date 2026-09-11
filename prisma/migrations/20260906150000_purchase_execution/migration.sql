-- AlterTable
ALTER TABLE "PurchaseJob" ADD COLUMN     "checkoutEvidence" JSONB,
ADD COLUMN     "checkoutExpiresAt" TIMESTAMP(3),
ADD COLUMN     "checkoutHash" TEXT,
ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "submissionId" TEXT,
ADD COLUMN     "submitStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PurchaseAccount" (
    "storeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT,
    "loginReady" BOOLEAN NOT NULL DEFAULT false,
    "paymentReady" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseAccount_pkey" PRIMARY KEY ("storeKey")
);

-- CreateTable
CREATE TABLE "TrackingSubscription" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "storeOrderNumber" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "claimToken" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSubscription_deliveryOrderId_key" ON "TrackingSubscription"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "TrackingSubscription_completedAt_nextCheckAt_idx" ON "TrackingSubscription"("completedAt", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseJob_submissionId_key" ON "PurchaseJob"("submissionId");

-- AddForeignKey
ALTER TABLE "TrackingSubscription" ADD CONSTRAINT "TrackingSubscription_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
