# Plano de implementação — compra na loja, rastreio e pós-venda (11/09/2026)

## Contexto

O dono opera a compra à mão e a única automação é uma tarefa horária do ChatGPT que ainda exige o clique dele. Nesta sessão fechamos o desenho (`docs/plano-compra-viavel-2026-09-10.md`, seções 3, 12 e 13) e as decisões: **Mercado Livre fica e é o canal principal** (sem API de compra; risco de Termos assumido), lojas VTEX executáveis **pagam a loja por Pix via API bancária**, **caixa de e-mail operacional legível por máquina** (leitor OAuth já escrito), **conta própria envelhecida por loja no Chrome local**, **exceções por um toque no WhatsApp do operador**, **modelo revenda** (sem CPF do cliente), **cliente paga primeiro**, teto R$500/pedido e /dia mantido, **fila manual explícita** para lojas não executáveis, **arrependimento com estorno imediato antes da compra** (decidido agora), e aposentar a tarefa do ChatGPT e o caminho de cartão salvo.

Respostas do dono nesta rodada: começar por **ML degrau C**; destinatário = **nome do WhatsApp, perguntar só se faltar**; **mudar a regra de arrependimento**; Pix-out com **interface neutra, Efí e Asaas em paralelo**.

Bloqueio real descoberto no mapa: `DeliveryOrder.customerName` nunca é gravado (`prisma/schema.prisma:35`; único `deliveryOrder.create` em `src/lib/delivery-service.ts:4328`), e `checkCheckout` exige o campo (`src/lib/purchase-execution.ts:109`). Nenhuma compra automática passa hoje.

Gates que precedem código pesado (já em PENDENCIAS): E0 OAuth real da caixa; E2 sondagem R$0 em Ri Happy, Drogaria SP, Cobasi, Swift; E3 um pedido real; E5/E6 banco; E8–E10 ML. As 3 migrations de 06–07/09 estão **untracked e não aplicadas** (`prisma/migrations/20260906090000_delivery_events`, `20260906150000_purchase_execution`, `20260907120000_purchase_spend`).

## Máquina de estados do `PurchaseJob` (strings, aditivo)

- Tronco: `queued → claimed → awaiting_approval ⇄ approved → submitting → completed`; absorventes `outcome_unknown`, `needs_review`, `canceled`.
- **Novo `manual_queue`** (loja não executável; nunca em `CLAIMABLE`, `src/lib/purchase-worker.ts:18`).
- **ML degrau C:** `claimed → cart_ready → awaiting_owner_confirm → awaiting_store_number → store_confirmed → completed`; "Não deu" → `needs_review`. `awaiting_owner_confirm` não expira por lease, expira pelo TTL da `OpsAction`.
- **VTEX Pix:** `submitting → pix_captured → pix_submitted → pix_paid → store_confirmed → completed`. `owned()` (lease 120 s) governa só até `pix_captured`; a conciliação bancária é do servidor.
- Invariantes: `PurchaseSpend` reservado uma vez (em `beginPurchase` ou no envio do botão do ML); um `PixPayout` por job (unique); timeout bancário → `PixPayout.unknown` + job `outcome_unknown` + botão, nunca segunda chamada; `refundOrderViaProvider` (`src/lib/payments/ledger.ts:87`) passa a bloquear em todos os estados pós-`submitting` e com `PixPayout` em `submitted|paid|unknown`; em `awaiting_owner_confirm` o estorno só passa se consumir (CAS) a `OpsAction` pendente.
- `claimNextPurchaseJob` (`purchase-worker.ts:150`): lease vencido em `pix_captured` → `outcome_unknown`; em `cart_ready` → `needs_review`; a trava `purchase-account:<store>` (`:188`) trata os estados novos como conta ocupada.
- `autoRefundDecision` (`src/lib/ops-lifecycle.ts:454`): `manual_queue` usa `LIA_AUTO_REFUND_MANUAL_HOURS` (48) em vez de 24 h.

## Modelo de dados (migrations aditivas)

- **Migration 1** (Fase 1): `PurchaseReceiver` (`storeKey, receiverDoc, receiverName, status pending|approved|blocked, approvedBy/At, timesUsed`, `@@unique([storeKey, receiverDoc])`); `OpsAction` (`id cuid, kind, purchaseJobId?, deliveryOrderId?, payload Json?, status pending|consumed|expired|canceled, expiresAt, consumedAt, consumedBy`); `PurchaseSpend.status/releasedAt/releaseNote`; `PurchaseAccount.authKind (email_code|totp|none)` e `paymentKind (pix_out|ml_balance|card)`; `PurchaseJob.ownerConfirmedAt`.
- **Migration 2** (Fase 3): `PixPayout` (`purchaseJobId @unique, provider efi|asaas, idempotencyKey @unique, status created|submitted|paid|refused|expired|unknown, amountCents, codeHash, txid?, receiverDoc, receiverName, receiverPsp?, endToEndId? @unique, expiresAt?, submittedAt, settledAt, lastError`). EMV em claro nunca persistido.

## Contrato do botão do operador

- Id ≤ 256 chars: `op1.<opsActionId>.<hmac32hex>`; HMAC via `loginSignature` de `src/lib/auth.ts:122` (hoje **não exportado**: exportar ou criar `signOpsAction` no mesmo arquivo usando o mesmo segredo `OPS_TOKEN`). Expiração e anti-replay na linha `OpsAction`: consumo = `updateMany({id, status:"pending", expiresAt>now} → consumed)`, só `count===1` executa.
- Envio: `sendMetaSimpleButtons` já existe (`src/lib/adapters/whatsapp.ts`, usado em `:614-742`); máx. 3 botões, título ≤ 20 chars. Fora da janela de 24 h: texto + link `/ops` (template não carrega botão); o `/ops` espelha os mesmos botões sobre a mesma `OpsAction`.
- Ramificação: em `src/app/api/whatsapp/webhook/route.ts`, após `parseInbound` (que colapsa `button_reply.id` em `text`, `adapters/whatsapp.ts:496`) e antes de `processDeliveryMessage`: `isAdminPhone` (`src/lib/turn-runtime.ts:63`) + `/^op1\./` → `handleOperatorAction` em novo `src/lib/ops-actions.ts`.
- Kinds: `ml_cart_ready` [Comprei / Não deu], `receiver_new` [Pagar e memorizar / Recusar], `over_limit` [Autorizar / Estornar], `pix_failed` [Refazer / Estornar], `store_silent` [Confirmar / Estornar], `item_missing` [Estornar item / Pedir reenvio], `buyer_silent` (aviso).
- "Comprei" do ML: consome a ação, job → `awaiting_store_number`, cria `OpsAction{await_store_number}` TTL 30 min e responde "manda o número do pedido do ML"; a próxima mensagem do admin que casar `/^#?\d{8,20}$/` vira `storeOrderNumber` via `recordDeliveryEvent(kind:"bought", source:"operator")`. Alternativa sempre no `/ops`. Todo consumo grava `PurchaseAttempt{step:"ops_action"}` + `appendOrderNote`.

## Fases (ordem decidida: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7)

### Fase 0 — preparar os gates, risco zero (~1 dia; sem migration, sem deploy)
- `scripts/retail-buyer/mailbox.ts`: `STORE_MAIL` (`:28`) e o tipo `AccessCodeRequest.storeKey` deixam de ser `cobasi|swift` fixos; mapa por loja vindo do `config.json`; manter `extractStoreAccessCode` (`:72`) e a regra de candidato único.
- `scripts/retail-buyer/browser.ts`: extrair o bloco de cartão (`:401-425`) para `selectSavedCard()`; adicionar `selectPix()` (`attachments/paymentData` com `paymentSystem:"125"`, dentro do allowlist atual de `api()`; **não** relaxar o bloqueio de `transaction|…` em `:221`).
- `scripts/retail-buyer/run.mts`: comando `probe LOJA` — perfil → cesta mínima → `selectPix` → screenshot + JSON (desafio visível? botão habilitado? login exigido?) → esvazia carrinho; **para antes de finalizar**; sem chamar o servidor.
- `.retail-buyer/config.json` (privado): tirar Oba e Pague Menos; incluir `rihappy`, `naturaldaterra`.
- Testes: `tests/retail-mailbox.test.ts` genérico por loja; `scripts/retail-buyer/verify.mts` ganha caso `selectPix`.
- Destrava: E0 (`npm run purchase-worker:mailbox-authorize` + `mailbox-check`), E2, E8 (sondagem humana no perfil do ML).

### Fase 1 — fundações (~3 dias; pode andar em paralelo ao E2)
1. **`customerName`**: gravar em `src/lib/delivery-service.ts:4328` a partir de `convo.user.name` (perfil do WhatsApp, `src/lib/turn-runtime.ts:110-115`); perguntar só se vazio ou se o cliente disser que é para outra pessoa (intent/copy novos em `src/lib/lia-intents.ts` e `src/lib/lia-copy.ts`); campo editável no `OpsBoard` para pedidos antigos.
2. **Evidência de pagamento generalizada**: `checkoutEvidenceSchema` (`src/lib/purchase-execution.ts:15-47`) troca `paymentLabel` literal + `paymentReference` por `payment: {kind:"pix_store", paymentSystem:125} | {kind:"ml_balance"} | {kind:"card_saved", reference}`; `checkoutDigest` (`:56`) inclui; `snapshot` (`browser.ts:429`, bloco `:476-501`) emite o novo formato; `PurchaseControl.tsx` troca o checkbox "Cartão corporativo salvo" (`:148-155`) e o `paymentLabel` (`:297`) por `paymentKind`; `verify.mts:153` e `verify-ui.mts:73` reescritos. `approveCheckout` (`:346`) trata evidência antiga como `needs_review`, não crash.
3. **Allowlist com ML**: remover o filtro `s !== "mercadolivre"` em `src/lib/purchase-policy.ts:9`; `automaticPurchaseDecision` ganha trava explícita "ML nunca chega a `beginPurchase`, só ao caminho do dono"; `PURCHASE_DOMAINS` (`src/lib/purchase-preparation.ts:3`) aceita múltiplos domínios por loja (ML + `mercadopago.com.br`); `purchaseUrlAllowed` idem.
4. **Fila manual**: `ensurePurchaseJobForPaidOrder` (`purchase-worker.ts:69`) cria job `manual_queue` em vez de `null`; `OPS_QUEUE_PRIORITY`/`getOperatorQueue` (`ops-lifecycle.ts:350/363`) e `OpsBoard.tsx` (`:273-293`) mostram seção própria; `order-payments.ts:792` envia copy distinta ("um humano está comprando"); `autoRefundDecision` com SLA próprio.
5. **Aposentadoria (marcar deprecado; apagar na Fase 7)**: `src/app/api/purchase-worker/claim`, `[id]/complete`, `[id]/fail`, `scripts/purchase-worker-client.mts`, script `purchase-worker:claim`, `validatePurchaseCompletion`/`markPurchaseJobCompleted`, env `PURCHASE_AUTOMATION_MODE`.
6. Migration 1. Envs: `LIA_AUTO_REFUND_MANUAL_HOURS`. Testes: `tests/purchase-execution.test.ts` (evidência nova; ML fora do auto-submit), novo `tests/manual-queue.test.ts`, `tests/order-monitor.test.ts`; `tests/helpers/load-env.ts` pina `LIA_AUTO_PURCHASE_STORES=""`.

### Fase 2 — Mercado Livre degrau C (~4 dias; depende de E8)
- Novo `scripts/retail-buyer/mercadolivre.ts`: `MercadoLivreBuyer` com a superfície de `VtexBuyer` (`prepare/snapshot/clearPreparedCart`) mas **DOM-driven** (URL do anúncio → variação → adicionar ao carrinho → "quem vai receber" → ler total/frete). Reaproveita `openProfile` (`browser.ts:188`), `extractAddress`/`verifyAddress` (`:123/:86`). **Sem** `submitSelector`: termina em `cart_ready`. Nunca HTTP puro, nunca mascarar navegador, nada de 2FA por e-mail (ML usa SMS/app/rosto).
- `src/lib/purchase-execution.ts`: `requestOwnerConfirm(jobId, workerId, token, evidence)` — `funding` + `checkCheckout` (`payment.kind="ml_balance"`) + `automaticPurchaseDecision` (teto) + reserva `PurchaseSpend` + `OpsAction{ml_cart_ready}` + botões; job → `awaiting_owner_confirm`; navegador fecha (carrinho do ML sincroniza para o app).
- `src/app/api/purchase-worker/session/route.ts` (`:20-67`): novas actions `owner_confirm` (ML) no `discriminatedUnion`.
- `src/lib/ops-actions.ts` novo (contrato acima) + ramificação no webhook; `PurchaseControl.tsx` inclui `mercadolivre` no roster (`:11-21`) e espelha ações pendentes.
- `run.mts`: loop passa a aceitar loja com receita ML (sem exigir `submitSelector`+`receipt`, `:375`).
- Testes: `tests/ops-actions.test.ts` (HMAC, replay, expirado, não-admin, CAS concorrente), `tests/ml-degrau-c.test.ts` (fluxo até `completed` com número do pedido), `verify.mts` com fixture DOM do ML.
- Ao final desta fase: desligar a tarefa horária do ChatGPT.

### Fase 3 — Pix-out + captura VTEX (~4 dias; depende de E2, E3, E5, E6)
- `src/lib/payments/pix-out.ts` (interface `{decode, pay(emv, idempotencyKey), status}`) + `pix-out/efi.ts` (`PUT /v2/gn/pix/:idEnvio/qrcode`, `idEnvio` = idempotencyKey) + `pix-out/asaas.ts` (`decode` + `pay`; tentativa única; `status()` obrigatório antes de qualquer retry); espelha `pixAdapter` (`src/lib/payments/mercadopago.ts:60`). `src/lib/pix-emv.ts`: parser BR Code + CRC16 puro.
- `session/route.ts`: action `pix_captured`. Servidor: CRC, valor exato vs `evidence.totalCents`, recebedor via `decode` vs `PurchaseReceiver` (novo → `OpsAction{receiver_new}`), `PixPayout` + `pay()`.
- `browser.ts`: `capturePixCode()` — primário modal do DOM (regex `^000201`), secundário `page.on("response")` passivo antes do clique; allowlist de `api()` inalterada.
- Conciliação no cron existente (`src/app/api/cron/reconcile-payments`, `src/lib/payments/reconcile.ts:34`): `settlePixPayouts()` → `pix_paid|refused|expired`; `LIA_PIX_STORE_CONFIRM_MIN` (30) sem confirmação → `OpsAction{store_silent}`; `CREDIT_REFUND` da loja conciliado por `endToEndId` → `refund_pending → refunded` (reusa `refundOrderViaProvider`).
- Migration 2 (`PixPayout`). Envs: `LIA_PIX_OUT_PROVIDER`, `LIA_PIX_OUT_OFF=true`, `EFI_*`/`ASAAS_*` só na Vercel. Testes: `tests/pix-out.test.ts` com a tabela da Etapa 2 do plano do Codex (QR vencido, resposta perdida sem 2ª chamada — contar fetches, duplicada/fora de ordem, pago sem confirmação, divergência, queda/reinício, cancelamento × pagamento).

### Fase 4 — e-mail → `DeliveryEvent` + alarme de silêncio (~2 dias; depende de E0, E3)
- `mailbox.ts`: `listStoreEvents(storeKey, since)`; novo `src/lib/mailbox-policy.ts` com frases literais por loja e Mercado Envios (mesmo espírito de `explicitTrackingStatus`, `src/lib/tracking-policy.ts:40`).
- `/api/tracking-worker`: action `report_mail`; `DeliveryEvidence.source` (`src/lib/delivery-events.ts:11`) ganha `mailbox_reader` com as mesmas guardas de `tracking_reader` (`:44-57`, loja + número exatos). "Pedido criado/faturado" não vira evento ao cliente: vira `store_confirmed` + nota.
- Alarme: comprador sem heartbeat 10 min (usa `PurchaseAccount.lastSeenAt`) e `store_confirmed` sem e-mail há X h → `OpsAction`. Nunca seguir link fora do domínio; nunca gravar corpo de e-mail.

### Fase 5 — exceções por um toque, catálogo completo (~1,5 dia)
Os kinds restantes com efeito idempotente; `notifyOperator` (`turn-runtime.ts:71`) só para avisos sem ação; espelho no `/ops`. Testes: um por kind + toque duplo + toque após estorno. Env `LIA_OPS_BUTTONS_OFF`.

### Fase 6 — arrependimento (~1 dia)
- `lia-intents.ts`: intent `regret`; `lia-copy.ts`: substituir `NO_CANCEL_AFTER_PAYMENT` (`:721`) por aceito/recusado com motivo.
- `delivery-service.handleCancel` (`:2482`, ramo pago `:2584`): `canCustomerWithdraw(orderId)` novo em `ops-lifecycle.ts` — `paid`, sem `storeOrderNumber`, sem `PixPayout` em `submitted|paid|unknown`, job não bloqueante, CAS da `OpsAction` pendente → `opsRefundViaProvider` (`:42`) na hora; senão texto pós-compra.
- Testes: corrida arrependimento × toque do dono; após `pix_submitted` recusado; em `manual_queue` aceito.

### Fase 7 — operação (~1 dia)
`launchd` + `caffeinate` para `purchase-worker:run`; heartbeat no `/ops`; runbook Tailscale em `docs/operador-runbook.md`; apagar o caminho legado marcado na Fase 1; docs (AGENTS/STATUS/PENDENCIAS/README) com entrada datada.

Total ≈ 17,5 dias, escalonados pelos gates.

## Ordem de deploy
1. **Deploy zero**: versionar (commit) e aplicar as 3 migrations pendentes sozinhas, com o código atual; `npm run db:check` sem drift antes e depois.
2. Fase 1 com flags off; `LIA_AUTO_PURCHASE_STORES` vazio.
3. Migration 1 + Fase 2; `LIA_PURCHASE_PREP_STORES=mercadolivre` (default); botões do dono ativos.
4. Migration 2 + Fase 3 com `LIA_PIX_OUT_OFF=true`; ligar loja a loja por três chaves independentes: `PurchaseAccount.enabled` no `/ops`, nome em `LIA_AUTO_PURCHASE_STORES`, receita com `submitSelector`+`receipt` no `config.json`.
5. Fases 4–7. Kill-switches: `LIA_PURCHASE_SUBMIT_OFF`, `LIA_AUTO_PURCHASE_OFF`, `LIA_AUTO_REFUND_OFF`, `LIA_PIX_OUT_OFF`, `LIA_OPS_BUTTONS_OFF`.

## O que não fazer
Burlar CAPTCHA/antibot; HTTP puro no ML; mascarar `navigator.webdriver`; guardar CVV/senha/cookies/EMV em banco; segunda chamada bancária após timeout; criar pedido na loja antes do pagamento do cliente; guest checkout com e-mail novo; coletar CPF do cliente; reintroduzir Browserbase; catálogos novos; subir o teto de R$500.

## Verificação
- Sempre: `npx tsc --noEmit`, `npm run lint`, `npm run test:local` (baseline 577/577, só sobe), `npm run db:check`, `npm run purchase-worker:verify`, `purchase-worker:verify-ui`.
- Fase 0: `mailbox-authorize` + `mailbox-check` → `ready`; `probe swift|rihappy|drogariasp|cobasi` imprime JSON + screenshot, nenhum pedido criado, carrinho vazio ao final.
- Fase 1: pedido de teste local `paid → manual_queue` visível no `/ops`; `checkCheckout` não falha mais por `customerName`; cliente sem nome no perfil é perguntado.
- Fase 2: com `WHATSAPP_PROVIDER=mock`, id do botão ≤ 256 chars e HMAC válido; no celular real: "Comprei" → número → `retailer_preparing` + mensagem ao cliente; segundo toque → "já usado". Tarefa do ChatGPT desligada.
- Fase 3: `tests/pix-out.test.ts` verde; E6 refeito com R$1 pelo código; `PixPayout` com `endToEndId` no `/ops`; timeout forçado → zero segunda chamada.
- Fase 4: um e-mail real de "saiu para entrega" → exatamente um `DeliveryEvent` + uma mensagem; relido → nada.
- Fase 6: "desisti" em pedido pago sem compra → estorno em segundos, `/ops` em `refunded`; em pedido comprado → texto pós-compra.
