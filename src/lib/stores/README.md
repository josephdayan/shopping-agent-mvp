# Vitrines (stores)

Registro plugável de lojas. Cada loja é um `StoreConnector` (ver `types.ts`). Somar uma
vitrine = 1 arquivo + 1 linha no registro.

## As 11 vitrines ativas (2026-07-24)

| Loja | Nicho | Itens | Fonte do catálogo |
|---|---|---|---|
| carrefour | mercado grande | 1.045 | seed (`carrefour-catalog.ts`); checkout automatizado PROIBIDO |
| oba | hortifruti | ~vivo | busca ao vivo Browserbase (seed de 2 p/ testes) |
| petz | pet | 2.812 | seed (`petz-catalog.ts`); busca ao vivo em prod |
| boticario | beleza | 1.380 | seed (`boticario-catalog.ts`); busca ao vivo em prod |
| decathlon | esporte | 17 | seed curado (API bloqueada) |
| swift | carnes | 925 | gerado (`swift-catalog.ts`) |
| kalunga | papelaria | 15 | seed real (site não-VTEX) |
| rihappy | brinquedo | 1.196 | gerado (`rihappy-catalog.ts`) |
| cacaushow | chocolate | 12 | seed real (Salesforce Commerce) |
| kopenhagen | chocolate | 248 | gerado (catálogo completo) |
| drogaraia | farmácia s/ remédio | 13 | seed real (Akamai) |

`LIA_ENABLE_<LOJA>=false` desliga uma vitrine.

## Como adicionar uma vitrine

### Se a loja é VTEX com API pública aberta (teste antes)
```bash
# 1. Testa se a API responde (200/206 com JSON):
curl -s "https://LOJA.com.br/api/catalog_system/pub/products/search?_from=0&_to=9" | head -c 200
# 2. Se sim, gera o catálogo (centenas/milhares, dados reais):
node --import tsx scripts/harvest-vtex-catalog.mts https://LOJA.com.br <chave> src/lib/stores/<chave>-catalog.ts 1200
```
Depois escreva `<chave>.ts` importando `CATALOG` do arquivo gerado (ver `rihappy.ts`).

### Se a API é bloqueada (Akamai) ou não é VTEX
Use um agente/Apify pra colher 10–20 itens REAIS das páginas de produto (nome/preço/URL
verbatim — nunca invente) e escreva um seed inline (ver `kalunga.ts`, `drogaraia.ts`). No
concierge o operador compra o resto; o seed é referência.

### Registrar
Em `index.ts`: `import` + uma linha no objeto `STORES` com o toggle `LIA_ENABLE_<CHAVE>`.
Roteamento por vocação: adicione palavras-chave em `BEAUTY_HINT_RE`/`PET_HINT_RE` se a loja
disputa termos com uma vitrine ampla (Carrefour). As dicas são testadas com a query
normalizada (sem acento).

## Regra de ouro
Preço/nome/URL sempre REAIS (colhidos, nunca inventados). No concierge o preço da vitrine é
só referência — a autoridade é a cotação manual do operador.
