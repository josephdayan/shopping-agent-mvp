# Lia — contexto obrigatório para agentes

_Última atualização: 2026-08-15._

Leia este arquivo antes de planejar, responder sobre o estado do produto ou alterar o
projeto. Ele é a memória canônica curta da Lia. Para detalhes, leia também:

1. [STATUS.md](STATUS.md) — estado técnico e operacional;
2. [PENDENCIAS.md](PENDENCIAS.md) — checklist canônico de progresso e lançamento;
3. [docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md) —
   evidências e decisão operacional vigente;
4. [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md) — canais e operação;
5. [docs/automacao-compra-varejistas.md](docs/automacao-compra-varejistas.md) — automação
   segura de cotação e compra por varejista;
6. [CLAUDE.md](CLAUDE.md) — histórico de arquitetura e decisões.

Em caso de conflito, prevalece a decisão mais recente documentada neste arquivo e no
registro de 14/07/2026. Não ressuscite uma premissa histórica sem nova evidência.

## Decisão vigente — remodelagem concierge (2026-07-20)

O produto foi remodelado para um **concierge de WhatsApp com largura**, comprado e
cotado **à mão pelo operador**, com **entrega na hora por motoboy que sai da base do
operador**. Isso resolve a fragilidade estrutural da automação de checkout (o Carrefour
bloqueou o Browserbase em 19/07; Petz/Boticário não expõem frete no Context há semanas).

- **Largura é o diferencial**: o cliente pede **qualquer coisa, de qualquer lugar**, numa
  mensagem só. Item fora de catálogo **não é recusado** — vira uma linha livre que o
  operador cota e compra. O moat é a largura + estar no WhatsApp (onde o Rappi não está) +
  memória do cliente. Velocidade pura contra Rappi/iFood é armadilha e não é o jogo.
- **Escopo geográfico**: a Lia opera **somente no estado de São Paulo**. No concierge, a
  fronteira de UF é rígida: CEP/UF fora de SP vira lista de espera e nunca chega a cotação,
  cobrança ou compra. Dentro de SP, o CEP exato, a disponibilidade do varejista e o frete
  ainda precisam ser confirmados pedido a pedido.
- **Cotação manual**: ao fechar a lista (`"só isso"`/`"pagar"`), a Lia cria um pedido em
  `awaiting_operator_quote`. O operador cota no `/ops` (custo dos produtos + frete +
  modalidade + prazo) e envia; o pedido reaproveita `awaiting_quote_confirmation` e toda a
  máquina de pagamento (Pix/cartão) já existente. Nada é cobrado antes da aprovação.
- **Motoboy na hora sai do OPERADOR, não da loja**: o operador compra e entrega o pacote ao
  courier (Uber Direct/Lalamove) na própria base → sem o problema de documento do titular
  na retirada em rede grande (que matou o motoboy-de-balcão em 14/07). Modalidade alternativa
  no `/ops`: entrega do próprio varejista.
- **Browserbase sai do caminho crítico**: com `LIA_MANUAL_CONCIERGE=true` (default), a
  cotação por checkout automatizado e as guardas de distância de loja não rodam. O fluxo
  legado de catálogo/auto-cotação permanece atrás de `LIA_MANUAL_CONCIERGE=false` (é o que os
  evals de conversa continuam exercitando).
- **Envs novos**: `LIA_MANUAL_CONCIERGE` (default on), `LIA_COVERAGE_PRESET=estado-sp`,
  `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` (base de onde o motoboy retira).
- **Prontidão**: o código e a publicação estão configurados para operar em SP; a primeira
  validação com pedidos reais é uma decisão do operador, não uma pendência de desenvolvimento.
  A empresa é MEI, a operação financeira será pela PJ e a PJ é a titularidade operacional da
  compra. MEI não exige contador fixo nem contabilidade formal: mantém relatório mensal de
  receitas e DASN anual. Para NF, venda a PF é dispensada salvo solicitação; venda a PJ exige
  documento fiscal. O formato exato para mercadoria/serviço deve ser documentado, mas não exige
  contratar contador mensalmente. TypeScript, lint, testes focados (fluxo manual + evals legados)
  e build estão verdes.
- **Pós-venda decidido em 02/08**: antes do pagamento, o cliente pode limpar a lista; depois do
  pagamento não há cancelamento iniciado pelo cliente nem substituição. Se faltar item, a Lia
  estorna o valor daquele item; se houver atraso, avisa o cliente. O procedimento de estorno
  parcial ainda é manual e precisa de referência do provedor para auditoria.
- **Estado em 21/07**: os commits `bb48c2e` (fluxo), `ededf6a` (documentação) e `7ab8453`
  (kit do operador) estão verdes localmente. Um pedido concierge percorreu, em ambiente local
  mockado e sem cobrança, cotação → Pix confirmado → compra → despacho pela base do operador →
  entrega; as mensagens ao cliente também foram conferidas. O concierge **não está implantado**:
  publicar agora misturaria uma migration Oba inacabada de outro trabalho. Fazer deploy somente
  quando houver publicação limpa. Há 19 pedidos técnicos na fila de produção; removê-los requer
  autorização explícita. A decisão operacional é **contratar um operador** para o piloto.

### Atualização 23/07/2026 — vitrines de referência (10 lojas)

Por decisão do operador, a vitrine integrada foi ampliada para **10 lojas**: Carrefour
(de volta como vitrine seed — a automação de checkout segue proibida; o bloqueio de
19/07 era contra o robô, não contra o operador comprando como cliente comum), Oba, Petz,
Boticário, Decathlon (restaurada + ampliada) e as novas **Swift, Kalunga, Ri Happy,
Cacau Show e Kopenhagen**. As novas vitrines são seeds de dados REAIS colhidos dos sites
públicos em 23/07 (nome/preço/URL verificados; sem invenção). No concierge, o preço da
vitrine é referência — a autoridade é a cotação manual do operador. A seção de 19/07
abaixo ("exatamente três fontes") fica **superada** por esta decisão. `quoteBasket`
passou a tolerar loja sem unidade física (sem balcão → sem guarda de distância; frete
cotado pelo CEP do cliente). Supersede também o item "não adicionar lojas agora": o
operador decidiu ampliar a vitrine antes do piloto.

**Totais da vitrine (seed/histórico, sob `LIA_RETAILER_TEST_SEED` ou como referência):**
Carrefour 1.045 · Petz 2.812 · Boticário 1.380 · Ri Happy 1.196 · Swift 925 · Kopenhagen
248 · Decathlon 17 · Kalunga 15 · Cacau Show 12 · Droga Raia 13 · Oba 2 (Oba usa busca ao
vivo em prod). ~7,7 mil itens. Ri Happy/Swift/Kopenhagen colhidos pela API pública VTEX via
`scripts/harvest-vtex-catalog.mts` (sem Chrome). Decathlon/Kalunga/Cacau/Raia têm API
bloqueada (Akamai/não-VTEX) e ficaram em seed real menor — aprofundar exige DOM/Apify.

**Bug de roteamento corrigido (23/07):** as dicas de vocação (pet/beleza) testavam a query
COM acento contra regex SEM acento, então "ração" perdia o empate para o Carrefour. Agora
normaliza (NFD) e pesa +2 → item de pet vai pra Petz, beleza pra Boticário.

**Deploy 24/07:** remodelagem concierge + kit do operador + 11 vitrines + fix de roteamento
foram para produção (`dpl_9upchNgpPZ15…`, READY). **Suíte completa 209/209 verde** (com banco),
TypeScript, lint e build limpos. `liadelivery.com.br` responde (landing 200, `/ops` 401,
webhook 403). A vitrine profunda ainda NÃO aparece pro cliente no concierge (fluxo é livre →
operador); mostrar opções com foto seria a "vitrine híbrida" — decisão de produto em aberto.
Pendências humanas: conciliar os 7 pedidos pagos antigos, documentar a rotina fiscal do MEI,
rotacionar a senha Carrefour/PIN do WhatsApp e as demais credenciais expostas. A validação com
pedidos reais é opcional e não é requisito de desenvolvimento.

O restante deste arquivo descreve o fluxo legado de automação por varejista; ele continua
válido como referência, mas **o produto ativo é o concierge manual acima**.

### Atualização 02/08/2026 — reconciliação de produção, escopo SP e segurança operacional

- O deploy limpo de 24/07 continua sendo a versão pública: concierge manual, kit do operador,
  11 vitrines e correção de roteamento. A landing responde 200; `/ops` abre a interface, mas as
  APIs internas continuam protegidas e o webhook rejeita chamadas sem assinatura.
- O snapshot publicado foi consolidado no Git sem descartar alterações do usuário. `main` foi
  avançada localmente até o commit `a700290`, que contém o limite estadual de SP, a titularidade
  na PJ e a política de pós-venda;
  o worktree está limpo. O push remoto de `main` ainda é uma ação separada.
- O item de segurança operacional foi reforçado no código: em produção Meta, despacho mockado do
  courier agora falha fechado; o despacho por motoboy também exige `LIA_OPERATOR_PICKUP_ADDRESS`
  e um `LIA_OPERATOR_PICKUP_CEP` válido. Demos locais continuam usando o provider `mock`.
- A auditoria de nomes de variáveis da Vercel encontrou Contexts/credenciais históricas. A base
  do operador foi configurada como Sensitive em Production (endereço e CEP informados pelo
  operador). `LIA_MANUAL_CONCIERGE=true`, `LIA_REQUIRE_REAL_COURIER_DISPATCH=true`,
  `PURCHASE_AUTOMATION_MODE=cart_only` e compra automática desligada estão ativas; o redeploy
  `dpl_5kTpBbsitN6BgP5vcQrDh22AfqP4` ficou `Ready`. O código impõe `estado-sp` no concierge.
- A fila tinha 19 entradas: 12 preflights internos sem pagamento foram removidos; 7 pedidos
  pagos ficaram intactos para conciliação/estorno. A decisão é receber na PJ, manter a PJ como
  titularidade operacional e, no pós-venda, não aceitar cancelamento/substituição depois do
  pagamento, estornar item faltante e avisar atraso. Restam a confirmação contábil do documento
  fiscal exato e a rotação de segredos. A conta Mercado Pago PJ foi confirmada pelo dono no
  painel; as variáveis de produção já estão presentes. A
  validação real fica para quando o operador decidir; não é um gate técnico.
- **2ª rodada de 02/08 — decisões do dono:** (1) o piloto será operado **pelo próprio dono**,
  sem contratar operador agora; (2) a rotina fiscal foi decidida e documentada em
  [docs/rotina-fiscal-mei.md](docs/rotina-fiscal-mei.md) (intermediação de compras; NF do
  produto é a do varejista; NFS-e só para PF que pedir ou cliente PJ; resta confirmação
  contábil pontual do teto de receita antes do lançamento público); (3) a rotação das
  credenciais expostas foi **abandonada como gate de piloto** — risco aceito e registrado,
  reabrir só por pedido explícito ou incidente; (4) a conta Mercado Pago foi confirmada no
  painel pelo dono como PJ, com a aplicação `LIA - APP` em Produção; as variáveis de acesso e
  webhook já estão na Vercel Production. As credenciais mostradas em captura permanecem
  tratadas como expostas, sem marcar a rotação como concluída.
  Verificação do dia: suíte **213/213 verde com banco**, `tsc` limpo, produção `READY` em
  `a700290`; vitrine runtime com **7.652 produtos em 11 lojas**.

### Atualização 03/08/2026 — One-Click reativado (decisão do dono)

O cartão nativo no WhatsApp saiu de "adiado" para "em ativação" ("vamos fazer isso"). Nada
mudou no desenho canônico (Meta Cloud API direta + Pagar.me V5, sem 360dialog) nem no código —
os gates são externos. Em 03/08, dois desdobramentos: (1) a **Infobip
respondeu NÃO** — a rota de allowlist via eles morreu; a rota restante é ticket no Suporte
Direto da Meta (rascunho entregue ao dono) — mas a verificação de 03/08 mostrou que a
Payments API BR segue em **beta fechado** ("select customers"); habilitações documentadas
passam por BSPs, então o ticket direto tem chance baixa/prazo indefinido para um MEI. Vale
abrir mesmo assim; plano B = Checkout Pro até a GA. A WABA também precisará de Meta Product
Catalog vinculado; (2) a pergunta técnica ao Pagar.me foi **resolvida por documentação, sem e-mail**:
`recurrence_cycle` marca recorrência externa, é opcional e "não cria cobrança recorrente" —
a recompra da Lia é avulsa iniciada pelo cliente, então **o adaptador atual (`card_id` sem
`recurrence_cycle`) está correto**; CVV para card_id avulso não é exigido pela doc (antifraude
é o que o sandbox valida); domínio do tokenizecard.js se libera pelo dashboard. Contatos:
relacionamento@pagar.me / homologacao@pagar.me. O piloto não espera o One-Click: Pix + Checkout Pro cobrem cartão. Sequência
pós-chaves (agente): envs Sensitive → webhook com 6 eventos → ajuste do adaptador conforme o
PSP → sandbox completo → só então `LIA_ENABLE_WA_PAYMENTS=true`.

### Atualização 04/08/2026 — ticket da Payments API aberto na Meta

O pedido de habilitação da **Payments API Brasil** foi aberto no Suporte Direto da Meta em
04/08, no portfólio **Lia** (`Business ID 1802515380110705`). Protocolo
**`37565409896407734`**, status inicial **Open**, assunto **Dev: Cloud API** e tipo
**Messages API and Webhook**. O chamado pede a habilitação de `order_details` / one-click
offsite card payment para a WABA **Lia Delivery** (+55 11 97844-4813), preservando número,
webhook e Graph API na Cloud API direta, sem migração de sender, com Pagar.me no backend.
O formulário recusou português para esse tipo de pergunta; a mesma solicitação foi enviada em
inglês. Abertura do ticket **não é habilitação nem prazo**: a flag continua desligada e o gate
agora é aguardar resposta da Meta. Acompanhar em
<https://business.facebook.com/direct-support/case-detail/37565409896407734/?business_id=1802515380110705>.

### Atualização 06/08/2026 — busca da vitrine: a IA passa a escolher o produto (rerank + golden set)

Caso real do dono: "carregador usb c" devolvia **3 carregadores veiculares** (o mesmo item em
3 cores). Quatro falhas léxicas empilhadas: o token "c" era descartado (1 letra); o item certo
("Carregador de Parede … Usb-C", Pague Menos) EMPATAVA no score com o veicular; o roteador de
loja única resolvia o empate pela ORDEM do registry (Petz vem antes); e o desempate final era
preço. Diagnóstico geral: o matcher conta palavras em comum, não entende o pedido — e a IA,
que já rodava na extração, **nunca participava da escolha do produto**.

Desenho novo (implementado e testado):

1. **Candidatos largos** — `gatherCrossStoreCandidates` (stores/index.ts) junta o top-4 de
   TODAS as vitrines e rankeia globalmente (score → variantes não pedidas → preço). No
   concierge, o roteador de loja única (`pickStoreForQueries`) sai do caminho: a cesta já era
   mista mesmo (quem compra é o operador). O fluxo legado travado em uma loja não muda.
2. **Rerank por IA** — `rerankShoppingOptions` (adapters/ai.ts): UMA chamada batched por
   mensagem decide, por item, quais candidatos são REALMENTE o produto pedido e em que ordem,
   diversificando cor/embalagem. Lista vazia = nada serve → linha livre do operador (o
   resultado honesto). Skus são validados contra os candidatos enviados (IA não inventa
   produto); timeout de 6s (`LIA_SEARCH_RERANK_TIMEOUT_MS`) e kill-switch
   `LIA_SEARCH_RERANK_OFF`; qualquer falha cai no determinístico de sempre. Quando o rerank
   roda, ELE substitui o piso `conciergeMatchIsStrong` — a IA entende "escova de dente" ≈
   "Escova Dental", que o piso léxico mata.
   *Custo/latência:* é a 2ª chamada de LLM por mensagem (a 1ª é a extração, que já existia),
   uma só por mensagem independente do nº de itens, com payload pequeno (≤12 candidatos por
   linha). Some ~1–3s ao turno; o teto de 6s garante que a Lia nunca fique presa esperando.
3. **Determinístico melhor mesmo sem IA** (regras principiais, nunca por produto): compostos
   ("usb c"/"tipo c" viram token único; o genérico "usb" ainda serve o específico "Usb-C");
   typo-fuzzy passa a exigir palavra de catálogo com 6+ letras ("miojo" casava com a vinícola
   **Miolo** e com "Miolo de Alcatra" — em 5 letras, palavras reais colidem a distância 1);
   marca nunca typo-casa (nome próprio); substantivo de categoria ganha o bônus de head
   ("Pack Macarrão … Nissin **Miojo** 510g" vale como miojo); "sem X" bonifica quem diz
   "Sem/Zero X" no nome ("leite sem lactose" acha o Italac sem lactose, não o desnatado mais
   barato); e as 3 opções são **diversificadas** — cores do mesmo produto ocupam 1 vaga
   (pedir uma cor desliga a regra).

**O método já se pagou no mesmo dia.** Rodar 60 pedidos realistas pelo pipeline (varredura
exploratória, o passo "procurar busca ruim" do método) achou quatro bugs que ninguém tinha
reportado, todos consertados por regra principial — nunca por regra de produto:

- **"cotonete" não achava cotonete**, que ESTÁ no catálogo ("Hastes Flexíveis **Cotonetes**
  Johnson & Johnson"). A regra de pedido-de-uma-palavra zerava tudo que não fosse head. O que
  separa o caso legítimo do falso positivo é a **preposição**: em "Macarrão COM Ovos" a palavra
  é ingrediente; em "Hastes Flexíveis Cotonetes" ela nomeia o produto. Agora vale quando está
  justaposta e na frase inicial do nome (até a 3ª palavra) — no fim do nome é sabor
  ("Petisco para Cachorro Purina FRANGO" não responde por "frango").
- **"leite" devolvia loção de pele** ("Leite de Rosas"), leite de coco e leite pet. Três causas:
  a lista de variantes processadas tinha soja/amêndoas mas não coco; a marca "Leiteria" casava
  com "leite" por prefixo; e a versão pet não era penalizada. Agora: qualificador "de X" não
  pedido penaliza em consulta de uma palavra (regra geral no lugar da lista), marca só casa
  exato/plural (nome próprio não admite aproximação — foi o mesmo defeito do "Miolo") e item de
  espécie pet perde pontos quando o cliente não falou de bicho.
- **"água" vinha com gás** — "gas" entrou nas variantes de desempate, junto de integral/zero.
- **Armadilha achada no próprio conserto:** em catálogo brasileiro **"PET" é a garrafa
  plástica** ("Coca-Cola Pet 2L"). A penalidade de item-pet usava o mesmo regex do guarda
  duro, que inclui "pet" solto, e passou a punir refrigerante como se fosse ração. A
  penalidade agora usa só palavras de espécie.

**Invariante que saiu daí — penalidade REORDENA, guarda EXCLUI.** Fora do scorer,
`score > 0` é lido como "casa ou não casa" (`itemMatchesPhrase`, do "tira o X", é um
desses). Duas penalidades novas somadas derrubaram um match legítimo de head para -1
("Acessório de Comedouro … para Cães" com a consulta "Acessório") e o cliente perdeu a
capacidade de REMOVER o item da cesta — a busca continuava certa, o comando é que quebrou.
Agora, item que passou pelas guardas nunca cai abaixo de 1: quem exclui é `return 0`
explícito (espécie, negação, piso de relevância, pedido de uma palavra), penalidade só
empurra pra baixo no ranking. Pego pelo eval de conversa legado, não pelo golden — os dois
harnesses cobrem coisas diferentes e vale rodar ambos.

**Método novo — fim da tentativa-e-erro infinita.** A qualidade da busca agora é MEDIDA:
`tests/helpers/search-golden.ts` guarda os casos rotulados (28 hoje);
`tests/search-golden.test.ts` trava os determinísticos no `npm test` (regressão dura, roster
completo de 18 lojas); `npx tsx scripts/eval-search.mts` roda o pipeline completo (extração +
rerank com a chave real) e imprime o placar DET/IA. Fluxo de melhoria: busca ruim reportada →
vira caso no golden → mede → conserta → placar sobe → commit. Placar da época: **31/32
determinístico · 32/32 com IA** (placar vigente: ver a entrada mais recente datada). Regra:
mudança de scorer/prompt só entra acompanhada do caso que a justifica.

Bônus: consertado o bug que escondia a IA dos scripts — `scripts/talk-env.mts` usava
`__dirname` (inexistente em ESM), o `catch` engolia o erro e o `.env` nunca era carregado; o
`talk-lia` sempre rodou determinístico mesmo com `OPENAI_API_KEY` presente no `.env` (origem
da crença "não tem chave local"). Em produção o rerank vale automaticamente onde
`OPENAI_API_KEY` já está configurada (a mesma chave da extração).

**07/08 — pedido durante a cotação do operador (screenshot de produção).** Com um pedido em
`awaiting_operator_quote`, QUALQUER mensagem de produto respondia "Ainda estou cotando…
segura aí!" e o item era descartado — o cliente teve que CANCELAR o pedido pra conseguir
pedir um cotonete. Agora o item novo entra no MESMO pedido como linha livre (a cotação ainda
não saiu; o operador cota tudo junto), com nota "➕ Cliente adicionou durante a cotação" no
/ops e confirmação ao cliente (`copy.addedToPendingQuote`). Pergunta ("já saiu o total?")
continua com a resposta de andamento; só remédio continua recusado. Regressão em
`tests/manual-concierge.test.ts`. No mesmo screenshot: o "1x cotonete" como linha livre e o
emoji literal `🙂` são o código ANTIGO em produção — o cotonete já resolve com o
deploy (match por apposição + rerank), e o emoji não existe em NENHUMA versão do fonte
(artefato do build implantado; conferir na primeira conversa pós-deploy).

**10/08 — frete AO VIVO por CEP (`src/lib/live-freight.ts`).** A cotação instantânea agora
consulta o checkout real da loja (VTEX `orderForms/simulation`, allowlist de 8 lojas
abertas) com a cesta exata e o CEP do cliente, em paralelo com timeout 4,5s; o frete vem
exato por endereço e o frete grátis é o do próprio site. Hierarquia: **ao vivo → tabela
semeada (`SEED_STORE_FREIGHT`) → tarifa padrão**; resposta válida sem SLA de entrega =
site não atende o CEP → pedido cai pra cotação manual. Cesta simulada tem que ser 100%
parseável (sku `<loja>-<id>`) senão desiste — cesta parcial daria frete grátis errado.
Fonte por loja na nota do /ops e log `[instant-quote:live]`; kill-switch
`LIA_LIVE_FREIGHT_OFF` (pinado nos testes), teto `LIA_LIVE_FREIGHT_MAX` (150). Carrefour e
Petz bloqueiam consulta externa → sempre tabela. Validação real 10/08: PM R$4,90, Oba
R$9,90 same-day, Swift R$0 (grátis auto), Campinas R$4,90 — e a incógnita restante é só
se os sites tratam o IP da Vercel diferente (o log responde no 1º pedido; se bloquear,
degrada pra tabela sozinho).

**10/08 — diversidade nas opções (caso do dono: "quase o mesmo carregador 3x").** Pedir
"carregador" ou "ração" mostrava 3 variantes quase iguais do mesmo produto. Três causas e
três consertos: (1) `gatherCrossStoreCandidates` agora ordena produtos DISTINTOS primeiro —
cada loja manda seu top-4, que costuma ser a mesma ração em 4 tamanhos, e as variantes
esgotavam as 12 vagas antes de o rerank sequer ver um produto diferente; (2)
`sameProductVariant` (stores/types.ts): identidade = tokens do nome sem cor/medida
(Jaccard ≥ 0.75 = variante; marcas declaradas diferentes nunca são variantes; pedir
cor/tamanho mantém o atributo na identidade) — `diversifyOptions` passou a usar isso no
lugar do dedupe só-por-cor; (3) regra 3 do prompt do rerank endurecida: produto realmente
diferente (marca/modelo/tipo/faixa de preço), variante só como preenchimento quando não há
3 distintos. Golden ganhou o campo `distinctOptions` (checado no unit E no eval); casos
novos/marcados: "carregador usb", "racao para cachorro", "carregador de celular". Placar
pós-mudança: **32/33 determinístico · 33/33 com IA** (o × é o caso que só a IA resolve por
desenho). A regra "3 opções ainda que repetidas > lista curta" continua: variantes
preenchem quando o catálogo não tem 3 produtos distintos.

**16/08 (3ª) — 5º ciclo de testes (10 rodadas): 4 consertos + gate focado.** Granola→aveia,
"sem remédio"+shampoo, presente≤R$100 e 4x→7x→5x passaram; fechados:
1. "Para domingo"/"Para uma viagem" (ocasião/dia) e "barato" seco = modificadores.
2. PLURAL no merge: "cafés moídos" não casava "café moído" e o gêmeo determinístico era
   resgatado como linha duplicada — `meaningfulProductTokens` singulariza; "cada" ignorado.
3. Adição relativa na MESMA mensagem ("…30 litros; mais um desses", "leite sem lactose;
   mais dois leites"): soma na linha anterior no parser; a linha nua da IA se dobra na
   rica ANTES da herança do gêmeo (depois contaria 2x); MORE_SAME ancorado no começo da
   mensagem (não sequestra mensagem que contém lista).
4. Trocar endereço com cotação na mesa PRESERVA a cesta (restaurada de `order.items` ao
   cancelar) e re-cota sozinho após o endereço novo.
Processo: a partir daqui o gate de publicação é FOCADO (tsc + units + golden + E2E dos
fluxos tocados); `npm test` completo só em mudança de core, antes de ciclo de teste do
dono, ou a pedido — decisão do dono em 16/08 (memória persistida).

**16/08 (2ª) — 4º ciclo de testes (10 rodadas): 6 consertos.** Perfume floral, leite sem
lactose relativo, sacos 30l e a guarda de remédio passaram; fechados:
1. **"cabo usb-c de 2 metros" devolvia carregador de parede**: o catálogo NÃO tem cabo
   USB-C — a resposta certa é "não tenho". Caso golden `none` (cabo ≠ carregador) +
   regra explícita no prompt do rerank: a recíproca de "carregador aceita cabo" NÃO
   vale; sem cabo de verdade, lista vazia. Lacuna de vitrine registrada (cabos/eletro).
2. **Teto de preço sobrevivia só no caminho determinístico**: a IA remove o preço da
   query (por instrução), e o merge descartava o gêmeo determinístico que carregava o
   "até R$25" — as opções passavam do limite (card de R$29,69). O merge agora re-anexa
   o cap do gêmeo. É o conserto REAL do "teto excedido"; o filtro em si sempre existiu.
3. **Tamanho vale para TODOS os cards**: "30 litros" filtra as 3 opções (antes 1 delas
   vinha sem o atributo); mesmo `attrMatchesItem` do refinamento.
4. **"Sem remédio" no COMEÇO da frase virava remoção** (REMOVE_START começa com "sem"):
   exceção pra negação de categoria — a frase segue como pedido e o shampoo é buscado.
5. **"pensando bem" e "chega amanhã/hoje" secos** viram filler/urgência (NOISE e
   MODIFIER); o swap sintetizado não emite mais "não tenho: pensando bem".
6. **Destino com CEP embutido** ("vou entregar em São Paulo, CEP 01310-100") consome o
   CEP direto (intent cep bare) — nada de "me manda o CEP" redundante.

**16/08 — botões de quantidade: "Outra quantidade" no lugar do 3 (pedido do dono).** Os
botões da pergunta de quantidade viraram *1 unidade · 2 unidades · Outra quantidade*
(id `qty:other`); o toque abre a pergunta livre (`copy.quantityAskFree`, "de 1 a 50") e
o número digitado no chat continua valendo em qualquer momento. O perfil do WhatsApp
(nome + CNPJ visíveis no contato) NÃO é código: edita-se no WhatsApp Manager da Meta —
o dono foi orientado; o nome legal verificado pela Meta não é removível, mas
descrição/sobre são.

**15/08 (2ª) — 3º ciclo de testes (10 rodadas): 6 consertos.** Quantidades, referência
por substantivo, cartão antigo por sku e guarda de remédio passaram; sobraram:
1. **Preferência negativa vira atributo, nunca linha**: "sem pimenta", "não veicular",
   "não quero brinquedo barulhento" → o segmento vira `sem <alvo>` grudado no item
   anterior (o matcher já exclui por `negatedWords`). Prompt da extração ganhou a 7d.
2. **"até R$30 cada"**: o "cada/por unidade" não quebra mais o padrão de orçamento;
   "queria algo barato" e "sem precisar de …" viraram modificadores descartáveis.
3. **"Antes de pagar, VOU entregar em Campinas, CEP 13010-100"** (crítica recorrente):
   "vou" entrou no deliver-to; e CEP chegando com o menu de pagamento aberto agora
   DERRUBA a cotação do endereço velho e segue pro fluxo de endereço — antes qualquer
   texto que não fosse pix/cartão devolvia o menu antigo.
4. **Adição relativa herda o item**: "Pode colocar mais um leite" com leite sem lactose
   na cesta incrementa O MESMO sku (a busca genérica adicionava leite integral novo);
   "mais um saco de lixo desses" captura o substantivo composto antes do marcador.
5. **"troca X por Y" numa lista NOVA** (mesma mensagem: "quero A e B; pensando bem,
   troca B por C"): com cesta vazia, a autocorreção vale pra própria mensagem — busca
   A + C, descarta B (antes: "não achei pra tirar").
6. Lancheira fora de catálogo agora recusa LIMPO (o "sem precisar de…" era o ruído);
   lacuna de vitrine registrada. Golden inalterado; unit + E2E dos três fluxos.

**15/08 — re-teste do dono (10 rodadas): 5, 6 e 15 PASSARAM; 5 ruídos restantes fechados.**
Transcrições reais de novo como fonte. (1) "três pacotes" virava "3x pacotes indisponível":
o branch de quantidade por extenso usava `\w` (ASCII) e "três" tem acento — corrigido; e
segmento só-de-embalagem ("três pacotes", "2x pacotes") agora TRANSFERE a quantidade pra
linha anterior em vez de virar linha. (2) "qualquer time" virou genérico: `qualquer <x>`
como segmento é sempre preferência. (3) "mas entrega hoje se der": adversativas
(mas/porém/só que/com) são limpas do começo do segmento antes do filtro de modificador.
(4) Confirmação de escolha mostra a quantidade ("✅ 4x …") quando ela já é conhecida —
o estado estava certo e o texto escondia (rodadas 3, 7, 9). (5) "mais um desse CAFÉ"
mira o item da cesta pelo substantivo (não cegamente o último). Bônus de relevância com
golden primeiro: "hidratante" não perde mais para "Sabonete Líquido Hidratante" — regra
principial no scorer: substantivo de categoria DIFERENTE antes da palavra pedida no nome
= penalidade (reordena; o sabonete segue como fallback). Golden 34 casos. Registrado sem
conserto: "o mais barato possível" ordena mas não restringe (decisão de produto).

**14/08 — 15 rodadas de teste real do dono → 7 consertos de NLU/fluxo.** Relatório em
[docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md); diagnóstico
refinado com as transcrições reais do banco (só o lado do cliente é persistido). A causa
nº 1 não era a busca: era o RESGATE do merge IA×determinístico devolvendo fragmentos
("até uns 100 reais", "qualquer marca", "se tiver", "queria receber hoje") como itens —
daí a cesta de R$167 (rodada 6: o cliente escolheu opção para a linha fantasma sem
perceber) e os "não tenho como trazer" contraditórios (3, 7, 10, 12).
1. `MODIFIER_SEGMENT_RE` no parser determinístico: restrição nunca vira linha; ORÇAMENTO
   gruda como teto na linha anterior ("presente… até uns 100 reais" → 1 item com cap,
   filtrado pelo splitPriceCap de sempre). Prompt da extração ganhou a regra 7b.
2. "Antes de pagar, quero entregar em Belo Horizonte" (rodada 15, a mais perigosa):
   "pagar" em oração subordinada não dispara pay; "quero entregar/receber em <lugar>"
   vira change_address (que já cancela cotação aberta); "receber em casa" fica de fora.
3. "quatro caixas" por extenso já era qty no parser; o E2E agora trava o ciclo inteiro:
   qty explícita não re-pergunta, número solto em collecting AJUSTA o último item
   (copy.qtyAdjusted), e "mais três do mesmo" vira intent `add_more_same` que soma no
   SKU do último item (nunca nova busca — que podia trazer outra marca). Em estado
   cotado (fluxo legado), o ajuste RE-COTA em vez de deixar total velho no menu.
4. Esclarecimento durante a escolha ("só shampoo normal, sem preferência" enquanto
   escolhe shampoo): mesmo substantivo (`sharesProductNoun`) = REFINA a escolha atual,
   nunca abre segunda linha (rodada 5: cliente levou 2 shampoos sem perceber).
5. "sem remédio"/"não quero remédio" é negação (`stripMedicineNegation` antes de
   qualquer detecção; prompt regra 7c) — some o falso "removi o medicamento" (4, 14).
6. Mensagem de pedido mínimo mostra o RESTO da cesta ("o resto continua guardado") —
   parecia resumo completo e o cliente achava que itens tinham sumido (3, 10).
7. Fallback manual explica o porquê ao cliente (conferência de estoque/entrega) e anota
   no /ops qual loja/motivo abortou a cotação instantânea (2, 11 — o runtime log de 1h
   não sobrevivia pro diagnóstico). P3: "Pagar" → "Fechar e ver total"; endereço com
   ponto final não gera mais "SP..".
Latência de ~15s no 1º turno (rodada 1) ficou registrada sem conserto: é cold start +
2 chamadas de LLM; otimizar só se o piloto mostrar recorrência.

**11/08 (7ª) — 2ª revisão: 4 lacunas de concorrência/consistência fechadas.**
1. **Lock de turno por conversa** (colunas `turnLock`/`turnLockAt`, migration
   20260811150000, **já aplicada no banco**): duas mensagens simultâneas do mesmo
   cliente liam a mesma cesta e a última gravação de contexto apagava o item da
   primeira. Agora `handleDeliveryMessage` reivindica o lock (claim atômico via
   updateMany; TTL 60s; espera máx. 15s e entra assim mesmo — webhook nunca pendura),
   recarrega a conversa DEPOIS do lock e processa em `handleDeliveryTurn`; release só
   se o token ainda é o nosso. Dedupe fica ANTES do lock (retry sai na hora). Efeito
   colateral: `lastActivityAt` deixou de olhar `Conversation.updatedAt` (o claim do
   lock o bumparia a cada turno) — só a mensagem anterior conta como atividade.
2. **Trocar endereço por estado**: com Pix/cartão emitidos (`awaiting_payment`/
   `payment_issuing`) a troca é bloqueada com orientação de cancelar primeiro (cobrança
   não fica órfã de conversa); com pedido AINDA na fila do operador, o pedido sobrevive
   — `deliveryOrderId` atravessa o fluxo de endereço e, confirmado o novo,
   `syncAwaitingQuoteOrderAddress` atualiza cep/endereço NO pedido, anota no /ops,
   alerta o operador e devolve a conversa pra espera da cotação.
3. **Falha parcial no envio da cotação**: rollback só quando o RESUMO falha (peça
   essencial), e a reescrita do contexto só quando o rollback de fato flipou o status
   (`rolled.count`) — menu/validade falhando depois do resumo apenas loga ("pix" por
   texto funciona); reverter aí desalinharia pedido (avançado por um toque) e conversa.
4. **Eco da simulação VTEX validado de verdade**: multiconjunto id→quantidade do eco
   tem que ser idêntico ao pedido (id trocado, qty errada ou item repetido → tabela) e
   `logisticsInfo` é alinhado por `itemIndex` (repetido/fora da faixa = malformado).
Testes: corrida de mensagens diferentes (Promise.all), troca de endereço nos dois
estados, falha parcial, eco malformado (live-freight 10/10).

**11/08 (5ª) — revisão de código do lote: 6 P1 + 4 P2/P3 corrigidos.** Uma revisão
independente dos 19 commits achou defeitos que a suíte verde não pegava (cada um virou
teste):
1. **Frete VTEX cobrava por 1 item.** `logisticsInfo` é POR ITEM; o código achatava todos
   os SLAs e pegava o mais barato — cesta de N itens saía com o frete de um. Agora soma o
   SLA de entrega mais barato de CADA item, exige que a resposta cubra a cesta inteira,
   trata item indisponível como `item-unavailable` (→ operador, nunca tabela) e **preço
   ausente não é frete grátis** (só `price: 0` explícito é). Prazo exibido = o do item
   mais lento.
2. **Falha de envio deixava pedido zumbi.** `opsPublishManualQuote` movia o status ANTES
   de mandar as mensagens: erro no WhatsApp deixava o cliente sem total e o operador sem
   poder recotar (o /ops só cota `awaiting_operator_quote`). Agora falha de envio faz
   ROLLBACK do status, anota o erro no /ops e propaga o erro.
3. **Pedido mínimo da loja não valia no concierge** (a checagem vivia só no ramo legado,
   depois do return): cesta abaixo do mínimo era cotada, cobrada e recusada no checkout
   da loja. `conciergeStoresBelowMinimum` roda antes de criar o pedido (linha concierge
   não tem loja real → sem mínimo, senão herdaria o do default).
4. **Botão "Trocar endereço" não trocava**: em `awaiting_quote_confirmation` o bloco de
   pagamento capturava tudo e devolvia o menu — dava pra pagar cotação amarrada ao
   endereço velho. O `change_address` subiu para antes dos estados de espera e derruba a
   cotação aberta (o frete era do outro endereço).
5. **Escritas ler-depois-escrever por id**: cancelamento automático e publicação podiam
   se sobrescrever. Ambos agora são `updateMany` com o status no WHERE; quem perde a
   corrida não mexe no contexto da conversa.
6. **Dedupe de webhook não era atômico** (findFirst→create): duas entregas simultâneas do
   mesmo sid passavam juntas. Agora há índice ÚNICO PARCIAL
   (`Message_inbound_provider_id_key`, migration 20260811120000) sobre
   (conversationId, metadata) **WHERE sender = 'user'** e o P2002 decide. Parcial porque
   `metadata` de mensagens do ASSISTENTE guarda JSON de opções do fluxo legado, que se
   repete legitimamente (2 grupos assim existem em produção) — índice global exigiria
   apagar mensagens reais. **Índice já aplicado no banco.**
7. **TTL media o relógio errado**: `Conversation.updatedAt` só muda quando o contexto é
   gravado, então quem só perguntava ("já saiu o total?") era expirado no meio de uma
   conversa viva. `lastActivityAt` usa a última MENSAGEM (ou o updatedAt, o que for mais
   recente); vale para o TTL de cesta e o de cotação.
8. **"troca X por Y" só olhava o Carrefour** no concierge (`orderStore` cai no default
   quando a chave é "concierge"): agora usa `gatherCrossStoreCandidates` + diversidade +
   piso, como o pedido normal, e a opção carrega a loja dela.
9. **Refino apagava o histórico de paginação** (`shownSkus` era substituído) e "outras"
   repetia cards; agora acumula.
10. `tail-messages` ordenava ASC com `take: 60` — mostrava as 60 mais ANTIGAS, escondendo
    justo o erro recente. Agora é DESC + reverse (tail de verdade).
Efeito colateral saudável nos testes: com o mínimo valendo, fechar 1 refrigerante do
Carrefour (mínimo R$30, loja pinada no registro de teste) passou a ser barrado — os evals
que fechavam cesta agora usam quantidade que passa do mínimo, e há caso novo cobrindo os
dois lados.

**Bug MAIOR achado ao consertar o nº 6 — conversa duplicada divide a cesta.** O teste de
dedupe passava sozinho e falhava na suíte cheia (sob carga). Causa: `getOrCreateConvo`
fazia ler-depois-criar, então duas mensagens simultâneas do MESMO número abriam DUAS
conversas ativas — cada uma com seu contexto (cesta dividida, item sumindo) e com o
dedupe, que é por conversa, sem colidir. O banco confirmou o estrago: um número com **86
conversas ativas**. Conserto na raiz e sem tocar em dados: a criação virou `upsert` com id
DETERMINÍSTICO (`conv_<userId>`) — upsert por PK é atômico, então as duas chamadas
convergem para a mesma conversa. Conversa nunca é desativada no produto (o único
`status: "inactive"` é de cartão salvo), então reaproveitar o id é seguro. O teste trava a
raiz (1 conversa ativa), não só o sintoma. **Descartada** a alternativa de índice único
global por `metadata`: os ids de teste (`dup_1`) se repetem entre usuários diferentes nos
evals, e um índice global quebraria a suíte além de exigir apagar linhas reais.

**11/08 (4ª) — teste real do dono pegou 2 bugs + 1 pedido de UX.** (1) **"Escolher esse"
confirmava OUTRO produto**: o id do botão era a POSIÇÃO ("1"/"2"/"3"); depois de "Outras
opções" a lista trocava por baixo e o toque num card antigo escolhia a posição equivalente
da lista nova. Agora o id carrega o SKU (`optsku:<sku>`), `PendingChoice.shownOptions`
guarda tudo que já foi mostrado, e o toque em QUALQUER card do histórico escolhe
exatamente o produto daquele card (`confirmChosenOption` unifica número digitado, "mais
barata", nome e toque; a loja é a do produto escolhido, não a da opção 1). Sku fora do
histórico (card de outro item) → reapresenta a escolha, nunca chuta. (2) **"Outras" veio
com 1 opção só**: o preenchimento até 3 se perdia quando o filtro de variantes esvaziava —
agora completa do pool (pool mais fundo: 12/loja) e o eval trava 3. (3) Resumo da cotação
ganhou o botão **"Trocar endereço"** (`trocar_endereco`; corpo ≤1024 chars, senão texto com
a dica escrita de sempre). Testes: E2E do card antigo por sku, eval de 3-de-verdade,
botões no adapter, intents dos ids de máquina.

**11/08 (3ª) — FIM DA LINHA LIVRE no fluxo do cliente (decisão do dono: "pede → preço →
acabou; se não tem, fala que não tem").** O "Recebi seu pedido, vou cotar" deixou de
existir no caminho normal. Regra nova: item sem preço nas 18 lojas é RECUSADO com
honestidade na mesma resposta (`copy.itemsNotAvailable`, com convite a tentar outra
marca/versão) e NUNCA entra na cesta; fechar a lista com escolha aberta pede pra
confirmar o item (`finishChoiceFirst`) em vez de dobrar em linha livre. Consequência:
toda cesta é 100% precificada e TODO fechamento sai com total na hora. O caminho manual
(`awaiting_operator_quote`) vira fallback técnico (falha de frete/kill-switch
`LIA_INSTANT_QUOTE=false`), cercado pelo alerta ao operador e pela expiração de 1h.
`foldPendingIntoBasket`, `conciergeItemsNoted` e `conciergeSourcingNote` foram removidos;
adicionar item DURANTE uma cotação manual (só no fallback) continua dobrando no pedido.
Testes flipados para a regra nova em manual-concierge (helper `manualQuoteOrder` exercita
o fallback com `LIA_INSTANT_QUOTE=false`). A largura agora É a vitrine (17 mil itens):
lacuna de catálogo virou "não tenho" — ampliar catálogo é a resposta, não promessa de
cotação. Bônus da rodagem viva: o seed do Imigrantes tinha 151 palavras com encoding
corrompido ("�gua", "A��car") — corrigidas por dicionário; isso destravou 30 águas
invisíveis e expôs que "Sem A��car" ESCAPAVA da penalidade de variante (a Coca sem
açúcar vencia a original). "tonica"/"micelar"/"termal" entraram em PROCESSED_VARIANTS
(água tônica/micelar/termal não é água de beber — caso golden da água cobrou). Placar
golden mantido: 32/33 DET · 33/33 IA.

**11/08 (2ª) — botão Cancelar sempre visível + cotação abandonada expira sozinha.** Duas
regras do dono na sequência do zumbi: (1) "sempre tem que vir um botão cancelar" — o menu
de pagamento ganhou o 3º botão *Cancelar* e TODA mensagem de espera de cotação
(`operatorQuoteRequested`/`StillWorking`/`addedToPendingQuote`) sai como interativo com
botão *Cancelar pedido* (`sendCancelableNotice`; o toque volta como o texto "cancelar" e
cai no cancel contextual que já existia; fora do Meta, texto puro). (2) "sumiu por 1h =
não quer mais" — `LIA_QUOTE_ABANDON_TTL_MS` (60 min): cliente que volta depois de 1h+ com
pedido parado em `awaiting_operator_quote`/`awaiting_supplier_validation`/
`awaiting_quote_confirmation` tem o pedido não-pago cancelado sozinho (nota "⏰ Cancelado
automático" no /ops), a conversa recomeça do zero (endereço preservado,
`copy.staleQuoteRestart` avisa que nada foi cobrado) e a mensagem nova é processada
normalmente — a camiseta nunca mais cai dentro do pedido de sábado. Pedido PAGO nunca é
tocado; `awaiting_payment` fica de fora de propósito (o cliente pode estar pagando o Pix
naquele momento; cotação vencida já bloqueia pagamento velho). Complementa o TTL de
carrinho de 30 min que já existia (aquele só cobria cesta em montagem, não pedido criado).
Testes: E2E de abandono (viagem no tempo via SQL no `updatedAt`) + botões no adapter.

**11/08 — pedido zumbi + alerta ao operador + card sem foto (bug real de produção).**
"Quero uma camiseta de futebol" respondeu "anotei e já incluí na cotação" — o dono achou
que era a busca; era um pedido REAL de sábado preso 2 dias em `awaiting_operator_quote`
(nasceu 26 min ANTES do deploy da cotação instantânea, e a camiseta caiu dentro dele como
linha livre, por desenho de 07/08). Diagnóstico via `tail-messages` + banco. Causa raiz
sistêmica: NADA avisava o operador de que havia trabalho no /ops — cotação manual era "em
instantes" que nunca chega. Fechado: `notifyOperator` (env `LIA_OPERATOR_PHONE`; sem env =
silêncio; best-effort, nunca afeta o cliente) dispara no WhatsApp do operador em 3
momentos: pedido caiu pra cotação manual, cliente adicionou item durante a cotação, e
pedido PAGO (o mais urgente). Setar a env na Vercel + redeploy pra valer. No mesmo
mergulho: o card da ração de sábado foi descartado pela Meta por **foto 404 no CDN**
(erro assíncrono 131053 — classe nova, não é o encoding de 07/08); `sendMetaDeliveryChoices`
agora faz pré-flight da imagem (Range 1 byte, timeout `LIA_MEDIA_PREFLIGHT_TIMEOUT_MS`
1500ms; só 4xx definitivo derruba) e manda o card SEM foto em vez de perdê-lo — produto,
preço e botões sobrevivem. Desbloqueio do pedido preso: o próprio cliente manda "cancelar"
(cancela `awaiting_operator_quote` sem cobrança). Testes: alerta E2E em
manual-concierge, card sem header em whatsapp-adapter.

**10/08 (2ª rodada) — botão "Outras opções" + paginação cross-store.** Pedido do dono: quem
não gosta de NENHUMA das 3 opções precisa de uma saída visível. O último card de produto no
canal Meta ganhou um segundo botão **"Outras opções"** (id de máquina `opt:outras`, que volta
como texto e cai no MESMO ramo do "mostra outras" digitado); o fallback numerado anuncia o
atalho no `choicesAsk` ("*outras* que eu mostro mais") e `wantsMoreOptions` aceita "outras"
seco, "mostrar mais" e o id do botão. Toque atrasado fora da escolha vira `reject` educado
(nunca busca de produto). Por baixo, dois consertos na paginação: `choiceCandidates` agora
busca em TODAS as vitrines no concierge (paginava só a loja da opção 1, escondendo as
outras; cada opção carrega a própria loja) com pool mais fundo (40, 8/loja), e tanto a
paginação quanto o refinamento passam pelo `diversifyOptions` — "outras" nunca devolve
variante do que o cliente acabou de dispensar (só se não sobrar nada distinto). Pool
esgotado continua honesto (`noMoreOptions`). Testes: intents (botão/atalhos), adapter
(2 botões no último card), E2E de paginação por botão.
A vistoria de rodagem completa (talk-lia) no mesmo dia pegou o buraco que a suíte não via:
a paginação nunca teve piso de relevância — "outras" de "carregador de celular" devolvia
Sérum Nivea "Cellular" e chip de operadora (score>0 por token solto; o pool cross-store
escancarou). `choiceCandidates` agora aplica `conciergeMatchIsStrong` na paginação e no
refino. Limitação assumida: o rerank de IA não roda na paginação (resposta na hora), então
o piso léxico é estrito — "outras" de "carregador de celular" pode dizer "essas são todas"
mesmo havendo veicular/cabo no catálogo (o refinamento cobre); regressão E2E do sérum em
tests/conversation.eval.test.ts.

**09/08 — cotação instantânea (decisão do dono: cliente não espera no chat).** Cesta 100%
de vitrine fecha com o total NA HORA: `tryPublishInstantQuote` calcula o subtotal da vitrine
(custo real; o markup entra no publish, como na cotação manual) + **frete por loja** e
auto-chama `opsPublishManualQuote` em modo `retailer_delivery`, reutilizando por inteiro a
máquina de cotação/pagamento existente. **A entrega é pelo SITE do varejista** (correção do
dono: "não é via Uber, é via site" — o operador compra no site e a loja entrega; "2 lojas =
2 fretes" = dois checkouts), então o frete certo é a POLÍTICA DO SITE de cada loja:
`LIA_STORE_FREIGHT_<LOJA>` + limiar de frete grátis `LIA_STORE_FREE_ABOVE_<LOJA>` (comparado
ao subtotal de CUSTO daquela loja, como o carrinho do site vê); sem política, tarifa padrão
`LIA_FREIGHT_DEFAULT` (18) com marca "(tarifa padrão)" na nota do /ops. Sem km, sem courier
nessa conta — o desenho base+km/Uber foi descartado no mesmo dia, antes de ir ao ar como
preço. Linha livre mantém o fluxo manual (não se cobra o que não tem preço); kill-switch
`LIA_INSTANT_QUOTE=false`. A autoridade de preço do operador passa a valer só para linha
livre; para vitrine, o preço raspado (com markup como colchão) é o cobrado — defasagem acima
da margem segue a política de pós-venda (avisar + estornar diferença). Módulo
`src/lib/instant-quote.ts` (puro/testável). Testes em `tests/instant-quote.test.ts` (4) +
3 E2E no `tests/manual-concierge.test.ts`. Calibração dos valores por loja = ação do dono.

**07/08 (3ª rodada) — cards de opção descartados pela Meta sem erro visível.** Teste real:
header "Achei essas opções de cotonete:" saiu e nenhum card chegou. Runtime logs: webhook
200, zero exceção → a Graph API aceitou os cards e o WhatsApp os descartou DEPOIS (falha
assíncrona). Dois buracos fechados: (1) `safeMediaLink` (adapters/whatsapp.ts) percent-encoda
URLs de imagem com byte não-ASCII — caso real: `…cotonetes®-150…` da Pague Menos; o fetcher
da Meta rejeita o que o curl aceita — aplicado nos 3 envios de mídia Meta (card interativo,
mensagem de imagem, sendMedia); (2) o webhook LOGA todo `status: failed` da Meta
(`[whatsapp:meta:status-failed]`, com code/title/details) antes do ACK — era ACKado e
descartado em silêncio, o que tornava esse tipo de falha indiagnosticável. Lição de método:
teste com adapter mockado NÃO cobre a entrega real da Meta; validação de card exige teste
real + leitura do runtime log. Unit de `safeMediaLink` em tests/whatsapp-adapter.test.ts.

**07/08 (2ª rodada) — emoji literal RESOLVIDO na raiz + linha livre passou a contar que buscou.**
O `🙂` que aparecia no WhatsApp era **bug do minificador SWC do Next 14**: ao fundir
`[template, "", 'string'].join("\n")` num template literal único, ele emitia o emoji com barra
dupla (`\\uD83D\\uDE42`) — texto literal pro cliente. Por isso o 📝 da MESMA mensagem
renderizava e o 🙂 final não, e nenhuma versão do fonte tinha o problema. 5 emojis de copy
estavam corrompidos no bundle (💚×4, 💳, 📍×2, 🙂×2, 🛵). Conserto na raiz:
`experimental.serverMinification: false` no `next.config.mjs` (minificar servidor não paga
nada aqui) + guarda `scripts/check-bundle-emoji.mjs` no `npm run build` que FALHA o build se
um surrogate com barra dupla voltar ao bundle. Junto: o caso real "adaptador hdmi pra usb"
(nenhuma das 18 lojas tem) mostrou que a linha livre parecia "anotou sem procurar" — a copy
`conciergeItemsNoted` agora diz que PROCUROU nas lojas parceiras e que o operador cota por
fora. Guarda do teste breadth mantida (a frase de recusa legada continua proibida).

**Três bugs de onboarding achados ao validar a busca numa conversa real (mesmos consertados).**
Eles produziam exatamente o sintoma que motivou o trabalho — busca devolvendo lixo — só que a
origem era o endereço, não o matcher:

1. **Endereço + CEP na mesma mensagem** ("Av. Paulista 1000, apto 5, Bela Vista, São Paulo,
   01310-100" — o jeito mais natural de responder) era interceptado pelo ramo de CEP, que
   tratava o resto como ITENS: a Lia respondia "Já anotei: 1x apto 5" e pedia o endereço de
   novo. Agora `looksLikeDeliveryAddress` decide, e o endereço salvo vem do texto **cru** (com
   acento, maiúscula e vírgula) — o normalizado ia pro motoboy como "av paulista 1000 apto 5".
2. **Endereço como primeira mensagem** (cliente que não diz "oi") virava lista de compras pelo
   mesmo motivo; agora é salvo.
3. **Pedido feito enquanto a Lia espera o endereço** era descartado em silêncio; agora fica
   guardado em `pendingRequest` e roda assim que o endereço chega.

Regressões em `tests/manual-concierge.test.ts` (3 testes novos).

### Atualização 03/08/2026 — vitrine híbrida (o cliente passa a ver produto)

Até aqui o concierge só ANOTAVA o pedido: os 17,4 mil itens existiam mas nunca chegavam ao
cliente (a "vitrine híbrida" era proposta desde 24/07). Agora `handleConciergeRequest` busca
nas 18 lojas via `buildChoices` (sem travar loja — o operador compra onde precisar, então a
cesta pode ser mista) e mostra até 3 opções com foto e botão. Item sem match continua virando
linha livre: a largura é o moat e nada é recusado.

Três regras sustentam a qualidade — todas viraram teste:

1. **Piso de relevância do concierge** (`conciergeMatchIsStrong`, em `stores/types.ts`). O piso
   legado (`scoreCatalogMatch > 0`) é permissivo porque lá não havia alternativa ao catálogo.
   No concierge há: a linha livre. Então sugerir errado é PIOR que não sugerir. Caso real que
   motivou: "conserto de torneira" casava com **"Espumante Argentino Concerto Brut"** (o fuzzy
   trata conserto≈concerto) e o cliente recebia vinho. A regra é COBERTURA da consulta, não
   score: consulta de 1–2 palavras exige cobertura total; consulta longa tolera 1 palavra sem
   correspondência; token de tamanho ("2kg") nunca conta. Opção reprovada faz a linha voltar a
   ser livre. Coberto por `tests/concierge-match-floor.test.ts`.
2. **Escolher NÃO fecha a lista.** No legado, acabar as escolhas ia direto pra cotação porque
   escolher era o último passo. No concierge o cliente ainda soma itens e só fecha com
   "só isso" — `advancePending` ganhou o ramo concierge.
3. **Fechar com escolha pendente não descarta o item** (`foldPendingIntoBasket`). Antes, dizer
   "só isso" no meio das opções perdia o item silenciosamente; agora ele vira linha livre.

Regressões 2 e 3 cobertas em `tests/manual-concierge.test.ts`. Suíte: 220 testes, 219 verdes
(1 flake de conexão do Postgres sob carga, que passa isolado em 45s), `tsc`, lint e build limpos.

### Atualização 03/08/2026 — Browserbase removido; catálogo com rotina mensal

Por decisão do dono, **o Browserbase saiu do produto inteiro** ("não precisa disso, não estamos
fazendo assim"). Todo o navegador remoto era suporte ao caminho automatizado, que já estava
atrás de `manualConciergeEnabled()` e desligado por `PURCHASE_AUTOMATION_ENABLED=false` — ou
seja, código morto em todos os ambientes. Não reintroduzir sem mudança explícita de produto.

**Removido:** busca ao vivo (`browserbase-live-search.ts`), os 3 compradores automatizados
(`purchasing/stores/`), o lease de Context, `purchasing/` inteiro, `workflows/purchase-order.ts`,
as rotas `/api/ops/internal-preflight` e `/api/ops/live-retailer-session`, o cron
`/api/cron/prewarm-search` (só existia para aquecer o cache do robô) e o `vercel.json` que o
agendava. No `/ops` saíram os botões de preflight/sessão viva e os cards de PurchaseJob. No
cérebro saíram `beginRetailerQuote`, `publishValidatedRetailerQuote`, `issueDeferredOrderPayment`
e a guarda `usesRetailerCheckoutQuote`. As dependências `@browserbasehq/sdk` e `playwright-core`
saíram do `package.json` (`workflow` fica: é do One-Click de cartão).

**Preservado de propósito:** `issueValidatedRetailerQuotePayment` e
`setQuoteConversationAwaitingPayment` — o concierge manual reusa os dois para cobrar depois que
o operador publica a cotação. O modelo `PurchaseJob` continua no schema (nenhuma migration), só
não é mais alimentado.

**Oba deixou de ser exceção.** Ela dependia de busca ao vivo e tinha só 2 itens de seed. A API
pública VTEX dela responde direto (206 + JSON) — o navegador nunca foi necessário ali. Colhida:
**1.494 itens reais**. Petz e Boticário passam a servir o catálogo colhido (anti-bot impede
recolheita automática; seguem em colheita manual).

**Rotina mensal de preço** (`npm run catalog:refresh`, `scripts/refresh-catalogs.mts`): recolhe
as 10 lojas com API/SSR aberta, compara preço a preço com o catálogo atual e resume quantos
mudaram, a variação média e as maiores mexidas. `--dry` simula sem tocar em arquivo. Colheita
vazia **preserva** o catálogo anterior (vazio quase sempre é bloqueio, não loja sem produto).
As farmácias carregam allowlist + deny-regex dentro do script. Primeira execução já mostrou o
valor: o Divvino teve **320 preços diferentes em um dia** (+31,8% médio — a colheita de 02/08
pegou uma promoção que acabou).

Verificação: suíte **210/210 verde** (os 14 a menos são os testes do Browserbase removidos),
`tsc`, lint e build limpos.

**Publicado em 03/08:** push da `main` (27 commits) → deploy `dpl_BKzUbC4brKprMqrdMYJQ7QDnt5Kr`
(commit `cf131f5`) `READY` em Production. Smoke: landing 200, `/ops` 200, webhook 403 e as
rotas removidas do Browserbase respondendo 404. Produção e código local estão idênticos;
não há mais gate técnico para o piloto.

### Atualização 02/08/2026 — 7 vitrines novas (18 lojas, 17.264 itens)

Por decisão do dono ("adiciona todos esses"), as lacunas de demanda mapeadas contra os dados
de e-commerce/delivery BR foram fechadas. A vitrine saiu de **7.652 itens em 11 lojas** para
**17.264 itens em 18 lojas**. Todos os dados são reais (nome/preço/URL/imagem verbatim) e cada
CDN foi testado como hotlinkável antes de registrar a loja.

| Loja | Lacuna | Itens | Método |
|---|---|---|---|
| Drogaria São Paulo | farmácia s/ remédio | 4.682 | API VTEX + allowlist + deny-regex |
| Pague Menos | farmácia s/ remédio | 1.551 | API VTEX + allowlist + deny-regex |
| Natural da Terra | hortifruti/empório | 1.000 | API VTEX |
| Cobasi | pet (redundância da Petz) | 998 | API VTEX |
| Divvino | adega/vinho | 998 | API VTEX |
| Imigrantes Bebidas | cerveja/destilado | 406 | SSR (coletor próprio, sem Chrome) |
| Giuliana Flores | flores/presente | 204 | DOM renderizado (loja client-rendered) |

- **Regra ANVISA nas farmácias virou TRIPLA guarda — e a terceira foi necessária.** A colheita
  usa allowlist de categorias seguras **e** um deny-regex. Mas a auditoria profunda encontrou
  medicamento registrado que passou pelas duas, porque **a própria loja classifica medicamento
  dentro de categorias cosméticas**: esmalte antifúngico com ciclopirox, shampoo com cetoconazol,
  gel Rozex com metronidazol, "Dermodex Tratamento 100.000 U.I./g" e gel Zella. Por isso a
  terceira guarda mora em `src/lib/stores/anvisa.ts` e roda **em runtime no conector**
  (`withoutMedicine`), não no script: assim uma recolheita futura não reintroduz remédio por
  esquecimento de flag. Ela filtra princípio ativo, marca de medicamento, notação de dosagem
  (`mg/g`, `U.I./g`) e alegação terapêutica; removeu 18 itens (7 Drogaria SP, 11 Pague Menos).
  `tests/anvisa-pharmacy.test.ts` trava a regra nos dois sentidos: nenhum medicamento passa e a
  vitrine não pode ser esvaziada por um regex ganancioso. **Não afrouxar sem evidência de que o
  item não é medicamento registrado.** Sem a allowlist, a varredura por mais-vendidos de uma
  farmácia volta ~80% medicamento (o teste inicial trouxe Mounjaro e dipirona no topo).
- **A mesma auditoria pegou o lado pet, que ninguém tinha revisado.** A Cobasi veio com 65
  medicamentos veterinários e antipulgas (Simparic, Bravecto, NexGard, Apoquel, Drontal,
  Seresto) e 56 dietas de prescrição; a **Petz**, cujo seed era tido como "sem remédio/antipulga"
  desde 2026-06, tinha 58 itens da linha "Nutrição Clínica" (dieta terapêutica com receita).
  `withoutVeterinaryMedicine` (mesmo módulo) agora filtra as duas vitrines — e também os
  resultados da **busca ao vivo** da Petz, que não passa por curadoria humana. Removidos: 122
  na Cobasi e 87 na Petz. Antiparasitário e medicamento veterinário são regulados (MAPA) e
  dieta terapêutica exige receita; se um cliente pedir, o operador cota à mão com a receita.
- **Total após as guardas: 17.264 itens** (227 removidos por segurança do bruto colhido).
- **Roteamento:** `DRINK_HINT_RE` e `FLOWER_HINT_RE` foram somados às dicas de vocação. Sem
  elas, "vinho" e "buquê" empatavam com o Carrefour — o mesmo bug que "ração" tinha em 23/07.
  Conferido: vinho/cerveja → Divvino, buquê → Giuliana, ração → Petz, perfume → Boticário.
- **Leroy Merlin ficou de fora**, apesar de constar da lista: bloqueia fetch server-side (403)
  e, no navegador, a listagem não expõe imagem — a URL do CDN só aparece no `og:image` de cada
  página de produto, exigindo uma visita por item. Os 40 produtos reais colhidos na validação
  não foram persistidos. Reabrir só se alguém aceitar o custo de uma visita por produto; a
  restrição documentada de aceitar apenas itens "vendido e entregue por Leroy Merlin" continua
  valendo.
- **Decathlon segue servindo 4 de 17 itens**: o filtro `catalogWithImages` corta os 13 sem foto.
  É um bug conhecido de vitrine, não de dados.
- `scripts/harvest-vtex-catalog.mts` ganhou `--categories` e `--deny`; o novo
  `scripts/harvest-imigrantes-catalog.mts` cobre lojas SSR não-VTEX. O
  [README das vitrines](src/lib/stores/README.md) documenta os quatro métodos de colheita
  (VTEX / SSR / navegador / seed) e o requisito de imagem.

## O produto

A Lia é uma concierge de compras pelo WhatsApp. O cliente descreve o que quer, a Lia busca
produtos reais, monta uma sacola no varejista, calcula preço/frete/prazo, cobra por Pix ou
cartão, revalida e compra sob política controlada. Pix e o fallback de cartão usam Mercado
Pago; o cartão de recompra nativo no WhatsApp usa Pagar.me + Cloud API direta da Meta.

O fluxo principal vigente é **entrega feita pelo próprio varejista ao cliente**.

“Entrega hoje” só pode ser prometida quando:

- o próprio varejista oferecer same-day no checkout; ou
- existir parceiro/merchant que autorize formalmente retirada por courier.

## Decisão que não pode ser esquecida

A premissa antiga abaixo foi invalidada em 14/07/2026:

> comprar numa conta central por clique-e-retire e mandar qualquer motoboy buscar.

Por quê:

- Petz exige, na retirada por terceiro, documento de quem retira e documento original do
  titular, além de aguardar liberação do pedido;
- Carrefour não alimentar exige documentos do terceiro/titular, token e pode usar
  biometria;
- Carrefour alimentar exige autorização assinada e documentos do terceiro/titular;
- Uber Direct funcionar tecnicamente não autoriza o balcão a liberar uma compra de
  consumidor e o uso para varejista terceiro precisa de validação comercial.

Consequência: Uber Direct permanece como conector opcional para parceiros compatíveis, não
como fulfillment padrão. Não enviar documentos pessoais a entregadores on-demand.

Fontes e detalhes:
[docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md).

## Fluxo do cliente vigente (05/08) — resumo canônico

Primeira compra: onboarding endereço+CEP (1x) → pedido em linguagem natural → vitrine
híbrida (card com foto para match; linha livre para o resto; escolher NÃO fecha a lista) →
"só isso" → cotação manual no /ops → resumo com Pix (copia-e-cola) ou cartão (1ª vez: link
/cartao, digita UMA vez e salva tokenizado). Recompra no cartão: botão "Pagar •••• 1234",
um toque, sem CVV. Desvios: recusa → Checkout Pro; "outro cartão" → re-cadastro; toque
duplo → cobra 1x; fechar com escolha pendente → vira linha livre. Pós-pago: sem
cancelamento/substituição; item faltante = estorno do item; atraso = aviso. Cartão salvo
validado no sandbox real em 05/08; produção atrás de LIA_ENABLE_SAVED_CARD até habilitação
comercial + smoke de R$ 1. A seção "Fluxo-alvo" abaixo é o desenho legado da automação.

## Fluxo-alvo vigente

1. Cliente informa itens e endereço no WhatsApp.
2. Lia busca opções reais e resolve ambiguidades.
3. Lia monta uma sacola temporária antes de cobrar.
4. O checkout do varejista determina estoque, preço, frete, modalidade e prazo para o CEP.
5. Lia mostra a cotação com validade curta.
6. Cliente paga a Lia por Pix, Checkout Pro ou, quando habilitado, One-Click nativo no
   WhatsApp com Pagar.me.
7. Lia revalida itens, total, endereço e prazo.
8. Compra segue em `cart_only`/aprovação explícita durante a operação.
9. Varejista entrega; Lia acompanha e comunica o cliente.

O comportamento legado que cobra primeiro e só monta a sacola depois deve ser invertido.

## Canais ativos a partir de 19/07/2026

O produto ativo tem exatamente três fontes: **Oba Hortifruti** para mercado e essenciais,
**Petz** para pet e **O Boticário** para beleza. Carrefour foi removido do registro, roteamento,
cron de busca, comprador e telas operacionais; permanece apenas como histórico de uma decisão e
não deve ser reativado por fallback. Mambo foi avaliado tecnicamente, mas não integra o produto.

- **Oba:** conector Browserbase implementado em `cart_only`, implantado em Production e validado
  ao vivo em 19/07. Usa SKU/vendedor reais, limpa a sacola isolada, simula entrega pelo CEP e
  exige estoque, frete e prazo antes de cotar. O job técnico obteve arroz Camil 1 kg por R$ 5,99,
  frete R$ 9,90 e janela do varejista, totalizando R$ 15,89, no CEP público `01310-100`, e chegou
  a `cart_ready`. A chave Browserbase renovada e o `OBA_BROWSER_CONTEXT_ID` estão Sensitive em
  Production, sem segredo em arquivos. O primeiro retry revelou o fechamento prematuro da página
  (`PURCHASE_WORKER_ERROR`); a correção para aguardar o snapshot foi publicada no deploy
  `dpl_CpcjWKyHrteDuiQQ2DU9NZbj5Pwz`, que ficou `Ready`. A migration de defaults Oba também foi
  aplicada e conferida no banco. Não houve WhatsApp, cobrança ou pedido.
- **Petz:** o comprador agora exige subtotal, frete e promessa de entrega, falhando fechado se
  algum campo não aparecer. A navegação de carrinho/checkout havia sido validada ao vivo, mas a
  orquestração pré-cobrança atual precisa de preflight técnico. Em 19/07, o job técnico encontrou
  SKU, preço e subtotal reais, mas o Context não expôs frete/prazo mesmo após abrir a sacola
  completa; terminou corretamente em `needs_human`, sem cobrança ou compra. No retry posterior,
  a limpeza do carrinho revelou um redesenho transitório da sacola que invalida o seletor de
  remoção; o conector foi endurecido para reler o controle. O retry alcançou a rota real de
  sacola completa `/checkout/cart/<id>` e confirmou novamente SKU/preço, mas não expôs os campos
  de frete/prazo no Context. Continua em `needs_human` e requer diagnóstico da etapa de entrega.
- **Boticário:** o comprador agora também lê frete e prazo, além de SKU/quantidade e subtotal.
  Em 19/07, o job técnico confirmou SKU/quantidade/subtotal reais, mas a loja exibiu somente o
  convite para consultar frete. O conector passou a priorizar esse painel e falhou fechado quando
  o varejista não expôs a confirmação de CEP. Um link “Entrega Rápida” foi testado e leva apenas
  a uma página informativa, não ao cálculo; não deve ser usado como etapa da cotação. Falta
  resolver o gate real de CEP e validar ao vivo. No diagnóstico final, a própria sacola expôs o
  campo `postalCode`, mas com `data-disabled=true`; não forçar esse controle. A cotação fica
  bloqueada até o varejista/Context habilitar o cálculo de entrega.
- Em 20/07, novos pedidos técnicos isolados (não reaproveitados) confirmaram novamente: Petz
  resolve SKU/preço/subtotal, mas a rota `/checkout/cart/<id>` não expõe entrega; Boticário
  resolve SKU/preço/subtotal, mas não fornece prazo domiciliar. Um falso positivo anterior de
  promoção “frete grátis”/retirada foi removido do parser e coberto por teste. Nenhuma cobrança,
  mensagem ao cliente ou compra foi feita.
- Ainda em 20/07, o `/ops` passou a abrir uma sessão Browserbase viva e isolada para Petz ou
  Boticário, usando somente o Context persistente de cada loja. A sessão Petz foi aberta para o
  operador selecionar **entrega no endereço** diretamente na UI do varejista; ela não cria
  sacola, não envia mensagem, não coleta pagamento e não compra. A validação do frete/prazo só
  deve ser repetida depois dessa seleção manual do varejista. O acionamento abre antes a página
  inicial da loja (o debugger remoto nasce em aba vazia), sem preencher ou clicar em nada, e fica
  ativo por até uma hora para o operador concluir a etapa. Em 20/07, o visualizador embutido do
  Codex não apresentou essa sessão de modo interativo de forma estável; a mesma sessão foi aberta
  no Safari do operador. Não interpretar o problema do visualizador como falha de Context ou da
  cotação.
- Depois da ação direta do operador, foi implementado no `/ops` o encerramento autenticado das
  sessões vivas do mesmo Context, para tornar login/endereço persistentes antes do novo preflight.
  O retry fresco continuou em `needs_human`: resolveu o SKU e R$ 15,99, alcançou
  `/checkout/cart/<id>`, mas não expôs controles, frete ou prazo de entrega. O conector também
  tenta apenas o CTA explicitamente chamado “ir/continuar para checkout” a partir dessa rota; a
  Petz não o expôs. Isto não comprova que o login foi salvo e não autoriza insistir em UI remota;
  nenhuma cobrança, WhatsApp ou compra ocorreu.
- Novo preflight Boticário em 20/07 confirmou novamente SKU B88468, quantidade e subtotal de
  R$ 16,90 na sacola. O campo `postalCode` permaneceu bloqueado, com convite para consultar
  frete mas sem prazo; frete grátis promocional e retirada foram corretamente descartados.
  Permanece `needs_human`, sem cobrança, WhatsApp ou compra.
- Na triagem oficial de 20/07, os próximos candidatos foram priorizados: **Pão de Açúcar** para
  mercado em São Paulo (cálculo de frete/prazo por CEP e escolha de modalidade de entrega) e
  **Cobasi** para pet (frete/prazo por CEP no carrinho e entrega própria). Savegnago fica como
  alternativa para cidades do interior paulista, não São Paulo capital. Isso é pesquisa, não
  validação Browserbase nem autorização de compra; os dois ainda precisam de Context, carrinho e
  preflight `cart_only` ao vivo.
- A validação de navegação de 20/07 eliminou Pão de Açúcar para automação neste momento: a rota
  pública de produto foi desviada para `az-request-verify` antes de produto/CEP. A **Cobasi**
  passou no smoke ao vivo anônimo com o CEP público `01310-100`: produto real entrou na sacola e
  o checkout exibiu Cobasi Já, Econômica, frete, prazo e total antes de qualquer pagamento. O
  carrinho técnico foi limpo. Isto valida a interface do varejista, não o conector, o Context
  Browserbase, termos comerciais ou uma compra.
- Na validação completa de navegação ainda em 20/07, a Cobasi avançou da sacola até o gate de
  login (sem inserir credencial, endereço pessoal, cartão ou criar pedido). A **Leroy Merlin**
  também passou no mesmo critério com SKU vendido e entregue pela própria Leroy: CEP público,
  entrega domiciliar, frete, prazo, total e, ao continuar, login antes de qualquer pagamento.
  As duas sacolas técnicas foram esvaziadas. Leroy só pode ser candidata se o conector restringir
  itens a “Vendido e entregue por Leroy Merlin”; itens de marketplace exigem validação separada.
  **Sephora** não passou: a navegação chegou a produto/CEP, mas ficou instável antes da sacola;
  não a tratar como fonte candidata. Cobasi e Leroy seguem sem conector, Context/preflight da Lia,
  validação comercial ou autorização de compra.
- A cotação dos três reserva um Context por loja, cria a sacola antes de cobrar, expira em curto
  prazo e não reconstrói a sacola depois do pagamento. A compra continua `cart_only`, com
  revalidação e aprovação do operador.

## O que foi validado de verdade

### Petz

- conta autenticada em Context persistente do Browserbase;
- endereço salvo e reconhecido pelo checkout;
- busca, produto, sacola, frete e prazo reais;
- checkout alcançado sem finalizar compra;
- formas vistas: cartão, Pix, NuPay, Click to Pay e boleto;
- modalidades vistas: padrão, expressa, agendada e retirada, variáveis por CEP/horário;
- opção de salvar cartão para compras futuras;
- botão financeiro final identificado como `Pagar agora`;
- nenhuma compra foi finalizada.

No teste noturno de 14/07/2026 em São Paulo, a menor promessa domiciliar era o dia
seguinte. Isso não é SLA: sempre cotar ao vivo.

### Busca e carrinho

- Carrefour, Petz e Boticário têm busca ao vivo com links/preços reais;
- Petz e Boticário usam cache curto de 15 minutos;
- produção falha fechada: sem URL/preço real, não mostrar opção;
- compradores Petz/Boticário montam e revalidam carrinhos em Browserbase;
- carrinhos antigos são limpos pelos conectores antes de um novo preflight;
- o job persiste o ID da sessão para revalidação, não credenciais/cartão;
- cada Context Browserbase é isolado por um lease persistente no banco: o workflow enfileira
  conflitos como `RETAILER_BUSY`, tenta novamente a cada minuto por até uma hora e nunca mistura
  carrinhos. Leases abandonados expiram em 15 minutos; falhas de banco/configuração não são
  disfarçadas como fila. A regressão é coberta em `tests/purchase-context-lease.test.ts`.

### Cotação Carrefour antes da cobrança

- **Implementado em código em 15/07:** com a automação Carrefour habilitada, a Lia cria
  a cotação pendente, monta o carrinho em `cart_only` e só mostra Pix/cartão após o
  checkout expor total, frete e promessa de entrega do varejista;
- a cotação expira em 5 minutos por padrão, exige escolha explícita de Pix/cartão depois
  do resumo e libera o Context se vencer ou for cancelada;
- o checkout falha fechado para `needs_human` se não expuser itens, total, frete ou prazo;
- migrations aplicadas e versão implantada em produção em 15/07/2026;
- em 16/07, a UI atual foi mapeada ao vivo: o modal de CEP fecha pelo botão
  `button[type=submit]` (Enter não fechou), e frete/prazo aparecem no carrinho completo,
  não no minicarrinho. Para o SKU técnico, a tela mostrou item R$ 1,99, frete a partir de
  R$ 9,90, prazo a partir de sábado e total R$ 11,89, além do mínimo de R$ 30. Isto valida
  seletores/parsers da UI, não o workflow Browserbase;
- o conector foi alterado para abrir o carrinho completo, ler rótulos/valores em linhas
  separadas, capturar `orderFormId`, limpar carrinho antigo pelo checkout e diagnosticar o
  campo faltante. TypeScript, lint, 8 testes Carrefour, a suíte de 203 testes (161 passaram,
  42 dependentes do banco foram pulados) e build passaram;
- após deploys e retries controlados, o workflow avançou por CEP ausente, regionalização,
  falso positivo de login e carrinho antigo; o bloqueio final verdadeiro é
  `LOGIN_REQUIRED` no Context persistente. Foi criada e aberta uma sessão viva para login
  humano. **A validação Browserbase de estoque, frete, prazo, cartão e 3DS continua pendente.**
  Não tratar o mapeamento da UI como evidência de cobertura ou cotação operacional.
- após a reautenticação humana em 16/07, o preflight confirmou que o login passou, mas o
  minicarrinho não expôs seu CTA para o carrinho completo (`MANUAL_ACTION_REQUIRED`). O
  conector passou a abrir somente a rota de resumo `/checkout/cart` como fallback seguro.
  A publicação inicial via artefato pré-construído revelou incompatibilidade do Prisma gerado
  no macOS com o runtime Linux ARM da Vercel; `linux-arm64-openssl-3.0.x` foi incluído nos
  `binaryTargets`, o artefato foi reconstruído e a produção ficou `Ready` em 16/07. O POST
  do preflight voltou a responder 200, mas o workflow atual falhou fechado em `LOGIN_REQUIRED`;
  uma nova sessão viva foi aberta para login humano. Nenhuma ação financeira foi executada.
- Ainda em 16/07, o painel Browserbase foi acessado com sucesso e uma sessão Carrefour nova foi
  aberta, mas a reautenticação humana não foi concluída. O operador pediu para pausar e tentar
  em outro momento. Não abrir novas sessões nem repetir o preflight até a próxima tentativa
  coordenada; o motivo da falha não foi confirmado. Nenhuma ação financeira foi executada.
- Em 19/07, depois de a configuração Browserbase de produção ser comprovada pelo avanço até
  `LOGIN_REQUIRED`, uma nova sessão viva chegou à rota de autenticação Carrefour e foi bloqueada
  pelo próprio varejista com a mensagem de que o acesso não estava em conformidade com suas
  políticas de segurança. A mesma conta funciona no navegador comum do operador. A evidência
  torna o ambiente remoto Browserbase não confiável para autenticação/checkout Carrefour no
  piloto; não tentar contornar o bloqueio com proxy, fingerprint, CAPTCHA ou repetição de sessões.
- **Decisão de 19/07:** pausar a cotação/compra Carrefour via Browserbase e removê-la do caminho
  crítico do lançamento. A busca pública pode continuar falhando fechada, mas o checkout
  automatizado Carrefour só deve voltar com API/parceria oficial ou ambiente formalmente
  autorizado pelo varejista. O primeiro piloto deve ser reposicionado para Petz, cujo carrinho,
  frete, prazo e checkout já foram validados ao vivo, depois de levar para esse conector a mesma
  orquestração de cotar antes de cobrar. Não houve WhatsApp, cobrança ou compra nessa tentativa.
- A opção de entregar links para o cliente concluir no Carrefour foi explicitamente rejeitada pelo
  operador em 19/07 e não faz parte do produto: a Lia deve concluir o pedido nos bastidores. No
  curto prazo, as alternativas restantes são operação humana invisível em navegador comum para
  testes internos/controlados ou um modelo próprio de shopper que compre na loja física; nenhum dos
  dois é automação escalável e ambos exigem desenho operacional antes de dinheiro real. No longo
  prazo, buscar parceria homologada com Carrefour ou plataforma de delivery para receber catálogo,
  cotação e criação de pedido por canal autorizado. A API pública do Marketplace Carrefour é para
  sellers gerirem ofertas/pedidos, não para a Lia comprar como consumidora. As APIs iFood públicas
  encontradas também são do lado merchant. A API VTEX permite carrinho/simulação em tese, mas o
  endpoint padrão no domínio headless Carrefour respondeu 500 e os termos atuais vedam ferramentas
  automatizadas; não prototipar contra endpoints internos sem autorização escrita. Automação em
  navegador local, extensão, proxy residencial ou troca de fingerprint não é caminho aprovado.
- **Estratégia de varejistas de 19/07:** a Lia deixa de tratar qualquer loja como garantida e passa
  a homologar conectores por gates: acesso público, catálogo/SKU real, carrinho isolado, cotação de
  estoque/frete/prazo antes do login/pagamento, persistência de sessão, entrega do varejista,
  bloqueio financeiro e autorização comercial/termos. Petz é referência técnica já validada ao
  vivo, mas ainda não equivale a autorização comercial. No teste técnico público de 19/07, Oba e
  Mambo criaram orderForms anônimos e receberam dois SKUs regionalmente disponíveis no CEP público
  `01310-100`. Ambos devolveram estoque, preços, frete e estimativa/janelas de entrega sem login:
  Oba montou uma sacola de R$ 18,98 e expôs Convencional por R$ 9,90 (`0bd`, com seis janelas) e
  Express por R$ 14,90 (`2h`, sem janela disponível no horário); Mambo montou R$ 22,78 e expôs
  Entrega Agendada por R$ 12,90 (`2h`, 19 janelas). Os dois carrinhos foram esvaziados ao fim.
  Isto valida catálogo, disponibilidade regional, carrinho e simulação pública de logística — não
  valida login, persistência, checkout financeiro, pedido, escala ou autorização comercial. Oba é
  o primeiro candidato para mercado/essenciais; Mambo é fallback regional em São Paulo e seus
  termos vinculam uma conta individual ao CPF. Savegnago permanece candidato regional. Pão de
  Açúcar respondeu `200`, porém apresentou gestão de bots. St. Marche segue depriorizado após a
  recuperação judicial informada pelo Grupo Hortus.
- **Boticário em 19/07:** a busca ao vivo e o comprador Browserbase continuam implementados. O
  comprador limpa, monta e revalida SKU/quantidade, subtotal, frete e promessa; sem estes campos,
  falha fechada. Ainda não houve preflight Browserbase ao vivo nesta rodada, portanto não está
  homologado para cotação antes da cobrança.

### Pagamentos e canal

- Mercado Pago Pix e Checkout Pro estão integrados;
- WhatsApp Meta Cloud API está ativo em produção;
- domínio de produção: `https://liadelivery.com.br`;
- confirmar situação PJ/NF do Mercado Pago antes do lançamento público;
- Pix e Checkout Pro do Mercado Pago permanecem o caminho ativo.
- O One-Click BR (Meta Cloud API direta + Pagar.me) está implementado, mas permanece
  desligado até a habilitação da Meta, chaves/domínio/webhook Pagar.me e sandbox. As
  migrations já estão aplicadas; o ticket Meta `37565409896407734` está **Open** desde
  04/08. Não depende de 360dialog. Ver
  [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).
- Em 16/07, Samuel Santana, da Infobip, respondeu sobre `order_details` /
  `offsite_card_pay` com Mercado Pago PJ e pediu volume, categoria das mensagens, países e
  canais para encaminhar a oportunidade. A Infobip documenta WhatsApp Payments no Brasil e
  orienta acionar gerente/suporte, portanto o contato é uma via plausível de habilitação.
  Isso ainda é somente qualificação comercial: não confirma elegibilidade, compatibilidade
  do Mercado Pago, geração de `credential_id`, custos ou preservação da WABA/número. O
  onboarding padrão da Infobip também contempla registrar/migrar o sender para a API deles;
  a resposta deve exigir explicitamente Cloud API direta, Graph API/webhook atuais e nenhum
  compartilhamento ou migração de BSP sem autorização separada.
- Em 18/07, Samuel classificou a Lia como **Self-Service** pelo volume inicial (2.000–10.000
  mensagens/mês) e encaminhou as dúvidas técnicas ao Customer Success
  (`success@infobip.com`); também ofereceu criar uma conta de teste. Isso não é aprovação
  técnica, habilitação de Payments, confirmação de compatibilidade com Mercado Pago PJ nem
  garantia de `credential_id`. Só solicitar/usar teste se ficar documentado que ele não
  migra nem compartilha WABA/número, preserva a Cloud API/Graph API e o webhook atuais, e
  se o escopo de `order_details`/`offsite_card_pay`, sandbox, webhook e custos for confirmado.
  O contato ao Customer Success foi enviado em 18/07, com Samuel em cópia; em 03/08 a Infobip
  respondeu negativamente e essa rota foi encerrada. Não criar conta de teste nem migrar sender.
- A revisão da documentação Pagar.me V5 confirmou `tokenizecard.js`, domínio liberado e
  cobrança por `card_id`. `recurrence_cycle=first|subsequent` descreve recorrência externa e
  não se aplica à recompra avulsa da Lia; o adaptador atual (`card_id` sem o campo) está
  correto. CVV/3DS, recusa e antifraude ainda precisam passar no sandbox antes de ligar a flag.

### Deploy e testes

- produção foi implantada e estava `Ready` após as mudanças de busca/carrinho;
- `npx tsc --noEmit` passou;
- testes focados de compra/busca/política passaram;
- em 15/07, os evals foram alinhados ao onboarding de endereço completo e `npm test` passou
  integralmente (201 testes). O build local de produção também passou; isso não substitui
  validação ao vivo de checkout ou piloto.
- em 16/07, a operação de entrega direta foi implementada localmente com estados explícitos
  `retailer_preparing` e `retailer_out_for_delivery`. O `/ops` agora mostra modalidade,
  promessa e rastreio do varejista, bloqueia courier externo em `retailer_delivery` e mantém
  os estados antigos apenas para parceiros formalmente autorizados. Cancelamento pago virou
  fluxo auditável `refund_pending -> refunded`: a confirmação ao cliente só ocorre depois de
  registrar a referência real do provedor. O runbook de `needs_human`/estorno está em
  `docs/operacao-piloto-needs-human-estorno.md`. TypeScript, lint, 210 testes (168 passaram,
  42 dependentes do banco foram pulados) e build passaram. Alteração ainda não implantada nem
  validada ao vivo.

## Segurança e limites financeiros

- Produção deve permanecer com `PURCHASE_AUTOMATION_MODE=cart_only` até piloto auditado.
- Nunca clicar no botão final de compra sem confirmação explícita no momento da ação.
- Nunca repetir automaticamente um clique financeiro quando o resultado for incerto.
- CAPTCHA, OTP, login, CVV e 3DS viram `needs_human`; não burlar desafios.
- O hash que protege uma aprovação deve incluir itens, total, frete e promessa de entrega;
  uma mudança em qualquer um deles invalida a aprovação anterior.
- Não guardar número de cartão ou CVV. O Pagar.me recebe os dados diretamente pelo
  `tokenizecard.js`; a Lia persiste somente IDs tokenizados, últimos quatro dígitos e o
  registro de consentimento necessários para a recompra.
- Não pedir cartão pelo chat. O usuário digita dados financeiros diretamente no checkout
  seguro do provedor/varejista.
- Um PIN de registro do WhatsApp estava salvo em um Markdown local ignorado pelo Git. O valor
  foi removido em 16/07; ele deve ser rotacionado e mantido apenas no cofre de segredos antes
  do piloto. Não registrar PINs em Markdown, chat ou logs.
- Credenciais já expostas em chats ou em diagnósticos locais devem ser rotacionadas e
  atualizadas na Vercel. Em 15/07, uma saída de diagnóstico incluiu credenciais de
  Browserbase/Vercel: tratá-las como expostas e rotacioná-las antes do piloto. O token OIDC
  local da Vercel foi renovado em 15/07 sem expor valores; ainda falta regenerar a chave
  Browserbase e atualizar os ambientes que a consomem. Em 15/07 foi aberta uma sessão
  persistente do Context Carrefour somente para reautenticação manual; não houve carrinho,
  checkout ou cobrança. Uma chave Browserbase de reposição foi colada em conversa em 15/07:
  ela também é exposta, não deve ser configurada mesmo com autorização posterior e precisa
  ser regenerada novamente. A validação da variável puxada de produção retornou
  `401 Missing x-bb-api-key`; não abrir novo preflight antes de configurar chave válida na
  Vercel e implantar. Em 15/07 a URL de Environment Variables da Vercel foi aberta no
  navegador embutido, mas exigiu login manual na conta Vercel antes da configuração. Após
  uma tentativa de salvar somente em Production, uma nova leitura de `vercel env pull`
  ainda não trouxe valor para `BROWSERBASE_API_KEY`; conferir no painel que a edição foi
  realmente salva com um valor não vazio antes de implantar. A tela de edição revelou em
  seguida um valor com prefixo `sk_live_`, que não é uma chave Browserbase (`bb_live_`):
  não implantar até substituir pelo segredo Browserbase correto e marcá-lo como Sensitive.
  Uma segunda leitura do Production após a alegada correção continuou sem a variável; o
  deploy e o preflight Carrefour permanecem bloqueados. Posteriormente, o painel confirmou
  `BROWSERBASE_API_KEY` como Sensitive, Production e "Updated just now"; um novo deploy de
  produção ficou Ready em 15/07. A confirmação de autenticação Browserbase ainda não pode
  ser feita localmente porque a variável Sensitive não é baixada pelo CLI; a sessão Carrefour
  foi reaberta para login humano antes de qualquer preflight. Em seguida, o operador informou
  que concluiu o login na tela; falta escolher o endereço salvo e o item de teste antes do
  preflight de carrinho, frete e prazo. Não houve item, checkout ou cobrança neste ciclo.
- Em 16/07, credenciais de login do Carrefour foram coladas diretamente no chat. Não
  persistir, repetir em logs/documentação, copiar para `.env` nem tratá-las como segredo
  reutilizável. A senha precisa ser rotacionada após a reautenticação controlada do Context
  e antes do piloto; o inspetor remoto não expôs campos seguros para automação, então a
  sessão viva ficou aberta para login humano.
- Em 18/07, o operador optou por não trocar a senha Carrefour neste momento. Nenhuma alteração
  de senha foi iniciada; a credencial continua tratada como exposta e bloqueia o uso do Context
  Carrefour e qualquer piloto até que seja rotacionada pelo titular.
- Manter idempotência, hash do carrinho e revalidação imediatamente antes de qualquer
  aprovação.
- Em 16/07, foi criado `OPS_TOKEN` dedicado (Sensitive, Production e Preview) sem
  substituir `API_TOKEN`; o redeploy de produção ficou `Ready` e o painel `/ops` foi
  autenticado com sucesso. O token não foi exibido nem registrado em documentação. A fila
  contém pedidos legados/pagos e alguns cancelados: não reutilizá-los para validar checkout.
  Em seguida, foi criado pelo painel um pedido técnico isolado com o SKU Carrefour exato
  então visível, usando somente a região já salva no Context persistente (nenhum endereço
  real foi copiado ou persistido). O workflow terminou em `needs_human` /
  `PREFLIGHT_NEEDS_HUMAN`: não conseguiu confirmar conjuntamente item, total, frete e prazo.
  O valor interno de R$ 1,99 não é cotação válida. Não houve WhatsApp, cobrança nem compra;
  a validação ao vivo continua pendente até o checkout expor todos esses campos.
- Em 16/07, a causa genérica acima foi decomposta com retries seguros. O endpoint técnico
  agora reutiliza o mesmo job, injeta somente o CEP público `01310-100`, possui status GET e
  uma página leve em `/ops/teste-carrefour`. O último retry limpou o carrinho anterior e
  terminou em `LOGIN_REQUIRED`; uma sessão viva do mesmo Context foi aberta para
  reautenticação humana. O detergente usado no mapeamento do navegador comum foi removido.
  Nenhuma etapa financeira foi aberta.

- Em 18/07, a chave Browserbase exposta foi regenerada no painel oficial e atualizada como
  `BROWSERBASE_API_KEY` Sensitive em Production. Um valor intermediário que apareceu no
  controle de rotação foi invalidado imediatamente e substituído por uma chave limpa, sem
  registrá-la no projeto ou na documentação. O redeploy de produção da versão
  `ops-direct-retailer-delivery` / `9a06eab` ficou `Ready`. Isso comprova a rotação e a
  configuração implantada, não a autenticação da API Browserbase nem o checkout Carrefour:
  não houve preflight, sessão nova, cobrança ou compra. Continuam pendentes a senha Carrefour,
  o PIN de registro WhatsApp e as demais credenciais expostas (Mercado Pago/Uber).
- Em 18/07, o operador pediu para suspender novas rotações de credenciais e priorizar o
  funcionamento do produto. Nenhuma rotação adicional deve ser iniciada sem novo pedido
  explícito. O trabalho funcional imediato é validar, em `cart_only` e sem cobrança/compra,
  a cotação Carrefour e os estados recém-implantados no `/ops`; os riscos de credenciais já
  documentados continuam bloqueios para piloto, não autorização para alterar segredos.
- Na primeira validação funcional coordenada de 18/07, o endpoint técnico de produção
  `/ops/teste-carrefour` iniciou um preflight sintético em `cart_only` (sem WhatsApp,
  cobrança ou compra) e terminou em `needs_human` / `CONFIGURATION_REQUIRED`: a credencial
  Browserbase configurada para Carrefour não foi aceita pelo runtime. Isto confirma que o
  deploy `Ready` não validou a variável em execução; não iniciar novo preflight até corrigir
  a configuração existente e confirmar a autenticação Browserbase. Não é autorização para
  nova rotação de credenciais.
- Ainda em 18/07, a causa foi confirmada: `BROWSERBASE_API_KEY` em Production continha um
  valor com prefixo `sk_live_`, que não era uma chave Browserbase. A variável foi substituída
  diretamente pela chave mascarada do painel Browserbase (sem registrá-la), e o redeploy
  `EEaegLWbmNtiwG6opHEbWirJBX57` ficou `Ready`. O retry do mesmo preflight técnico avançou até
  `LOGIN_REQUIRED`, confirmando que a autenticação Browserbase e o Context Carrefour voltaram
  a ser acessíveis pelo runtime. A cotação completa continua pendente de login humano no
  Context; não houve WhatsApp, cobrança ou compra.

## Cobertura e cotação

- A antiga regra “cidade coberta + loja a até 12 km” é legado do motoboy.
- Para entrega direta, o checkout do varejista é a autoridade de cobertura, frete e prazo.
- Distância até loja pode continuar como filtro comercial ou para parceiros same-day, mas
  não prova entregabilidade.
- Meta de cotação por loja: busca 2–8 s; carrinho/frete 10–25 s; total normalmente
  15–30 s. Medir p95 antes de prometer SLA.
- Cotação deve expirar em poucos minutos e ser revalidada antes da cobrança e da compra.

## Bloqueios antes do lançamento

1. Definir juridicamente comprador, titular da NF, múltiplos destinatários, troca,
   devolução, chargeback e responsabilidade pelo pós-venda.
2. Validar nos termos de cada varejista o uso de uma conta central para diferentes clientes.
3. Validar ao vivo a cotação real antes da cobrança. A rota Carrefour/Browserbase foi pausada
   após bloqueio de segurança do varejista em 19/07; priorizar a orquestração de cotação
   pré-cobrança e o piloto controlado na Petz, já validada até o checkout.
4. Validar ao vivo no `/ops` os estados de entrega/rastreio do varejista e o fluxo
   auditável de estorno. O código da revisão está implantado em produção desde 18/07,
   mas ainda não foi validado com massa técnica nova.
5. Testar cartão salvo, CVV, 3DS, CAPTCHA e antifraude sem habilitar compra automática.
6. Pilotar 5–10 pedidos controlados com entrega direta.
7. Para same-day, obter parceiro local ou contrato merchant/courier antes de desenvolver
   nova automação de retirada.
8. Antes de ativar One-Click: confirmar as migrations de pagamento já aplicadas, liberar
   Payments API BR na WABA, liberar o domínio no Pagar.me e configurar as chaves/webhooks
   em produção.

## Estado dos conectores

- **Petz:** busca/carrinho/checkout validados; é o conector recomendado para o primeiro piloto,
  após receber a orquestração de cotação antes da cobrança. Finalização financeira ainda bloqueada.
- **Carrefour:** busca pública disponível; automação de carrinho implementada, mas autenticação e
  checkout via Browserbase pausados após bloqueio de segurança do varejista em 19/07. Só retomar
  com API/parceria oficial ou ambiente autorizado. Handoff para o cliente foi rejeitado; qualquer
  alternativa deve preservar a compra concluída pela Lia nos bastidores.
- **Boticário:** busca e carrinho preparados; política de entrega/titularidade ainda precisa
  da mesma validação operacional.
- **Candidatos supermercado:** Oba primeiro e Mambo como fallback regional; ambos passaram em
  19/07 por catálogo, disponibilidade regional, carrinho anônimo e simulação pública de frete/prazo
  no CEP `01310-100`, com limpeza posterior. Savegnago vem depois; Pão de Açúcar exige cautela por
  gestão de bots. Nenhum deles tem login, checkout financeiro ou autorização comercial homologados.
- **Mercado Pago:** cobrança do cliente.
- **Pagar.me + Meta One-Click:** código pronto, flag desligada; depende da habilitação
  externa e de validação sandbox.
- **Browserbase:** navegação persistente e auditável, mas a viabilidade é específica por varejista;
  foi validado na Petz e bloqueado pelo Carrefour na autenticação em 19/07.
  Falhas de credencial, indisponibilidade e sessão expirada devem ser classificadas de forma
  explícita e falhar fechadas; não transformá-las em tentativa de checkout.
- **Uber Direct:** opcional para parceiro que autorize courier.

## Mapa rápido do código

- conversa e orquestração: `src/lib/delivery-service.ts`;
- intenções: `src/lib/lia-intents.ts`;
- copy: `src/lib/lia-copy.ts`;
- conectores de lojas: `src/lib/stores/`;
- busca Browserbase: `src/lib/stores/browserbase-live-search.ts`;
- compra e política: `src/lib/purchasing/`;
- workflow durável: `src/workflows/purchase-order.ts`;
- pagamentos: `src/lib/payments/`;
- guia de ativação One-Click: `docs/whatsapp-one-click-pagarme.md`;
- webhook WhatsApp: `src/app/api/whatsapp/webhook/route.ts`;
- operação: `src/app/ops/` e `src/app/api/ops/`;
- convenções de estado/entrega/estorno: `src/lib/order-flags.ts`;
- runbook do piloto: `docs/operacao-piloto-needs-human-estorno.md`;
- schema: `prisma/schema.prisma`;
- testes: `tests/`.

## Validação ao vivo — 15/08/2026

Uma nova rodada de 10 cenários foi executada no WhatsApp contra a versão já publicada,
sem alteração de código e sem cobrança. Passaram de forma clara a adição relativa pelo
SKU, a preservação da cesta e o cancelamento antes do pagamento. Permaneceram observados
em produção: cabo de 2 m retornando carregador de parede; fillers como “pensando bem” e
“chega amanhã” virando linhas indisponíveis; “sem remédio” sendo confundido com remoção;
cards acima de teto explícito; e CEP embutido na frase de troca de endereço sendo pedido
novamente. O relatório detalhado está em
[docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md). Isso é evidência
de comportamento ao vivo, não registro de conserto ou de novo deploy.

### Perfil público do WhatsApp — 15/08/2026

No WhatsApp Manager da conta conectada `+55 11 97844-4813`, foi solicitada a troca do nome
visível de `Lia Delivery by 67.742.955 Joseph Carlos Dayan` para **Lia Delivery**. O painel
marcou o número como **In Review**. Até a aprovação da Meta, o CNPJ e o nome anterior ainda
podem aparecer no WhatsApp; não há nova ação de código ou de pagamento associada.

### Validação independente — 15/08/2026

Outra rodada de 10 cenários foi executada sem alteração de código. Passaram a troca
“granola → aveia”, “sem remédio” com shampoo, presente dentro de R$100 e 4x → 7x → 5x
do mesmo bombom. Ainda foram observados fillers/contexto (“Para domingo”, “Para uma
viagem”), preço (“barato”), combinação de itens na mesma mensagem, e perda da cesta
depois de salvar um novo endereço. O detalhe está no relatório de testes; isto é validação
ao vivo, não conserto nem novo deploy.

## Regras para continuar o trabalho

- Preserve mudanças existentes: o worktree pode estar sujo e contém trabalho do usuário.
- Não trate documentação histórica como verdade operacional quando conflitar com este
  arquivo.
- **Ao encerrar toda conversa com avanço, decisão, descoberta, bloqueio ou validação
  relevante, atualize automaticamente os Markdown canônicos — mesmo sem pedido explícito.**
  No mínimo revise `AGENTS.md`, `STATUS.md`, `PENDENCIAS.md` e o documento operacional
  datado; registre com clareza o que foi implementado, validado, somente pesquisado e o
  que ainda depende de ação externa.
- Ao mudar uma decisão de produto, atualize primeiro este arquivo, depois `STATUS.md` e o
  documento datado correspondente.
- Ao concluir, criar ou repriorizar trabalho, atualize `PENDENCIAS.md` no mesmo momento.
- Diferencie sempre: implementado, validado ao vivo, implantado, pendente e hipótese.
- Não declare “pronto para lançamento” enquanto qualquer bloqueio acima estiver aberto.
