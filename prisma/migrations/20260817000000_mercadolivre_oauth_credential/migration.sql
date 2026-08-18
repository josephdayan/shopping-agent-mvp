CREATE TABLE "MercadoLivreOAuthCredential" (
    "id" TEXT NOT NULL,
    "mercadoLivreUserId" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreOAuthCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MercadoLivreOAuthCredential_expiresAt_idx"
ON "MercadoLivreOAuthCredential"("expiresAt");
