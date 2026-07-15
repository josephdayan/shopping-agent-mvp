-- A checkout quote is only safe for a few minutes. Do not accept payment after
-- the retailer's price, stock, freight or promise may have changed.
ALTER TABLE "DeliveryOrder" ADD COLUMN "quoteExpiresAt" TIMESTAMP(3);

CREATE INDEX "DeliveryOrder_quoteExpiresAt_idx" ON "DeliveryOrder"("quoteExpiresAt");
