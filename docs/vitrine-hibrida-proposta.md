# Proposta: vitrine híbrida no concierge

_Escrita em 2026-07-24. Decisão de produto pendente do dono — NÃO construída (só proposta)._

## O gap

Hoje há **~7,7 mil produtos reais** em 11 vitrines, mas no fluxo concierge (o ativo) **o
cliente não vê nenhum**: ele digita "arroz" e recebe "recebi, vou cotar" (linha livre pro
operador). As 8 opções de arroz com foto que existem no catálogo nunca aparecem.

Isso foi decisão consciente (concierge = largura, sem depender de catálogo), mas deixa a
vitrine profunda invisível — justamente o que mais foi pedido ("mais produtos e opções").

## A proposta

Um flag `LIA_HYBRID_VITRINE` (default off) que, no concierge:

1. Item que **bate no catálogo** → mostra até 3 opções **com foto** (o cliente escolhe o
   número), como o fluxo legado já faz.
2. Item que **não bate** → vira linha livre (largura preservada), como hoje.
3. Ao fechar → o pedido vai pro operador cotar do mesmo jeito (o operador segue sendo a
   autoridade de preço; o preço do catálogo é só referência).

Resultado: o cliente vê e escolhe produtos reais com foto **e** ainda pode pedir qualquer
coisa; o back-end (cotação/compra manual) não muda.

## Por que não construí sozinho

- **Risco de regressão** no fluxo de escolha (legado, verde e em produção): misturar itens
  livres com o fluxo de opções pode **derrubar itens silenciosamente** se a costura estiver
  errada — bug ruim. Precisa de teste cuidadoso antes de ligar.
- **Decisão de produto tua:** o concierge foi deliberadamente simplificado pra livre; voltar
  a mostrar escolhas é um trade-off (UX mais rica × preço de catálogo pode estar velho).

## Esforço estimado

~1–2h: um `handleHybridRequest` (separado do legado pra não tocar código verde), teste E2E
no `manual-concierge.test.ts` (bate no catálogo → mostra opções → escolhe → cotação do
operador inclui escolhido + livre), e re-rodar a suíte completa. Flag off até validar.

## Alternativa menor (menos risco)

Em vez de escolha completa: quando o item bate no catálogo, a Lia **mostra os produtos
encontrados com foto** na confirmação ("achei estes — o operador confirma o preço"), sem
deixar escolher. Surfaça a vitrine (fotos!) sem mexer no fluxo de escolha. Meio-termo.

**Recomendação:** vale a versão completa (escolha) — é o que foi pedido. Mas é a tua decisão;
quando voltar, é só dizer "constrói a vitrine híbrida" que eu faço com teste e flag.
