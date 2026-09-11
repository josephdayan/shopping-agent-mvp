-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "receiptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEvent_dedupeKey_key" ON "DeliveryEvent"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEvent_providerMessageId_key" ON "DeliveryEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "DeliveryEvent_deliveryStatus_nextAttemptAt_idx" ON "DeliveryEvent"("deliveryStatus", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DeliveryEvent_deliveryOrderId_occurredAt_idx" ON "DeliveryEvent"("deliveryOrderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
