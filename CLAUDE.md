# Lia — projeto, decisões e arquitetura

Lia é uma **concierge de compras do dia a dia no WhatsApp**: o cliente pede itens em
linguagem natural, paga por Pix, e a Lia compra numa loja local via **clique-e-retire**
e entrega no mesmo dia por **motoboy** (Uber Direct). Este doc registra **por que** o
produto é assim (a jornada e os becos sem saída) e **como** ele funciona.

---

## 1. A jornada de decisão (por que NÃO os outros caminhos)

Exploramos a fundo (com pesquisa real, fontes citadas) e descartamos, em ordem:

- **"Comprar no Mercado Livre/Rappi por API" (automático):** ❌ não existe API de compra
  do lado do comprador. A API do ML/Rappi é só do vendedor/lojista. Automatizar o
  checkout = robô (botting) → banimento, ilegal, quebra sempre. Beco.
- **Zinc / Rye (rails de "compre em qualquer varejista via API"):** existem e funcionam —
  mas **só EUA/Canadá** (Amazon US/UK/CA, Walmart, Target…). **Nenhum varejista BR/LATAM.**
  E não há "Zinc do Brasil"; construir um é virar uma empresa de automação/operação que
  come o risco. Beco pro Brasil.
- **Dropshipping nacional (Dropify/DSlite):** automatiza a compra, MAS é **centralizado**
  (galpão único, envia pro consumidor por transportadora) → **não dá same-day**. Física:
  same-day exige estoque **local**; dropship é nacional. Não combinam.
- **Farmácia same-day em SP:** ❌ duas paredes. (a) **ANVISA**: vender/entregar remédio é
  exclusivo de farmácia licenciada — até OTC; terceiro não pode revender. Uber Direct ainda
  PROÍBE remédio. (b) **Concorrência**: iFood Turbo (~12 min, R$3,99), Rappi Turbo Farma
  (virou farmácia licenciada, ~10 min), Daki, e as próprias redes (60 min + WhatsApp) já
  dominam. Seríamos mais lentos e mais caros, sem poder vender o item principal.
- **"Conselheiro neutro" (compara e indica, não compra):** sem moat — conselho qualquer
  GPT dá. O cliente quer **operacional** (WhatsApp que FAZ), não conselho.
- **Concorrência da Lia (Brasil):** não existe um "Lia" exato (cross-seller + paga no chat).
  O mais perto é o **WhatsApp da Lu (Magalu)** — faz tudo, mas só no catálogo próprio (jardim
  murado). **Zapia** é cross-seller mas não paga no chat. **Meta** entra com pagamento nativo
  no WhatsApp em 2026.

**Conclusão:** o único modelo **operacional + legal + sem parceria/BD + same-day** para um
time pequeno é: **clique-e-retire (você é só cliente) + motoboy self-serve + WhatsApp + Pix.**

---

## 2. O modelo escolhido (o que a Lia É hoje)

```
Cliente pede no WhatsApp  →  Lia acha no Carrefour, mostra preço (com 10% embutido)
  →  cota o motoboy em tempo real (frete repassado)  →  total  →  Pix
  →  cai na FILA DO OPERADOR  →  operador faz o clique-e-retire no Carrefour e despacha o motoboy
  →  motoboy retira na loja (com documento) e entrega same-day  →  Lia avisa o cliente
```

- **Loja-base:** Carrefour (hipermercado = tem tudo: comidinha, higiene, pet, limpeza,
  bebida), com **clique-e-retire** e **retirada por terceiro** (motoboy com documento). Aberto
  pra somar farmácia (não-remédio), Petz, etc. → o moat é a **largura** ("qualquer coisa, num
  WhatsApp só").
- **Economia:** produto e frete são **pass-through**; sua receita = **markup de 10%** embutido
  no preço (sem linha de "taxa"). Operador vê custo Carrefour / margem / cliente pagou.
- **CEP/endereço:** configurado **uma vez no onboarding**; reusado em todos os pedidos.
- **Catálogo:** **~1094 itens reais** raspados de `mercado.carrefour.com.br` (nome + preço de
  verdade, páginas de categoria dos 9 departamentos) em `src/lib/stores/carrefour-catalog.ts`.
  O `unitPrice` é o **custo real Carrefour** (markup de 10% entra depois). Estático/instantâneo
  (sem scrape no turno). Como recoletei: extensão Claude-no-Chrome paginando `/categoria/<dep>?page=N`
  e lendo o DOM (a API VTEX/legada dá 403/503 mesmo same-origin; só páginas renderizadas passam,
  por isso o actor Apify da comunidade falha — anti-bot Akamai). Pra regenerar: re-raspar as
  categorias e rodar o gerador.
- **Catálogo Boticário:** **1.409 itens reais** (nome + marca + preço + **foto** + **URL real
  do produto**) em `src/lib/stores/boticario-catalog.ts` — perfumaria, maquiagem, corpo & banho,
  cabelos. Vertical de **beleza** (presente / "acabou minha base"), margem alta, sem sobrepor
  mercado/pet. Boticário faz "Entrega Rápida" **e** "Retire em loja" (clique-e-retire). Raspado
  de `boticario.com.br` em 2026-07-01 (SSR: fetch+parse `?page=N`; server-side puro dá 403).
  `productUrl` = deep-link real (o `/ops` abre o item exato). **Fotos (98%, Cloudinary)**
  raspadas do DOM renderizado (navigate+extract síncrono → localStorage, porque a Boticário
  limita fetch em massa) e **forçadas pra JPG** (`f_jpg`) porque a origem é AVIF (WhatsApp
  rejeita); Cloudinary é permissivo → sem re-host (diferente do Akamai da Petz). Lojas = 10
  shoppings reais de SP (confirmar a unidade + política de retirada por terceiro antes do
  piloto). Liga/desliga por `LIA_ENABLE_BOTICARIO`.
- **Catálogo Petz:** **2.822 itens reais** (nome + preço + foto) em `src/lib/stores/petz-catalog.ts`,
  raspados de `petz.com.br` (48 subcategorias, 6 deptos; sem remédio/antipulga — ANVISA). Mesmo
  método DOM (Petz também é VTEX+Akamai). **Imagens re-hospedadas** em `/api/petz-image/<id>`
  (tabela `PetzImage`, ~60MB) porque o CDN da Petz é Akamai e barra o Twilio no WhatsApp;
  `LIA_MEDIA_BLOCK_HOSTS` evita imagem quebrada. Ver/buscar tudo em **`/ops/catalogo`** (foto +
  custo/margem). ⚠️ prod: setar `OPS_TOKEN` forte (default cai no `API_TOKEN` fraco).
- **Lojas:** **107 unidades reais geocodadas** de Carrefour, Petz e Boticário em SP. A escolha
  usa distância geográfica real quando há coordenadas (`pickNearestUnit`); o proxy de CEP é
  apenas o fallback quando não há geo disponível. Ver o detalhamento de cobertura abaixo.
- **Pagamento/motoboy:** **Pix (Mercado Pago) e Uber Direct estão REAIS e testados** — Pix com
  pagamento de verdade confirmado; Uber Direct OAuth + cotação validados. Ver §3 envs.
- **Sem remédio** (ANVISA). Saudações e itens fora do catálogo são tratados sem chutar produto.
- **Entregabilidade em 2 camadas (dado, não código).** O cérebro NUNCA aceita um pedido pago
  que a operação não entrega. Duas travas, ambas gravam `WaitlistLead` (dedupe phone+cep, `hits`,
  `reason`) e o `/ops` vira **mapa de demanda** (cidade → nº de pedidos, tag `fora`/`longe`):
  - **Cobertura por cidade** (`src/lib/coverage.ts`, puro+testado): a cidade (ViaCEP; fallback
    prefixo de CEP) está na área? Fora → `copy.outsideCoverage`, lead `outside_coverage`.
    **Presets** (`LIA_COVERAGE_PRESET`): `capital` (default), `grande-sp` (39 municípios da RMSP)
    e `estado-sp` (**SP inteiro por UF** — quem decide entregabilidade é a guarda de frete).
    Sobrepõe campo-a-campo: `LIA_COVERAGE_CITIES` / `_UFS` / `_CEP_PREFIXES` / `_LABEL` / `_OFF`.
  - **Guarda de frete** (`src/lib/freight-guard.ts`, puro+testado): cidade coberta, mas o endereço
    pode estar longe de QUALQUER loja (metrópole é grande). `pickNearestUnit(allUnits(), cep)` dá a
    distância real (haversine); > `LIA_MAX_DELIVERY_KM` (12) → `copy.tooFarForDelivery`, lead `too_far`.
    Guarda secundária de fee real (`LIA_MAX_DELIVERY_FEE` 35, só cotação real) no `quoteBasket`.
    Distância é primária (mock é fake-barato). `LIA_FREIGHT_GUARD_OFF` = kill-switch.
- **Geo compartilhado** (`src/lib/geo.ts`): `haversineKm` + `geocode` (BrasilAPI→Nominatim, timeout,
  nunca-lança, cache; `LIA_GEOCODE_TIMEOUT_MS`). `StoreUnit` tem `lat/lng`; `nearestUnit` virou
  `listUnits()` + `pickNearestUnit` (stores/nearest.ts): haversine quando há coords, senão proxy
  numérico de CEP. **107 unidades geocodadas** (2026-07-02): capital (37) + Grande SP (16, incl.
  Alphaville) + interior (54: Campinas, Santos/SV/PG, SJC/Taubaté, Sorocaba, Ribeirão, Piracicaba,
  Bauru*, SJRP, Jundiaí, Franca*, Marília*, Araçatuba*, Prudente, Araraquara, S.Carlos, Limeira,
  Americana/SBO, Indaiatuba, Rio Claro, Mogi Guaçu — *sem hiper Carrefour: pet/beleza atendem,
  mercado recusa educado). Unidades novas = pesquisa web, confiança média: CONFIRMAR aberta +
  clique-e-retire + retirada por terceiro antes do 1º pedido real em cada. Somar unidade = 1 linha
  com lat/lng. Ligar tudo = `LIA_COVERAGE_PRESET=estado-sp` na Vercel (sem deploy).

### Riscos honestos a validar num piloto real
1. O motoboy fazer a **retirada no balcão com documento** (o maior risco operacional). Tensão:
   Uber Direct é on-demand (motoboy aleatório), mas o Carrefour quer retirante conhecido →
   pro 1º piloto, usar **motoboy fixo conhecido**, não o on-demand.
2. O cliente **pagar o total** (produto+frete) pela conveniência vs. usar o Daki.
3. **Preço/estoque desatualizados** (catálogo estático). Desenho da solução: (a) grátis hoje =
   link "ver no Carrefour" por item no `/ops` (operador confere na hora de comprar); (b) auto =
   **1 scrape por pedido PAGO** (background, antes de comprar) — precisa de **serviço de scraping
   com anti-bot** (ScrapingBee/Zyte/Bright Data/Apify-residencial), ~R$0,10/pedido + cache/prewarm.
   Escala melhor que manter N catálogos frescos quando somar lojas.

---

## 3. Arquitetura (código)

Tudo roda em **sandbox/mock** até as credenciais reais entrarem por env (sem mexer no fluxo).

| Peça | Arquivo | O que faz |
|---|---|---|
| Pedido (cesta) | `prisma DeliveryOrder` | itens (Json), loja, motoboy, taxas, ciclo de status |
| Lojas (plugável) | `src/lib/stores/` | `StoreConnector` + Carrefour (ao vivo Apify + seed). **Somar loja = 1 arquivo** |
| Motoboys (plugável) | `src/lib/couriers/` | `CourierConnector` + Uber Direct (cota + despacha; real inerte até credenciais) |
| Pix + cartão | `src/lib/payments/mercadopago.ts` | createPix (copia-e-cola) + Checkout Pro (link de cartão, taxa da maquininha repassada) + webhook `/api/mercadopago/webhook` (mock até token) |
| Busca por IA | `ai.ts` `extractShoppingList` | limpa o pedido (sinônimos, saudação, remédio, qty); fallback determinístico |
| Intenções (NLU puro) | `src/lib/lia-intents.ts` | `detectIntent`, parser de lista, escolha e refinamento: serviço, status, pagamento, atendimento, reclamação, cancelamento contextual, CEP + itens, total parcial e opções. Sem DB — unit-testado |
| Matcher comum | `src/lib/stores/types.ts` | score/ranking dos três catálogos: piso de relevância, exclusões, guarda humano/pet e espécie, tamanhos e preferência pelo produto básico |
| Copy | `src/lib/lia-copy.ts` | TODAS as mensagens enviadas ao cliente num lugar só (tom/emoji/formatação consistentes) |
| Cérebro | `src/lib/delivery-service.ts` | máquina de conversa (onboarding CEP → cesta → cotação → Pix/cartão → fila) + ciclo do pedido + notificações + dedupe de retry do Twilio por MessageSid |
| Painel do operador | `/ops?key=<OPS_TOKEN>` + `/api/ops/...` | fila de pagos → nº do pedido → despachar motoboy → entregue/cancelar; caixa "avisar cliente" (substituição/atraso); destaque vermelho quando o cliente pediu cancelamento |
| Testes/evals | `tests/` | `npm test` = unitários (intents/copy, sem DB) + evals E2E de conversa (DB real + mocks, telefones de teste auto-limpos) |

**Ciclo de status:** `awaiting_payment → paid → operator_buying → ready_for_pickup → dispatched → delivered` (+ canceled/refunded).

Decisões de comportamento do cérebro (não são bugs):
- **"paguei" só aprova no sandbox/mock.** Com Pix real, a Lia consulta o status no Mercado Pago antes de acreditar; cartão nunca aprova por texto (o webhook decide).
- **"cancelar" é contextual:** cesta em montagem → limpa; aguardando pagamento → cancela o pedido; já pago → grava `⚠️ CLIENTE PEDIU CANCELAMENTO` nas notes (destaque no /ops; estorno é manual); despachado → explica que não dá mais.
- Endereço é trocável a qualquer momento ("trocar endereço" ou mandar um CEP puro).

### Env pra virar real (cada um tem fallback sandbox)
- `APIFY_API_TOKEN` (+ `APIFY_CARREFOUR_ACTOR`, default `gio21~carrefour-br-scraper`) — catálogo real
- `UBER_DIRECT_CUSTOMER_ID` / `UBER_DIRECT_TOKEN` — motoboy real
- `MERCADO_PAGO_ACCESS_TOKEN` — Pix real
- `LIA_PRICE_MARKUP` (1.1), `OPS_TOKEN` (acesso ao painel)
- Lado do dono: **MEI** (pra emitir nota / conta Mercado Pago PJ)

> Histórico técnico anterior (busca no Mercado Livre via Apify + cache + cron de prewarm)
> está **dormente** — o caminho do WhatsApp agora é o fluxo de entrega. Ver `src/lib/adapters/suppliers.ts` (reusamos `runApifyActor` dele).

## 4. Reconstrução da conversa (2026-07-07)

O review profundo de conversa (115 achados) levou a um ciclo concentrado de NLU, matcher,
copy e máquina de estados. A Lia agora identifica recusas/encerramento de lista, perguntas
operacionais, atendimento humano, reclamações, reenvio de Pix, troca de pagamento e
cancelamento contextual antes de considerar uma busca de produto. O onboarding preserva o
pedido bruto até o CEP; a escolha aceita preço, marca, recomendação e refinamento; e o
matcher só devolve itens com relevância real, priorizando a variante mais comum quando o
cliente não especifica outra.

O processo completo, a linha do tempo, os casos cobertos e as ferramentas de validação
estão em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md). Os evals
E2E rodam em `npm test`; `npx tsx scripts/talk-lia.mts` permite inspecionar uma conversa
sem enviar mensagem real.

---

## 5. Operação, canais e formalização (2026-07)

O domínio `liadelivery.com.br` está no ar e foi verificado na Meta. A entrada na Meta foi
iniciada para obter o canal WhatsApp oficial, mas a verificação do negócio e o sender ainda
precisam ser aprovados; até lá, o canal de teste permanece no Twilio Sandbox. O e-mail
`contato@liadelivery.com.br` foi configurado no ImprovMX para concluir essa verificação.

Pix real (Mercado Pago), cartão por Checkout Pro, cotação Uber Direct, painel `/ops`, MEI/CNPJ
e cobertura de SP já sustentam o piloto, com a ressalva de que Pix está em conta pessoal e a
retirada por terceiro precisa ser validada em campo. O checklist completo de operação está em
[docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md).

---

## 6. Próximos passos
- Rodar o **piloto manual** (10-20 pedidos reais) pra validar os 3 riscos acima.
- Afinar o mapeamento do catálogo do Carrefour com os primeiros runs reais do actor.
- Somar mais lojas (farmácia não-remédio, Petz) = a largura/moat.
- Memória/perfil mais rica. Botões tocáveis nas opções já estão ativos no canal Meta
  (cards com foto + **Escolher este**; lista numerada permanece como fallback).
