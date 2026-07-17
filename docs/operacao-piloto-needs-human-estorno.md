# Operação do piloto — `needs_human`, cancelamento e estorno

_Criado em 16/07/2026. Procedimento padrão do piloto controlado; revisar após os
primeiros incidentes reais._

Este runbook cobre os pedidos com entrega direta do varejista. Ele não autoriza compra
automática, não substitui as regras do Mercado Pago/Pagar.me e não transforma courier
externo em rota válida de retirada.

## Regras invioláveis

- Produção permanece em `PURCHASE_AUTOMATION_MODE=cart_only` até piloto auditado.
- Login, OTP, CAPTCHA, CVV e 3DS são resolvidos por uma pessoa na sessão oficial; nunca
  são burlados ou copiados para chat, banco, logs ou Markdown.
- Se o clique financeiro tiver resultado incerto, não repetir. Conferir primeiro a
  sessão do varejista e o extrato/status do provedor.
- Mudança em item, quantidade, total, frete, endereço ou promessa de entrega invalida a
  aprovação anterior.
- Pedido com `retailer_delivery` nunca despacha courier externo. O `/ops` bloqueia essa
  ação; exceção exige parceiro formal e pedido configurado para a rota autorizada.

## Responsável e tempos do piloto

O responsável é o operador de plantão que iniciou ou assumiu o pedido no `/ops`.
Enquanto não houver escala formal, usar estes limites conservadores:

1. reconhecer um `needs_human` em até 10 minutos durante a janela do piloto;
2. resolver, pedir decisão ao cliente ou cancelar em até 30 minutos;
3. se a promessa da loja puder ser perdida antes disso, interromper a compra e oferecer
   nova cotação, nunca inventar um prazo;
4. fora da janela com operador disponível, não aceitar novos pedidos com dinheiro real.

Esses tempos são metas internas de operação, não SLA prometido ao cliente.

## Triagem de `needs_human`

| Código/sinal | Ação permitida | Saída segura |
| --- | --- | --- |
| `LOGIN_REQUIRED` | abrir a sessão viva do mesmo Context e autenticar manualmente | repetir somente o preflight sem pagamento/compra |
| `CAPTCHA_REQUIRED` | resolver manualmente na sessão | retomar a mesma etapa uma vez |
| `PAYMENT_ACTION_REQUIRED` / 3DS / CVV | operador conclui o desafio na sessão, após aprovação explícita | registrar resultado; nunca guardar CVV |
| `PRICE_CHANGED` | comparar item, frete, total e prazo com a cotação aprovada | nova aprovação do cliente ou cancelamento/estorno |
| `OUT_OF_STOCK` / `AMBIGUOUS_ITEM` | não substituir automaticamente | pedir escolha ao cliente ou remover o item e recotar |
| `RETAILER_BUSY` | deixar a fila durável tentar novamente | não abrir outro carrinho no mesmo Context |
| `ORDER_STATUS_UNKNOWN` | parar qualquer retry financeiro | conferir sessão, pedido da loja e extrato antes de decidir |
| varejista indisponível | aguardar dentro da validade da cotação | expirou: cancelar e recotar |

Ao resolver, o operador registra no pedido somente metadados necessários: código do
incidente, decisão, horário, número do pedido da loja e link/referência não secreta.

## Cancelamento e estorno

O botão do `/ops` não executa estorno no provedor. O fluxo seguro é deliberadamente em
duas etapas:

1. **Cancelar e solicitar estorno:** para pedido já pago, o sistema muda para
   `refund_pending`, grava `ESTORNO PENDENTE` e avisa ao cliente que a confirmação ainda
   virá. Etapas de carrinho/aprovação ainda não iniciadas são canceladas para liberar o
   Context. Para pedido sem pagamento, muda diretamente para `canceled`.
2. **Executar no provedor:** operador cancela a compra no varejista quando possível e
   solicita o estorno no meio de pagamento original. Não trocar Pix por crédito interno
   ou outro meio sem concordância explícita.
3. **Conferir:** verificar no Mercado Pago/Pagar.me que o estorno foi aceito. Uma tela
   aberta ou clique sem resposta não é confirmação.
4. **Confirmar no `/ops`:** informar a referência do provedor. Só então o pedido muda
   para `refunded` e a Lia confirma ao cliente.

Se o varejista já tiver despachado, não prometer cancelamento. Tratar conforme a política
de recusa/devolução da loja e registrar a comunicação ao cliente.

Se uma finalização no varejista já estiver em voo quando o cancelamento ocorrer, o sistema
preserva `refund_pending` e não ressuscita o pedido como preparação. O job da loja continua
como evidência para o operador conferir e cancelar a compra no varejista; nunca repetir o
clique financeiro.

## Auditoria mínima por pedido

- cotação aprovada: itens, total, frete, promessa e validade;
- pagamento: provedor, ID não secreto e horário de confirmação;
- compra: número do pedido da loja, aprovação e resultado;
- entrega: modalidade, promessa, rastreio e transições;
- incidente: código, decisão humana e comunicação;
- estorno: meio original, referência e horário de confirmação.

Nunca registrar senha, cookie, chave de API, número completo de cartão, CVV, documento
pessoal ou conteúdo de OTP.

## Critérios de parada

Interromper novos pedidos do piloto se ocorrer qualquer um destes casos:

- cobrança duplicada ou compra duplicada;
- pedido marcado como comprado sem confirmação no varejista;
- estorno informado ao cliente sem confirmação do provedor;
- mistura de carrinhos entre clientes;
- segredo ou dado financeiro exposto;
- operação sem responsável disponível na janela definida.

Depois da contenção, registrar o incidente, corrigir a causa e executar um teste sem
dinheiro antes de retomar.
