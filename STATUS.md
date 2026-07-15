# Lia — Status do Projeto

> Memória canônica para agentes: [AGENTS.md](AGENTS.md). Progresso e próximos passos:
> [PENDENCIAS.md](PENDENCIAS.md). Leia ambos antes de interpretar este status ou tomar
> decisões de produto.

_Última atualização: 2026-07-14. Doc de leitura rápida do estado atual. O histórico de
decisões ("por que esse modelo") está no [CLAUDE.md](CLAUDE.md); os ciclos recentes estão
em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md) e
[docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md). A revisão operacional
de hoje está em
[docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md)._

---

## 1. O que é a Lia

**Concierge de compras do dia a dia no WhatsApp.** O cliente pede itens em linguagem
natural, recebe preço/frete/prazo cotados no checkout real e paga por **Pix ou cartão**.
Pix e Checkout Pro usam Mercado Pago; o cartão nativo no WhatsApp, quando habilitado, usa
Meta Cloud API direta + Pagar.me. A Lia compra e o **varejista entrega diretamente** ao
endereço.

“Entrega hoje” é uma modalidade separada: só pode ser oferecida quando o próprio varejista
prometer o mesmo dia ou quando houver parceiro formal que libere retirada por courier.
`Clique-e-retire + motoboy aleatório` não é mais considerado fluxo escalável.

- **Receita:** markup de **10%** embutido no preço (produto e frete são pass-through).
- **Sem remédio** (ANVISA). **Loja-base:** Carrefour; **+lojas:** Petz (pet), O Boticário (beleza).
- **Moat:** a **largura** — "qualquer coisa, de qualquer loja, num WhatsApp só".

---

## 2. O fluxo (e o que é automático vs. manual)

```
1. 💳 Cliente manda no WhatsApp: "ração e arroz"
2. 🤖 Lia pede o endereço (só na 1ª vez) e o mantém no perfil seguro
3. 🤖 Lia acha os itens ao vivo e ROTEIA pra 1 loja só (a que cobre melhor)
4. 🤖 Se ambíguo ("sal"), mostra até 3 opções → cliente responde o número
5. 🤖 Monta uma sacola temporária e pede ao varejista preço, frete e prazo reais
6. 💳 Cliente responde "pagar" → escolhe Pix (copia-e-cola, sem taxa) ou cartão. O
   fallback ativo é link Checkout Pro; após habilitação externa, recompra com cartão salvo
   usa confirmação nativa One-Click no WhatsApp → 🤖 Lia gera a cobrança REAL
7. 💳 Cliente paga → 🤖 Lia revalida preço, itens, endereço e prazo
8. 🛡️ A compra segue em cart_only/approval_required enquanto o checkout é pilotado
9. 🏬 O varejista entrega diretamente e a Lia acompanha o pedido
```

**Dinheiro:** cliente paga tudo (produtos +10% + frete) no Pix → cai na sua conta MP →
você paga o varejista desse saldo → **sobra a margem de 10%**. Courier só entra e é pago
quando existir uma rota urgente formalmente compatível.

---

## 3. O que está PRONTO e REAL ✅

| Componente | Status |
|---|---|
| **Busca Carrefour** | ✅ links/preços reais via busca ao vivo; cache curto e falha fechada em produção. O catálogo de 1.094 itens permanece como histórico/seed de teste. |
| **Busca Petz** | ✅ busca ao vivo + cache de 15 min; só mostra opção com URL/preço reais. Catálogo histórico: 2.822 itens, sem remédio. |
| **Busca Boticário** | ✅ busca ao vivo + cache de 15 min; SKU, preço e URL reais. Catálogo histórico: 1.409 itens. |
| **Multi-loja + roteamento** | ✅ Carrefour + Petz + Boticário; **1 loja por pedido**, escolhida por match |
| **Pix (Mercado Pago)** | ✅ **REAL, testado com pagamento de verdade** |
| **Cartão (Checkout Pro)** | ✅ link hospedado no MP com taxa repassada; mesmo webhook do Pix |
| **Cartão One-Click (Meta + Pagar.me)** | 🟡 código concluído, flag desligada; primeira compra tokeniza no Pagar.me, recompra usa `order_details` nativo. Falta allowlist Meta, configuração Pagar.me, migration e sandbox. Não usa 360dialog. |
| **Comandos de conversa** | ✅ status, "paguei" (verificado no MP em prod), cancelar, trocar endereço, "tira X", "troca X por Y", repete o de sempre, ajuda |
| **Conversa / NLU** | ✅ reconstruída após review: onboarding preserva o pedido até o CEP, perguntas não viram item, total parcial, encerramento de lista, atendimento/reclamação, cancelamento e pagamento são contextuais |
| **Escolha de opções** | ✅ número, ordinal, preço, recomendação, marca/nome, refinamento e estreitamento de opções; "coca" entre duas Cocas não vira item novo |
| **Matcher dos catálogos** | ✅ piso de relevância + guardas de negação, produto humano/pet, espécie, tamanho e variante; básico/adulto/seco primeiro quando não há preferência explícita |
| **Testes focados da compra** | ✅ TypeScript + compradores/busca/política passam. ⚠️ O `npm test` completo ainda tem evals históricos que esperam CEP em vez de endereço completo. |
| **Motoboy (Uber Direct)** | ⚠️ OAuth + cotação funcionam, mas não autorizam retirada em Petz/Carrefour. Só usar com parceiro compatível. |
| **Cobertura** | ⚠️ O preset de SP e a guarda de 12 km continuam no código, mas são legado do motoboy. Para entrega direta, o checkout do varejista é a autoridade por CEP. |
| **Lojas (107 unidades geocodadas)** | ✅ dado útil para parceiros/same-day; proximidade não prova estoque, entrega ou prazo do varejista. |
| **Landing + domínio** | ✅ **liadelivery.com.br no ar** (HTTPS) — site novo (pôster Petróleo), domínio **verificado na Meta** |
| **Meta / WhatsApp oficial** | ✅ número aprovado, Cloud API ativa em produção e webhook assinado validado |
| **Opções pra escolher** | ✅ até 3 cards com foto + botão **Escolher este** na Meta; lista numerada como fallback |
| **Pedido mínimo** | ✅ por loja (Carrefour = R$30); avisa o cliente p/ completar |
| **Painel do operador `/ops`** | ✅ existe; o fluxo legado de retirada/despacho precisa ser adaptado para entrega do varejista |
| **Onboarding de endereço** | ⚠️ CEP já é persistido; o fluxo novo precisa guardar endereço completo de forma segura e confirmar no resumo. |
| **Markup 10%** | ✅ embutido no preço (sem linha de "taxa") |
| **Privacidade da loja** | ✅ a Lia não fala "Carrefour" pro cliente ("Procurando…") |
| **Canal** | ✅ Meta Cloud API em produção; Twilio Sandbox é legado de teste. |
| **MEI / CNPJ + e-mail** | ✅ aberto (do seu lado); `contato@liadelivery.com.br` configurado no ImprovMX |

---

## 4. O que FALTA (por prioridade)

### 🔴 O que destrava o produto
- **Definir titularidade e pós-venda:** comprador, nota fiscal, troca, devolução e uso de
  uma conta de varejista para múltiplos destinatários.
- **Pilotar entrega direta** com 5–10 pedidos controlados, sem prometer motoboy.
- **Testar checkout e cartão salvo** em `cart_only`, incluindo CVV, 3DS, CAPTCHA e antifraude.
- **Revisar a conversa e o `/ops`** para frete/prazo do varejista em vez de cotação Uber
  obrigatória.
- **Antes de habilitar One-Click:** aplicar migrations de pagamento, obter a allowlist
  Payments API BR da Meta, liberar domínio/configurar webhook no Pagar.me e rodar testes
  sandbox de primeira compra, recompra, recusa e resposta perdida. Guia:
  [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).

### 🟡 Pra operar de verdade
- **WhatsApp oficial da Meta**: ✅ o número `+55 11 97844-4813` foi aprovado como
  `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e ativado em
  produção (`WHATSAPP_PROVIDER=meta`). O webhook assinado foi validado em produção.
- **Mercado Pago PJ + nota fiscal** (hoje o Pix está no nome pessoal).
- **Confirmar cobertura real de entrega** por CEP em Petz, Carrefour e Boticário. Unidade
  próxima não prova estoque, frete ou prazo.

### 🟢 Pra escalar (pós-piloto)
- **Mais lojas** (a largura = moat): **Cobasi** (mesma receita, já confirmado raspável),
  **farmácia não-remédio**, **beleza** (Boticário/Sephora).
- **Fortalecer busca/cotação ao vivo:** Browserbase + cache já existem; falta medir p95,
  concorrência por Context, falhas de anti-bot e custo por pedido. O checkout continua sendo
  a fonte final de preço, estoque, frete e prazo.
- **Cesta multi-loja** (juntar Carrefour + Petz num pedido) — decidimos deixar pra depois
  (= 2 compras, fretes, entregas e pós-vendas).
- **Expandir catálogos** (re-coletar Carrefour/Petz periodicamente).
- **Migração de schema (quando fizer sentido):** coluna `paymentMethod` no DeliveryOrder
  (hoje é inferido de `notes`/link — centralizado em `src/lib/order-flags.ts`) e índice
  único em `Message(conversationId, metadata)` pra fechar de vez a janela de corrida do
  dedupe de webhook (hoje é check-then-insert; janela pequena, mas existe).

---

## 5. Riscos honestos a validar no piloto

1. 🧾 **Titularidade/termos:** conta central comprando para vários destinatários, NF, troca
   e devolução precisam de validação jurídica e comercial.
2. 💰 **Cliente pagar o total** (produto+frete) pela conveniência vs. comprar diretamente.
3. 🛡️ **Checkout:** cartão salvo, CVV, 3DS, CAPTCHA, antifraude e duplicidade.
4. 📦 **Preço/estoque desatualizados.** Mitigação: link
   "ver no Carrefour" no /ops. Mitigação futura: o scrape por pedido pago.
5. 🛵 **Same-day:** não prometer retirada por courier sem parceiro que a autorize.

---

## 6. Como operar / testar

**Cliente (pelo celular):** manda no WhatsApp da Lia → `oi` → CEP → itens → escolhe opções
→ `pagar` → paga o Pix. Recebe "Pagamento confirmado ✅".

**Operador (piloto):** abre `shopping-agent-mvp.vercel.app/ops?key=<API_TOKEN>` → vê o pedido
pago → confere o carrinho/sessão → aprova a compra com entrega direta → registra o número
do pedido e acompanha o fulfillment do varejista.
O card também permite **avisar o cliente** (substituição/atraso, vira mensagem da Lia) e
destaca em vermelho pedidos em que o **cliente pediu cancelamento** pelo WhatsApp.

**Motoboy:** não faz parte do fluxo padrão. Petz e Carrefour exigem documentação do titular
para retirada por terceiro; não enviar documentos pessoais a entregadores on-demand.

---

## 7. Credenciais / ambiente (Vercel)

| Configurado ✅ | Pendente / opcional |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` + webhook | `MERCADO_PAGO_WEBHOOK_SECRET` (assinatura é só aviso) |
| `BROWSERBASE_API_KEY` + Contexts dos varejistas | `LIA_PETZ_MIN_ORDER`, `LIA_CARREFOUR_MIN_ORDER` (default 30) |
| `UBER_DIRECT_CUSTOMER_ID/CLIENT_ID/CLIENT_SECRET` (opcional/parceiros) | Política e credenciais de rastreio dos varejistas |
| `OPENAI_API_KEY`, `DATABASE_URL`, `API_TOKEN`, Twilio | Scraper pago (estoque ao vivo) — futuro |
| `LIA_COVERAGE_PRESET=estado-sp` (SP inteiro) | `LIA_MAX_DELIVERY_KM` (12), `LIA_MAX_DELIVERY_FEE` (35) — ajuste da guarda |

> 🔒 Recomendado: **regenerar** o Access Token do MP e o Client Secret da Uber (passaram no
> chat) e atualizar no Vercel depois dos testes.

O estado de Meta, domínio, e-mail, cobrança, motoboy, painel e checklist do piloto está
centralizado em [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md).

---

## 8. Arquitetura (onde está cada coisa)

| Peça | Arquivo |
|---|---|
| Cérebro da conversa (estado, roteamento, opções, mínimo) | `src/lib/delivery-service.ts` |
| Detecção de intenção (pura, sem DB — unit-testável) | `src/lib/lia-intents.ts` |
| Copy — todas as mensagens enviadas ao cliente | `src/lib/lia-copy.ts` |
| Testes/evals de conversa | `tests/` (`npm test`) |
| Lojas (plugável) | `src/lib/stores/` (`carrefour.ts`, `petz.ts`, `*-catalog.ts`, `index.ts`) |
| Cobertura + entregabilidade | `src/lib/coverage.ts` (presets/UF) + `src/lib/freight-guard.ts` (guarda km/fee) + `WaitlistLead` (mapa de demanda no /ops) |
| Geo + loja mais próxima | `src/lib/geo.ts` (haversine + geocode) + `src/lib/stores/nearest.ts` (`pickNearestUnit`) |
| Landing (site público) | `src/app/page.tsx` + `src/components/landing/` (demo de chat em `/chat`) |
| Motoboys (plugável) | `src/lib/couriers/` (Uber Direct) |
| Pix | `src/lib/payments/mercadopago.ts` + `/api/mercadopago/webhook` |
| Cartão One-Click | `src/lib/payments/pagarme.ts`, `src/lib/payments/whatsapp-pay.ts`, `/api/pagarme/webhook` e [guia](docs/whatsapp-one-click-pagarme.md) |
| Busca por IA | `src/lib/adapters/ai.ts` (`extractShoppingList`) |
| Matcher / ranking comum | `src/lib/stores/types.ts` (`scoreCatalogMatch`, `rankCatalog`, `attrMatchesItem`) |
| Painel do operador | `/ops` + `/api/ops/...` |
| Pedido (cesta, ciclo de status) | `prisma DeliveryOrder` |

**Somar loja = 1 arquivo** (conector + catálogo) + registrar em `stores/index.ts`.
**Ciclo atual no código (legado):** `awaiting_payment → paid → operator_buying → ready_for_pickup → dispatched → delivered`.
O fluxo de entrega direta precisa substituir `ready_for_pickup/dispatched` por estados de
pedido/rastreio do varejista.

### Atualização de conversa — 2026-07-07

O review profundo de conversa (115 achados) resultou em uma reconstrução de NLU, matcher,
copy e máquina de estados. A documentação completa, com sequência do trabalho e comandos
de validação, está em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md).
