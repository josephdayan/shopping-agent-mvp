-- CreateTable
CREATE TABLE "SearchCache" (
    "queryKey" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mercado_livre',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("queryKey")
);

-- CreateIndex
CREATE INDEX "SearchCache_updatedAt_idx" ON "SearchCache"("updatedAt");
