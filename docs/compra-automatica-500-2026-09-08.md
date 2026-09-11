# Compra automática autorizada

## 08/09/2026 — autorização permanente de compra até R$ 500

Dono: “sim isso sim. eu atorizo ate 500 reais. queroo mais automatico que der mesmo se isso significar menos lojas.” Autorizada compra sem aprovação individual. Interpretação conservadora comunicada: teto R$500 por pedido e R$500 total por dia de São Paulo, frete incluso; não interpretar como orçamento diário ilimitado. Priorizar poucas lojas com checkout real validado; interromper expansão de cadastros até concluir a primeira. Não exige loja parceira. Autorização não significa conta/cartão prontos.

Implementado localmente: `purchase-policy.ts`, lista explícita `LIA_AUTO_PURCHASE_STORES` (vazia por padrão, ML assistido), `LIA_AUTO_PURCHASE_OFF`, aprovação por política após pagamento real/carrinho/endereço/conta verificados, nova conferência antes do envio. `PurchaseSpend` registra a reserva em centavos antes do clique, dentro da mesma transação da tentativa e de uma trava global entre lojas. Compras com aprovação individual também consomem orçamento; autorização individual é exceção explícita aos limites, indicada no painel. Resultado incerto, cancelamento e estorno não liberam saldo automaticamente. Revogação ou disputa pelo saldo antes de begin devolve para revisão sem clicar. Falha do comprador avisa o operador.

Painel mostra limites, gasto/reserva do dia e lojas explicitamente liberadas. Quando há lista automática, o comprador restringe novas reservas a ela; não altera a pesquisa automática do ML nem substitui produto escolhido pelo cliente. Cesta multiloja continua assistida. Lista de lojas liberadas vazia: nenhuma conta real homologada. Não preencher allowlist por inferência de cadastro/login.

Validação: 567/567 testes em Postgres local, migration sem drift; TypeScript do app/runtime, lint, build e painel no Chrome simulado aprovados. Migration aditiva `20260907120000_purchase_spend` precisa preceder publicação. Nenhum deploy, cartão salvo, compra real ou processo de compra iniciado nesta alteração. Falta concluir primeira conta/cartão, observar botão/comprovante/status, configurar processo e publicar. Detalhes: [política de compra](docs/compra-automatica-500-2026-09-08.md).

## Operação e ativação

O cliente paga primeiro. Somente pagamento real e integral, sem estorno/cancelamento ou resultado pendente, pode criar execução. O preparador monta exatamente a cesta e entrega do pedido. Se a conta está ativa e na lista de lojas homologadas, e o total cabe nos dois limites, a política aprova sem mensagem pedindo clique. A decisão do orçamento é revalidada e reservada atomicamente no início da tentativa. O comprovante exato alimenta o acompanhamento já implementado.

O gasto diário considera o dia do início autorizado da tentativa (America/Sao_Paulo). O registro de gasto não tem exclusão em cascata com o pedido. Até uma tentativa posteriormente conciliada como não comprada continua consumindo limite naquele dia: não reaproveitar automaticamente dinheiro de resultado incerto. O orçamento do novo dia começa à meia-noite; uma exceção já estacionada não é retomada silenciosamente na virada do dia. O operador pode dar autorização adicional concreta no painel.

Para ativar, aplicar as três migrations pendentes do comprador/acompanhamento/orçamento, publicar o código, concluir uma conta e cartão no perfil Chrome dedicado e validar seletores reais de checkout, comprovante e status. Só depois incluir a loja em `LIA_AUTO_PURCHASE_STORES` e ativar sua conta no painel. A lista vazia não autoriza nenhuma loja. Valores de R$500 são limites fixos no código; aumento exige nova instrução do dono. Pausar automático por `LIA_AUTO_PURCHASE_OFF=true`, ou toda finalização por `LIA_PURCHASE_SUBMIT_OFF=true`. O cadastro de novas lojas fica suspenso em favor da primeira validação completa.

O rastreio real ainda depende de página de pedidos homologada e processo ativo; esta alteração de autorização não o implanta. A busca por produto e o resgate automático do Mercado Livre continuam como estavam. Redução de lojas aqui é a seleção do executor automático, não uma troca silenciosa de produtos já escolhidos.
