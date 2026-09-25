-- CreateTable
CREATE TABLE "StoreMailSeen" (
    "messageId" TEXT NOT NULL,
    "storeKey" TEXT,
    "kind" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreMailSeen_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE INDEX "StoreMailSeen_seenAt_idx" ON "StoreMailSeen"("seenAt");
