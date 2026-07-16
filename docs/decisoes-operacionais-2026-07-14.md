# Decisões operacionais — 14 de julho de 2026

Este documento registra as conclusões obtidas em 14/07/2026 após validar o checkout real
da Petz e revisar as políticas oficiais de retirada da Petz, Carrefour e Uber Direct.
Ele substitui a premissa anterior de que uma compra comum em `clique-e-retire` poderia ser
coletada em escala por qualquer motoboy.

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

## Pagamento por cartão no WhatsApp: decisão de hoje

O 360dialog não é parte necessária deste fluxo. A Lia envia o `order_details` diretamente
para a Graph API da Meta e recebe a confirmação no mesmo webhook. O Pagar.me mantém o
`card_id`, cobra no servidor e envia eventos de reconciliação.

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
implantada em 15/07. A inspeção ao vivo também confirmou que a regionalização atual do
Carrefour submete o CEP por Enter, e o seletor foi corrigido e implantado.

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
