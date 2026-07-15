-- Provider-neutral card references for WhatsApp One-Click. Meta receives the
-- PaymentCredential id, not the provider's card credential.
CREATE TABLE "PaymentCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mercadopago',
    "providerCustomerId" TEXT NOT NULL,
    "providerCardId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCredential_pkey" PRIMARY KEY ("id")
);

-- An attempt is the unique reference_id carried by the WhatsApp payment UI and the
-- idempotency key used by the PSP charge. Reissuing an order creates another row.
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "providerPaymentId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentCredential_userId_status_idx" ON "PaymentCredential"("userId", "status");
CREATE INDEX "PaymentAttempt_deliveryOrderId_idx" ON "PaymentAttempt"("deliveryOrderId");
CREATE INDEX "PaymentAttempt_credentialId_idx" ON "PaymentAttempt"("credentialId");

ALTER TABLE "PaymentCredential"
  ADD CONSTRAINT "PaymentCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_deliveryOrderId_fkey"
  FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "PaymentCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
