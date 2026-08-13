-- Lock cooperativo de turno por conversa (2ª revisão, 11/08): duas mensagens
-- simultâneas do mesmo cliente liam a mesma cesta e a última gravação de contexto
-- apagava o item da primeira. O claim é um UPDATE atômico sobre estas colunas.
ALTER TABLE "Conversation" ADD COLUMN "turnLock" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "turnLockAt" TIMESTAMP(3);
