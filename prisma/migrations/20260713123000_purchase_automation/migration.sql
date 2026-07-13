-- CreateTable
CREATE TABLE "PurchaseJob" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "fulfillmentKey" TEXT NOT NULL DEFAULT 'primary',
    "storeKey" TEXT NOT NULL,
    "storeLabel" TEXT NOT NULL,
    "storeUnitId" TEXT,
    "storeUnitLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'preflight_queued',
    "workflowRunId" TEXT,
    "browserSessionId" TEXT,
    "cartHash" TEXT,
    "cartSnapshot" JSONB,
    "expectedTotal" DOUBLE PRECISION,
    "actualTotal" DOUBLE PRECISION,
    "storeOrderNumber" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "approvalMaxTotal" DOUBLE PRECISION,
    "approvalCartHash" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseJobId" TEXT NOT NULL,
    "requestedSku" TEXT NOT NULL,
    "requestedName" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "requestedUnitPrice" DOUBLE PRECISION,
    "productUrl" TEXT,
    "retailerSku" TEXT,
    "retailerProductId" TEXT,
    "retailerSellerId" TEXT,
    "ean" TEXT,
    "resolvedName" TEXT,
    "expectedUnitPrice" DOUBLE PRECISION,
    "actualUnitPrice" DOUBLE PRECISION,
    "matchConfidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAttempt" (
    "id" TEXT NOT NULL,
    "purchaseJobId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "idempotencyKey" TEXT,
    "browserSessionId" TEXT,
    "details" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseJob_status_nextAttemptAt_idx" ON "PurchaseJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PurchaseJob_storeKey_status_idx" ON "PurchaseJob"("storeKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseJob_deliveryOrderId_fulfillmentKey_key" ON "PurchaseJob"("deliveryOrderId", "fulfillmentKey");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseJobId_idx" ON "PurchaseItem"("purchaseJobId");

-- CreateIndex
CREATE INDEX "PurchaseItem_status_idx" ON "PurchaseItem"("status");

-- CreateIndex
CREATE INDEX "PurchaseAttempt_purchaseJobId_createdAt_idx" ON "PurchaseAttempt"("purchaseJobId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseAttempt_status_idx" ON "PurchaseAttempt"("status");

-- AddForeignKey
ALTER TABLE "PurchaseJob" ADD CONSTRAINT "PurchaseJob_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseJobId_fkey" FOREIGN KEY ("purchaseJobId") REFERENCES "PurchaseJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAttempt" ADD CONSTRAINT "PurchaseAttempt_purchaseJobId_fkey" FOREIGN KEY ("purchaseJobId") REFERENCES "PurchaseJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
