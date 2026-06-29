-- AlterTable
ALTER TABLE "User" ADD COLUMN "cep" TEXT;

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "phone" TEXT NOT NULL,
    "customerName" TEXT,
    "cep" TEXT,
    "deliveryAddress" TEXT,
    "storeKey" TEXT NOT NULL DEFAULT 'carrefour',
    "storeLabel" TEXT NOT NULL DEFAULT 'Carrefour',
    "storeUnit" TEXT,
    "storeAddress" TEXT,
    "storeOrderNumber" TEXT,
    "items" JSONB NOT NULL,
    "itemsSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "courierKey" TEXT NOT NULL DEFAULT 'uber_direct',
    "courierQuoteId" TEXT,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "pixId" TEXT,
    "pixCopiaECola" TEXT,
    "paidAt" TIMESTAMP(3),
    "courierTrackingUrl" TEXT,
    "courierDispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryOrder_status_idx" ON "DeliveryOrder"("status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_phone_idx" ON "DeliveryOrder"("phone");

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
