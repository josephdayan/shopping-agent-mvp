# Lia — Status do Projeto

> Memória canônica para agentes: [AGENTS.md](AGENTS.md). Progresso e próximos passos:
> [PENDENCIAS.md](PENDENCIAS.md). Leia ambos antes de interpretar este status ou tomar
> decisões de produto.

_Última atualização: 2026-08-04. Doc de leitura rápida do estado atual. O histórico de
decisões ("por que esse modelo") está no [CLAUDE.md](CLAUDE.md); os ciclos recentes estão
em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md) e
[docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md). A revisão operacional
de hoje está em
[docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md)._

---

> **Remodelagem 2026-07-20 — concierge manual (fluxo ativo).** O produto passou a ser um
> concierge de WhatsApp com **largura** (pede qualquer coisa, de qualquer lugar), **cotação e
> compra manuais pelo operador** e **entrega na hora por motoboy que sai da base do operador**.
> A automação de checkout (Browserbase) saiu do caminho crítico (`LIA_MANUAL_CONCIERGE=true`,
> default). Ao fechar a lista, cria-se `awaiting_operator_quote`; o operador cota no `/ops` e o
> pedido reaproveita `awaiting_quote_confirmation` + a máquina de pagamento existente. Detalhes
> e racional em [AGENTS.md](AGENTS.md) (topo) e no registro datado. A seção abaixo descreve o
> fluxo legado de automação, mantido atrás da flag e ainda usado como referência/testes.

> **Estado em 21/07.** O fluxo concierge passou por uma demonstração local mockada completa:
> cotação manual de R$100, Pix confirmado, compra, despacho Uber Direct a partir da base do
> operador e entrega — incluindo as mensagens ao cliente; não houve cobrança real. Os commits
> `bb48c2e`, `ededf6a` e `7ab8453` estão verdes, mas o concierge ainda não foi implantado porque
> o deploy arrastaria uma migration Oba inacabada de outro trabalho. A decisão é contratar um
> operador. A fila de Production contém 19 pedidos técnicos e só pode ser limpa com aprovação
> explícita.

> **Atualização 02/08.** A Lia opera **somente no estado de São Paulo**. No concierge, o código
> rejeita qualquer UF fora de SP (e usa o prefixo do CEP como fallback quando o ViaCEP cai),
> independentemente dos overrides legados de cobertura. O deploy final de código foi publicado no
> commit `a700290` como `dpl_5kTpBbsitN6BgP5vcQrDh22AfqP4` (`Ready`), reassumindo `liadelivery.com.br`. As flags
> `LIA_MANUAL_CONCIERGE=true` e `LIA_REQUIRE_REAL_COURIER_DISPATCH=true` estão explícitas em
> Production. O código impede despacho mockado quando o provider é Meta e exige endereço + CEP
> reais da base do operador. A base foi configurada como Sensitive em Production; `PURCHASE_AUTOMATION_MODE=cart_only`
> e a compra automática desligada estão ativas. A primeira validação com pedidos reais não é
> pendência de desenvolvimento: fica a critério do operador depois que os gates abaixo estiverem
> concluídos.

> **Reconciliação de código.** O snapshot publicado foi consolidado no commit `a700290`; `main`
> local foi avançada por fast-forward até ele e o worktree está limpo. O push de `main` para o
> GitHub ainda não foi feito.

> **02/08 — 2ª rodada (decisões do dono + verificação).** O piloto será operado pelo próprio
> dono (sem contratar operador). Rotina fiscal decidida e documentada em
> [docs/rotina-fiscal-mei.md](docs/rotina-fiscal-mei.md). Rotação das credenciais expostas
> abandonada como gate de piloto (risco aceito). Conta Mercado Pago: conferir no painel se já
> é PJ (o dono acredita que sim; API local sem escopo para confirmar). Verificação técnica:
> suíte **213/213 verde com banco**, `tsc` limpo, produção `READY` no commit `a700290`,
> landing/`/ops`/webhook OK. Vitrine em runtime: **7.652 produtos em 11 lojas** — Carrefour
> 1.045, Petz 2.812, Boticário 1.380, Ri Happy 1.196, Swift 925, Kopenhagen 248, Kalunga 15,
> Droga Raia 13, Cacau Show 12, Decathlon 4 (filtro de imagem corta 13 dos 17), Oba 2
> (busca ao vivo em prod). Lacunas de demanda mapeadas (e-commerce/delivery BR): farmácia
> não-remédio (Droga Raia só 13 itens de seed), bebidas/adega dedicada, flores/presentes,
> eletrônicos/acessórios, moda básica e hortifruti fresco (Oba ao vivo cobre em tese). No
> concierge nada disso bloqueia pedido — item fora de vitrine vira linha livre que o operador
> cota; as lacunas afetam só a vitrine com foto.

> **02/08 — vitrine ampliada para 18 lojas / 17.264 itens.** As lacunas acima foram fechadas
> por decisão do dono. Novas: **Drogaria São Paulo (4.675)** e **Pague Menos (1.540)** para
> farmácia sem remédio, **Natural da Terra (1.000)** para hortifruti, **Cobasi (998)** como
> redundância de pet, **Divvino (998)** e **Imigrantes Bebidas (406)** para bebidas, e
> **Giuliana Flores (204)** para flores/presente. Dados reais, CDNs testados como hotlinkáveis.
> Nas farmácias a regra ANVISA virou **tripla guarda**: allowlist de categoria + deny-regex na
> colheita e `withoutMedicine` em runtime (`src/lib/stores/anvisa.ts`). A terceira foi
> necessária — a loja classifica medicamento dentro de categorias cosméticas (cetoconazol,
> metronidazol, ciclopirox passaram pelas duas primeiras). 18 itens removidos; regra travada em
> `tests/anvisa-pharmacy.test.ts`. A mesma auditoria pegou o lado pet: Cobasi (65 medicamentos
> veterinários + 56 dietas de prescrição) e Petz (58 itens da linha "Nutrição Clínica") agora
> passam por `withoutVeterinaryMedicine` — inclusive a busca ao vivo da Petz. Roteamento ganhou
> dicas de bebida e flor.
> **Leroy Merlin não entrou**: bloqueia fetch (403) e a listagem não expõe imagem sem uma visita
> por produto. Detalhes em [AGENTS.md](AGENTS.md) e [README das vitrines](src/lib/stores/README.md).

> **03/08 — Browserbase removido; catálogo com rotina mensal.** O navegador remoto saiu do
> produto inteiro: busca ao vivo, os 3 compradores automatizados, o lease de Context, o
> workflow de compra, as rotas de preflight/sessão viva do `/ops`, o cron de prewarm e as
> dependências `@browserbasehq/sdk`/`playwright-core`. Tudo isso já era código morto (atrás de
> `manualConciergeEnabled()` e de `PURCHASE_AUTOMATION_ENABLED=false`). A **Oba** deixou de
> depender dele: a API pública dela responde direto e virou catálogo de **1.494 itens**.
> Preço agora se atualiza por rotina mensal — `npm run catalog:refresh` (`--dry` simula),
> que recolhe as 10 lojas com API/SSR aberta e resume o que mudou. Suíte **210/210 verde**,
> `tsc`, lint e build limpos. Detalhes em [AGENTS.md](AGENTS.md).

> **03/08 — PUBLICADO.** Os 27 commits locais foram enviados ao GitHub e o deploy
> `dpl_BKzUbC4brKprMqrdMYJQ7QDnt5Kr` (commit `cf131f5`) ficou `READY` em Production.
> Smoke verificado: landing 200, `/ops` 200, webhook 403 (assinatura exigida) e as rotas
> Browserbase removidas respondendo 404 (`/api/cron/prewarm-search`,
> `/api/ops/internal-preflight`, `/api/ops/live-retailer-session`) — prova de que o código
> novo está no ar. Produção agora tem: 18 lojas (~17,4 mil itens), guardas ANVISA/MAPA em
> runtime, Oba com catálogo de 1.494 itens e zero Browserbase. O piloto pode começar.

> **03/08 — vitrine híbrida ligada.** A Lia deixou de só anotar: agora procura o pedido nas
> 18 lojas e mostra até 3 opções com foto para o cliente escolher; o que não tem match vira
> linha livre e o operador garimpa — a largura continua intacta. Três regras novas travam a
> qualidade: (1) **piso de relevância próprio do concierge** (`conciergeMatchIsStrong`) — no
> concierge um palpite errado é pior que nenhum, porque a linha livre resolve de verdade; o
> caso real que motivou foi "conserto de torneira" casando com "Espumante Concerto"; (2)
> **escolher não fecha a lista** — o cliente segue somando e só fecha com "só isso"; (3)
> **fechar com escolha pendente não descarta o item** — ele vira linha livre. Suíte 220
> testes (219 verdes; 1 flake de conexão do Postgres que passa isolado), `tsc`, lint e build
> limpos.

> **03/08 — One-Click reativado por decisão do dono.** O cartão nativo no WhatsApp (Meta
> Cloud API direta + Pagar.me) deixa de ser "adiado": a ativação começou. Código e migrations
> já estão em produção. Em 03/08 a Infobip NEGOU a habilitação; em 04/08 o pedido foi aberto
> diretamente no Suporte da Meta, protocolo `37565409896407734`, status **Open**, categoria
> **Dev: Cloud API / Messages API and Webhook**. A Payments API BR segue em beta fechado e as
> habilitações documentadas passam por BSPs; o chamado não garante aprovação nem prazo. Plano B:
> Checkout Pro até a disponibilidade geral. A dúvida técnica do Pagar.me foi
> resolvida por documentação: `recurrence_cycle` é só de recorrência externa; o adaptador
> atual está correto e nenhum e-mail ao PSP é necessário. O piloto não espera:
> Pix + Checkout Pro cobrem cartão até lá. Plano completo e divisão do trabalho em
> [PENDENCIAS.md](PENDENCIAS.md) (seção One-Click) e [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).

## 1. O que é a Lia

**Concierge de compras do dia a dia no WhatsApp.** O cliente pede itens em linguagem natural;
um operador cota e compra o que for necessário, e a Lia só cobra por **Pix ou cartão** após a
aprovação do cliente. Pix e Checkout Pro usam Mercado Pago; o cartão nativo no WhatsApp,
quando habilitado, usa Meta Cloud API direta + Pagar.me. Na modalidade rápida, o motoboy retira
o pacote **na base do operador**; a entrega do varejista continua alternativa.

“Entrega hoje” no concierge é uma modalidade separada: só pode ser oferecida quando o operador
consegue comprar e entregar o pacote à sua própria base antes de despachar o courier. A alternativa
é a promessa same-day do próprio varejista. `Clique-e-retire + motoboy aleatório` continua fora do
modelo: o courier não retira no balcão da loja.

- **Receita:** markup de **10%** embutido no preço (produto e frete são pass-through).
- **Sem remédio** (ANVISA). **Fontes ativas:** Oba Hortifruti (mercado/essenciais), Petz e O
  Boticário. Carrefour foi removido do produto ativo após o bloqueio da sessão remota; Mambo
  ficou apenas como candidato pesquisado. O primeiro preflight ao vivo deve ser Oba ou Petz.
- **Moat:** a **largura** — "qualquer coisa, de qualquer loja, num WhatsApp só".

---

## 2. O fluxo (e o que é automático vs. manual)

```
1. 💬 Cliente manda no WhatsApp o que quer e o endereço.
2. 🤖 Lia preserva qualquer item pedido — inclusive fora de catálogo — e fecha a lista.
3. 👤 Operador recebe o pedido em `awaiting_operator_quote`, pesquisa, compra/cota itens,
   frete, modalidade e prazo no `/ops`.
4. 🤖 Cliente aprova a cotação e escolhe Pix ou cartão; só então a Lia gera a cobrança.
5. 👤 Pagamento confirmado → operador compra os itens.
6. 🛵 Com as compras na base, o operador despacha o motoboy; alternativamente acompanha a
   entrega do varejista.
7. 🤖 Lia comunica o status até a entrega.
```

**Dinheiro:** cliente paga tudo (produtos +10% + frete) no Pix → cai na sua conta MP →
você paga o varejista desse saldo → **sobra a margem de 10%**. Courier só entra e é pago
quando existir uma rota urgente formalmente compatível.

---

## 3. O que está PRONTO e REAL ✅

| Componente | Status |
|---|---|
| **Oba — mercado/essenciais** | ✅ Cotação Browserbase validada em Production em 19/07, ainda em `cart_only`: catálogo VTEX por SKU/vendedor, sacola isolada, simulação por CEP e estoque/frete/prazo obrigatórios. O job técnico chegou a `cart_ready` com arroz Camil 1 kg (R$ 5,99), frete R$ 9,90 e janela de entrega do varejista no CEP público `01310-100` (total R$ 15,89). A chave Browserbase e `OBA_BROWSER_CONTEXT_ID` são Sensitive; migration de defaults Oba aplicada e conferida. No fluxo ativo, a vitrine é referência e a cotação final é manual. |
| **Busca Petz** | 🟡 busca ao vivo + cache de 15 min. O preflight novo de 20/07 confirmou SKU/preço/subtotal, alcançou `/checkout/cart/<id>`, mas não recebeu frete/prazo ou controles de entrega no Context; falhou fechada em `needs_human`. O `/ops` agora abre uma sessão viva isolada, sem sacola/pagamento, para o operador selecionar entrega no endereço na Petz; depois disso, o preflight deve ser repetido. |
| **Busca Boticário** | 🟡 busca ao vivo + cache de 15 min; SKU, preço e URL reais. O novo preflight de 20/07 confirmou novamente SKU B88468, quantidade e subtotal de R$ 16,90, mas não recebeu prazo domiciliar. O link “Entrega Rápida” é informativo e o `postalCode` permanece bloqueado pelo varejista. O parser rejeita promoção de frete grátis e retirada como cotação. Permanece `needs_human`, sem cobrança ou compra. |
| **Multi-loja + roteamento** | ✅ Oba + Petz + Boticário; **1 loja por pedido**, escolhida por match. |
| **Pix (Mercado Pago)** | ✅ **REAL, testado com pagamento de verdade** — conta PJ confirmada pelo dono no painel para a aplicação `LIA - APP` em Produção; variáveis de acesso e webhook presentes na Vercel Production. |
| **Cartão (Checkout Pro)** | ✅ link hospedado no MP com taxa repassada; mesmo webhook do Pix |
| **Cartão One-Click (Meta + Pagar.me)** | 🟡 código concluído, flag desligada; primeira compra tokeniza no Pagar.me, recompra usa `order_details` nativo. Migrations aplicadas. Ticket Meta `37565409896407734` aberto em 04/08 e aguardando resposta; ainda faltam habilitação/allowlist, configuração Pagar.me e sandbox. A documentação confirma que `recurrence_cycle` é de recorrência externa e não se aplica à recompra avulsa da Lia; o payload atual usa corretamente `card_id` sem o campo. Não usa 360dialog. |
| **Qualificação externa de WhatsApp Payments** | 🟡 A rota Infobip foi encerrada após a negativa de 03/08. O canal vigente é o Suporte Direto da Meta: ticket `37565409896407734` aberto em 04/08 e aguardando resposta. Isso não é aprovação nem prazo; não migrar/compartilhar sender nem alterar WABA, número, Graph API ou webhook. |
| **Comandos de conversa** | ✅ status, "paguei" (verificado no MP em prod), limpar/cancelar antes do pagamento, trocar endereço, "tira X", "troca X por Y", repete o de sempre, ajuda |
| **Conversa / NLU** | ✅ reconstruída após review: onboarding preserva o pedido até o CEP, perguntas não viram item, total parcial, encerramento de lista, atendimento/reclamação, cancelamento e pagamento são contextuais |
| **Escolha de opções** | ✅ número, ordinal, preço, recomendação, marca/nome, refinamento e estreitamento de opções; "coca" entre duas Cocas não vira item novo |
| **Matcher dos catálogos** | ✅ piso de relevância + guardas de negação, produto humano/pet, espécie, tamanho e variante; básico/adulto/seco primeiro quando não há preferência explícita |
| **Testes de compra e conversa** | ✅ Em 19/07, TypeScript, lint, build e 204 testes passaram (162 aprovados; 42 integrações de banco puladas por indisponibilidade do Postgres remoto). Checkout ao vivo continua um gate separado. |
| **Cotação antes de cobrar** | 🟡 Implementada genericamente para Oba, Petz e Boticário: só libera pagamento depois de itens, total, frete e prazo. Oba e Boticário ainda precisam de preflight Browserbase ao vivo; Petz precisa validar o fluxo genérico atual. Compra final permanece bloqueada em `cart_only`. |
| **Motoboy (Uber Direct)** | ⚠️ OAuth + cotação funcionam, mas não autorizam retirada em varejistas de consumidor. Só usar com parceiro compatível. |
| **Cobertura** | ✅ O concierge aceita somente o estado de SP, com bloqueio rígido de UF/CEP. Dentro de SP, o checkout do varejista ou a cotação manual confirma se o endereço, frete e prazo são viáveis. A guarda de 12 km é apenas legado do fluxo antigo. |
| **Lojas (107 unidades geocodadas)** | ✅ dado útil para parceiros/same-day; proximidade não prova estoque, entrega ou prazo do varejista. |
| **Landing + domínio** | ✅ **liadelivery.com.br no ar** (HTTPS) — site novo (pôster Petróleo), domínio **verificado na Meta** |
| **Meta / WhatsApp oficial** | ✅ número aprovado, Cloud API ativa em produção e webhook assinado validado |
| **Opções pra escolher** | ✅ até 3 cards com foto + botão **Escolher este** na Meta; lista numerada como fallback |
| **Pedido mínimo** | ✅ por loja; avisa o cliente p/ completar. |
| **Painel do operador `/ops`** | ✅ publicado: cota qualquer lista, reaproveita pagamento e tem o botão único **“Comprei — despachar motoboy”**. O despacho real exige `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP`. |
| **Acesso ao `/ops`** | ✅ `OPS_TOKEN` dedicado, Sensitive em Production e Preview, criado e implantado em 16/07; não substitui `API_TOKEN` e não foi exposto. |
| **Onboarding de endereço** | 🟡 o endereço completo é pedido e persistido uma vez no fluxo e está coberto pelos evals; falta validar o resumo/cotação em checkout real. |
| **Markup 10%** | ✅ embutido no preço (sem linha de "taxa") |
| **Privacidade da loja** | ✅ a Lia não precisa expor o varejista ao cliente ("Procurando…"). |
| **Canal** | ✅ Meta Cloud API em produção; Twilio Sandbox é legado de teste. |
| **MEI (PJ/CNPJ) + e-mail** | ✅ MEI confirmado; não exige contador fixo. Manter relatório mensal/DASN e documentar a rotina fiscal da Lia. `contato@liadelivery.com.br` configurado no ImprovMX |

**Atualização operacional (02/08):** o `/ops` agora trata despacho repetido como operação
idempotente (não cria um segundo courier), registra eventos seguros de compra/despacho/entrega
e permite registrar o valor e a referência de estorno integral ou parcial antes de avisar o
cliente. A validação com pedidos reais continua separada e opcional.

---

## 4. O que FALTA para aceitar pedidos pagos (por prioridade)

O limite geográfico já está resolvido: o concierge opera somente no estado de São Paulo.
O código, o deploy e a proteção de compra estão prontos; a lista abaixo reúne apenas
configuração e decisões humanas que ainda impedem dinheiro real. A validação de pedidos fica
para quando o operador decidir, depois desses gates.

### 🔴 O que destrava o produto
- **Base para motoboy na hora:** `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` já
  estão configurados como Sensitive em Production. A entrega do próprio varejista pode ser
  usada quando o checkout confirmar essa modalidade.
- **Operação humana:** contratar o operador e usar [o runbook](docs/operador-runbook.md).
- **Fila técnica:** 12 preflights internos sem pagamento foram removidos com autorização. Restam
  7 pedidos `paid` antigos, preservados para conciliação ou estorno; não são lixo descartável.
- **Histórico do fluxo legado (19/07):** o Context persistente, a configuração e o preflight técnico do
  Oba já foram validados em Production em `cart_only`. Petz e Boticário chegaram a carrinhos reais,
  mas ambos falharam fechados antes de preço de entrega/prazo: Petz não expôs os campos na sacola
  completa; Boticário não liberou a confirmação de CEP. Resolver esses gates antes de repetir os
  preflights e obter a validação comercial/termos. Nenhuma etapa cobra ou compra.
- **Sessão de entrega Petz (20/07):** publicada e aberta pelo `/ops` para a seleção manual de
  entrega no endereço dentro da Petz. Ela abre já na página inicial da loja, sem carrinho,
  pagamento ou interação automática, e fica aberta por até uma hora. Não é validação de cotação: o próximo passo técnico é um
  novo preflight, após o varejista expor frete e prazo reais. O visualizador Browserbase embutido
  no Codex não se mostrou estável para o operador, então a sessão viva foi aberta no Safari.
  Após encerrar a sessão pelo `/ops` para persistir a ação manual, um retry fresco ainda chegou
  somente a `/checkout/cart/<id>` com SKU R$ 15,99; a etapa de entrega não apareceu. Permanece
  `needs_human`, sem evidência de frete/prazo e sem cobrança ou compra.
- **Handoff Carrefour rejeitado:** o cliente não receberá links para terminar a compra. A experiência
  deve continuar integralmente na Lia. Para testes internos, resta operação humana invisível no
  navegador comum; para um piloto operacional sem checkout web, avaliar shopper próprio em loja.
  Nenhum desses caminhos é tratado como automação escalável.
- **Carrefour de longo prazo:** negociar integração homologada de catálogo/cotação/pedido com o
  varejista ou um app de delivery parceiro. Marketplace Seller e APIs públicas do iFood são fluxos
  do lado da loja, não APIs para criar uma compra de consumidor.
- **Supply ativo:** Oba é a fonte de mercado/essenciais; Petz e Boticário completam pet e beleza.
  Mambo não integra o produto. Oba passou no teste público e no preflight Browserbase em
  Production, com carrinho, estoque, total, frete e janela reais antes da cobrança. Boticário
  passou a extrair frete e promessa, mas precisa validar ao vivo.
- **Próximos candidatos (pesquisa, não validação):** Pão de Açúcar é a primeira substituição para
  mercado em São Paulo; sua documentação oficial descreve seleção de entrega e frete/prazo por
  CEP. Cobasi é a primeira substituição para pet; a política oficial exige calcular frete/prazo
  no carrinho e oferece entrega própria. Savegnago é adequado apenas onde sua rede atende no
  interior paulista. Nenhum dos três novos candidatos está integrado ou aprovado.
- **Cobasi — pet (smoke ao vivo):** ✅ em 20/07, navegação anônima com CEP público `01310-100`
  adicionou produto real à sacola e o checkout mostrou Cobasi Já, Econômica, frete, prazo e total
  antes de pagamento; ao continuar, chegou ao login. O carrinho técnico foi limpo. **Leroy Merlin
  — casa/manutenção (smoke ao vivo):** ✅ produto vendido e entregue pela Leroy, CEP público,
  entrega domiciliar, frete, prazo e total reais; ao continuar, chegou ao login e a sacola foi
  esvaziada. Para Leroy, um futuro conector deve aceitar exclusivamente itens vendidos e entregues
  pela própria loja. 🟡 Nenhuma das duas tem conector, Context Browserbase, preflight de produção
  ou validação comercial. **Sephora:** chegou a produto/CEP, mas a sessão ficou instável antes da
  sacola; não é candidata. **Pão de Açúcar:** a rota pública foi bloqueada por `az-request-verify`
  antes de produto/CEP; não é candidato automatizável agora.
- **Titularidade e pós-venda:** ✅ decisão tomada: a operação financeira e a titularidade
  operacional são da PJ; antes do pagamento o cliente pode limpar a lista; depois do pagamento
  não há cancelamento iniciado pelo cliente nem substituição; item faltante gera estorno do
  próprio item; atraso é comunicado. A execução de estorno parcial ainda é manual e precisa de
  referência do provedor.
- **Fiscal:** 🟡 a empresa é MEI e não precisa de contador fixo. Para a rotina da Lia, PF é
  dispensado de NF salvo solicitação; PJ exige documento fiscal. Falta apenas documentar se o
  fluxo de mercadoria/serviço usa NF-e, NFS-e ou outro documento.
- **Pilotar entrega direta** com 5–10 pedidos controlados, sem prometer motoboy.
- **Testar checkout e cartão salvo** em `cart_only`, incluindo CVV, 3DS, CAPTCHA e antifraude.
- **Validar a revisão do `/ops`** para frete/prazo/rastreio do varejista e estorno auditável.
  A revisão está implantada; falta massa técnica nova. A orquestração de cotação antes da
  cobrança precisa ser levada para Petz antes do piloto.
- **Antes de habilitar One-Click:** confirmar as migrations de pagamento aplicadas, obter a
  allowlist Payments API BR da Meta, liberar domínio/configurar webhook no Pagar.me e rodar testes
  sandbox de primeira compra, recompra, recusa e resposta perdida. Guia:
  [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).
- **Acompanhar a habilitação na Meta:** aguardar a resposta do ticket `37565409896407734` e
  manter a flag desligada até a allowlist ser comprovada. A rota Infobip foi encerrada.
- **Validar o payload Pagar.me no sandbox:** manter `card_id` sem `recurrence_cycle`, pois o
  campo é de recorrência externa; testar CVV/3DS, antifraude, recusa e reconciliação antes da
  ativação real.

### 🟡 Pra operar de verdade
- **WhatsApp oficial da Meta**: ✅ o número `+55 11 97844-4813` foi aprovado como
  `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e ativado em
  produção (`WHATSAPP_PROVIDER=meta`). O webhook assinado foi validado em produção.
- **Mercado Pago PJ + nota fiscal** (hoje o Pix está no nome pessoal).
- **Confirmar cobertura real de entrega** por CEP em Oba, Petz e Boticário. Unidade
  próxima não prova estoque, frete ou prazo.

### 🟢 Pra escalar (pós-piloto)
- **Mais lojas** (a largura = moat): **Cobasi** (mesma receita, já confirmado raspável),
  **farmácia não-remédio**, **beleza** (Boticário/Sephora).
- **Fortalecer busca/cotação ao vivo:** Browserbase + cache já existem; falta medir p95,
  concorrência por Context, falhas de anti-bot e custo por pedido. O checkout continua sendo
  a fonte final de preço, estoque, frete e prazo.
- **Cesta multi-loja** (juntar Oba + Petz num pedido) — decidimos deixar pra depois
  (= 2 compras, fretes, entregas e pós-vendas).
- **Expandir catálogos** e medir cobertura dos três varejistas periodicamente.
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
4. 📦 **Preço/estoque desatualizados.** Mitigação: cotação e revalidação no checkout do
   varejista antes de cobrar/aprovar; sem link de handoff ao cliente.
5. 🛵 **Same-day:** não prometer retirada por courier sem parceiro que a autorize.

---

## 6. Como operar / testar

**Cliente (pelo celular):** manda no WhatsApp da Lia → `oi` → CEP → itens → escolhe opções
→ `pagar` → paga o Pix. Recebe "Pagamento confirmado ✅".

**Operador:** abre `liadelivery.com.br/ops?key=<OPS_TOKEN>` → vê o pedido
pago → confere o carrinho/sessão → aprova a compra com entrega direta → registra o número
do pedido e acompanha preparação, rastreio e entrega do varejista. Cancelamento pago entra
em `refund_pending`; a confirmação só é enviada depois de registrar a referência real do
provedor. Runbook: [docs/operacao-piloto-needs-human-estorno.md](docs/operacao-piloto-needs-human-estorno.md).
O card também permite **avisar o cliente** (item faltante/estorno ou atraso, vira mensagem da
Lia). Substituições não fazem parte da operação atual; o pedido pago não oferece cancelamento
ao cliente.

**Motoboy:** não faz parte do fluxo padrão. Varejistas de consumidor podem exigir documentação do titular
para retirada por terceiro; não enviar documentos pessoais a entregadores on-demand.

---

## 7. Credenciais / ambiente (Vercel)

| Configurado ✅ | Pendente / opcional |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` + webhook | `MERCADO_PAGO_WEBHOOK_SECRET` (assinatura é só aviso) |
| `BROWSERBASE_API_KEY` + Contexts dos varejistas | `OBA_BROWSER_CONTEXT_ID`, `LIA_OBA_MIN_ORDER`, `LIA_PETZ_MIN_ORDER`, `LIA_BOTICARIO_MIN_ORDER` |
| `UBER_DIRECT_CUSTOMER_ID/CLIENT_ID/CLIENT_SECRET` (opcional/parceiros) | Política e credenciais de rastreio dos varejistas |
| `OPENAI_API_KEY`, `DATABASE_URL`, `API_TOKEN`, `OPS_TOKEN`, Meta Cloud API | Scraper pago (estoque ao vivo) — futuro |
| `LIA_COVERAGE_PRESET=estado-sp` (SP inteiro) | `LIA_MAX_DELIVERY_KM` (12), `LIA_MAX_DELIVERY_FEE` (35) — ajuste da guarda |

> 🔒 Recomendado: **regenerar** o Access Token do MP e o Client Secret da Uber (passaram no
> chat) e atualizar no Vercel depois dos testes. Em 15/07, credenciais Browserbase/Vercel
> também apareceram em saída de diagnóstico. O token OIDC local da Vercel foi renovado em
> 15/07; a chave Browserbase ainda precisa ser regenerada e atualizada nos ambientes antes
> do piloto. Em 15/07 foi aberta uma sessão persistente do Context Carrefour, sem itens ou
> cobrança, aguardando reautenticação manual por senha/OTP/CAPTCHA. Uma chave de reposição
> foi enviada por chat e, portanto, também deve ser descartada e regenerada antes do uso,
> mesmo com autorização posterior para instalá-la. A variável atual de produção não autenticou
> no Browserbase em 15/07 (`401` por chave ausente); configurar a nova chave na Vercel e
> implantar é pré-requisito para retestar. A URL correta de Environment Variables foi aberta
> no navegador embutido em 15/07, mas a Vercel pediu login manual antes da edição. Após o
> operador tentar salvar apenas em Production, uma leitura nova por `vercel env pull` ainda
> encontrou `BROWSERBASE_API_KEY` sem valor; confirmar o salvamento efetivo no painel antes
> de disparar outro deploy. A tela posterior mostrou valor `sk_live_` no campo, prefixo que
> não pertence ao Browserbase; substituir por uma nova chave `bb_live_` e marcar Sensitive
> antes de implantar. Uma segunda leitura do Production depois da alegada correção ainda não
> recebeu a variável, portanto o deploy e o reteste Carrefour continuam bloqueados. Depois,
> o painel confirmou a variável como Sensitive, em Production e atualizada; o deploy de
> produção subsequente ficou Ready em 15/07. A CLI local não baixa esse segredo Sensitive,
> portanto a autenticação será confirmada pelo fluxo implantado após a reautenticação manual
> do Context Carrefour, que foi reaberto sem itens, checkout ou cobrança.
> O operador informou que a reautenticação foi concluída na tela em 15/07; ainda falta
> escolher endereço salvo e item de teste para executar o preflight de carrinho, frete e
> prazo. Nenhum pagamento ou compra foi iniciado.
> Em 16/07, credenciais Carrefour foram expostas no chat. Os valores não foram persistidos
> nem registrados no projeto; a senha deve ser rotacionada antes do piloto. O inspetor
> remoto não expôs campos seguros para automação, portanto uma sessão nova ficou aberta
> para autenticação humana.

Em 15/07, o hash de aprovação do carrinho passou a incluir frete e promessa de entrega,
além de itens e total. Falhas Browserbase 401/503, sessão Carrefour expirada e página de
varejista indisponível passaram a ser classificadas explicitamente e testadas sem abrir
checkout; `cart_only` também é testado como bloqueio anterior ao acesso ao Browserbase.

O estado de Meta, domínio, e-mail, cobrança, motoboy, painel e checklist do piloto está
centralizado em [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md).

Em 16/07, a autenticação do `/ops` foi recuperada criando `OPS_TOKEN` separado e Sensitive
em Production/Preview, seguido de redeploy que ficou `Ready`. A abertura do painel confirmou
que há pedidos legados pagos e alguns cancelados; eles não são massa segura para este teste.
Foi então criado um pedido interno isolado, em `cart_only`, com SKU Carrefour exato e CEP
público de teste `01310-100` (sem endereço pessoal). O mapeamento no navegador comum confirmou
que a UI atual submete o CEP pelo botão do formulário e só expõe frete/prazo no carrinho
completo: item R$ 1,99, frete a partir de R$ 9,90, prazo a partir de sábado e total R$ 11,89.
O conector, parsers, limpeza segura, diagnóstico e página `/ops/teste-carrefour` foram
implantados. Os retries do workflow removeram bloqueios intermediários e chegaram ao bloqueio
real `LOGIN_REQUIRED` no Context persistente; uma sessão viva foi aberta para login humano.
Esses valores mapeiam a tela, mas ainda não são uma cotação Browserbase validada. Não houve
WhatsApp, cobrança ou compra.

Na continuação de 16/07, o painel Browserbase autenticado foi confirmado e outra sessão
Carrefour foi aberta para login humano. A reautenticação não foi concluída, sem causa confirmada,
e o operador decidiu repetir em outro momento. Não abrir novas sessões ou repetir o preflight
até a próxima tentativa coordenada.

Também em 16/07, foi confirmada e coberta por testes a serialização já aplicada por Context
Browserbase: um lease persistente impede que dois workers usem o mesmo carrinho, conflitos entram
em `preflight_queued` com retry de um minuto, e um lease abandonado só é recuperado após 15
minutos. Falhas de banco/configuração não são classificadas como carrinho ocupado. Essa alteração
foi somente local; não abriu sessão, checkout, cobrança ou compra.

Ainda em 16/07, o ciclo operacional de entrega direta foi implementado localmente sem migration:
pedidos novos passam por `retailer_preparing` e `retailer_out_for_delivery`, enquanto os estados
de retirada/courier ficaram restritos a parceiros formalmente autorizados. O backend bloqueia
despacho externo para `retailer_delivery`; o `/ops` mostra promessa e rastreio do varejista. O
cancelamento de pedido pago não afirma mais que o estorno ocorreu: cria `refund_pending`, exige
referência do provedor e só então muda para `refunded` e avisa o cliente. Foi criado o runbook de
`needs_human` e estorno. Um PIN de registro encontrado em Markdown local foi removido e precisa
ser rotacionado. TypeScript, lint, 210 testes (168 passaram, 42 foram pulados por dependência de
banco) e build passaram. Nada foi implantado ou validado ao vivo nesta alteração.

Em 18/07, a chave Browserbase exposta foi regenerada no painel oficial e atualizada como
`BROWSERBASE_API_KEY` Sensitive em Production. Um valor intermediário que foi exibido durante a
rotação foi considerado exposto, invalidado imediatamente e substituído por uma chave limpa; nenhum
valor foi salvo no repositório ou nesta documentação. O redeploy de produção da versão
`ops-direct-retailer-delivery` / `9a06eab` ficou `Ready`. Isso valida a rotação e a configuração
implantada, mas não a autenticação Browserbase no runtime nem o checkout Carrefour: não houve
preflight, sessão nova, cobrança ou compra. A senha Carrefour, o PIN de registro WhatsApp e os
segredos Mercado Pago/Uber expostos continuam pendentes de rotação.

Em 18/07, a conta Carrefour foi aberta somente para confirmar a sessão; o operador optou por
adiar a troca da senha exposta. Nenhuma credencial foi digitada, alterada ou registrada. A senha
continua tratada como exposta e bloqueia qualquer uso do Context Carrefour ou piloto até a rotação
feita pelo titular.

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
| Estados e convenções operacionais | `src/lib/order-flags.ts` |
| Pedido (cesta, ciclo de status) | `prisma DeliveryOrder` |

**Somar loja = 1 arquivo** (conector + catálogo) + registrar em `stores/index.ts`.
**Ciclo direto implementado localmente:** `awaiting_payment → paid → retailer_preparing → retailer_out_for_delivery → delivered`.
O ciclo antigo `operator_buying → ready_for_pickup → dispatched` permanece somente para pedidos
legados ou parceiros courier autorizados. Cancelamento pago usa `refund_pending → refunded`.

### Atualização de conversa — 2026-07-07

O review profundo de conversa (115 achados) resultou em uma reconstrução de NLU, matcher,
copy e máquina de estados. A documentação completa, com sequência do trabalho e comandos
de validação, está em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md).
