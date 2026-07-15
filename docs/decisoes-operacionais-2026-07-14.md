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

Isto é **implementação verificada por TypeScript, testes focados e build**, não validação ao
vivo. Continua obrigatório validar o checkout Carrefour com endereço real, frete, prazo,
cartão salvo/CVV/3DS/antifraude e aplicar a migration antes de implantar.
