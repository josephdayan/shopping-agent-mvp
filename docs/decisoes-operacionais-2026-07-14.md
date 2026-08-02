# Decisões operacionais — 14 de julho de 2026

Este documento registra as conclusões obtidas em 14/07/2026 após validar o checkout real
da Petz e revisar as políticas oficiais de retirada da Petz, Carrefour e Uber Direct.
Ele substitui a premissa anterior de que uma compra comum em `clique-e-retire` poderia ser
coletada em escala por qualquer motoboy.

> **Registro posterior — 02/08/2026.** A decisão de produto mais recente é o concierge manual
> de largura descrito no topo de [AGENTS.md](../AGENTS.md). A Lia opera somente no estado de
> São Paulo, o deploy limpo está online, a base do operador está configurada em Production e,
> em produção Meta, despacho mockado falha fechado. O recebimento será pela PJ, que também é a
> titularidade operacional da compra. O pós-venda é sem cancelamento/substituição depois do
> pagamento, com estorno de item faltante e aviso de atraso; antes do pagamento o cliente pode
> limpar a lista. A empresa é MEI e não precisa de contador fixo; falta documentar o documento
> fiscal exato por formato de operação e permanecem pendentes
> as rotações de credenciais expostas. O código mais recente está no commit `a700290` e o deploy
> correspondente é `dpl_5kTpBbsitN6BgP5vcQrDh22AfqP4`. O histórico abaixo permanece válido para
> explicar por que não usamos retirada no balcão.

## Resumo executivo

- A proposta de conveniência no WhatsApp continua válida.
- A entrega feita pelo próprio varejista passa a ser o fluxo principal.
- `Retire na loja + motoboy aleatório` não é um fluxo operacional escalável nas contas de
  consumidor da Petz ou do Carrefour.
- “Entrega hoje” continua como produto, mas somente quando:
  1. o próprio varejista oferecer entrega no mesmo dia; ou
  2. houver uma loja/parceiro que aceite formalmente retirada por courier.
- Uber Direct cotar e despachar corridas não resolve sozinho a autorização de retirada no
  balcão.
- O caminho de cartão sem sair do WhatsApp é a Payments API BR da Meta, pelo canal Cloud
  API direto, com Pagar.me mantendo o cartão tokenizado. A implementação está pronta, mas
  não será ativada antes da allowlist, configuração Pagar.me e testes sandbox.
- Desde 19/07, Carrefour/Browserbase não é caminho crítico do piloto: a autenticação remota
  foi bloqueada explicitamente pela política de segurança do varejista. O piloto deve começar
  pela Petz; Carrefour fica restrito à busca até existir API/parceria ou ambiente autorizado.

## Remodelagem para concierge manual — 20/07/2026

Depois de semanas provando que a automação de checkout não é rail viável (Carrefour
bloqueou o Browserbase em 19/07; Petz/Boticário não expõem frete/prazo no Context), o
produto foi remodelado para um **concierge manual de WhatsApp**, que é o fluxo ativo do
piloto. Racional canônico no topo do [AGENTS.md](../AGENTS.md).

- **Largura como diferencial.** O cliente pede qualquer coisa, de qualquer lugar, numa
  mensagem só. Item sem catálogo não é recusado — vira linha livre que o operador cota e
  compra. Moat = largura + estar no WhatsApp + memória do cliente. Velocidade pura contra
  Rappi/iFood é armadilha e foi descartada como eixo.
- **Cotação e compra manuais.** Fechar a lista cria `awaiting_operator_quote`. O operador
  cota no `/ops` (custo dos produtos + frete + modalidade + prazo) e envia; o pedido
  reaproveita `awaiting_quote_confirmation` e a máquina de pagamento (Pix/cartão) existente.
  Nada é cobrado antes da aprovação do cliente.
- **Motoboy sai da base do operador, não da loja.** O operador compra e entrega o pacote ao
  courier (Uber Direct/Lalamove) na própria base — sem o problema de documento do titular na
  retirada de rede grande que invalidou o motoboy-de-balcão em 14/07. Entrega do próprio
  varejista continua como modalidade alternativa.
- **Browserbase fora do caminho crítico.** `LIA_MANUAL_CONCIERGE=true` (default) desliga a
  cotação automatizada e as guardas de distância de loja. O fluxo legado de catálogo fica
  atrás de `LIA_MANUAL_CONCIERGE=false` e continua exercitado pelos evals de conversa.
- **Envs novos:** `LIA_MANUAL_CONCIERGE`, `LIA_OPERATOR_PICKUP_ADDRESS`,
  `LIA_OPERATOR_PICKUP_CEP`.
- **Estado.** Sem migration (novos estados cabem na coluna string). TypeScript, lint, testes
  focados (`tests/manual-concierge.test.ts` + evals legados) e build passaram em 20/07. Ainda
  não implantado ao vivo; próximo passo é o piloto manual de 5–10 pedidos reais. Titularidade,
  NF, troca/devolução e chargeback seguem como bloqueio antes do lançamento público.

### Atualização operacional — 21/07/2026

O ciclo concierge foi demonstrado localmente em ambiente mockado, sem cobrança: cotação de
R$100, confirmação de Pix, compra, despacho de Uber Direct a partir da base do operador e
entrega, com as mensagens ao cliente conferidas. O botão único **“Comprei — despachar motoboy”**
e o [runbook do operador](operador-runbook.md) formam o kit para a pessoa que vai operar o
piloto.

Os commits `bb48c2e`, `ededf6a` e `7ab8453` estão verdes, mas o concierge ainda não foi para
Production: a publicação atual incluiria uma migration Oba inacabada de trabalho paralelo. A
regra é publicar somente com deploy limpo. A operação decidiu contratar um operador. Há 19 pedidos
técnicos na fila de Production; a limpeza é ação destrutiva e requer autorização explícita.

## Reavaliação Carrefour — 19/07/2026

Depois de corrigir `BROWSERBASE_API_KEY` em produção, o workflow avançou normalmente até
`LOGIN_REQUIRED`, comprovando acesso ao Browserbase e ao Context pelo runtime. Na tentativa
humana seguinte, a própria página de autenticação Carrefour recusou a sessão remota e informou
que o acesso não estava em conformidade com as políticas de segurança da organização. A conta
continuava acessível no navegador comum do operador.

A conclusão é operacional, não absoluta: o código do carrinho existe, mas o ambiente
Browserbase não oferece uma rota de autenticação Carrefour confiável para lançar ou escalar.
Não serão tentados proxy, alteração de fingerprint, bypass de CAPTCHA/WAF nem novas sessões em
sequência. Carrefour sai do caminho crítico do MVP; sua busca pública pode permanecer com falha
fechada, enquanto o checkout só será retomado com API/parceria oficial ou ambiente autorizado.

O primeiro piloto passa a priorizar Petz, onde conta persistente, endereço, produto, sacola,
frete, prazo e checkout já foram observados ao vivo. Antes de cobrar qualquer cliente, é preciso
portar para Petz a orquestração de cotação com validade curta, revalidação e `cart_only`. Um
handoff para o cliente foi avaliado e explicitamente rejeitado: a Lia deve concluir a compra nos
bastidores. Não houve mensagem, cobrança ou compra.

### Opções Carrefour avaliadas em 19/07

| Opção | Prazo | O que entrega | Limite/decisão |
| --- | --- | --- | --- |
| Handoff para o cliente | Curto | Lia enviaria lista e cliente pagaria no Carrefour | **Rejeitada pelo operador em 19/07.** Quebra a experiência ponta a ponta da Lia. |
| Operação manual em navegador comum | Imediato, só demonstração | Operador monta a compra nos bastidores sem expor o Carrefour ao cliente | Ponte interna possível; não é automação nem solução de escala. |
| Shopper próprio/controlado | Curto/médio | Pessoa da operação compra fisicamente e a Lia coordena entrega | Preserva a experiência, mas muda fulfillment e exige desenho fiscal, substituição, cadeia fria e logística. |
| Parceria direta Carrefour | Médio/longo | Potencial catálogo, cotação, pedido e webhooks homologados | **Melhor arquitetura Carrefour.** Exige negociação e autorização escrita. |
| Integração com app de delivery homologado | Médio/longo | Compra e entrega por canal parceiro já reconhecido pelo Carrefour | Viável somente por acordo comercial; APIs iFood públicas encontradas são para merchants, não para criar pedidos de consumidor. |
| Marketplace Carrefour Seller | Não aplicável | Cadastro de catálogo, oferta e gestão de pedidos de quem vende no Carrefour | Não compra produtos Carrefour para clientes da Lia; não resolve o caso. |
| VTEX Checkout direto | Prova técnica condicionada | A plataforma VTEX suporta simulação e orderForm | O domínio headless Carrefour não expôs o endpoint padrão (respondeu 500) e os termos vedam automação. Não acessar backend interno sem autorização. |
| Browser local/extensão/proxy/fingerprint | Curto tecnicamente | Tentaria reproduzir o checkout consumidor | Rejeitada: frágil, não autorizada e incompatível com o bloqueio e os termos observados. |

Após a avaliação, o operador rejeitou explicitamente qualquer fluxo em que o cliente receba link
ou termine a compra. Portanto, o requisito de produto é que a Lia conclua a compra nos bastidores.
A ponte imediata pode ser humana e invisível em navegador comum, restrita a teste interno, ou um
shopper próprio/controlado que compre fisicamente; a solução de escala continua sendo integração
homologada.

O Carrefour declara oficialmente que oferece sua loja por sites de parceiros e aplicativos de
delivery homologados, o que comprova que a via comercial existe. Já o programa Marketplace
publicado é voltado a sellers com CNPJ, NF-e e integração de ofertas/pedidos. A documentação VTEX
descreve carrinho headless e simulação, mas essa capacidade genérica não concede permissão para
usar a implementação privada do Carrefour.

Fontes consultadas: [Termos do app Carrefour](https://www.carrefour.com.br/app/termos-de-uso),
[Termos do Mercado Carrefour](https://mercado.carrefour.com.br/institucional/termos-de-uso),
[Política de privacidade e parceiros](https://www.carrefour.com.br/institucional/politicas-carrefour/politica-de-privacidade-carrefour),
[Marketplace Carrefour](https://www.carrefour.com.br/marketplace),
[Checkout headless VTEX](https://developers.vtex.com/docs/guides/headless-cart-and-checkout) e
[APIs iFood para groceries](https://developer.ifood.com.br/pt-BR/docs/guides/solutions/integration-scopes).

## Seleção de varejistas automatizáveis — 19/07/2026

### Decisão de implementação — 19/07/2026

O produto ativo passa a ter Oba Hortifruti, Petz e O Boticário; Mambo não será incluído nesta
etapa. Carrefour foi removido do registro, roteamento, cron, comprador e operação, sem handoff
ao cliente. O conector Oba implementa a mesma política segura: Browserbase com Context isolado,
SKU/vendedor real, sacola limpa, simulação por CEP e cotação somente com estoque, frete e prazo;
`placeOrder` falha em `cart_only`. Petz e Boticário passaram a rejeitar snapshots sem frete ou
promessa. A implementação passou em TypeScript e 162 testes locais (42 integrações de banco
puladas por indisponibilidade remota); a prévia Vercel `dpl_GHsPBkvKhrw4zAUZsoh5uT6P5jac` ficou
`Ready`. A tentativa inicial de criar apenas o Context retornou `401 Unauthorized`; a chave foi
então renovada no painel Browserbase autenticado, aceita pela criação do Context vazio exclusivo
do Oba e atualizada como Sensitive em Production junto do ID do Context. Nenhum segredo foi
impresso, persistido em arquivo ou enviado em chat; temporários e área de transferência foram
limpos. O primeiro job técnico em Production terminou em `needs_human` quando
o conector fechou a página antes da simulação VTEX (`page.evaluate: Target page, context or
browser has been closed`). A causa foi corrigida com `return await buildSnapshot(...)` antes do
`finally` de fechamento. O deploy de Production `dpl_CpcjWKyHrteDuiQQ2DU9NZbj5Pwz` ficou
`Ready`; o retry do mesmo job chegou a `cart_ready` com arroz Camil 1 kg por R$ 5,99, frete
R$ 9,90, total R$ 15,89 e janela do varejista no CEP público `01310-100`. A migration que torna
Oba/Oba Hortifruti os defaults de novos pedidos foi aplicada e conferida diretamente no banco.
TypeScript e 204 testes locais passaram (162 aprovados; 42 integrações de banco puladas).
Nenhuma ação financeira foi executada.

### Preflights Petz e Boticário — 19/07/2026

Foram criados gates técnicos por varejista no painel `/ops`, cada um buscando um SKU real e
executando somente a preparação de carrinho em `cart_only`. A Petz encontrou e adicionou areia
higiênica real por R$ 15,99, mas nem o minicarrinho nem a sacola completa expuseram frete e prazo
no Context persistente. O Boticário encontrou o SKU B88468 por R$ 16,90 e confirmou a quantidade,
mas exibiu apenas o convite para consultar frete; o conector foi ajustado para abrir o painel de
CEP e falhou fechado quando a confirmação não foi disponibilizada. As duas tentativas terminaram
em `needs_human`, sem WhatsApp, cobrança, pagamento ou pedido. Esses conectores não devem cotar
antes de resolver os respectivos gates de entrega.

No retry técnico da Petz, o conector superou o redesenho transitório da sacola e alcançou
`/checkout/cart/<id>`, mantendo o SKU e R$ 15,99 reais. Essa tela, porém, não expôs frete, prazo
nem controles de entrega no Context Browserbase. O estado correto permanece `needs_human`; a
próxima investigação deve mapear somente a etapa de entrega, sem avançar para pagamento.

No Boticário, o diagnóstico final confirmou produto, quantidade e subtotal e revelou o campo
`postalCode` da sacola. Contudo, o próprio varejista o entregou com `data-disabled=true`; a ação
“Entrega Rápida” leva somente a conteúdo informativo. Não é permitido forçar ou contornar esse
estado. Petz e Boticário permanecem em `needs_human` até que seus Contexts exponham a etapa de
entrega com frete e prazo reais. Nenhuma cobrança, mensagem ao cliente ou compra foi feita.

Em 20/07, depois de corrigir a reutilização do teste técnico, foram criadas sacolas novas para
ambos os varejistas. Petz voltou a resolver SKU/preço/subtotal e alcançou a sacola completa, mas
sem etapa de entrega exposta. Boticário voltou a resolver SKU/quantidade/subtotal, mas sem prazo
domiciliar. A tentativa anterior que parecia `cart_ready` foi reclassificada como falso positivo:
texto promocional de frete grátis e retirada não pode ser frete/prazo de entrega. O parser foi
endurecido e testado; os dois preflights permanecem `needs_human`.

Na mesma data, foi publicado no `/ops` um acionamento autenticado para abrir, na própria aba do
operador, uma sessão Browserbase viva e isolada de Petz ou Boticário. Ele usa o Context já
persistente e não cria sacola, envia mensagem, cobra ou compra. A sessão Petz foi aberta para que
o operador selecione **entrega no endereço** diretamente na UI da loja. Isso não valida frete ou
prazo; somente um novo preflight posterior, ainda em `cart_only`, poderá registrar esses campos.
Como o debugger remoto cria uma aba vazia, o acionamento navega apenas para a home do varejista
antes de mostrar a sessão; não preenche, seleciona ou avança qualquer etapa de checkout.
Ela fica viva por até uma hora, para não encerrar durante a ação direta do operador.
O visualizador embutido do Codex não apresentou essa sessão de modo interativo estável; em vez de
concluir haver falha no Context, a mesma sessão viva foi aberta no Safari do operador. Isso não
altera carrinho, endereço, pagamento ou resultado de preflight.

Foi criado no `/ops` um encerramento autenticado que libera somente as sessões vivas do mesmo
Context, para que uma ação manual possa ser persistida antes de novo preflight. Após esse
encerramento, o retry Petz fresco voltou a confirmar o SKU e R$ 15,99, mas chegou apenas a
`/checkout/cart/<id>` sem controles, frete ou prazo. O conector também buscou, somente nessa rota,
um CTA explicitamente “ir/continuar para checkout”; ele não foi exposto. A Petz continua
`needs_human`. Isso não é falha financeira, não confirma persistência do login e não justifica
novas tentativas cegas na UI remota; não houve cobrança, mensagem ou compra.

O Boticário também recebeu novo preflight fresco em 20/07: SKU B88468, quantidade e subtotal de
R$ 16,90 foram confirmados, mas o campo `postalCode` continuou bloqueado e a sacola não mostrou
prazo domiciliar. “Entrega Rápida” continua conteúdo informativo; frete grátis e retirada foram
corretamente rejeitados como publicidade, não cotação. O resultado permanece `needs_human`, sem
cobrança, mensagem ou compra.

Para substituir as fontes bloqueadas sem recorrer a motoboy, a triagem oficial de 20/07 priorizou
Pão de Açúcar para mercado em São Paulo e Cobasi para pet. O Pão documenta cálculo de frete/prazo
por CEP e escolha de modalidade no checkout; a Cobasi instrui calcular frete/prazo no carrinho e
oferece entrega própria. Savegnago tem delivery próprio com agendamento, mas a cobertura oficial
é voltada às cidades onde possui loja e vizinhas, portanto é candidato de interior paulista. Esta
é somente pesquisa: nenhum candidato foi integrado, recebeu Context ou passou em preflight
`cart_only`.

No smoke de navegação de 20/07, o Pão de Açúcar não passou do bloqueio público
`az-request-verify`, antes de produto ou CEP, e não deve ser priorizado para automação agora. A
Cobasi passou: com produto real e CEP público `01310-100`, a sacola exibiu antes de pagamento as
modalidades Cobasi Já e Econômica, frete, prazo e total; o carrinho técnico foi limpo. Isto
confirma a superfície de entrega própria, não o conector, Context Browserbase, termos comerciais
ou compra. A próxima implementação deve ser Cobasi em `cart_only`, falhando fechada sem os quatro
campos de cotação.

No complemento da validação em 20/07, a Cobasi avançou até a tela de login sem que fossem
informados dados de conta, endereço pessoal ou pagamento. A Leroy Merlin passou pelo mesmo gate:
um SKU explicitamente “Vendido e entregue por Leroy Merlin” recebeu CEP público, entrega
domiciliar, frete, prazo e total no carrinho e, ao continuar, levou ao login antes de pagamento;
o carrinho técnico foi esvaziado. Isto torna Cobasi (pet) e Leroy (casa/manutenção) candidatas
técnicas de interface, não fontes ativas nem automações aprovadas. Qualquer futuro conector Leroy
deve rejeitar itens de marketplace e aceitar somente vendedor/entrega da própria Leroy. A Sephora
foi descartada por ora: a sessão pública chegou a produto e CEP, mas ficou instável antes da
sacola, logo não há evidência de checkout.

A falha Carrefour mudou o método: uma loja só entra no produto depois de passar por gates técnicos
e comerciais. A ordem é: catálogo/SKU público real; carrinho isolável; estoque, total, frete e prazo
antes da cobrança; sessão persistente; entrega do varejista; finalização bloqueável em `cart_only`;
e autorização compatível com uma operação de concierge. Petz já passou pelos gates técnicos até o
checkout, mas ainda requer validação comercial/termos antes de representar “automação permitida”.

Triagem e smoke test público, sem login, pagamento ou criação de pedido:

| Candidato | Evidência de 19/07 | Prioridade | Restrição atual |
| --- | --- | --- | --- |
| Oba Hortifruti | Dois SKUs disponíveis no CEP `01310-100`, carrinho anônimo de R$ 18,98; Convencional R$ 9,90 (`0bd`, seis janelas) e Express R$ 14,90 (`2h`, sem janela no horário); carrinho limpo | **1** | Conector e preflight Browserbase posteriores passaram em `cart_only`; faltam validação comercial e piloto |
| Mambo | Dois SKUs disponíveis no mesmo CEP, carrinho anônimo de R$ 22,78; Entrega Agendada R$ 12,90 (`2h`, 19 janelas); carrinho limpo | Fora do escopo | Não integra o produto ativo; termos vinculam conta individual ao CPF e vedam compartilhamento |
| Savegnago | VTEX, orderForm e catálogo públicos `200`; entrega própria e pagamento na entrega em modalidades publicadas | 3 regional | Confirmar cobertura do CEP do piloto |
| Pão de Açúcar | Home pública `200`, catálogo amplo e entrega rápida/agendada | 4 | Camada de bot management e login antecipado elevam risco técnico |
| St. Marche | Storefront Shopify/Hydrogen público `200` e delivery | Pausado | Grupo Hortus informou recuperação judicial em 24/06/2026 |

O teste também confirmou que disponibilidade de catálogo não basta: no primeiro passe, um
detergente de cada varejista entrou no carrinho, mas ficou `withoutStock` para o CEP. O selecionador
precisa simular cada SKU regionalmente antes de montar a sacola. No segundo passe, os dois itens de
cada loja ficaram disponíveis e receberam SLAs. `0bd` é o valor bruto devolvido pelo Oba e não deve
ser traduzido como promessa ao cliente sem selecionar uma janela no checkout.

Decisão: implementar Oba como fonte de mercado/essenciais e não incluir Mambo nesta etapa. O
preflight Browserbase posterior validou carrinho, estoque, total, frete e janela em `cart_only`;
ainda faltam checkout financeiro, pedido, escala e autorização comercial.

O Boticário foi reavaliado no mesmo dia. Busca e comprador existem; o comprador foi então
atualizado para exigir SKU, quantidade, subtotal, frete e promessa, falhando fechado na ausência
de algum campo. Falta o preflight Browserbase ao vivo, portanto a cotação pré-cobrança ainda não
está homologada para essa loja.

Fontes: [Oba delivery e WhatsApp](https://ofertas.obahortifruti.com.br/delivery-express/),
[Mambo termos e delivery](https://www.mambo.com.br/termos-de-uso),
[Savegnago entrega](https://www.savegnago.com.br/entrega-e-retirada),
[Pão de Açúcar como comprar](https://www.paodeacucar.com/campanhas/2020/05/como-comprar/index.html) e
[St. Marche — aquisição/recuperação](https://marche.com.br/pages/informacoes-aquisicao-cencosud).

## Pagamento por cartão no WhatsApp: decisão de hoje

O 360dialog não é parte necessária deste fluxo. A Lia envia o `order_details` diretamente
para a Graph API da Meta e recebe a confirmação no mesmo webhook. O Pagar.me mantém o
`card_id`, cobra no servidor e envia eventos de reconciliação.

### Prioridade de execução — 18/07/2026

O operador determinou que novas rotações de credenciais fiquem pausadas. O foco imediato é
validar a cotação do varejista em `cart_only` e os fluxos operacionais de entrega/estorno já
implantados, sem cobrança ou compra. Pendências de segurança continuam bloqueios de piloto,
mas não serão executadas sem novo pedido explícito.

Na primeira validação funcional coordenada de 18/07, o preflight técnico Carrefour de produção
foi acionado em `cart_only` e falhou fechado em `needs_human` / `CONFIGURATION_REQUIRED`: o
runtime recusou a credencial Browserbase configurada. Não houve sessão de varejista, mensagem,
cobrança ou compra. A decisão operacional é corrigir a configuração existente e comprovar
autenticação antes de novo retry; não executar nova rotação por conta desse resultado.

O retry após a investigação confirmou a causa: `BROWSERBASE_API_KEY` em Production estava com
prefixo `sk_live_`, incompatível com Browserbase. A chave correta foi copiada do painel oficial
diretamente para a variável Sensitive e o redeploy `EEaegLWbmNtiwG6opHEbWirJBX57` ficou `Ready`.
O workflow passou a configuração e retornou `LOGIN_REQUIRED`; isso valida o acesso Browserbase no
runtime, mas não a cotação, que aguarda reautenticação humana Carrefour. Não houve mensagem,
cobrança ou compra.

### Atualização de canal — 18/07/2026

A Infobip classificou a projeção inicial (2.000–10.000 mensagens/mês) como Self-Service e
direcionou as dúvidas de arquitetura ao Customer Success, oferecendo também uma conta de
teste. Esta é somente uma rota de avaliação comercial/técnica: não concede allowlist da Meta,
habilitação de WhatsApp Payments, compatibilidade com Mercado Pago PJ, `credential_id` ou
aprovação de webhook. Preservar a Cloud API direta continua requisito: nenhuma conta de teste
ou onboarding pode migrar ou compartilhar WABA, número, sender, Graph API ou webhook sem uma
decisão explícita e separada. Antes de qualquer teste, obter por escrito o suporte a
`order_details`/`offsite_card_pay`, o sandbox, o modelo de confirmação/webhook e os custos.
O contato ao Customer Success foi enviado em 18/07, com Samuel em cópia; até a resposta
escrita, não criar conta de teste, migrar canal ou alterar a decisão de manter o One-Click
desligado.

- primeira compra: página de tokenização Pagar.me de uso único; a Lia nunca recebe número
  do cartão ou CVV;
- recompra: cartão mascarado e confirmação nativa no WhatsApp;
- segurança: `PaymentAttempt.id` serve como `reference_id` Meta e `Idempotency-Key`
  Pagar.me; toques/retries não criam outra cobrança;
- estado atual: código, migration, workflow, webhook e testes focados concluídos;
- limite: a API BR da Meta é allowlist. A flag continua desligada até habilitação e
  validação sandbox.

Guia operacional: [whatsapp-one-click-pagarme.md](whatsapp-one-click-pagarme.md).

## O que foi validado ao vivo na Petz

Foi criada uma conta Petz em um Context persistente do Browserbase e o fluxo chegou, sem
finalizar compra, até a tela real de pagamento. A validação confirmou:

- conta autenticada e reutilizável entre sessões;
- endereço salvo e CEP reconhecido pelo checkout;
- produto real, sacola, disponibilidade, frete e prazo calculados pela Petz;
- modalidades padrão, expressa, agendada e retirada, condicionadas ao CEP, horário e estoque;
- pagamento por cartão, Pix, NuPay, Click to Pay e boleto;
- opção de salvar cartão para compras futuras;
- botão final claramente identificado como `Pagar agora`.

No teste específico, feito à noite para um CEP de São Paulo, a menor promessa de entrega
domiciliar era o dia seguinte. Isso prova o fluxo, mas não constitui SLA geral: modalidade,
preço e prazo devem ser recalculados em cada pedido.

Nenhuma compra foi finalizada. A automação de produção continua em `cart_only`.

## O que caiu

### Petz: retirada por terceiro

A política oficial exige, para retirada por terceiro, documento original com foto de quem
retira e documento original com foto do titular da compra, além do código quando houver.
O pedido só pode ser buscado depois da mensagem de liberação.

Isso impede tratar um entregador on-demand desconhecido como retirada automática de uma
compra feita numa conta central da Lia.

Fonte: <https://www.petz.com.br/institucional/politica-de-entrega>

### Carrefour: retirada por terceiro

Para produtos não alimentares, o Carrefour exige documentos do terceiro e do titular,
confirmação/token do pedido e pode aplicar biometria em algumas lojas de São Paulo.

Fonte: <https://www.carrefour.com.br/politica-de-retirada-cancelamento-trocas-e-devolucoes-retire-em-loja>

Para supermercado, exige formulário de autorização assinado pelo titular, documento do
terceiro e documento do titular.

Fonte: <https://secure.mercado.carrefour.com.br/politica-de-retirada-cancelamento-trocas-e-devolucoes-drive-em-loja>

Portanto, o fluxo antigo é tecnicamente possível apenas com documentação por pedido, mas
é inadequado para escala, privacidade e experiência do cliente.

### Uber Direct

A integração técnica existe e permite cotação, criação de entrega, ETA e acompanhamento.
Entretanto, a disponibilidade da API depende de liberação comercial e seus termos descrevem
entregas de produtos vendidos pelos canais da empresa ou por estabelecimentos vinculados.
É necessário validar contratualmente qualquer uso para coletar compras de consumidor em
varejistas terceiros.

Fontes:

- <https://developer.uber.com/docs/deliveries/direct/guides/overview>
- <https://www.uber.com/legal/ur/document/?country=brazil&lang=pt-br&name=uber-direct-api-terms-and-conditions>

## Modelo operacional vigente

### Fluxo padrão: varejista entrega

1. Cliente pede os itens no WhatsApp.
2. Lia usa o endereço salvo e busca produtos reais.
3. Lia monta uma sacola temporária na loja.
4. A loja calcula preço, disponibilidade, frete e prazo para aquele CEP.
5. Lia apresenta o total e uma validade curta da cotação.
6. Cliente paga a Lia pelo Mercado Pago.
7. Lia revalida o carrinho e compra sob política controlada.
8. O varejista entrega diretamente ao cliente.

O passo 4 deve acontecer antes da cobrança. O comportamento legado que cobra primeiro e
só depois monta a sacola precisa ser invertido.

Esse fluxo dispensa motoboy, mas exige definir corretamente titular da compra, nota fiscal,
trocas, devoluções, chargeback e uso de uma conta para múltiplos destinatários.

### Fluxo urgente: entrega hoje

“Hoje” só deve ser prometido depois de existir uma destas rotas válidas:

- entrega no mesmo dia oferecida pelo próprio varejista no checkout; ou
- parceiro local que recebe pedidos da Lia e libera retirada para courier sem documento do
  titular; ou
- contrato/API de merchant que reconheça o courier como parte oficial do fulfillment.

Não usar `clique-e-retire` de consumidor da Petz/Carrefour como backbone desse produto.

## Cotação e desempenho

A cotação é feita no checkout real, não por uma tabela inventada:

- busca com cache: alvo de 2–8 segundos;
- montagem de carrinho e cálculo de frete: alvo de 10–25 segundos;
- cotação completa por loja: normalmente 15–30 segundos, com cauda maior em site lento.

Preço, estoque e frete devem ser revalidados antes da cobrança e antes da compra. Uma
cotação deve expirar em poucos minutos.

Para operar em volume, cada pedido precisa de carrinho/sessão isolado ou fila exclusiva por
Context. Uma única conta de varejista não pode compartilhar um carrinho concorrente entre
clientes.

## Próximas decisões obrigatórias

1. Definir quem é juridicamente o comprador e o titular da nota em cada pedido.
2. Validar nos termos dos varejistas o uso de uma conta para vários destinatários.
3. Testar cartão salvo, CVV, 3DS, CAPTCHA e antifraude sem habilitar compra automática.
4. Implementar checkout Petz até revisão, mantendo o clique final bloqueado.
5. Atualizar a conversa para oferecer prazo/frete do próprio varejista.
6. Tratar Uber Direct como conector opcional, não como fulfillment padrão.
7. Para “entrega hoje”, buscar parceiros locais ou contrato merchant/courier antes de
   desenvolver mais automação de retirada.

## Estado do produto após esta decisão

- Petz: busca, carrinho, frete e checkout validados; compra final ainda bloqueada.
- Carrefour: automação de carrinho existe; retirada por motoboy não deve ser usada como
  premissa de escala.
- Boticário: busca/carrinho preparados; política de entrega e titularidade ainda precisam
  de validação equivalente.
- Cobertura geográfica: o checkout da loja substitui a antiga regra “unidade a até 12 km”
  como autoridade de frete e prazo; a regra antiga pode permanecer como filtro comercial.
- Mercado Pago: continua sendo a cobrança do cliente.
- Browserbase: continua sendo a infraestrutura de navegação persistente e auditável.
- Uber Direct: integração técnica preservada para parceiros compatíveis.

## Atualização de implementação — 15/07/2026

O fluxo Carrefour passou a criar uma cotação pendente antes de qualquer cobrança quando
`PURCHASE_AUTOMATION_ENABLED` está ligado. O preflight `cart_only` monta o carrinho e só
publica Pix/cartão se o checkout expuser itens, total, frete e promessa de entrega. A
cotação fica válida por cinco minutos por padrão; o cliente escolhe Pix/cartão depois de
ver o resumo. Ao vencer ou ser cancelada, a reserva do Context é liberada para não bloquear
o carrinho do cliente seguinte.

As migrations pendentes (One-Click e expiração) foram aplicadas em produção e a versão foi
implantada em 15/07. Nova inspeção da UI em 16/07 substituiu a conclusão anterior: Enter não
fechou o modal atual; o botão submit do formulário fechou. O conector agora usa esse botão e
espera o campo visível desaparecer, com Enter apenas como fallback.

Isto ainda não é validação completa do checkout: a tentativa de preflight encontrou o
Context Carrefour sem login antes de limpar/adicionar o SKU de teste. Nenhuma sacola,
checkout ou cobrança foi criada. Continua obrigatório reautenticar o Context e validar com
endereço real frete, prazo, cartão salvo/CVV/3DS e antifraude.

Na contenção posterior à exposição de diagnóstico, o token OIDC local da Vercel foi
renovado em 15/07 sem imprimir valores. A chave Browserbase continua pendente de
regeneração e atualização dos ambientes que a consomem; o acesso ao painel autenticado não
estava disponível neste ambiente. A reautenticação Carrefour continua uma etapa humana de
login/OTP/CAPTCHA, sem contorno automatizado.

Foi aberta em 15/07 uma sessão persistente do Context Carrefour apenas para essa
reautenticação manual. Ela chegou à página inicial do varejista sem inserir itens, abrir
checkout ou iniciar cobrança; antes do próximo preflight, a sessão deve ser conferida como
autenticada e a chave Browserbase regenerada deve estar configurada nos ambientes.

Uma chave Browserbase de reposição foi enviada por chat durante essa operação. Ela também
deve ser considerada exposta e não pode ser instalada na Vercel, mesmo com autorização
posterior: é necessário regenerar outra chave diretamente no painel, copiá-la somente para o
campo secreto da Vercel e então remover a chave anterior de todos os ambientes.

Ao conferir a variável trazida do ambiente de produção em 15/07, o Browserbase respondeu
`401 Missing x-bb-api-key`. Portanto, a Vercel ainda não tem uma chave Browserbase utilizável
para o projeto: salvar a chave recém-regenerada em Production e Development e implantar uma
nova versão é condição obrigatória antes de reabrir qualquer preflight.

Em 15/07 a URL direta de Environment Variables do projeto Vercel foi aberta no navegador
embutido, mas a página exigiu login manual antes de permitir a edição da variável.

Após o operador tentar salvar a nova chave apenas no escopo Production em 15/07, uma nova
leitura do ambiente de produção pelo CLI (`vercel env pull`) continuou sem valor para
`BROWSERBASE_API_KEY`. Production é escopo suficiente para o deploy e para a validação ao
vivo; o bloqueio atual é confirmar no painel que a edição contém um valor não vazio e foi
realmente salva. Não houve deploy nem novo preflight após essa tentativa.

A inspeção visual do formulário salvo mostrou que o valor começava por `sk_live_`, prefixo
incompatível com uma chave Browserbase, que deve começar por `bb_live_`. Não acionar
Redeploy: o operador precisa substituir o campo por uma chave Browserbase recém-regenerada,
marcar a variável como Sensitive e salvar em Production. O valor não foi copiado, registrado
nem usado na operação.

Uma segunda leitura independente do ambiente Production após a alegada correção ainda não
recebeu `BROWSERBASE_API_KEY`. Até o painel apresentar a chave Browserbase correta e uma
nova leitura conseguir autenticar uma chamada mínima, permanecem vedados o Redeploy e o
preflight Carrefour.

Em seguida, o painel confirmou visualmente `BROWSERBASE_API_KEY` como Sensitive, no escopo
Production e atualizada naquele momento. Foi feito um novo deploy de produção, que ficou
Ready em 15/07 e mantém `PURCHASE_AUTOMATION_MODE=cart_only`. A chave Sensitive não foi
baixada pelo CLI local; por isso, a autenticação Browserbase será comprovada pelo fluxo em
produção, depois da reautenticação manual do Context Carrefour. A sessão persistente foi
reaberta para essa ação humana, sem inserir itens, abrir checkout ou iniciar cobrança.

O operador informou em 15/07 que concluiu o login Carrefour nessa sessão. A próxima etapa é
um preflight de cotação em `cart_only`, limitado a um item e ao endereço salvo que o operador
indicar, para conferir carrinho, frete e prazo. Não há autorização nem necessidade de emitir
pagamento ou finalizar compra nessa etapa.

## Qualidade autônoma — 15/07

Foi alinhada a suíte de evals ao onboarding vigente: o primeiro atendimento pede endereço
completo e só então CEP; cenários de cliente recorrente agora trazem ambos os dados salvos.
Esse ajuste é de teste e não altera o fluxo de produção.

O hash de aprovação do carrinho passou a incluir frete e promessa de entrega, de modo que
uma alteração de modalidade/prazo invalida a aprovação mesmo se o total coincidir. Foram
adicionados testes para `cart_only`, preço/itens ambíguos já protegidos pela política e para
falhas Browserbase: credencial recusada, indisponibilidade temporária, sessão expirada e
página Carrefour indisponível. Esses caminhos falham fechados, sem abrir checkout nem
acionar compra.

Verificação local concluída em 15/07: `npx tsc --noEmit`, `npm test` (201 testes) e
`npm run build` passaram. O build emitiu somente o aviso não bloqueante existente de uso de
`<img>` em `src/components/chat-app.tsx`. Não houve deploy, teste ao vivo, carrinho,
cobrança ou compra durante essa verificação.

## Atualização operacional — 16/07/2026

Para recuperar o acesso administrativo sem reutilizar ou expor `API_TOKEN`, foi criado
`OPS_TOKEN` dedicado, Sensitive em Production e Preview. O redeploy de produção posterior ficou
`Ready`, e o painel `/ops` foi autenticado. A inspeção da fila encontrou somente pedidos legados
pagos e alguns cancelados; eles não são massa segura para a validação. O preflight Carrefour
foi executado em um pedido técnico novo, com SKU exato e apenas a região persistida no Context;
nenhum endereço real foi copiado. Em `cart_only`, o workflow terminou em
`PREFLIGHT_NEEDS_HUMAN`, porque não confirmou conjuntamente item, total, frete e prazo. O valor
interno de R$ 1,99 não é evidência de cotação. Não houve WhatsApp, cobrança ou compra. A decisão
permanece: não liberar pagamento nem compra até a confirmação completa do checkout.

Na continuação de 16/07, o carrinho completo foi mapeado ao vivo e mostrou o SKU técnico por
R$ 1,99, frete a partir de R$ 9,90, prazo a partir de sábado e total R$ 11,89, com pedido
mínimo de R$ 30. O minicarrinho não contém frete/prazo. O conector foi implantado com
navegação ao carrinho completo, `orderFormId`, parsers de rótulos em linhas separadas,
limpeza de carrinho antigo e diagnóstico por campo. Retries controlados corrigiram CEP ausente,
tempo do modal, falso positivo de login e item residual. O bloqueio final verdadeiro é
`LOGIN_REQUIRED` no Context Browserbase. Foi implantada `/ops/teste-carrefour` e aberta uma
sessão viva do mesmo Context para reautenticação humana. Não houve WhatsApp, cobrança, avanço
ao pagamento ou compra; os valores acima são mapeamento da UI, não cotação operacional validada.

Ainda em 16/07, credenciais Carrefour foram enviadas pelo chat. Elas não foram salvas no
projeto nem reproduzidas nesta documentação. Como o inspetor remoto não expôs os campos de
login de forma segura para automação, uma nova sessão viva foi deixada para autenticação
humana. A senha deve ser rotacionada antes do piloto e nunca migrada para `.env` ou banco.

Após essa autenticação humana em 16/07, o preflight avançou além do login e falhou fechado
no minicarrinho: o CTA para o carrinho completo não foi exposto. O conector passou a usar a
rota de resumo `/checkout/cart` como fallback somente de leitura, sem avançar ao pagamento.
Na publicação desse fallback, a primeira versão pré-construída respondeu erro de runtime porque
o Prisma havia sido gerado para macOS e o ambiente de produção usa Linux ARM. O schema passou a
incluir o binário `linux-arm64-openssl-3.0.x`, o artefato foi reconstruído e o deploy seguinte
ficou `Ready`; o POST do preflight voltou a responder 200. O workflow ainda falhou fechado em
`LOGIN_REQUIRED`, por expiração da sessão Carrefour, e uma sessão viva nova foi aberta para
login humano. Isso não altera a política: não houve pagamento, compra ou envio de mensagem, e
a cotação operacional continua pendente.

Na sequência de 16/07, o painel Browserbase autenticado foi confirmado e uma sessão Carrefour
nova foi aberta para retomar o login humano. A reautenticação não foi concluída, sem causa
confirmada, e o operador decidiu adiar o teste. Não criar novas sessões nem repetir o preflight
até uma próxima tentativa coordenada; não houve cobrança, compra ou mensagem.

Ainda em 16/07, a proteção de concorrência por Context Browserbase foi confirmada e ganhou
testes de regressão. O lease é persistente no banco, impede dois workers de usar o mesmo carrinho
e, em conflito, mantém o segundo job em `preflight_queued` para retry controlado a cada minuto.
Um lease abandonado só pode ser retomado após 15 minutos; erro de banco/configuração não é
interpretado como Context ocupado. Não houve sessão nova, checkout, cobrança ou compra nessa
alteração local.

## Qualidade autônoma — entrega direta e estorno (16/07/2026)

O ciclo do pedido foi adaptado localmente à decisão operacional deste documento. Pedidos com
`retailer_delivery` passam por `retailer_preparing` e `retailer_out_for_delivery`; o backend
recusa despacho de courier externo para essa modalidade. Os estados antigos
`operator_buying`, `ready_for_pickup` e `dispatched` continuam disponíveis apenas para pedidos
legados ou parceiros que autorizem formalmente o courier.

O `/ops` passou a mostrar quem entrega, promessa do checkout, validade da cotação e rastreio do
varejista. A compra manual ou confirmada pelo job entra no estado correto conforme a modalidade.
Marcar como entregue exige que o pedido já esteja em rota.

Também foi corrigida uma ambiguidade financeira: o antigo comando de cancelar/estornar apenas
mudava o status local, mas a mensagem podia sugerir que o estorno já estava em andamento. Agora,
pedido pago entra em `refund_pending`, a equipe executa a devolução no provedor original e o
`/ops` exige a referência antes de mudar para `refunded` e confirmar ao cliente. O procedimento
de `needs_human`, incidentes e estorno foi registrado em
[operacao-piloto-needs-human-estorno.md](operacao-piloto-needs-human-estorno.md).

Um PIN de registro do WhatsApp encontrado em Markdown local ignorado pelo Git foi removido; ele
deve ser rotacionado antes do piloto e guardado somente no cofre de segredos. A verificação local
passou em TypeScript, lint, 210 testes (168 aprovados e 42 integrações puladas por banco remoto
indisponível) e build. Esta alteração não foi implantada ou validada ao vivo e não abriu navegador,
checkout, cobrança, compra ou mensagem real.

## Atualização de segurança — 18/07/2026

A chave Browserbase que havia aparecido em diagnóstico foi regenerada diretamente no painel oficial
e substituída na Vercel como `BROWSERBASE_API_KEY` Sensitive em Production. Um valor intermediário
exibido pelo controle de rotação foi tratado como exposto e invalidado imediatamente, com nova
substituição limpa; nenhum valor foi registrado em código, documentação ou chat. O redeploy de
produção da versão `ops-direct-retailer-delivery` / `9a06eab` ficou `Ready`.

O fato acima comprova a rotação e a configuração implantada, não a autenticação Browserbase no
runtime nem a cotação do Carrefour. Não houve sessão nova, preflight, checkout, cobrança ou compra.
O próximo uso permanece condicionado a uma tentativa coordenada de reautenticação humana do Context
Carrefour em `cart_only`. Senha Carrefour, PIN de registro WhatsApp e os segredos Mercado Pago/Uber
expostos continuam pendentes de rotação.

Ainda em 18/07, o operador optou por adiar a troca da senha Carrefour exposta. A abertura da conta
serviu somente para confirmar a sessão; nenhuma senha foi digitada, alterada ou registrada. O
Context Carrefour permanece bloqueado para preflight e piloto até a rotação manual pelo titular.
No retry técnico subsequente, a Petz apresentou um redesenho transitório da sacola durante a
limpeza do item anterior; o conector passou a reler o botão de remoção antes de cada ação e ainda
precisa ser revalidado. No Boticário, o único link adicional exposto (“Entrega Rápida”) foi testado
e navegou para uma página informativa, sem frete, prazo ou sacola: ele não é um passo válido da
cotação e foi removido do fluxo. Nenhuma ação financeira foi executada.

## Registro vigente — 02/08/2026: escopo estadual e prontidão

A Lia opera somente no estado de São Paulo. No concierge manual, a UF fora de SP é rejeitada
antes de cotação, cobrança ou compra; quando o ViaCEP não responde, o prefixo do CEP mantém a
mesma fronteira. Overrides legados (`LIA_COVERAGE_OFF`, cidades ou UFs) não podem ampliar o
concierge para fora de SP. Dentro do estado, o endereço exato, o frete, o prazo e a disponibilidade
continuam sendo confirmados por pedido.

O produto está publicado em produção com `LIA_MANUAL_CONCIERGE=true`, `cart_only`, compra
automática desligada e bloqueio de despacho mockado no provider Meta. A base do operador já está
configurada como Sensitive. Dos 19 itens antigos da fila, 12 preflights internos sem pagamento
foram removidos com autorização; 7 pedidos pagos permanecem intactos para conciliação/estorno.
A primeira validação com pedidos reais é uma decisão posterior do operador, não uma pendência de
desenvolvimento. A empresa é MEI e não exige contador fixo. A decisão financeira é usar o Mercado
Pago na PJ e manter a PJ como titularidade operacional da compra. O pós-venda fica: limpar a lista antes do pagamento; sem cancelamento ou
substituição depois do pagamento; estornar o item faltante; avisar atraso. Continua pendente a
documentação de se o desenho exige NF-e, NFS-e ou outro documento e como registrar a taxa,
além da rotação dos segredos expostos. O estorno parcial ainda é manual e deve guardar a
referência do provedor.
