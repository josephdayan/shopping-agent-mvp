# WhatsApp One-Click + Pagar.me

O fluxo é direto entre a Lia, a Cloud API da Meta e o Pagar.me. O 360dialog não
participa do envio, recebimento ou da cobrança.

1. Na primeira compra com cartão, a Lia cria uma URL de uso único em `/cartao`.
   O `tokenizecard.js` envia os dados do cartão diretamente ao Pagar.me; a Lia
   recebe somente o token, salva o `card_id` e cobra o primeiro pedido.
2. Na recompra, a Lia envia o `interactive.order_details` da Cloud API. O
   `credential_id` é o id opaco interno de `PaymentCredential`, e não o id do
   cartão no Pagar.me. A Meta devolve esse id no webhook de confirmação.
3. A confirmação inicia um Workflow durável. A cobrança V5 usa o mesmo
   `PaymentAttempt.id` como `Idempotency-Key`; um retry nunca cria uma nova
   transação.
4. O webhook Pagar.me é apenas um sinal de reconciliação. A aplicação consulta
   o pedido na API V5 antes de atualizar o status local.

## Modo cartão salvo sem Meta Payments (ativo por decisão de 05/08)

Enquanto a Payments API BR segue em beta fechado, o mesmo alicerce funciona com botões
comuns do WhatsApp, atrás da flag independente `LIA_ENABLE_SAVED_CARD=true`:

1. Primeira compra no cartão → link `/cartao` (tokenizecard.js → Pagar.me), credencial
   salva (`PaymentCredential`) e cobrança do pedido — exatamente o fluxo já descrito.
2. Recompra → botões comuns "Pagar •••• 1234" / "Usar outro cartão" (ids
   `cardpay:<attemptId>` / `cardother`). O toque volta como texto e dispara o mesmo
   pipeline: claim da tentativa → cobrança idempotente → confirmação. Formas por texto
   ("usar cartão", "outro cartão") também são entendidas.
3. Desfechos (aprovado/recusado/expirado) vão como texto comum em vez de `order_status`.
   Recusa cai no fallback Checkout Pro; "outro cartão" expira a tentativa e manda um
   link novo de cadastro (a credencial é substituída no submit).

O gate `cardOnFileEnabled()` (uma das duas flags) controla credencial e cadastro: chave
Pagar.me configurada sem flag nenhuma NÃO muda o caminho de checkout. Quando a Meta
liberar a Payments API, `LIA_ENABLE_WA_PAYMENTS=true` promove a recompra ao
`order_details` nativo sem tocar no resto.

Pré-requisitos deste modo: chaves/domínio/webhook Pagar.me (passos 2–3 abaixo) e o
sandbox validando primeira compra, recompra, recusa e resposta perdida. A allowlist da
Meta NÃO é necessária.

## Ativação em produção

1. Obtenha da Meta a allowlist da Payments API BR para a WABA brasileira e mantenha
   o número no canal Cloud API direto (`WHATSAPP_PROVIDER=meta`). O pedido foi aberto em
   04/08/2026 no Suporte Direto da Meta, protocolo `37565409896407734`, status inicial
   **Open**, categoria **Dev: Cloud API / Messages API and Webhook**. Acompanhe em
   <https://business.facebook.com/direct-support/case-detail/37565409896407734/?business_id=1802515380110705>.
2. Cadastre o domínio da Lia no dashboard Pagar.me para `tokenizecard.js` e
   configure as chaves `PAGARME_SECRET_KEY` e `PAGARME_PUBLIC_KEY`.
3. Crie um segredo longo em `PAGARME_WEBHOOK_TOKEN` e cadastre
   `https://SEU-DOMINIO/api/pagarme/webhook?token=SEU_SEGREDO` no Pagar.me,
   com ao menos os eventos `order.paid`, `order.payment_failed`, `charge.paid`,
   `charge.payment_failed`, `card.deleted` e `card.expired`.
4. Confirme as migrations já aplicadas, configure `LIA_PUBLIC_URL`, ative
   `LIA_ENABLE_WA_PAYMENTS=true` e valide primeiro com uma conta sandbox.

A documentação Pagar.me confirma que `recurrence_cycle=first|subsequent` descreve
**recorrência externa** e é opcional; ele não cria cobrança recorrente. A recompra da Lia é
avulsa, iniciada e confirmada pelo cliente no WhatsApp, portanto o adaptador atual envia
corretamente `card_id` sem `recurrence_cycle`. O sandbox ainda deve validar CVV/3DS, recusa e
antifraude na conta real antes da ativação. Não presuma que o mock comprova aceitação do
adquirente ou do antifraude.

Não ative a flag antes da resposta positiva e da habilitação efetiva pela Meta: ticket aberto
não equivale a allowlist. Sem ela, a Lia mantém o fallback de Checkout Pro para cartão e Pix
segue independente.
