ALTER TABLE "Product"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'marketplace',
  ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'marketplace_native',
  ADD COLUMN "automationLevel" TEXT NOT NULL DEFAULT 'mock';

ALTER TABLE "Order"
  ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'marketplace_native',
  ADD COLUMN "fulfillmentNotes" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN "refundStatus" TEXT NOT NULL DEFAULT 'none';

CREATE TABLE "OpsTask" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpsTask_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OpsTask" ADD CONSTRAINT "OpsTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
