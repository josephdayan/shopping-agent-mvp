-- Persist click-to-WhatsApp attribution independently from customer text.
CREATE TABLE "AcquisitionTouch" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "campaignCode" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "headline" TEXT,
    "body" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "ctwaClid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcquisitionTouch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeliveryOrder" ADD COLUMN "acquisitionTouchId" TEXT;

CREATE UNIQUE INDEX "AcquisitionTouch_providerMessageId_key" ON "AcquisitionTouch"("providerMessageId");
CREATE INDEX "AcquisitionTouch_conversationId_createdAt_idx" ON "AcquisitionTouch"("conversationId", "createdAt");
CREATE INDEX "AcquisitionTouch_source_createdAt_idx" ON "AcquisitionTouch"("source", "createdAt");
CREATE INDEX "AcquisitionTouch_sourceId_idx" ON "AcquisitionTouch"("sourceId");
CREATE INDEX "AcquisitionTouch_campaignCode_idx" ON "AcquisitionTouch"("campaignCode");
CREATE INDEX "DeliveryOrder_acquisitionTouchId_idx" ON "DeliveryOrder"("acquisitionTouchId");

ALTER TABLE "AcquisitionTouch"
  ADD CONSTRAINT "AcquisitionTouch_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder"
  ADD CONSTRAINT "DeliveryOrder_acquisitionTouchId_fkey"
  FOREIGN KEY ("acquisitionTouchId") REFERENCES "AcquisitionTouch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
