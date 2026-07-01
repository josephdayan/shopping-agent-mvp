# Lia — Status do Projeto

_Última atualização: 2026-07-01. Doc de leitura rápida do estado atual. O histórico de
decisões ("por que esse modelo") está no [CLAUDE.md](CLAUDE.md)._

---

## 1. O que é a Lia

**Concierge de compras do dia a dia no WhatsApp.** O cliente pede itens em linguagem
natural, paga por **Pix ou cartão** (Mercado Pago), e a Lia compra numa loja local via
**clique-e-retire** e entrega no **mesmo dia** por **motoboy** (Uber Direct).

- **Receita:** markup de **10%** embutido no preço (produto e frete são pass-through).
- **Sem remédio** (ANVISA). **Loja-base:** Carrefour; **+lojas:** Petz (pet), O Boticário (beleza).
- **Moat:** a **largura** — "qualquer coisa, de qualquer loja, num WhatsApp só".

---

## 2. O fluxo (e o que é automático vs. manual)

```
1. 💳 Cliente manda no WhatsApp: "ração e arroz"
2. 🤖 Lia pede o CEP (só na 1ª vez) e guarda pra sempre
3. 🤖 Lia acha os itens (catálogo real) e ROTEIA pra 1 loja só (a que cobre melhor)
4. 🤖 Se ambíguo ("sal"), mostra até 3 opções → cliente responde o número
5. 🤖 Cota o frete na Uber em tempo real + mostra o total
6. 💳 Cliente responde "pagar" → escolhe Pix (copia-e-cola, sem taxa) ou cartão
   (link Checkout Pro, taxa repassada) → 🤖 Lia gera a cobrança REAL
7. 💳 Cliente paga → 🤖 pedido vira "pago" e entra na fila do /ops
──────────── operador (você) ────────────
8. 🧑 Compra os itens na loja (clique-e-retire)          ← ÚNICO passo 100% manual
9. 🧑 No /ops: "marquei como comprado" + nº do pedido
10. 🧑 No /ops: "Despachar motoboy" → 🤖 chama a Uber sozinho
11. 🏬 Motoboy retira no balcão (com SEU documento) e entrega  ← o risco nº1
12. 🧑 No /ops: "marcar entregue" → 🤖 cliente é avisado
```

**Dinheiro:** cliente paga tudo (produtos +10% + frete) no Pix → cai na sua conta MP →
você paga a loja e a Uber desse saldo → **sobra a margem de 10%**.

---

## 3. O que está PRONTO e REAL ✅

| Componente | Status |
|---|---|
| **Catálogo Carrefour** | ✅ **1094 itens reais** (preço + nome) — 9 departamentos |
| **Catálogo Petz** | ✅ **2.822 itens reais** (pet, sem remédio) + fotos re-hospedadas em `/api/petz-image` |
| **Catálogo Boticário** | ✅ **1.409 itens reais** (beleza: perfumaria/maquiagem/corpo/cabelos) + **foto (98%)** + **URL real do produto** (deep-link no /ops) + 10 lojas de SP |
| **Multi-loja + roteamento** | ✅ Carrefour + Petz + Boticário; **1 loja por pedido**, escolhida por match |
| **Pix (Mercado Pago)** | ✅ **REAL, testado com pagamento de verdade** |
| **Cartão (Checkout Pro)** | ✅ link hospedado no MP com taxa repassada; mesmo webhook do Pix |
| **Comandos de conversa** | ✅ status, "paguei" (verificado no MP em prod), cancelar, trocar endereço, "tira X", "troca X por Y", repete o de sempre, ajuda |
| **Testes/evals** | ✅ `npm test` — unitários (NLU + copy) + evals de conversa E2E |
| **Motoboy (Uber Direct)** | ✅ **REAL** — OAuth + cotação testados com as credenciais |
| **Lojas Carrefour** | ✅ 12 unidades Hiper reais de SP + escolha da mais próxima por CEP |
| **Opções pra escolher** | ✅ até 3 opções (lista numerada) quando o item é ambíguo |
| **Pedido mínimo** | ✅ por loja (Carrefour = R$30); avisa o cliente p/ completar |
| **Painel do operador `/ops`** | ✅ fila → comprar → despachar → entregue, com endereço da loja + link "ver no Carrefour" |
| **Onboarding de CEP** | ✅ uma vez só, reusado em todo pedido |
| **Markup 10%** | ✅ embutido no preço (sem linha de "taxa") |
| **Privacidade da loja** | ✅ a Lia não fala "Carrefour" pro cliente ("Procurando…") |
| **Canal** | ✅ WhatsApp via Twilio (sandbox) |
| **MEI / CNPJ** | ✅ aberto (do seu lado) |

---

## 4. O que FALTA (por prioridade)

### 🔴 O que destrava o produto
- **Rodar o PILOTO real** (5–10 pedidos) — validar a **retirada no balcão com documento**
  (o risco nº1). Nenhum código resolve isso; só a vida real. **Use motoboy conhecido** no
  começo (CPF pré-cadastrado), não o aleatório do Uber.

### 🟡 Pra operar de verdade
- **Mercado Pago PJ + nota fiscal** (hoje o Pix está no nome pessoal).
- **Lojas Petz reais** (endereço + mínimo + política de retirada por terceiro) antes de um
  pedido Petz real — hoje são placeholder.

### 🟢 Pra escalar (pós-piloto)
- **Mais lojas** (a largura = moat): **Cobasi** (mesma receita, já confirmado raspável),
  **farmácia não-remédio**, **beleza** (Boticário/Sephora).
- **Check de estoque/preço ao vivo** por pedido pago — precisa de um **serviço de scraping
  com anti-bot** (ScrapingBee/Zyte/Bright Data). Custo ~R$0,10/pedido + cache. Hoje o
  catálogo é estático (resposta instantânea, mas pode desatualizar).
- **Botões tocáveis no WhatsApp** — precisa de **sender WhatsApp Business aprovado** (o
  sandbox só faz lista numerada).
- **Cesta multi-loja** (juntar Carrefour + Petz num pedido) — decidimos deixar pra depois
  (= 2 retiradas/fretes).
- **Expandir catálogos** (re-coletar Carrefour/Petz periodicamente).
- **Migração de schema (quando fizer sentido):** coluna `paymentMethod` no DeliveryOrder
  (hoje é inferido de `notes`/link — centralizado em `src/lib/order-flags.ts`) e índice
  único em `Message(conversationId, metadata)` pra fechar de vez a janela de corrida do
  dedupe de webhook (hoje é check-then-insert; janela pequena, mas existe).

---

## 5. Riscos honestos a validar no piloto

1. 🏬 **Retirada no balcão com documento** — o maior risco operacional (varia por loja).
2. 💰 **Cliente pagar o total** (produto+frete) pela conveniência vs. usar o Daki.
3. 📦 **Preço/estoque desatualizados** (catálogo estático). Mitigação grátis hoje: o link
   "ver no Carrefour" no /ops. Mitigação futura: o scrape por pedido pago.

---

## 6. Como operar / testar

**Cliente (pelo celular):** manda no WhatsApp da Lia → `oi` → CEP → itens → escolhe opções
→ `pagar` → paga o Pix. Recebe "Pagamento confirmado ✅".

**Operador (você):** abre `shopping-agent-mvp.vercel.app/ops?key=<API_TOKEN>` → vê o pedido
pago → confere preço/estoque no link "🔎 ver" de cada item → compra na loja
(clique-e-retire) → "marquei como comprado" + nº → "Despachar motoboy" → "marcar entregue".
O card também permite **avisar o cliente** (substituição/atraso, vira mensagem da Lia) e
destaca em vermelho pedidos em que o **cliente pediu cancelamento** pelo WhatsApp.

**Retirada (motoboy):** leva o **nº do pedido + documento do titular (VOCÊ) + autorização**.
O documento do **cliente nunca é necessário** — quem compra na loja é sempre você.

---

## 7. Credenciais / ambiente (Vercel)

| Configurado ✅ | Pendente / opcional |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` + webhook | `MERCADO_PAGO_WEBHOOK_SECRET` (assinatura é só aviso) |
| `UBER_DIRECT_CUSTOMER_ID/CLIENT_ID/CLIENT_SECRET` | `LIA_PETZ_MIN_ORDER`, `LIA_CARREFOUR_MIN_ORDER` (default 30) |
| `OPENAI_API_KEY`, `DATABASE_URL`, `API_TOKEN`, Twilio | Scraper pago (estoque ao vivo) — futuro |

> 🔒 Recomendado: **regenerar** o Access Token do MP e o Client Secret da Uber (passaram no
> chat) e atualizar no Vercel depois dos testes.

---

## 8. Arquitetura (onde está cada coisa)

| Peça | Arquivo |
|---|---|
| Cérebro da conversa (estado, roteamento, opções, mínimo) | `src/lib/delivery-service.ts` |
| Detecção de intenção (pura, sem DB — unit-testável) | `src/lib/lia-intents.ts` |
| Copy — todas as mensagens enviadas ao cliente | `src/lib/lia-copy.ts` |
| Testes/evals de conversa | `tests/` (`npm test`) |
| Lojas (plugável) | `src/lib/stores/` (`carrefour.ts`, `petz.ts`, `*-catalog.ts`, `index.ts`) |
| Motoboys (plugável) | `src/lib/couriers/` (Uber Direct) |
| Pix | `src/lib/payments/mercadopago.ts` + `/api/mercadopago/webhook` |
| Busca por IA | `src/lib/adapters/ai.ts` (`extractShoppingList`) |
| Painel do operador | `/ops` + `/api/ops/...` |
| Pedido (cesta, ciclo de status) | `prisma DeliveryOrder` |

**Somar loja = 1 arquivo** (conector + catálogo) + registrar em `stores/index.ts`.
**Ciclo:** `awaiting_payment → paid → operator_buying → ready_for_pickup → dispatched → delivered`.
