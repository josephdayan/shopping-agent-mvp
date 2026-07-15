-- Pagar.me-backed WhatsApp One-Click. Money is always stored in cents on a
-- payment attempt; floats are never used as the PSP charge amount.
ALTER TABLE "PaymentCredential"
  ALTER COLUMN "provider" SET DEFAULT 'pagarme',
  ADD COLUMN "consentAt" TIMESTAMP(3),
  ADD COLUMN "consentVersion" TEXT;

ALTER TABLE "PaymentAttempt"
  ADD COLUMN "amountCents" INTEGER,
  ADD COLUMN "providerOrderId" TEXT,
  ADD COLUMN "providerChargeId" TEXT,
  ADD COLUMN "workflowRunId" TEXT;

UPDATE "PaymentAttempt"
SET "amountCents" = ROUND("amount" * 100)::INTEGER
WHERE "amountCents" IS NULL;

ALTER TABLE "PaymentAttempt"
  ALTER COLUMN "amountCents" SET NOT NULL,
  DROP COLUMN "amount";

CREATE UNIQUE INDEX "PaymentCredential_provider_providerCardId_key"
  ON "PaymentCredential"("provider", "providerCardId");

CREATE INDEX "PaymentAttempt_providerOrderId_idx"
  ON "PaymentAttempt"("providerOrderId");

CREATE TABLE "CardEnrollmentSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deliveryOrderId" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardEnrollmentSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardEnrollmentSession_deliveryOrderId_key"
  ON "CardEnrollmentSession"("deliveryOrderId");
CREATE INDEX "CardEnrollmentSession_userId_expiresAt_idx"
  ON "CardEnrollmentSession"("userId", "expiresAt");

ALTER TABLE "CardEnrollmentSession"
  ADD CONSTRAINT "CardEnrollmentSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardEnrollmentSession"
  ADD CONSTRAINT "CardEnrollmentSession_deliveryOrderId_fkey"
  FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
