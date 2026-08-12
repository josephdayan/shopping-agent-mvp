-- Dedupe ATÔMICO do webhook. Sem este índice, duas entregas simultâneas do MESMO
-- MessageSid/wamid passavam as duas pelo findFirst e a mensagem era processada em
-- dobro (item duplicado, pedido duplicado, cobrança duplicada).
--
-- PARCIAL (só `sender = 'user'`) de propósito: no fluxo legado de busca, o `metadata`
-- de mensagens do ASSISTENTE guarda um JSON de opções que legitimamente se repete
-- (2 grupos assim existem em produção). Um índice global quebraria aquele fluxo — e
-- exigiria apagar mensagens reais, o que não é aceitável só para criar um índice.
-- Entre mensagens do cliente não há nenhuma duplicata hoje, então isto é aditivo.
-- NULLs não colidem em Postgres: mensagens sem sid seguem livres.
CREATE UNIQUE INDEX IF NOT EXISTS "Message_inbound_provider_id_key"
  ON "Message"("conversationId", "metadata")
  WHERE "sender" = 'user';
