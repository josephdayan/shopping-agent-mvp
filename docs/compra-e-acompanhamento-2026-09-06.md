# Compra e acompanhamento — implementação de 06/09/2026

**Estado: implementado e testado localmente; não implantado nem homologado em contas reais.**
O dono autorizou implementar as melhorias e descartou lojas parceiras. A Lia continua
comprando como cliente nos sites existentes. Não é necessário acordo comercial com lojas.

## Atualização 08/09 — aprovação permanente

A regra abaixo de aprovação por carrinho passa a valer para exceções. O dono autorizou compras sem aprovação individual até R$500, com teto diário conservador de R$500, incluindo frete. Implementação, limites e pendências em [política de compra](compra-automatica-500-2026-09-08.md). A lista de lojas homologadas continua vazia; não houve ativação real. A migration `20260907120000_purchase_spend` também é necessária.

## Como fica a operação

1. O pagamento confirmado cria a intenção de compra. O comprador consulta a fila a cada
   15 segundos; não depende de esperar a tarefa horária do ChatGPT. Recuperação de fila
   cobre falha de notificação após pagamento.
2. Cada loja usa uma conta operacional da Lia e um perfil próprio do Chrome. O cadastro
   inicial de login e cartão ocorre diretamente na loja. O painel registra apenas e-mail
   e prontidão. Não recebe senha, número de cartão nem CVV.
3. O comprador prepara o carrinho, confere destinatário/endereço completo, SKU, quantidade,
   vendedor, preço, modalidade/prazo e pagamento salvo. A IA somente separa os componentes
   do endereço; os campos precisam corresponder ao texto original, inclusive complemento.
4. O /ops apresenta o carrinho e um botão **Autorizar compra de R$ X**. O aviso ao operador
   usa o canal já existente. **Não há prazo de 5 minutos para o operador responder.** O
   resumo fica salvo, e o comprador esvazia apenas a cesta conferida e libera a conta.
   O computador não precisa manter o navegador aberto durante a espera.
   Ao aprovar, o pedido volta à fila de execução. O comprador reconstrói a cesta e compara
   as condições atuais com o resumo autorizado. Só se estiverem idênticas é aberta uma
   janela técnica de 60 segundos para finalizar. Mudanças exigem nova conferência; dados
   fora do pedido ou do teto não são liberados por essa aprovação.
5. Após autorização e reconferência atual, o comprador obtém uma permissão de uso único e clica uma
   vez. Só registra compra com número e total do comprovante iguais ao checkout aprovado.
   Timeout após o envio não gera outro clique: a conta fica reservada para conferência.
6. A compra registrada gera acompanhamento. Um leitor separado consulta a página de
   pedidos a cada 2 minutos, com recuo de 5 até 60 minutos em falhas. Pedidos antigos já
   comprados também entram, se forem de uma loja e tiverem número confirmado.
7. Só o status atual explícito do pedido inteiro gera “saiu para entrega” ou “entregue”.
   Previsão, texto genérico de linha do tempo, outro número ou um pacote isolado não bastam.
   Se a primeira prova observada for “entregue”, não inventamos aviso anterior de saída.

**Atualização 08/09:** dentro da política autorizada e nas lojas homologadas, não há confirmação individual. Exceções continuam no painel. A homologação real ainda está pendente.

## Código entregue

- `purchase-execution.ts`: contas prontas, identidade de sessão, conferência vinculada à
  aprovação, início de tentativa durável, conclusão idempotente e recuperação auditada.
- `purchase-worker.ts`: jobs para contas habilitadas; reserva do carrinho por loja;
  trabalhadores antigos não disputam contas ativadas para o comprador novo.
- `scripts/retail-buyer`: processo executável, perfis persistentes separados, preparação
  VTEX por checkout público do comprador, seleção de cartão salvo, botão/comprovante
  configuráveis e leitor de status. Não recebe banco nem OPS_TOKEN; o Chrome herda
  somente variáveis básicas do sistema, sem chaves do processo.
- `/api/purchase-worker/session`: credencial do comprador. `/api/tracking-worker`: outra
  credencial, sem poder de compra. Contas e aprovação exigem sessão do /ops.
- `/ops`: contas, carrinho, aprovação, instrução de recuperação e registro de conferência.
- `TrackingSubscription`: agenda persistente e reserva de leitura. Leitor e comprador
  não abrem o mesmo perfil em paralelo; tentativas entre processos usam a mesma trava.
- `DeliveryEvent`: mudança de etapa e aviso na mesma transação, deduplicação e recibos
  Meta. Aceite da mensagem pela API não significa entrega ao telefone.
- Estorno e cancelamento disputam a mesma trava do pedido com o início da compra.
  Resultado financeiro desconhecido precisa ser conciliado antes de devolver dinheiro.
  Plano B também verifica estado/cesta e tentativa em andamento antes de substituir.

As migrations `20260906090000_delivery_events` e `20260906150000_purchase_execution`
são aditivas. Devem anteceder o novo código e os monitores em produção.

## O que os testes provam — e o que falta

Testes locais cobrem contas incompletas, destinatário/endereço divergente, quantidade,
valores, validade, aprovação de outro cartão, envio concorrente, bloqueio de estorno e
cancelamento, resultado desconhecido, comprovante divergente, conclusão duplicada,
recuperação auditada, token de leitor separado e status sem evidência suficiente.

O teste com Chrome intercepta todas as requisições: não acessa varejista nem realiza
compra. Cobre carrinho ocupado, complemento divergente, preparação sem compra, clique
único, comprovante e bloqueio de origem. O painel foi renderizado no Chrome com dados
fictícios: conta previamente configurada permanece preenchida e aprovação leva o hash
exibido. Isso **não é homologação do checkout real das lojas**.

O preparador tem origens e prefixos para as nove lojas VTEX. Os seletores de botão final,
comprovante e status NÃO foram inventados e ainda precisam ser observados em uma sessão
real de cada loja. Sem esses seletores, o processo não reserva compras dessa loja.
Mercado Livre permanece no executor assistido anterior; outros formatos de checkout
precisam de adaptadores próprios. Cesta com múltiplas lojas/pacotes continua manual.

O leitor de código por e-mail foi implementado em 10/09 para o acesso rápido da Swift,
mas ainda não recebeu consentimento ou credencial real. Usa Gmail OAuth somente leitura,
aceita apenas mensagens recentes de remetentes permitidos e não registra o conteúdo ou o
código. O acompanhamento de pedidos continua usando a página de pedidos configurada;
não há rastreio em produção enquanto essa página e o processo não forem ativados.
CAPTCHA, autenticação adicional, CVV, carrinho existente, vendedor ambíguo, nome ausente
ou endereço não verificável exigem intervenção. Não foi cadastrado cartão neste trabalho.

Avisos ao cliente fora da janela da Meta dependem de template aprovado/configurado.
Aviso de carrinho ao operador reutiliza a função existente: seu envio não tem a mesma
fila de recibos dos eventos de entrega; conferir o painel durante homologação.
O processo precisa de um computador ligado; não foi instalado serviço de inicialização.

## Ativação operacional

1. Publicar a versão com as duas migrations e configurar os tokens separados no servidor
   e no processo local. Validar o painel. Nenhuma variável sensível entra no Git.
2. Executar `npm run purchase-worker:init`. O arquivo privado
   `.retail-buyer/config.json` contém URL do servidor e configuração das lojas, sem cartões.
3. Executar `npm run purchase-worker:setup -- drogariasp`. Na janela dedicada, entrar no
   e-mail operacional e cadastrar um único cartão corporativo. Fechar a janela ao terminar.
4. Conferir o checkout e a página do pedido da loja. Preencher no arquivo a configuração
   `submitSelector`, `receipt` (successSelector, orderNumberSelector, totalSelector) e
   `tracking` (urlTemplate com `{orderNumber}`, orderNumberSelector, statusSelector,
   wholeOrder). O seletor de status deve apontar para o estado atual do pedido inteiro,
   nunca para a sequência de etapas possíveis. Se não houver prova do pedido inteiro,
   manter acompanhamento manual nessa loja.
5. Habilitar conta/e-mail/login/cartão em **Contas de compra da Lia** no /ops. O processo
   recebe `LIA_PURCHASE_WORKER_TOKEN`, `LIA_TRACKING_WORKER_TOKEN` e `OPENAI_API_KEY` por
   ambiente protegido. No macOS os tokens também podem vir dos itens existentes no
   Chaves: serviços “Lia Purchase Worker” e “Lia Tracking Worker”, conta “lia-purchase-worker”.
6. Para a Swift, criar um cliente OAuth local com apenas `gmail.readonly`, obter acesso
   offline com participação do titular e guardar no Chaves, conta `lia-purchase-worker`,
   os serviços “Lia Gmail Client ID”, “Lia Gmail Client Secret” e “Lia Gmail Refresh Token”.
   Não colocar esses valores no perfil do Chrome, no banco ou na Vercel. Validar com
   `npm run purchase-worker:mailbox-check`; a saída informa somente `ready` ou erro.
7. Executar `npm run purchase-worker:once` para uma passagem controlada; depois
   `npm run purchase-worker:run` no computador operacional. Uma compra real de homologação
   precisa de aprovação concreta no painel. Não repetir se o resultado ficar incerto.
8. Confirmar número/total/endereço na loja e recibos dos avisos ao telefone antes de
   habilitar outra loja. Só depois substituir a tarefa horária por monitoração de exceções.

Para pausar finalizações, `LIA_PURCHASE_SUBMIT_OFF=true` no servidor. Para pausar novas
compras de uma loja, desativar a conta no painel. Uma compra já enviada exige conciliação;
pausa não desfaz pagamento na loja. Para recuperar uma interrupção, encerrar o comprador,
conferir pedidos e cobranças pendentes, esvaziar o carrinho e registrar a conferência no
painel. Existe uma espera mínima de 2 minutos desde o último contato antes da liberação.

## Validação

- **560/560 testes**, zero skips, em PostgreSQL local; migrations × schema sem divergência.
- TypeScript do aplicativo e do processo local, lint e build aprovados; build local sem migration/deploy.
- `npm run purchase-worker:verify`: Chrome com loja simulada.
- `npm run purchase-worker:verify-ui`: Chrome com painel e respostas simulados.

Nenhuma compra, cobrança, mensagem real ou alteração de conta externa foi realizada.
A automação horária existente não foi alterada nesta implementação.

Foi corrigida também a instabilidade de `ops-login-token.test.ts`: a adulteração substituía
o último caractere por zero mesmo quando ele já era zero. Agora o teste sempre altera a
assinatura. A autenticação não foi afrouxada para fazer o teste passar.


## Ajuste solicitado: responder quando puder

A aprovação antiga continua disponível sem navegador ou reserva ativa. A fila retoma
pedidos aprovados, revalida pagamento/pedido/conta e compara a cesta refeita antes do
envio. A reserva só é liberada após o navegador confirmar que retirou os próprios itens
(e não um carrinho divergente). Aprovar durante a liberação não perde a autorização.
O heartbeat é serializado com a liberação, para não recriar uma reserva já encerrada.

Isso remove a janela humana de 5 minutos, não as regras de cancelamento/estorno do pedido
nem a validade curta da observação feita na loja. Pedidos já encerrados não podem ser
comprados. Uma demora na aprovação também pode consumir o prazo operacional antes de
um estorno automático; essa política comercial anterior permanece vigente.

Validação específica: aprovar resumo de uma hora atrás após fechar a sessão, usar a conta
em outro pedido durante a espera, exigir nova aprovação para alteração de frete, rejeitar
leitura antiga antes do envio e preservar aprovação que chega durante a liberação. Chrome
simulado confirma limpeza seletiva do carrinho sem compra e botão habilitado após uma hora.


## Esclarecimento: cadastros, verificações e nome do destinatário

O cadastro de conta/cartão é por loja habilitada. A configuração inicial local contém
Drogaria SP; não é necessário configurar as nove origens antes de validar uma operação.
Sessão persistente evita refazer login deliberadamente a cada execução, mas a loja pode
exigir autenticação adicional. A incidência real de CAPTCHA/autenticação ainda não foi
medida; desafios frequentes não atendem à exigência operacional do dono.

No código, a conta/comprador mantém seu perfil, enquanto `shippingData.selectedAddresses`
usa `receiverName` e endereço do cliente do pedido. O comprador bloqueia a finalização se
esses dados divergirem. Isso não prova o que será impresso no pacote nem garante que
nota/comprovante não exponham dados da conta compradora. Homologação real deve conferir
ambos antes de ativar a loja. Nenhuma identidade de comprador foi trocada neste trabalho.
