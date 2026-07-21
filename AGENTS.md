# Lia — contexto obrigatório para agentes

_Última atualização: 2026-07-20._

Leia este arquivo antes de planejar, responder sobre o estado do produto ou alterar o
projeto. Ele é a memória canônica curta da Lia. Para detalhes, leia também:

1. [STATUS.md](STATUS.md) — estado técnico e operacional;
2. [PENDENCIAS.md](PENDENCIAS.md) — checklist canônico de progresso e lançamento;
3. [docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md) —
   evidências e decisão operacional vigente;
4. [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md) — canais e piloto;
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
- **Envs novos**: `LIA_MANUAL_CONCIERGE` (default on), `LIA_OPERATOR_PICKUP_ADDRESS`,
  `LIA_OPERATOR_PICKUP_CEP` (base de onde o motoboy retira).
- **Próximo passo**: piloto manual de 5–10 pedidos reais medindo demanda, margem após frete e
  tempo por pedido. Titularidade/NF continuam pendência antes do público. Código: TypeScript,
  lint, testes focados (fluxo manual + evals legados) e build verdes em 2026-07-20.

O restante deste arquivo descreve o fluxo legado de automação por varejista; ele continua
válido como referência, mas **o produto ativo é o concierge manual acima**.

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

## Fluxo-alvo vigente

1. Cliente informa itens e endereço no WhatsApp.
2. Lia busca opções reais e resolve ambiguidades.
3. Lia monta uma sacola temporária antes de cobrar.
4. O checkout do varejista determina estoque, preço, frete, modalidade e prazo para o CEP.
5. Lia mostra a cotação com validade curta.
6. Cliente paga a Lia por Pix, Checkout Pro ou, quando habilitado, One-Click nativo no
   WhatsApp com Pagar.me.
7. Lia revalida itens, total, endereço e prazo.
8. Compra segue em `cart_only`/aprovação explícita durante o piloto.
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
  desligado até a allowlist da Meta, chaves/domínio/webhook Pagar.me e migrations serem
  configurados. Não depende de 360dialog. Ver
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
  O contato ao Customer Success foi enviado em 18/07, com Samuel em cópia; aguardar resposta
  técnica escrita antes de criar conta de teste, alterar canal ou ligar a flag.
- A revisão da documentação Pagar.me V5 em 16/07 confirmou `tokenizecard.js`, domínio
  liberado e cobrança por `card_id`, mas também expôs um gate a confirmar com o PSP: a API
  distingue `recurrence_cycle=first|subsequent` e orienta CVV apenas na primeira transação
  de recorrência externa. O adaptador atual usa `card_id` sem marcar o ciclo. Isto não é
  falha validada ao vivo, mas precisa de resposta do Pagar.me e eventual ajuste/teste antes
  do sandbox real e antes de ligar a flag.

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
