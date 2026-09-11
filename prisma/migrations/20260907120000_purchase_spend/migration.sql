CREATE TABLE "PurchaseSpend" (
  "submissionId" TEXT NOT NULL PRIMARY KEY,
  "purchaseJobId" TEXT NOT NULL,
  "budgetDay" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "authorization" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PurchaseSpend_budgetDay_idx" ON "PurchaseSpend"("budgetDay");
