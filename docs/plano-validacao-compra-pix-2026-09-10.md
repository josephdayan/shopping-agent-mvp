# Plano de validação da compra por Pix

Data: 10/09/2026. Estado: **em execução; nenhuma das quatro lojas inspecionadas passou o gate autônomo**.

## Execução de 10/09/2026

A etapa 1B foi executada até o primeiro bloqueio, sem criar pedido nem movimentar dinheiro. No perfil persistente autenticado da Pague Menos, a cesta anterior continuava íntegra: um Fio Dental Reach, vendido e entregue por Farmácias Pague Menos, subtotal de R$19,49, frete econômico de R$4,90 e total de R$24,39, para o endereço já usado na preparação anterior.

Ao selecionar **Pix**, o checkout informou que o código QR somente seria gerado depois de “Finalizar compra”. A página continuou exibindo “Verificação de segurança”, a caixa “Não sou um robô” permaneceu desmarcada e o botão de finalização ficou desabilitado. Nenhum CAPTCHA foi resolvido e nenhuma finalização foi tentada.

Resultado: **Pague Menos reprovada para a rota automática proposta**. A evidência real da loja prevalece sobre a regra geral da VTEX citada neste plano. Pix elimina o CVV, mas não elimina a intervenção obrigatória observada antes da emissão da cobrança nessa loja. Não implementar o adaptador Pix da Pague Menos, não habilitá-la na allowlist e não contratar a camada bancária com base nessa rota.

A etapa 1A permanece inconclusiva. As fontes públicas confirmam o endpoint de pagamento de QR do Asaas, mas não garantem que uma conta real possa usá-lo repetidamente sem ação crítica humana, e a referência pública não apresenta uma chave de idempotência para recuperar com segurança uma resposta perdida antes do retorno do ID. Não há conta nem credencial Asaas/Efí configurada neste workspace. Antes de testar outro varejista com dinheiro real, escolher uma única loja alternativa e repetir o gate até a emissão de Pix sem desafio.

A Oba foi testada como alternativa. O dono autorizou o cadastro obrigatório no Programa Cliente Bem Querer e ampliou o orçamento disponível, mas determinou que a prova não compre itens caros desnecessariamente. Foi montada uma cesta temporária de itens úteis, no menor total prático acima do mínimo de R$89,90: R$97,76. O checkout abriu sem CAPTCHA. Após o cadastro e o preenchimento do endereço operacional autorizado, o site apresentou uma inconsistência na unidade de entrega; para isolar o gate de pagamento, avançou-se com retirada em loja. Na tela real de pagamento, as únicas opções foram cartão de crédito e Google Pay. Pix não estava disponível. Nenhum pedido ou pagamento foi criado, e a cesta foi esvaziada.

Resultado: **Oba reprovada para a rota proposta**. O orçamento maior é apenas teto; não é meta de gasto. Toda prova seguinte deve usar o menor carrinho legítimo permitido pela loja e parar antes de criar pedido se o gate já puder ser decidido.

A Cobasi foi testada com uma unidade de um produto útil de R$2,80. O carrinho real confirmou esse único item; o fluxo exigiu identificação, iniciou o cadastro e enviou um código de validação ao e-mail operacional. A caixa de e-mail não estava autenticada no perfil do comprador, portanto o fluxo não pôde prosseguir autonomamente. O cadastro foi cancelado, nenhum pedido ou pagamento foi criado e o carrinho foi esvaziado. A Cobasi permanece fora da allowlist. A presença de reCAPTCHA invisível na página de acesso também foi registrada, sem afirmar que ele necessariamente apresentaria desafio em toda sessão.

A Swift foi testada em seguida com uma unidade do item útil mais barato disponível, R$4,50. Para entrega, o carrinho totalizou R$22,40 com frete de R$17,90. Antes da etapa de pagamento, a loja exigiu autenticação. O caminho de acesso rápido enviou uma chave ao e-mail operacional, que também não estava acessível no perfil do comprador. Nenhum pedido ou pagamento foi criado, e o carrinho foi esvaziado. A Swift permanece fora da allowlist.

Resultado combinado: **Cobasi e Swift são inconclusivas quanto ao Pix, mas reprovadas no gate autônomo atual por dependência de código por e-mail**. A próxima ação útil não é montar outra cesta: é dar ao comprador acesso programático e auditável ao e-mail operacional ou homologar uma sessão de conta que não peça código por compra. Só depois vale repetir uma única candidata até a tela de pagamento.

A infraestrutura local desse próximo gate foi implementada. O comprador agora possui um leitor Gmail por OAuth com escopo somente leitura, renovação de token fora do navegador, filtro por domínio da loja, corte pelo instante em que o código foi solicitado e recusa de mensagens ambíguas. O conteúdo e o código não são gravados nem enviados ao servidor da Lia. A autenticação por “Acesso Rápido” da Swift foi conectada a esse leitor e só roda quando a sessão persistente não corresponde à conta operacional. O comando `npm run purchase-worker:mailbox-check` verifica apenas se a credencial consegue acessar o perfil da caixa.

Essa implementação ainda não aprova a Swift: faltam consentimento OAuth real da caixa, credenciais guardadas no Chaves e uma execução real que confirme remetente, formato do código, login, Pix, recibo e consulta do pedido. A conta da loja e a allowlist continuam desativadas.

Validação local desta etapa: 577/577 testes em PostgreSQL, migrations sem divergência, TypeScript do aplicativo e do comprador, lint, teste isolado do leitor e verificador de navegador aprovados.

Registro detalhado: [evidências da execução](evidencias-validacao-compra-pix-2026-09-10.md).

## Decisão proposta

Validar, em uma única loja, se a Lia consegue preparar uma compra, obter o Pix do varejista, pagá-lo por uma conta empresarial e confirmar o pedido com pouca intervenção. Investir na integração ao produto somente depois de demonstrar esse percurso em uma prova isolada.

A candidata inicial é a Pague Menos, usando produtos não medicamentosos vendidos e entregues pela própria rede. Asaas é um candidato para o pagamento de saída; a escolha depende de comprovação das condições da conta. Efí pode ser avaliada se o primeiro candidato não atender aos requisitos. Não abrir várias contas ou ampliar lojas simultaneamente.

O objetivo operacional é retirar o dono da execução de cada pedido. Não assumir ausência permanente de falhas, suporte, manutenção ou reautenticação. Nenhuma parceria com varejista faz parte do plano.

## O que já sabemos e o que falta provar

| Evidência existente | Limite dessa evidência |
| --- | --- |
| Houve uma compra real assistida na Pague Menos. | O dono resolveu CAPTCHA; não houve recompra automática. |
| A conta e o cartão foram reaproveitados numa segunda preparação. | O cartão voltou a exigir CVV; foi usado o mesmo endereço. |
| O comprador contínuo e a preparação VTEX existem localmente. | O contrato atual exige cartão salvo; testes simulados não homologam a loja. |
| A VTEX documenta dispensa do seu reCAPTCHA de checkout em pedidos sem cartão. | Não comprova ausência de desafios próprios da loja, do acesso ou do login. |
| Há API para pagar QR Pix e autorizar saída pelo sistema. | Não comprova que a conta real estará habilitada sem confirmação humana, nem que falhas serão conciliáveis. |
| Cobasi e Swift anunciam Pix no comércio eletrônico. | Ambas interromperam o ensaio na autenticação por código de e-mail antes da tela de pagamento. |

Referências locais: [configuração das lojas](configuracao-lojas-2026-09-07.md), [comprador e acompanhamento](compra-e-acompanhamento-2026-09-06.md), [política de gasto](compra-automatica-500-2026-09-08.md).

## Limites da investigação

- Uma loja, um vendedor, uma conta de compras e uma compra por vez nessa conta.
- Uma loja por cesta. Preservar produto, quantidade, destinatário e entrega escolhidos.
- Prova isolada do atendimento de clientes em produção. Nenhuma alteração de cobrança, catálogo, allowlist ou automação nesta entrega de planejamento.
- Usar o ambiente previsto para o comprador: navegador persistente em máquina operacional independente do computador pessoal. Um ensaio no Mac pode diagnosticar, mas não aprova a execução em outro host.
- Identificar a cesta já preparada na Pague Menos antes de qualquer ensaio futuro. Não apagar itens desconhecidos nem confundir pedido anterior com o teste.
- Não contornar desafios nem alterar configurações da loja. Desafios entram como evidência de intervenção necessária.
- Teto autorizado para a prova: **R$500 no total em compras, frete incluso**, compartilhado com o teto vigente de R$500 por dia de São Paulo. Esse é um limite máximo, não uma meta. Usar sempre o menor pedido legítimo que prove o gate e não comprar itens desnecessários para completar amostras.
- Custos de conta, tarifas e ambiente serão levantados antes da contratação. Proposta de teto adicional de infraestrutura para a prova: R$100; contratação não realizada por este plano.
- Gasto real, reservas e resultados incertos consomem limite. Cancelamento ou estorno não liberam orçamento por inferência. As compras do piloto também contam no limite diário existente.
- O dono autorizou executar a prova dentro desses limites. A execução deve respeitar confirmações específicas impostas pelo canal apenas quando aplicáveis; não criar aprovações individuais onde já existe autorização suficiente.

## Etapa 1 — confirmar as duas dependências externas

As duas frentes abaixo podem avançar em paralelo quando houver autorização para executar a prova. Nenhuma exige integrar o pagamento ao fluxo comercial da Lia.

### 1A. Conta de pagamento

Responsável proposto: responsável técnico pela Lia; titular da conta participa apenas do cadastro, verificações e permissões que a instituição exigir.

Obter documentação ou resposta objetiva do fornecedor sobre:

1. Pagamento de **QR Pix dinâmico emitido por outro PSP**, com saldo da conta empresarial, em produção.
2. Condições exatas para pagamentos por software sem código, aplicativo ou confirmação humana por transação; limites de valor, frequência e beneficiários.
3. Relação entre autorização por webhook e outras confirmações de segurança. Não presumir que uma elimina a outra.
4. Identificadores disponíveis para associar a cobrança da loja ao pagamento bancário e ao resultado final.
5. Recuperação de uma solicitação que perdeu a resposta antes de devolver identificador: consultar com certeza e evitar pagamento duplicado. Valor e beneficiário iguais não identificam uma compra de forma suficiente.
6. Dados verificáveis do recebedor, valor, vencimento e identificação da cobrança; tarifas, devoluções e tratamento de cobrança expirada.

**Entrega:** ficha curta com condição confirmada, fonte/data, custo e pendências. As perguntas são um roteiro; nenhuma mensagem foi enviada ao fornecedor neste trabalho.

**Aprovar para a prova financeira:** condições de produção esclarecidas e conta efetivamente habilitada para esse uso. A comprovação prática virá na etapa 3.

**Parar/reavaliar:** confirmação humana obrigatória em toda saída, limites insuficientes ou impossibilidade de conciliar resultado incerto. Se o Asaas reprovar, avaliar a Efí pelos mesmos requisitos antes de trocar qualquer componente.

### 1B. Checkout da Pague Menos

Responsável proposto: responsável técnico pela Lia.

Observar o percurso real com os recursos já existentes, usando uma compra legítima planejada para a prova:

1. Abrir o perfil, verificar conta e estado do carrinho.
2. Adicionar o produto exato, quantidade, destinatário e endereço autorizado para o teste.
3. Escolher a entrega e Pix. Identificar se a ação cria um pedido ainda não pago.
4. Capturar o identificador do pedido, total, cobrança Pix e vencimento, sem confundir pedido criado com compra paga.
5. Observar se existe alguma intervenção obrigatória até a emissão do Pix e como consultar esse pedido depois de fechar a página.

Um pedido não pago ainda altera o estado da loja. Não gerar cestas ou pedidos em massa apenas para testar. Reutilizar evidências do ensaio legítimo e tratar expiração/cancelamento pelo comportamento observado.

**Entrega:** descrição do percurso real, campos observados, bloqueios, origem do Pix e caminho de consulta do pedido.

**Aprovar para protótipo:** percurso até uma cobrança identificável executável pelo programa, com os dados corretos, no ambiente pretendido.

**Parar/reavaliar:** desafio obrigatório recorrente, endereço não verificável, cobrança sem vínculo confiável com o pedido ou consulta posterior inviável. Um erro transitório isolado merece diagnóstico; um bloqueio estrutural não justifica construir o restante.

## Etapa 2 — protótipo mínimo, fora da produção

Começar somente após as dependências da etapa 1 estarem suficientemente esclarecidas. O protótipo é trabalho técnico limitado e pode falhar; sua função é evitar uma integração maior baseada em suposições.

Reaproveitar a preparação e a conferência existentes, acrescentando apenas:

- Seleção de Pix e leitura da cobrança real da loja.
- Registro durável do pedido da loja, valor, recebedor verificado, identificação e validade da cobrança, tentativa bancária e resultado.
- Pagamento pelo endpoint de **pagamento do QR**, preservando a identificação da cobrança. Não converter em transferência genérica para uma chave.
- Consulta do resultado bancário e consulta do pedido no varejista.
- Separação explícita dos estados: preparado, aguardando pagamento, pagamento em processamento, pagamento confirmado, pedido confirmado pela loja, resultado incerto e encerrado sem compra.
- Trava para impedir duas execuções sobre a mesma compra ou a mesma conta/carrinho.

Usar dados de teste separados do razão de clientes. Não fabricar um pagamento de cliente em produção para liberar o comprador. O ensaio financeiro deve ter orçamento e trilha próprios, respeitando o controle global de gasto; não desabilitar verificações do comprador comercial.

Validar em simulação os casos que não devem ser provocados com dinheiro real:

| Caso | Resultado exigido |
| --- | --- |
| Pix vencido antes de iniciar o pagamento | Não pagar; encerrar ou obter nova cobrança somente após confirmar o estado anterior e reconferir condições. |
| Resposta bancária perdida | Registrar incerteza e consultar; não criar uma segunda tentativa financeira independente. |
| Notificação duplicada ou fora de ordem | Um único efeito financeiro e estado final coerente. |
| Pagamento enviado, loja ainda sem confirmar | Continuar conciliação e não anunciar compra confirmada. |
| Beneficiário, valor, endereço ou produto divergentes | Bloquear a execução. |
| Queda e reinício do processo | Retomar pelo registro persistido, sem repetir compra ou pagamento. |
| Cancelamento disputando o pagamento | Uma decisão consistente; não devolver dinheiro enquanto a situação do gasto estiver desconhecida. |

**Aprovar para dinheiro real:** identificação e conciliação demonstradas e todos os cenários acima tratados. A ausência de identificação segura após timeout é motivo para interromper a escolha do fornecedor, não para usar comparação aproximada.

## Etapa 3 — cinco compras reais de comprovação

As compras devem ser úteis e legítimas, dentro do orçamento da prova. Não usar clientes não informados como teste.

- Distribuir as execuções em dias diferentes, atravessando pelo menos duas janelas superiores a 24 horas.
- Incluir fechar/reabrir o navegador, reiniciar o processo e um intervalo de inatividade.
- Incluir pelo menos dois destinatários e endereços autorizados e diferentes, atendidos pela loja.
- Usar o host previsto para a operação; registrar qualquer intervenção de login, desafio ou pagamento.
- Nas cinco compras, conferir pagamento bancário e pedido aceito pela loja. Acompanhar as entregas e conferir destinatário e dados visíveis no pacote/comprovante.
- Documentar o procedimento real de cancelamento/devolução. Testar um cancelamento legítimo, se surgir; não alegar reembolso automático apenas com base em simulação.

O teste de alguns dias não prova sessão permanente. Observar como a loja renova o acesso e como se recupera uma sessão realmente expirada. Se a recuperação exigir uma pessoa, medir a frequência e o tempo e atribuir essa manutenção a uma função operacional, sem contar com o dono para cada pedido.

**Aprovar para integração limitada:** cinco compras concluídas corretamente pelo protótipo, depois da configuração inicial, sem intervenção durante a compra; zero duplicidade; estados finais conciliados; acompanhamento utilizável. Falhas devem ser mantidas no relatório, mesmo que uma correção permita repetir o cenário.

**Reprovar a rota atual:** intervenção recorrente por compra, destinatário incorreto, pagamento duplicado ou resultado financeiro que não pode ser conciliado. Um erro próprio corrigível permite uma rodada curta de correção e nova comprovação, com gasto acumulado preservado.

## Etapa 4 — integração limitada e piloto de trinta pedidos

Integrar somente o percurso que passou pelas provas. Antes de publicar, confirmar por leitura quais versões e migrations do comprador já estão em produção; a documentação local não é prova do estado publicado.

Escopo previsto da implementação:

1. Adaptar o contrato atualmente restrito a cartão salvo para representar Pix e suas evidências.
2. Incorporar a tentativa bancária e conciliação ao controle durável de compra e gasto existente.
3. Executar o comprador em serviço independente, com reinício, persistência do perfil e reserva por conta.
4. Habilitar apenas a loja/vendedor/produtos e entrega validados; manter uma loja por pedido.
5. Integrar acompanhamento, alertas e fila de exceções; definir pessoa responsável e horário de cobertura antes de admitir clientes.

O recebimento do cliente pelo Pagar.me permanece. A conta que paga o fornecedor precisa ter saldo disponível próprio; calcular a reserva a partir do gasto até a próxima reposição, tarifas e exposição de pedidos incertos/devoluções. Não presumir liquidação imediata do recebimento do cliente.

Fluxo comercial proposto: cliente confirma cesta → preparar pedido Pix na loja → conferir valor/validade → apresentar cobrança da Lia → confirmar pagamento do cliente → pagar fornecedor → confirmar compra na loja. Esse fluxo exige tratar pagamento tardio do cliente após expiração do Pix do fornecedor. Só reconstruir nas mesmas condições e com o pedido anterior conciliado; caso contrário, tratar revisão/reembolso conforme estado real, sem substituição silenciosa.

Validar essa sequência completa antes de admitir o primeiro cliente. Não deixar o fluxo antigo e o novo disputarem a mesma compra. Ofertas que não podem ser executadas devem ser identificadas antes da cobrança; isso não altera por si só a regra de pesquisa automática do Mercado Livre.

Admitir os trinta pedidos gradualmente, dentro do teto diário vigente. Proposta: começar com até três pedidos por dia e aumentar apenas após verificar os resultados. Não comprar produtos desnecessários para completar a amostra.

Registrar:

- Todas as tentativas e seus resultados, sem apagar falhas após correção.
- Cobertura: quantas solicitações a rota consegue atender; separar de sucesso das compras admitidas.
- Percentual sem intervenção e minutos humanos totais, incluindo login, suporte, conciliação e manutenção.
- Tempo entre pagamento do cliente e pedido confirmado; prazo de entrega e evidência observada.
- Margem por pedido depois de taxas, tecnologia, trabalho operacional, perdas e subsídios.
- Gasto/reserva, capital operacional e pedidos com resultado financeiro pendente.

**Critérios propostos para continuar após o piloto:**

- Pelo menos 29 de 30 compras sem intervenção durante a execução.
- Nenhuma compra ou saída financeira duplicada; todos os resultados financeiros conciliados antes de declarar o piloto concluído.
- Nenhuma ação rotineira do dono para comprar; cobertura de exceções exercida pelo responsável definido.
- Como objetivo inicial, ao menos 29 de 30 pedidos confirmados pela loja em até cinco minutos do pagamento do cliente, sem transformar isso em promessa comercial antes de medir.
- Contribuição positiva no conjunto, incluindo o custo atribuído à cobertura operacional e manutenção, e sem perdas omitidas.
- Acompanhamento e entrega conferidos; resultados e devoluções ainda pendentes explicitados. Não contar confirmação da compra como entrega.

Esses critérios são uma porta de entrada para expansão controlada. Trinta pedidos não demonstram uma taxa estatística definitiva de confiabilidade nem validam volume alto.

## Prazo, revisão e interrupção

Proposta de sequência, não promessa de calendário:

| Marco | Limite ou janela proposta |
| --- | --- |
| Diligência das dependências | Um dia útil de análise técnica inicial; espera pelo fornecedor registrada separadamente. |
| Primeiro percurso no host pretendido | Até dois dias úteis de investigação ativa antes de revisar um bloqueio sem progresso. |
| Protótipo | Escopo apenas de uma compra Pix; se exigir refazer chat, busca ou todo o sistema financeiro, voltar ao desenho antes de ampliar. |
| Cinco compras e persistência da sessão | Mínimo de três dias; duração real depende de entregas e do comportamento da sessão. |
| Piloto de trinta pedidos | Revisão após duas semanas de operação; se faltar volume legítimo, resultado inconclusivo, sem fabricar pedidos. |

Não manter uma tentativa indefinida. Após dois dias técnicos sem evidência de avanço num bloqueio, emitir uma decisão: resolver causa específica, aguardar dependência externa ou reprovar a rota. Esperar habilitação de banco não é motivo para construir antecipadamente toda a integração.

Se o banco reprovar, avaliar um segundo fornecedor antes de alterar o produto. Se a loja reprovar, registrar a causa e decidir sobre uma única alternativa de loja. Se o modelo continuar dependendo de intervenção frequente, interromper a expansão e reavaliar a proposta comercial. Enviar ao cliente o Pix do varejista é uma alternativa de produto que muda a monetização; não é uma troca silenciosa dentro deste plano.

## Evidência final para decidir

O resultado deve ser um relatório curto com:

1. **Aprovado para expansão limitada, reprovado ou inconclusivo.**
2. Condições reais em que funcionou: loja, vendedor, conta, host, período, produtos e entregas.
3. Compras, falhas, intervenções, tempo e custo efetivamente observados.
4. Pendências externas e limites do teste, incluindo sessão, pós-venda e volume.
5. Escopo e custo estimado da próxima etapa, sem tratar a prova como aprovação automática de novas lojas ou maiores limites.

## Fontes consultadas na análise

- [VTEX — casos de aplicação do reCAPTCHA](https://developers.vtex.com/docs/guides/applicable-cases): exceção de pedidos sem cartão; não cobre toda proteção da loja.
- [VTEX — Checkout API](https://developers.vtex.com/docs/api-reference/checkout-api): carrinho público, autenticação conforme contexto e alterações sequenciais.
- [VTEX — erros do checkout](https://developers.vtex.com/docs/guides/checkout-error-codes): inclui login necessário para endereço novo.
- [VTEX — renovação de acesso](https://developers.vtex.com/docs/guides/refresh-token-flow-for-headless-implementations): acesso e renovação têm duração/configuração; não assumir sessão eterna nem intervenção diária obrigatória.
- [Asaas — pagar QR Code](https://docs.asaas.com/reference/pagar-um-qrcode): pagamento com saldo e consulta posterior do resultado.
- [Asaas — autorização de saídas](https://docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks): validação pela aplicação.
- [Asaas — ações críticas](https://docs.asaas.com/docs/como-testar-a%C3%A7%C3%B5es-cr%C3%ADticas): confirmação adicional depende da operação e conta.
- [Asaas — limites da homologação](https://docs.asaas.com/docs/como-testar-funcionalidades): sandbox não substitui habilitação de produção.
- [Efí — envio e pagamento Pix](https://dev.efipay.com.br/docs/api-pix/envio-pagamento-pix/): alternativa a avaliar pelos mesmos critérios, incluindo escopos e limites.
- [Google — listar mensagens do Gmail](https://developers.google.com/workspace/gmail/api/guides/list-messages): busca filtrada devolve IDs; o conteúdo é lido separadamente.
- [Google — obter mensagem do Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get): leitura com escopo `gmail.readonly`.
- [Google — OAuth offline](https://developers.google.com/identity/protocols/oauth2/web-server): refresh token permite ao processo local renovar o acesso sem participação por mensagem.

## Registro desta execução

O plano entrou em execução. Foram feitos quatro diagnósticos reais de checkout e registradas Oba, Cobasi e Swift na configuração privada do comprador. Pague Menos falhou por CAPTCHA antes da emissão do Pix; Oba chegou ao pagamento, mas não ofereceu Pix; Cobasi e Swift pararam na validação de acesso por código de e-mail. Nenhuma contratação, mensagem externa, criação de pedido, compra, cobrança ou publicação foi feita. Os carrinhos temporários foram esvaziados e todas as quatro lojas permanecem fora da allowlist.
