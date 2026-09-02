-- Revisão 01/09/2026. WaitlistLead e PetzImage só existiam em produção via `prisma db
-- push` (nenhuma migration as criava): banco limpo ou `migrate deploy` nascia sem as
-- duas tabelas e a lista de espera do /ops quebrava. IF NOT EXISTS torna a aplicação em
-- produção um no-op. Os índices novos cobrem as consultas que o cérebro faz em quase
-- todo turno (conversa ativa por usuário, último pedido por usuário+status, última
-- mensagem por conversa), hoje sem índice.
CREATE TABLE IF NOT EXISTS "WaitlistLead" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "city" TEXT,
    "uf" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'outside_coverage',
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaitlistLead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistLead_phone_cep_key" ON "WaitlistLead"("phone", "cep");
CREATE INDEX IF NOT EXISTS "WaitlistLead_updatedAt_idx" ON "WaitlistLead"("updatedAt");

CREATE TABLE IF NOT EXISTS "PetzImage" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PetzImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Conversation_userId_status_updatedAt_idx" ON "Conversation"("userId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_userId_status_createdAt_idx" ON "DeliveryOrder"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
