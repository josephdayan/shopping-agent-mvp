# Operador automático local — monitoramento de todas as lojas

Desde 02/09/2026, a rotina horária consulta `DeliveryOrder` diretamente, sem filtro por
loja, existência de `PurchaseJob` ou limite dos primeiros N pedidos. Ela acompanha
todos os pedidos ativos, os encerrados/alterados nas últimas 24 horas e pendências
financeiras. O executor de carrinho continua específico do Mercado Livre; ele NÃO é
a fonte de verdade sobre a existência de pedidos.

**`job: null` significa apenas ausência de job elegível do Mercado Livre.** Um pedido
pago da Natural da Terra, por exemplo, não gera esse job e ainda precisa de atendimento.

## Checagem e inspeção (somente leitura)

```sh
npm run --silent purchase-worker:monitor
npm run --silent purchase-worker:inspect -- ID_DO_PEDIDO
```

O primeiro comando carrega a `DATABASE_URL` local do projeto e retorna `checkedOrders`,
contagens por ação e `byAction`. Cada linha segue `columns`: ID curto, status, instante
da última alteração em epoch ms e lojas. Todos os registros consultados estão listados;
itens e dados de entrega ficam na inspeção individual para não inundar a rotina. ID curto
ambíguo é recusado: nesse caso, use o completo. Falha de conexão encerra com erro, nunca
com uma resposta que pareça fila vazia.

As ações separam compra pendente, compra bloqueada, job em andamento, reconciliação,
pagamento, estorno, cotação e acompanhamento de entrega. `purchase_required` exige
evidência de pagamento real no razão, valor exato e nenhum estorno, bloqueio ou compra
prévia. Não é autorização para comprar: releia os detalhes e verifique o varejista.
Pagamentos antigos sem evidência entram em revisão; não presuma que são testes.

O monitor não reserva jobs, cobra, manda WhatsApp, altera pedidos ou executa checkout.
Bloqueios já registrados com `🛑 COMPRA BLOQUEADA:` ficam visíveis como revisão de compra.
O estado `paid` não significa que a compra na loja já foi feita.

## Régua operacional

1. `PURCHASE_AUTOMATION_MODE=cart_only`: abre o anúncio, confere item, quantidade,
   endereço, prazo e total, mas para antes do botão final.
2. Nunca trocar produto, vendedor, endereço ou modalidade por aproximação.
3. Total acima do valor aprovado, carrinho alterado, login/2FA, CAPTCHA ou divergência
   de prazo: marcar `needs_review` e devolver ao operador.
4. Antes da confirmação final, procurar o número do pedido no Mercado Livre e no `/ops`.
   Se já existir, reconciliar; nunca enviar novamente.
5. Não registrar cookies, cartão, códigos de 2FA ou dados completos do cliente nos logs.

## Executor de carrinho do Mercado Livre

O segredo do worker fica no Chaves do macOS e também no ambiente publicado, configurados
na ativação. O cliente usa `https://liadelivery.com.br` por padrão. Depois execute:

```sh
npm run purchase-worker:claim
```

Sem job elegível do Mercado Livre, a resposta contém `"job": null`; isso não dispensa
a checagem geral acima. Havendo job, ela contém uma tarefa
com links exatos, quantidades, teto de valor e endereço. O lease dura 15 minutos; falhas
recuperáveis voltam à fila depois de 5 minutos.

## Luna e recorrência

A tarefa `operador-de-compras-da-lia` foi atualizada em 02/09/2026 para começar pelo
monitor de TODAS as lojas a cada hora. Outras lojas são inspecionadas em modo de leitura;
a ampliação não habilita novas compras recorrentes, cobranças ou estornos. O fluxo
existente do Mercado Livre prepara o carrinho e para antes do botão final. A autorização
específica para comprar um pedido não habilita automaticamente checkout recorrente dos
demais pedidos.

A preferência histórica por Luna continua separada do script: a tarefa heartbeat usa
a configuração da conversa. A recorrência continua local no Mac, não foi migrada para
a nuvem e depende de o computador/app estarem disponíveis. O monitor local já funciona
sem deploy da aplicação. A configuração de notificações existente foi preservada.
Estados iguais/sem ação nova ficam silenciosos; mudanças relevantes são relatadas.

Validação da ampliação: `tsc`, lint e `npm run test:local`, 481/481 testes no Postgres
local; consulta real confirmou o pedido da Natural da Terra sem PurchaseJob.
