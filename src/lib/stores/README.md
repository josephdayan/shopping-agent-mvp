# Vitrines (stores)

Registro plugável de lojas. Cada loja é um `StoreConnector` (ver `types.ts`). Somar uma
vitrine = 1 arquivo + 1 linha no registro.

## As 18 vitrines ativas (2026-08-02) — 17.264 itens

| Loja | Nicho | Itens | Fonte do catálogo |
|---|---|---|---|
| drogariasp | farmácia s/ remédio | 4.675 | gerado VTEX, allowlist + deny-regex + filtro ANVISA em runtime |
| petz | pet | 2.725 | seed (`petz-catalog.ts`) + filtro MAPA em runtime; busca ao vivo em prod |
| paguemenos | farmácia s/ remédio | 1.540 | gerado VTEX, allowlist + deny-regex + filtro ANVISA em runtime |
| boticario | beleza | 1.380 | seed (`boticario-catalog.ts`); busca ao vivo em prod |
| rihappy | brinquedo | 1.196 | gerado (`rihappy-catalog.ts`) |
| carrefour | mercado grande | 1.045 | seed (`carrefour-catalog.ts`); checkout automatizado PROIBIDO |
| naturaldaterra | hortifruti/empório | 1.000 | gerado VTEX |
| cobasi | pet (redundância) | 876 | gerado VTEX + filtro MAPA em runtime |
| divvino | adega (vinho) | 998 | gerado VTEX |
| swift | carnes | 925 | gerado (`swift-catalog.ts`) |
| imigrantes | bebidas | 406 | gerado por SSR (`harvest-imigrantes-catalog.mts`) |
| kopenhagen | chocolate | 248 | gerado (catálogo completo) |
| giulianaflores | flores/presente | 204 | colhido do DOM renderizado (loja client-rendered) |
| kalunga | papelaria | 15 | seed real (site não-VTEX) |
| drogaraia | farmácia s/ remédio | 13 | seed real (Akamai) |
| cacaushow | chocolate | 12 | seed real (Salesforce Commerce) |
| decathlon | esporte | 4 de 17 | seed curado; 13 são cortados pelo filtro de imagem |
| oba | hortifruti | 1.494 | gerado VTEX (`oba-catalog.ts`) |

`LIA_ENABLE_<LOJA>=false` desliga uma vitrine.

### Farmácia: regra ANVISA é TRIPLA guarda

Nenhuma vitrine de farmácia pode vender medicamento. São **três guardas independentes** e todas
devem ser mantidas:

1. `--categories=<ids>` — allowlist das categorias seguras (higiene, dermo, bebê, conveniência).
   Nunca incluir Medicamentos, Remédios, Vitamina/Polivitamínicos, Manipulação, Vacina/Teste/
   Exame/Injetáveis ou Serviços de Saúde.
2. `--deny=<regex>` — descarta por nome/categoria o que escapar da allowlist.
3. `withoutMedicine()` de `anvisa.ts` — **filtro em runtime, no conector**. É a guarda que
   realmente pega o resto: a loja classifica medicamento dentro de categorias cosméticas
   (esmalte antifúngico com ciclopirox, shampoo com cetoconazol, gel Rozex com metronidazol).
   Por morar no código, sobrevive a uma recolheita feita sem as flags.

Sem allowlist, a varredura por mais-vendidos de uma farmácia volta ~80% medicamento.
`tests/anvisa-pharmacy.test.ts` trava a regra nos dois sentidos: nenhum medicamento passa e o
regex não pode ficar ganancioso a ponto de esvaziar a vitrine. Só afrouxe com evidência de que
o item não é medicamento registrado.

### Pet: a mesma regra vale (MAPA)

`petz` e `cobasi` usam `withoutVeterinaryMedicine()` do mesmo módulo. Antiparasitário e
medicamento veterinário são regulados e dieta terapêutica exige receita — nada disso pode ser
vendido por concierge. A colheita da Cobasi trouxe 65 medicamentos (Simparic, Bravecto, NexGard,
Apoquel, Drontal, Seresto) e 56 dietas de prescrição; a Petz, tida como já curada, tinha 58 itens
da linha "Nutrição Clínica". **O filtro roda também sobre a busca ao vivo da Petz**, que devolve
o catálogo inteiro do varejista sem curadoria humana.

## Como adicionar uma vitrine

### Se a loja é VTEX com API pública aberta (teste antes)
```bash
curl -s "https://LOJA.com.br/api/catalog_system/pub/products/search?_from=0&_to=9" | head -c 200
```
200/206 com JSON = aberta. Gere o catálogo (dados reais, verbatim):
```bash
node --import tsx scripts/harvest-vtex-catalog.mts https://LOJA.com.br <chave> src/lib/stores/<chave>-catalog.ts 1200
```
Para restringir categorias (obrigatório em farmácia), veja o árvore de categorias em
`/api/catalog_system/pub/category/tree/1` e passe `--categories=<ids>` e `--deny=<regex>`.
Depois escreva `<chave>.ts` importando `CATALOG` do arquivo gerado (ver `rihappy.ts`).

### Se não é VTEX mas as páginas são server-rendered
Escreva um coletor que busca e faz parse do HTML — sem Chrome. Modelo:
`scripts/harvest-imigrantes-catalog.mts` (divide por card, extrai slug/nome/preço/imagem e
para quando a paginação repete).

### Se a loja é client-rendered ou bloqueia fetch
Use o navegador (renderiza JS), acumulando em `localStorage` entre navegações — foi assim com
a Giuliana Flores e com as fotos do Boticário. Evite rolagens longas num único `javascript_exec`
(estoura o timeout de 30 s): navegue, role em passos curtos, extraia e siga.

### Se nada disso passa (Akamai / 403)
Colha 10–20 itens REAIS das páginas de produto (nome/preço/URL verbatim — nunca invente) e
escreva um seed inline (ver `kalunga.ts`, `drogaraia.ts`).

### Imagem é requisito, não detalhe
`catalogWithImages` descarta silenciosamente todo item sem `imageUrl` https — é por isso que a
Decathlon serve 4 de 17. Confira a cobertura e teste o CDN antes de dar a vitrine por pronta:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "<imageUrl de amostra>"
```
Se o CDN barrar hotlink (caso do Akamai da Petz), re-hospede como `/api/petz-image/<id>`.

### Registrar
Em `index.ts`: `import` + uma linha no objeto `STORES` com o toggle `LIA_ENABLE_<CHAVE>`.
Roteamento por vocação: adicione palavras-chave em `BEAUTY_HINT_RE`/`PET_HINT_RE`/
`DRINK_HINT_RE`/`FLOWER_HINT_RE` se a loja disputa termos com uma vitrine ampla (Carrefour).
As dicas são testadas com a query normalizada (sem acento).

## Atualizar preços (rotina mensal)

O catálogo é arquivo estático: rápido, sem rede no turno da conversa e sem navegador remoto.
O custo disso é que o preço envelhece. Uma vez por mês:

```bash
npm run catalog:refresh -- --dry
```
Mostra, loja a loja, quantos preços mudaram, a variação média e as três maiores mexidas —
sem tocar em arquivo. Se o resumo fizer sentido:

```bash
npm run catalog:refresh
npm test && git add src/lib/stores/*-catalog.ts && git commit
```

A rotina cobre as lojas com API/SSR aberta: oba, divvino, naturaldaterra, cobasi, rihappy,
swift, kopenhagen, paguemenos, drogariasp e imigrantes. As farmácias mantêm allowlist de
categoria + deny-regex dentro do próprio script — **não rodar farmácia sem elas**.

Ficam de fora (colheita manual): **giulianaflores** (client-rendered, precisa de navegador),
**carrefour/petz/boticario** (anti-bot) e os seeds pequenos (kalunga, cacaushow, decathlon,
drogaraia). Para essas, repita o método da seção acima quando o preço divergir demais.

Uma colheita que volta vazia é quase sempre a loja bloqueando, não a loja sem produto: o
script preserva o catálogo anterior e marca a loja como falha em vez de esvaziá-la.

## Sem navegador remoto

Até 03/08/2026 Oba, Petz e Boticário faziam busca ao vivo por Browserbase, e havia um
subsistema de compra automatizada (carrinho/checkout por robô). **Tudo isso foi removido**:
no concierge quem cota e compra é o operador, então o navegador remoto não estava no caminho
crítico — só custava dependência, credencial e superfície de falha. Não reintroduzir sem uma
mudança de produto explícita.

## Regra de ouro
Preço/nome/URL sempre REAIS (colhidos, nunca inventados). No concierge o preço da vitrine é
só referência — a autoridade é a cotação manual do operador.
