# Revisão completa — 01/09/2026: código, melhorias e leitura do negócio

_Escrita a pedido do dono ("revisão completa do código, sugestões de melhora e leitura do
business model, ideia e execução, para eventuais mudanças de caminho"). Método: sete
revisões independentes por área (cérebro, pagamentos, segurança de API, painel/páginas,
dados/infra/testes, síntese das 5 rodadas de teste, linha do tempo de decisões), leitura
direta dos docs de decisão, e contagens somente-leitura no banco de produção. A oitava
frente (busca/catálogo) caiu por limite de gasto da API antes de produzir resultado; o
essencial dela foi coberto à mão (guarda ANVISA no Mercado Livre, código morto, tamanho
dos catálogos). Nenhum número abaixo foi inventado; onde não há prova, está escrito
"a confirmar"._

---

## 0. Resumo executivo

1. **O código é muito melhor do que a maioria dos MVPs** — máquina de estados com lock e
   CAS, dinheiro determinístico, sem mock em caminho real, 458 testes, golden set de
   busca, copy centralizada. O problema não é qualidade de código.
2. **Havia furos reais de dinheiro**, todos fechados neste ciclo com regressão: o webhook
   do Mercado Pago aprovava sem conferir valor nem qual Pix foi pago (com a bolha nativa
   no chat, o código antigo continuava pagável por 60 min); cancelar/reabrir não olhava
   cartão salvo em cobrança; a taxa do cartão ficava gravada quando a emissão falhava; e o
   frete digitado com vírgula no `/ops` virava R$ 0.
3. **Segurança:** nenhum caminho anônimo para marcar pedido pago ou cobrar cartão. Mas o
   `/ops` e o proxy de imagens falhavam ABERTO sem token (Preview da Vercel), e um callback
   legado permitia mandar WhatsApp pelo número oficial para qualquer telefone. Fechados.
4. **O repositório carrega seis eras de produto** (busca ML → clique-e-retire + motoboy →
   Browserbase → concierge manual → 18 vitrines → ML de volta). Um terço dos arquivos é
   legado vivo como superfície pública. A "regra canônica vigente" não está escrita em
   lugar nenhum; precisou ser reconstruída a partir de 360 KB de logs.
5. **Execução:** em 10 semanas, 295 commits, ~173 mil linhas, 5 pedidos reais pagos
   (≈ R$ 215, todos do dono ou de testadores) e **zero pedido concluído de ponta a ponta
   pelo fluxo do varejista**. Dois pedidos pagos esperam decisão desde 23–25/08.
6. **As 5 rodadas de teste dizem a mesma coisa cinco vezes**: "não deixaria minha mãe usar
   sem ajuda". A família de falha presente em 100% das rodadas — frete fragmentado, mínimo
   por loja, troca de marca por baixo do pano — é **desenho de produto, não bug**. O ciclo
   de conserto por regex está em whack-a-mole visível (notas 4,3 → 4,2 → 6,8 → 2,9 → 4,3).
7. **Leitura de negócio:** a Lia hoje é uma camada fina sobre 18 sites + Mercado Livre,
   com um humano comprando como consumidor, cobrando 10% (3% no caro) em cestas de
   R$ 50–80. Margem bruta de R$ 5–8 por pedido não paga o turno de compra manual nem o
   custo de IA/busca; e o cliente paga mais que indo direto ao site. **O modelo não fecha
   em volume e ainda não provou demanda em unidades.** Recomendação: parar de construir por
   4 semanas, rodar um piloto de 30 pedidos com desconhecidos sob um contrato simples
   (taxa fixa, uma loja por cesta, SLA humano visível) e, em paralelo, testar a rota de
   parceria com um varejista. Detalhe na seção 4.

---

## 1. Evidências usadas

| Fonte | O que provou |
|---|---|
| Leitura integral de `delivery-service.ts` (6.4k linhas), `lia-intents`, `lia-copy`, `order-flags`, `payments/*`, `workflows/*`, `auth*`, todas as rotas `src/app/api/**`, `OpsBoard`, landing/termos/privacidade, `schema.prisma` + 14 migrations, `package.json`, scripts e 34 arquivos de teste | Achados de código com arquivo:linha |
| `git log` (295 commits, 24/06–01/09) | Cadência e padrão de retrabalho |
| Banco de produção (Supabase `zytt…`, só `count`/`group by`, sem PII) | Métricas reais da seção 4.1 |
| `vercel env ls production` (só nomes) | Flags realmente ligadas |
| AGENTS.md, STATUS.md, PENDENCIAS.md, CLAUDE.md, README e 26 docs em `docs/` | Linha do tempo, decisões do dono, contradições |
| 5 relatórios de rodada + protocolos + auditoria de 30/08 | Voz do cliente (simulado) |
| Gates rodados: `tsc` limpo, `next lint` limpo (1 aviso preexistente), 109 unitários verdes (`auth`, `pricing`, `copy`, `intents`, `whatsapp-pay`, `order-lifecycle`), pagamento com banco 23/23 (`payment-reconcile`, `payment-issue-failure`, `saved-card`, `whatsapp-pay.db`), concierge E2E 97/97 (95 na primeira passada + 2 re-verificados após ajuste: relógio de abandono restrito a `awaiting_quote_confirmation` e o caso "mais um leite", que ainda esperava a pergunta de quantidade extinta em 01/09) | Estado após as correções |

---

## 2. Revisão de código

### 2.1 Corrigido neste ciclo (com teste de regressão)

| # | Severidade | O quê | Onde |
|---|---|---|---|
| 1 | **P0 dinheiro** | Webhook do Mercado Pago aprovava com `status=approved` + `external_reference`, sem conferir `transaction_amount` nem se o `id` era o Pix vigente. Agora `markDeliveryOrderPaid` recebe evidência (provedor, id, valor); divergência ou pedido fora de `awaiting_payment` vira **nota `⚠️ PAGAMENTO FORA DO ESPERADO` + alerta ao operador + aviso ao cliente**, nunca aprovação. Replay é idempotente. Id é validado (`^\d{1,20}$`) antes de ir na URL com nosso token; falha nossa devolve 503 (o MP reenvia; antes devolvia 200 e o pagamento se perdia). | `api/mercadopago/webhook/route.ts`, `delivery-service.ts` (`markDeliveryOrderPaid`, `paymentEvidenceMismatch`, `recordUnexpectedPayment`), `lia-copy.ts` |
| 2 | **P0 dinheiro** | Cobrança substituída ficava viva: cancelar, "tira o X" (reabrir), "pedido novo" e troca Pix↔cartão deixavam o Pix antigo pagável por 60 min (a bolha nativa fica no chat) e cancelavam com `update` sem guarda de status (pagamento simultâneo virava "cancelado" com `paidAt`). Agora há uma saída única `closeUnpaidOrder`: `updateMany` guardado por status, **bloqueio se há cartão salvo confirmado** (resposta "cobrando no cartão"), expiração das tentativas e **cancelamento best-effort do Pix no MP** (`cancelMercadoPagoPayment`, nunca lança). A troca de método cancela o Pix anterior depois de gravar o novo. | `delivery-service.ts` (4 sites), `payments/mercadopago.ts` |
| 3 | **P0 dinheiro** | `chargeConfirmedPaymentAttempt` não reconferia o pedido antes do PSP: cancelamento pelo `/ops` entre o toque e a cobrança capturava o cartão num pedido cancelado, em silêncio. Agora reconfere status e valor (`amountCents === toCents(total)`), expira a tentativa e loga; captura em pedido que saiu de `awaiting_payment` vira alerta via evidência. A guarda de cancelamento usa `hasInFlightCardAttempt` (ignora o TTL de 60 min: desfecho desconhecido não "expira"). | `payments/whatsapp-pay.ts` |
| 4 | **P0 dinheiro** | Emissão de cartão que falhava (MP fora) deixava `total` com o gross-up; o "pix" seguinte cobrava ~5% a mais e um novo "cartão" aplicava a taxa duas vezes. Base agora é recomposta de `itemsSubtotal + serviceFee + deliveryFee` e o `catch` restaura `total`. | `delivery-service.ts` (`issueValidatedRetailerQuotePayment`) |
| 5 | **P0 dinheiro** | `/ops`: `Number("12,90")` é `NaN` → `NaN \|\| 0` → frete R$ 0 cobrado do cliente (teclado decimal do iPhone pt-BR mostra vírgula). `parseMoneyInput` compartilhado (aceita "12,90", "R$ 1.290,00", "12.90"), validação no cliente E no servidor (400 com mensagem). | `pricing.ts`, `OpsBoard.tsx`, `api/ops/orders/[id]/route.ts` |
| 6 | **P1 segurança** | 7 cópias de `authed()` falhavam ABERTO sem `OPS_TOKEN`, comparavam com `===`, caíam em `API_TOKEN` e gravavam o token cru no cookie de 90 dias. Guarda única `requireOpsKey` em `auth.ts`: fail-closed em deploy, tempo constante, cookie = HMAC do token, sem fallback. **Efeito operacional: o cookie antigo deixa de valer — abrir `/ops?key=<OPS_TOKEN>` uma vez após o deploy.** | `auth.ts`, 5 rotas `/api/ops/*`, 2 rotas `petz-image`, `ops/login` |
| 7 | **P1 segurança** | Callback do Apify (fluxo legado) falhava aberto, comparava com `!==` e mandava WhatsApp pelo número oficial para o `phone` que viesse no `metadata` (base64 controlado pelo chamador). Agora fail-closed em deploy, tempo constante e **o telefone tem que ser o dono da conversa**. | `api/apify/mercadolivre/callback/route.ts` |
| 8 | P2 segurança | Proxy de imagens aceitava `image/svg+xml` (XSS armazenado na nossa origem, contra o cookie do `/ops`). Allowlist jpeg/png/webp, `nosniff`, `CSP: sandbox`, id validado. | `api/petz-image/[id]/route.ts` |
| 9 | P2 segurança | Rotas OAuth do Mercado Livre sem auth permitiam substituir a credencial do operador; regex do cookie de state tinha `\\s` literal (só casava o primeiro cookie). Exigem sessão admin; regex corrigido. | `api/mercadolivre/oauth/*` |
| 10 | P1 conversa | TTL do lock de turno (60 s) era menor que um turno de busca fria (45–120 s): a mensagem seguinte roubava o lock e a mais nova morria no CAS sem resposta. 180 s (`LIA_TURN_LOCK_TTL_MS`). | `delivery-service.ts` |
| 11 | P1 conversa | Relógio de abandono só contava mensagens do cliente (a Lia não grava as suas): cotação manual publicada 70 min depois do "só isso" e aceita 2 min depois era **cancelada "por inatividade" no instante do "pix"**. O `updatedAt` do pedido entra como segundo relógio. | `delivery-service.ts` |
| 12 | P1 conversa | "Trocar endereço" com o mesmo CEP mantinha a rua velha como verificada (o turno seguinte restaurava `user.defaultAddress`). Restauração não roda em `need_cep`/`need_address`. | `delivery-service.ts` |
| 13 | P1 conversa | Cotação publicada enquanto a conversa estava em outro assunto era impagável ("pix" virava busca). "pix"/"cartão" sem cesta nem escolha aberta procura a cotação em aberto do cliente. | `delivery-service.ts` |
| 14 | P1 operação | Pedido em `awaiting_payment` sumia do `/ops` (#GAS8P9 ficou 2 h invisível). Entrou na fila com rótulo próprio. | `order-flags.ts`, `OpsBoard.tsx` |
| 15 | P1 operação | Não existia botão para abrir estorno de pedido pago (removido em 02/08; runbook e doc de estorno mandavam clicar nele; `refund_pending` só era alcançável por `curl`). Botão "Cancelar e solicitar estorno" com confirmação, para pedidos pagos. Erros de domínio do servidor agora chegam ao operador com a mensagem real (409/400), não "confira a sessão". | `OpsBoard.tsx`, `api/ops/orders/[id]/route.ts` |
| 16 | P2 infra | `WaitlistLead` e `PetzImage` existiam em produção só via `db push` (sem migration): banco limpo nascia sem elas. Migration com `IF NOT EXISTS` (no-op em prod) + `migration_lock.toml` + **3 índices** para as consultas por cliente feitas em todo turno (`Conversation(userId,status,updatedAt)`, `DeliveryOrder(userId,status,createdAt)`, `Message(conversationId,createdAt)`). **Ainda não aplicada em produção** — ver seção 5. | `prisma/` |
| 17 | P2 higiene | Removidos: `/api/mercadolivre/notifications` (POST anônimo que logava o corpo), `/api/mercadolivre/callback` (redirect morto), `scripts/preflight-oba-internal.mts` (importava módulo inexistente), `serverComponentsExternalPackages` de pacotes não instalados. `.gitignore` deixava de versionar `.env.example` (`.env*`). `.env.example` ganhou as 14 variáveis operacionais que estão ligadas em produção e não constavam. Texto do `/ops` ("+10% de margem", "a Lia monta o carrinho") atualizado para o produto vigente. | vários |
| 18 | P1 pagamentos | Chave de idempotência do Pix era só `orderId`: reemitir um Pix vencido podia devolver o pagamento antigo já cancelado. Chave = `orderId:valor:janela de 30 min` (retentativa após timeout continua idempotente). *A confirmar* o comportamento exato do MP. | `payments/mercadopago.ts` |
| 19 | **P1 dinheiro** | Achado pelo E2E novo: quando a emissão do cartão falhava (MP fora), o `catch` restaurava o status mas não `quoteExpiresAt` (já zerado pelo caminho do cartão) — o "pix" seguinte **cancelava o pedido como "preço vencido"** e o cliente perdia a cotação. Validade restaurada junto com o total. | `delivery-service.ts` (`issueValidatedRetailerQuotePayment`) |

**Testes novos:** `tests/payment-reconcile.test.ts` (6 E2E com banco: valor divergente,
id não vigente, evidência que bate, dinheiro em pedido cancelado, cancelar com cartão
confirmado, total restaurado após falha do cartão), `tests/auth.test.ts` (+2: guarda do
`/ops`), `tests/pricing.test.ts` (+2: `parseMoneyInput`).

### 2.2 Aberto — por severidade (não corrigido neste ciclo; cada item tem dono sugerido)

**P1 — dinheiro/operação**
- **Esgotamento de retries do workflow de cartão fica mudo** (`workflows/charge-whatsapp-card.ts:39-46`): após 5 falhas relança sem marcar a tentativa nem avisar. E o `claimConfirmation` é um step com efeito: re-execução após falha de persistência vê `confirmed` → "duplicate" → **não cobra** e a tentativa fica órfã. Correção: catch final → nota + alerta + status `unknown_outcome`; `duplicate` com `confirmed` do próprio run segue para a cobrança; cron de reconciliação (`reconcilePagarmeOrder`) para `confirmed` > 5 min. *(engenharia, 2 h)*
- **Pagar.me 4xx tratado como "cartão recusado"** (`pagarme.ts:221-223`): 401/404/422 (chave errada, payload) viram "seu cartão foi recusado" + link Checkout Pro e tentativa `failed`. `declined` só quando o corpo diz `failed/not_authorized`; demais 4xx = `unavailable` + alerta. *(engenharia, 1 h)*
- **Mock aprova em produção por env ausente** (`mercadopago.ts:42-44`, `pagarme.ts:52-54`): deploy sem `MERCADO_PAGO_ACCESS_TOKEN` gera Pix mock e "paguei" aprova. Fail-closed quando `NODE_ENV=production`. *(engenharia, 30 min)*
- **Estorno não é executado por API** — `opsConfirmRefund` só registra a referência digitada; a rota legada `/api/admin/orders/[id]/cancel-refund` grava `mock_refunded` num modelo morto. Tabela `Payment` (provedor, id, valor) + estorno por API (`POST /v1/payments/{id}/refunds`) preenchendo a referência. *(engenharia, 1 dia)*
- **`awaiting_payment` nunca expira, o Pix expira em 60 min**: `resendCharge` reenvia código morto; `getStatus` mapeia `cancelled` para `rejected` ("ainda não caiu" em vez de "expirou, reemito"). *(engenharia, 2 h)*
- **Sem rate limit**: um número pode disparar 50 turnos de 300 s com até 3 chamadas OpenAI + Apify cada; logins `/admin` e `/ops` sem backoff. Orçamento por telefone/dia em Postgres. *(engenharia, 3 h)*

**P1 — conversa (do revisor do cérebro; a confirmar em E2E)**
- "2x arroz"/"bota 3" prometidos na copy como ajuste **somam** ou dão "não entendi" fora do comando composto (`lia-copy:339/516`, `delivery-service` `mergeBaskets`).
- `ctx.minSwap` pegajoso: um "beleza" casual depois de outro item executa a troca de loja.
- `mergeDecision` sobrevive a `change_address` (pedido com Pix vivo vira órfão da conversa).
- Dois caminhos mudos que disparam "Me perdi aqui" de verdade: toque de frete simultâneo à publicação (`:2364`) e `issueValidatedRetailerQuotePayment` quando o claim perde por `quoteExpiresAt` cruzado.
- TTL de cotação manual de 5 min para um processo assíncrono (`quoteValidFor`): cliente que lê 10 min depois recebe "esse preço venceu" e o "pix" seguinte abre **outro** pedido na fila. *Decisão de produto.*

**P2 — segurança/plataforma**
- Webhook Meta faz `JSON.parse` + zod **antes** da assinatura; provider é inferido pelo formato (ramo Twilio vivo se `TWILIO_AUTH_TOKEN` existir na Vercel — *a confirmar*); payload assinado com `entry:[]` responde 401 e a Meta re-entrega em rajada.
- Sem `headers()` de segurança (HSTS, `frame-ancestors`, nosniff, CSP); `/ops`, `/admin` sem `noindex`.
- Logs com telefone + 80 chars da mensagem; endereço completo enviado ao Nominatim.
- `/.well-known/workflow/v1/{step,flow}` são rotas públicas; verificação de origem não encontrada no código do `@vercel/queue` — **testar** `curl -X POST …/step` anônimo e registrar.
- `.env.local.bak` (06/08) é backup em texto puro com 60+ chaves reais no disco do dono. Apagar (não apaguei: é arquivo seu, fora do git).

**P2 — dados/infra**
- **O banco de produção é compartilhado com outro aplicativo** (tabelas `teams`, `players`, `tournament_settings`, funções `admin_login` SECURITY DEFINER, event trigger `ensure_rls` que liga RLS em toda tabela nova — todas as 20 da Lia estão com RLS ligado e sem policy; só funciona porque o role é owner). `migrate reset`/`db push --force-reset` podem destruir dados alheios. Projeto Supabase exclusivo.
- **Teste e produção compartilham banco e telefone**: os zumbis (#CMSMCE), os 7 pagos antigos, #YAQHF8/#QTNL2T e "cesta da sessão 18 no Pix da 19" são o mesmo defeito. Banco de teste separado (ou schema) e um telefone só de teste com reset por comando.
- Suíte fica verde sem banco (161 E2E viram `skip`); não há CI; `migrate deploy` não roda no build; duas migrations foram aplicadas à mão (`applied_steps_count=0`). Suíte completa leva **53 min**, o que empurra para o "gate focado" e deixa regressões passarem entre ciclos.
- 92 variáveis lidas e não documentadas / 21 documentadas e não lidas (parcialmente corrigido no `.env.example`).

### 2.3 Legado vivo (inventário) — recomendação: apagar em um único PR

Provado por grep que **nada do fluxo vivo importa**: `chat-service.ts` (1.2k), `admin-service.ts`, `adapters/{messaging,products,fulfillment,payment,twilio-agent-connect,twilio-content}.ts`, `adapters/suppliers.ts` (1.7k, só `runApifyActor` é reusado — extrair), rotas `/api/v1/*`, `/api/conversations/*`, `/api/admin/*` (12), `/api/twilio/*`, `/api/apify/mercadolivre/callback`, páginas `/admin` e `/chat`, componentes `admin-*`, `chat-app`, `product-actions`, modelos Prisma `Order`, `OpsTask`, `Product`, `ProductOption`, `Preference`, `SearchCache` (ML dormente), o ramo Twilio do webhook e `auth.ts:40-59`. No cérebro: `buildBasket`, passo `choosing_quantity` + `finishQuantityChoice` + `parseContextualQuantity`, passos `payment_issuing`/`awaiting_supplier_validation` nunca atribuídos, o fluxo legado de catálogo inteiro atrás de `LIA_MANUAL_CONCIERGE=false` (`quoteBasket`, `applyCourier`, `respondAfterQuote`, `createOrderAndCharge`, passos `quoted`/`choosing_courier`/`choosing_payment`), `coverage/freight-guard/geo/nearest` + 107 unidades geocodadas + 4 suítes, `couriers/{uber,lalamove,loggi}` e todo o motoboy (`operatorPickup`, `opsDispatchCourier`, `bought_and_dispatch`, envs `LIA_OPERATOR_PICKUP_*`, `LIA_REQUIRE_REAL_COURIER_DISPATCH`), `savedCardAdapter`, `isOneClickAvailable`, `attemptTotal`, 4 copies sem chamador. Estimativa: **−30% de arquivos, −2 superfícies de auth, −6 modelos**, e o cérebro deixa de ter duas máquinas de estado que todo handler precisa respeitar. É o pré-requisito para o item 3.2.

### 2.4 Busca e catálogo (cobertura parcial)

- Guarda ANVISA roda no caminho ML (`withoutMedicine` em `mercadolivre.ts:232,314`); a guarda **veterinária** (`withoutVeterinaryMedicine`) não é aplicada ao ML — *a confirmar* se antipulga do ML passa.
- Catálogos: 7,3 MB de `.ts` (Drogaria SP sozinha 46k linhas) importados estaticamente em todo cold start. Mover para JSON gzip carregado sob demanda (ou tabela) reduz bundle e latência fria.
- Por turno: até 3 chamadas OpenAI (extração, rerank, roteador) + Apify na cauda longa; sem orçamento por cliente (ver rate limit acima).

---

## 3. Sugestões de melhoria (engenharia), em ordem

1. **Fechar o dinheiro de ponta a ponta** (P1s da seção 2.2): tabela `Payment`, estorno por API, fail-closed de mock em produção, reconciliação por cron. Sem isso o "pago" e o "estornado" continuam sendo anotações.
2. **Apagar as cinco eras mortas** (2.3) e, só depois, **quebrar o cérebro** na ordem que menos arrisca: `turn-runtime` (lock/CAS/reply) → `ops-lifecycle` → `order-payments` → `address-flow` → `choice/basket/quote` → roteador em duas tabelas (intents globais × passo). Cada passo com a suíte E2E verde.
3. **Inverter a ordem do roteamento**: hoje regex primeiro, LLM só nos becos, busca de produto como default. É a causa única das duas famílias de falha mais frequentes de todas as rodadas ("frase vira produto", "pergunta sem resposta"). Classificar antes de buscar (LLM com schema fechado; dinheiro segue determinístico), "não sei" como resposta legítima, cauda longa opt-in.
4. **Máquina de estados tipada com expiração por estado**, em vez do saco de flags no JSON (`pendingRequest`, `lastChoice`, `mergeDecision`, `paymentIssuedAt`, `quotedAt`, `freightChoice`…) com três TTLs medindo relógios diferentes. Cada rodada achou um "ponteiro morto" novo — é a forma do bug, não o bug.
5. **Fronteira teste/produção**: projeto Supabase exclusivo, banco de teste, CI mínimo (tsc + lint + unit em todo push; E2E com Postgres em serviço), `migrate deploy` no pipeline, suíte E2E em paralelo por arquivo (53 min → < 10).
6. **Catálogo fora do bundle** e **um `env.ts` com zod** como fonte única do `.env.example`.

---

## 4. Leitura do negócio

### 4.1 O que os números reais dizem (banco de produção, 01/09)

| Métrica | Valor | Leitura |
|---|---|---|
| Duração | 24/06 → 01/09 (10 semanas), 295 commits, ~173k linhas (7,3 MB são catálogos) | Muito código por unidade de aprendizado com cliente |
| Pedidos (`DeliveryOrder`) | 463; 177 cancelados, 76 aguardando pagamento, 84 aguardando confirmação, 61 na fila do operador | Quase tudo é rodada de teste/persona |
| Pedidos com `paidAt` | 44 — **39 são Pix mock** (testes), **3 Pix reais** (R$ 68 em jun/jul + R$ 80,93 em 23/08) e **2 cartão** (R$ 65,59, 25–30/08) | **≈ R$ 215 de GMV real em 10 semanas, todos do dono/testadores** |
| Concluídos de ponta a ponta pelo fluxo do varejista | **0** (os 17 "entregues" são mock; 1 pedido real está em `retailer_preparing` desde 23/08; 2 Pix reais de jun/jul nunca saíram de "pago") | O ciclo completo cliente → pago → comprado → entregue **nunca aconteceu com dinheiro real** |
| Telefones distintos com pedido / com pedido pago | 334 / 40 | Personas de teste; clientes externos reais: 2 (24/08), nenhum comprou |
| Mensagens recebidas | jun 187 · jul 916 · **ago 3.146** · set 184 | Agosto foi o mês das 5 rodadas de teste por IA |
| Lista de espera (CEP fora) | 42 | Demanda fora de SP existe, pequena |
| Custo fixo declarado | US$ 49/mês (`docs/custos.md`, de 28/06, nunca revisado) + OpenAI/Apify/Pagar.me variáveis não medidos | Sem custo por pedido conhecido |

### 4.2 O que as 5 rodadas dizem (síntese)

- Notas: 4,30 → 4,15 → 6,80 → 2,85 → 4,30. **Não são comparáveis**: cada protocolo sondou
  as feridas da rodada anterior mais chão novo; a de 6,80 mediu "os consertos seguraram nas
  sondas exatas", a de 2,85 mediu "o que acontece fora do trilho". Gate fixado pelos
  próprios protocolos (≥ 8): nunca chegou perto.
- **Nenhum testador era humano pagante** desde 26/08 (agente de IA simulando personas).
  Os dois humanos de 24/08 "quebraram a conversa em minutos" após 7 ciclos limpos por IA.
- Veredito literal em 4 de 4 rodadas que fizeram a pergunta: **"não deixaria minha mãe usar
  sem ajuda"**. O núcleo (total certo, barreira de pagamento) funciona; a desconfiança vem
  de estado que se perde, pergunta que vira produto, e dinheiro parado.
- **Código resolve e resolveu**: aritmética (0 divergência desde a R3), troca anunciada,
  rede anti-silêncio, retomada, comando composto.
- **Só desenho resolve** (e está intacto): frete fragmentado / mínimo por loja / troca de
  marca forçada (100% das rodadas: R$ 27,80 de frete em arroz + café; R$ 53,70 de frete em
  R$ 71 de produto; café de R$ 21,89 trocado por R$ 36,29 para fugir do mínimo); preço acima
  do site ("vc tá me cobrando a mais?"); espera pelo operador sem SLA ("mando em instantes"
  que nunca veio); prazo que não pode ser prometido; lixo caro da cauda longa (Imagem de
  São Jorge, corte a laser, educador sanitário).
- Sinais de whack-a-mole: "contexto vira produto" voltou com 7 disfarces em 7 rodadas;
  teto de preço consertado 5+ vezes em rotas diferentes; ovos consertado no parser e
  voltou pelo caminho da IA; menu de pagamento sequestrando edição em 3 rodadas.

### 4.3 As hipóteses do produto e onde cada uma está

| Hipótese | Estado | Evidência |
|---|---|---|
| **H1 — Demanda:** gente quer pedir "qualquer coisa" por WhatsApp e pagar por isso | **Não testada** | 0 clientes externos pagantes em 10 semanas; a landing está no ar sem tráfego medido; os 42 leads fora de SP são o único sinal orgânico |
| **H2 — Largura como moat:** "nunca dizer não" (18 lojas + ML) | **Contraditada pelos testes** | A largura é a fonte do frete fragmentado, do mínimo por loja e do lixo da cauda longa; o dono já reduziu (11/08: "se não tem, fala que não tem") |
| **H3 — A conversa é o diferencial** (dono, 16/08) | **Parcialmente** | Quando linear, funciona; fora do trilho, 5 rodadas de "não deixaria minha mãe". E conversa boa é copiável pelo Magalu/Rappi em meses |
| **H4 — Fulfillment pelo varejista + compra manual escala** | **Contraditada** | Compra automatizada bloqueada 3× (Carrefour WAF, Petz/Boticário sem frete, ML = banimento); compra por agente GPT reabre o mesmo risco; 15 min/pedido humano |
| **H5 — 10% de markup paga a operação** | **Não fecha** | Cesta média real R$ 50–80 → R$ 5–8 brutos; menos taxa MP/Pagar.me (1–5%), IA+Apify (R$ 0,10–0,30/turno × N turnos), tempo do operador. Item caro tem 3% (R$ 40 num violão de R$ 1.389), com risco de preço defasado |
| **H6 — Pagamento no chat é vantagem** | **Validada tecnicamente, não comercialmente** | Bolha Pix nativa no ar (01/09); One-Click de cartão negado pela Meta |

### 4.4 Diagnóstico

A Lia hoje é **uma camada fina sobre lojas que não a reconhecem**: não controla preço
(catálogo raspado, refresh mensal, "preço garantido por X min"), não controla frete (tabela
por loja + fragmentação), não controla prazo (proibido prometer), não controla estoque
(descoberto na hora da compra) e não controla a compra (humano como consumidor comum, ou
robô sob risco de bloqueio). O que ela controla — a conversa e a cobrança — é justamente o
que mais recebeu investimento e o que menos decide a compra.

O resultado é um produto **mais caro que ir direto** (markup + frete por loja), **mais
lento que os apps** (sem same-day, espera pelo operador), com **catálogo menor que o ML**
(que ela própria usa como fallback), competindo por conveniência de "não abrir um app".
Isso pode ser um negócio para um segmento que valoriza exatamente isso e paga por serviço
(quem não consegue ou não quer usar apps; quem compra para outra pessoa — a "mãe" das
rodadas; escritórios e condomínios com listas recorrentes), mas **não como o produto de
massa "qualquer coisa para qualquer um em SP"** que a arquitetura de 18 lojas assume.

Do lado da execução, o padrão de 10 semanas foi: **decisão → construção intensa → teste
que invalida → pivô**, seis vezes, com o teste sempre feito por IA ou pelo próprio dono e
nunca por 30 clientes pagantes. Cada era deixou código, envs e docs "vigentes" que ainda
se contradizem (markup 10% vs progressivo; motoboy da base vs entrega do varejista; três
fontes vs 18; contratar operador vs GPT vs Luna). A auditoria de 30/08 comemorou 479/479
testes; no mesmo dia havia dois pedidos pagos há uma semana sem compra nem estorno. O
sistema mede a si mesmo, não o cliente.

### 4.5 Caminhos possíveis

**A. Concierge premium para poucos (piloto de demanda, 30 dias)** — *recomendado como
próximo passo, independentemente do destino.* Congelar features. Contrato simples e
visível: **taxa de serviço fixa** (ex.: R$ 9,90–14,90 por pedido) em vez de markup
escondido; **uma loja por cesta por padrão** (a de mercado cobre o mínimo; cauda longa
vira pedido separado com frete explícito); **SLA humano visível** ("total em até 15 min, das
9h às 21h") com o operador respondendo de verdade; sem cauda longa ao vivo (ML só por
pedido explícito). Meta: **30 pedidos pagos de desconhecidos** (amigos de amigos,
grupo de condomínio, escola), recompra ≥ 30% em 30 dias, margem de contribuição ≥ 0 com o
tempo do operador contado. Custo: quase zero de código (a taxa fixa e a loja única são
configuração + 1 dia de ajuste).

**B. Vertical de lista recorrente (escritório/condomínio/pet)** — cestas de R$ 300+, listas
estruturadas (menos cauda longa e menos NLU), recompra natural, margem que paga o
operador. A vitrine Kalunga/Cobasi/Petz já existe. Exige vendas B2B cara a cara, não
landing.

**C. Camada de conversa para UM varejista (parceria)** — vender exatamente o que a Lia
construiu (WhatsApp + busca + carrinho + Pix nativo + operador) como front-end de um
varejista que entrega (Oba, Cobasi, Petz, uma rede regional). Resolve de uma vez compra
automatizada (API do parceiro), termos, frete, prazo e preço fresco. Os docs de 19/07
identificam a "parceria homologada" como a rota de escala e nunca a perseguiram
comercialmente. Exige uma proposta, três reuniões e um piloto branded — não código.

**D. Encerrar ou pausar.** Honesto se nenhum dos três acima motivar: o custo fixo é baixo,
mas o custo de oportunidade de mais 10 semanas de regex é alto.

**Recomendação:** A agora (4 semanas), com C em paralelo (três conversas comerciais).
Ao fim, decidir com dados: recompra e margem ≥ meta → seguir A/B; interesse real de
varejista → C; nada → D. Em qualquer cenário, o trabalho de engenharia da seção 3
(dinheiro fechado, legado apagado, teste ≠ produção) vale a pena porque é o que se leva
para C.

### 4.6 O que NÃO fazer nos próximos 30 dias

- Mais rodadas de persona por IA e mais intents por regex — o sinal já está claro.
- Mais lojas, mais catálogo, automação de compra por agente.
- Ligar One-Click, Rappi, parcelamento, comparação técnica, "escolhe você com julgamento".

---

## 5. Decisões e ações que só o dono pode tomar

1. **#YAQHF8 (R$ 20,62, cartão, 25/08) e #QTNL2T (R$ 80,93, ML, 23/08)**: entregar ou
   estornar hoje. Também os 7 pagos antigos de julho.
2. **Aplicar a migration** (`prisma migrate deploy` com `DIRECT_URL`) — cria índices e
   registra as duas tabelas; é no-op nos dados. Não apliquei porque altera produção.
3. **Deploy desta revisão** e, logo depois, abrir `/ops?key=<OPS_TOKEN>` uma vez (o cookie
   antigo deixa de valer). Observar o primeiro pagamento real: `[payment:unexpected]` não
   deve aparecer num fluxo normal.
4. **Apagar `.env.local.bak`** e mover a Lia para um projeto Supabase só dela.
5. **Escolher o caminho da seção 4.5** e, com ele, autorizar o PR de remoção do legado.
6. Pendências de 1 minuto que seguem paradas: `LIA_BUSINESS_INFO`, Fluid Compute na
   Vercel, ticket do DevCenter do ML, `LIA_OPERATOR_PAID_ALERT=true` quando entrar gente de
   fora.

---

## Anexo — o que foi verificado e o que não foi

- Verificado por execução: `tsc`, `lint`, 109 unitários, suíte de pagamento com banco.
- Verificado por leitura: todos os achados com arquivo:linha.
- **Não verificado ao vivo:** o `/ops` renderizado (não subi o dev server contra o banco de
  produção), a Graph aceitando `order_status`, o comportamento do MP para chave de
  idempotência repetida, o cancelamento real de um Pix no MP (best-effort, só loga).
- **Não coberto:** revisão profunda do matcher/rerank e dos wrappers de loja (o agente
  dessa frente caiu por limite de gasto); recomendo rodar `npx tsx scripts/eval-search.mts`
  e o golden como parte do próximo ciclo, se houver.
