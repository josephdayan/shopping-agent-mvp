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
- **Catálogo:** **~113 itens reais** copiados de `mercado.carrefour.com.br` (nome + preço de
  verdade, 46 termos do dia a dia × top resultados orgânicos) em `src/lib/stores/carrefour.ts`.
  O `unitPrice` é o **custo real Carrefour** (o markup de 10% entra depois). O scrape ao vivo via
  Apify está **dormente** (actor da comunidade quebrado, gated em `LIA_CARREFOUR_LIVE`). Como
  recoletei: extensão Claude-no-Chrome navegando o storefront + lendo o DOM (a API VTEX/legada
  dá 403/503 mesmo same-origin; só páginas renderizadas passam).
- **Sem remédio** (ANVISA). Saudações e itens fora do catálogo são tratados sem chutar produto.

### Riscos honestos a validar num piloto real
1. O motoboy fazer a **retirada no balcão com documento** (o maior risco operacional).
2. O cliente **pagar o total** (produto+frete) pela conveniência vs. usar o Daki.
3. Preço/estoque batendo na hora da compra (o catálogo de ~113 itens é real mas estático —
   re-coletar periodicamente; respostas são instantâneas, sem scrape no turno).

---

## 3. Arquitetura (código)

Tudo roda em **sandbox/mock** até as credenciais reais entrarem por env (sem mexer no fluxo).

| Peça | Arquivo | O que faz |
|---|---|---|
| Pedido (cesta) | `prisma DeliveryOrder` | itens (Json), loja, motoboy, taxas, ciclo de status |
| Lojas (plugável) | `src/lib/stores/` | `StoreConnector` + Carrefour (ao vivo Apify + seed). **Somar loja = 1 arquivo** |
| Motoboys (plugável) | `src/lib/couriers/` | `CourierConnector` + Uber Direct (cota + despacha; real inerte até credenciais) |
| Pix | `src/lib/payments/mercadopago.ts` | createPix + webhook `/api/mercadopago/webhook` (mock copia-e-cola até token) |
| Busca por IA | `ai.ts` `extractShoppingList` | limpa o pedido (sinônimos, saudação, remédio, qty); fallback determinístico |
| Cérebro | `src/lib/delivery-service.ts` | máquina de conversa (onboarding CEP → cesta → cotação → Pix → fila) + ciclo do pedido + notificações + "repete o de sempre" |
| Painel do operador | `/ops?key=<OPS_TOKEN>` + `/api/ops/...` | fila de pagos → nº do pedido Carrefour → despachar motoboy → entregue/cancelar |

**Ciclo de status:** `awaiting_payment → paid → operator_buying → ready_for_pickup → dispatched → delivered` (+ canceled/refunded).

### Env pra virar real (cada um tem fallback sandbox)
- `APIFY_API_TOKEN` (+ `APIFY_CARREFOUR_ACTOR`, default `gio21~carrefour-br-scraper`) — catálogo real
- `UBER_DIRECT_CUSTOMER_ID` / `UBER_DIRECT_TOKEN` — motoboy real
- `MERCADO_PAGO_ACCESS_TOKEN` — Pix real
- `LIA_PRICE_MARKUP` (1.1), `OPS_TOKEN` (acesso ao painel)
- Lado do dono: **MEI** (pra emitir nota / conta Mercado Pago PJ)

> Histórico técnico anterior (busca no Mercado Livre via Apify + cache + cron de prewarm)
> está **dormente** — o caminho do WhatsApp agora é o fluxo de entrega. Ver `src/lib/adapters/suppliers.ts` (reusamos `runApifyActor` dele).

---

## 4. Próximos passos
- Rodar o **piloto manual** (10-20 pedidos reais) pra validar os 3 riscos acima.
- Afinar o mapeamento do catálogo do Carrefour com os primeiros runs reais do actor.
- Somar mais lojas (farmácia não-remédio, Petz) = a largura/moat.
- Botões tocáveis (precisa de sender WhatsApp Business aprovado), memória/perfil mais rica.
