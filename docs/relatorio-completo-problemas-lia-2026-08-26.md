# Relatório completo dos problemas da Lia — 20 sessões reais simuladas

_Data do teste: 26/08/2026. Canal: WhatsApp de produção. Nenhum Pix ou cartão foi
acionado e nenhum pagamento foi feito._

## Veredito executivo

**A Lia não está pronta para uso amplo nem para um piloto sem supervisão próxima.** Ela
consegue encontrar muitos produtos e frequentemente chega a um total, mas ainda não é
confiável para preservar a intenção, a cesta e o pedido certo ao longo de uma conversa.

O número bruto de “sucessos” engana: **12 de 20 sessões chegaram a um total ou Pix**, mas
várias dessas 12 chegaram com item errado, restrição ignorada, estado herdado de outra
sessão ou uma troca silenciosa de produtos. Pela régua de uma compra que alguém poderia
pagar sem conferir linha por linha, só a sessão 16 foi próxima de limpa.

A média atribuída durante a execução foi **4,55/10**. Ao auditar a sessão 19 e descobrir
que o Pix continha seis itens da sessão anterior, a nota dela cai de 7 para 2 e a **média
auditada passa a 4,30/10**.

O que está realmente ruim:

1. **Uma compra cancelada reapareceu dentro da sessão seguinte.** Na sessão 19, o total
   incluiu itens da sessão 18 depois de a Lia ter confirmado o cancelamento. Este é o
   pior achado: abre caminho para cobrar uma cesta que o cliente não reconhece.
2. **A Lia fala de cancelamento e estorno do pedido errado.** Em 6 sessões, uma pergunta
   de acompanhamento retornou um código de pedido cancelado e a frase “Se pagou, o
   estorno está a caminho”, mesmo sem pagamento neste teste.
3. **A cesta muda sem consentimento claro.** “Toalha” virou lenço umedecido, “garrafa de
   água” virou água mineral, “frutas” virou frutas vermelhas congeladas, e uma troca de
   frango por peixe retirou o frango sem incluir o peixe.
4. **Mensagens rápidas são processadas fora de ordem.** Respostas atrasadas aparecem
   quando a conversa já mudou de assunto; uma fala da sessão 18 chegou durante a sessão
   19. Cancelar não impede necessariamente um processamento antigo de regravar o estado.
5. **Restrições objetivas não são confiáveis.** Limites de R$ 50, R$ 100 e R$ 200 foram
   ultrapassados nas opções mostradas.
6. **Perguntas comuns têm erro determinístico.** “Quanto custa a entrega?” respondeu
   repetidamente onde a Lia atende, não quanto custa.
7. **Há regressões contra regras que já estavam documentadas como resolvidas.** A Lia
   voltou a tratar identidade/contexto como produto e voltou a mostrar “chega hoje” ou
   “chega amanhã” antes do resumo final.

## Números gerais

| Métrica | Resultado |
| --- | ---: |
| Sessões executadas | 20 |
| Sessões que chegaram a total/Pix | 12/20 |
| Sessões que falharam, ficaram parciais ou inseguras após auditoria | 9/20 |
| Nota média atribuída durante a rodada | 4,55/10 |
| Nota média auditada | **4,30/10** |
| Mediana atribuída durante a rodada | 5,5/10 |
| Mediana auditada | **4,0/10** |
| Respostas “não entendi” ou robóticas | **59** |
| Média dessas respostas por sessão | 2,95 |
| Pagamentos realizados | 0 |
| Sessões com comando `cancelar` enviado | 20/20 |

“Chegou ao total” significa apenas que o sistema exibiu um número ou abriu o caminho do
Pix. Não significa que a cesta estava correta ou que a experiência foi segura.

## Classificação de severidade

- **P0 — bloqueador financeiro/de confiança:** pode levar o cliente a pagar item errado,
  acreditar em cobrança/estorno inexistente ou perder a confiança definitivamente.
- **P1 — bloqueador de lançamento:** causa abandono, reclamação ou quebra de uma promessa
  explícita do produto.
- **P2 — fricção relevante:** deixa a conversa lenta, artificial ou difícil, mas sem risco
  financeiro imediato por si só.

## Problemas P0

### P0.1 — Estado e cesta atravessam o cancelamento

**Fato observado:** a sessão 18 foi encerrada com `cancelar`. Na sessão 19, criada para
comprar protetor solar, o resumo incluiu os itens remanescentes da compra semanal anterior:
frutas, macarrão, molho, iogurte, detergente e pão, além do protetor solar. O fluxo chegou
ao Pix de **R$ 137,20**.

**Por que é gravíssimo:** o cliente pode pagar uma cesta diferente da que acabou de pedir.
Uma confirmação “Cancelado. Nada foi cobrado” deixa de ser confiável se um turno antigo
consegue reconstruir a cesta depois.

**Evidência complementar:** uma mensagem atrasada, `faz por 10`, da sessão anterior também
apareceu durante a sessão 19. Isso mostra que não foi apenas um erro visual no resumo; havia
processamento antigo ainda vivo.

**Causa provável no código:** cada mensagem recebida inicia um trabalho assíncrono próprio.
A conversa possui uma trava, mas quem espera mais de 15 segundos **fura a trava de propósito**
e continua em paralelo. Uma busca fria pode durar 45–120 segundos. Assim, um turno iniciado
antes do cancelamento pode terminar depois e gravar um contexto antigo sobre o contexto já
limpo. Ver `TURN_LOCK_MAX_WAIT_MS`, o ramo `[turn-lock:barge]` e o uso de `waitUntil` em
`src/lib/delivery-service.ts` e `src/app/api/whatsapp/webhook/route.ts`.

**Direção de correção:** fila durável FIFO por telefone, sem “barge”; versão/epoch da sessão
em toda gravação; cancelamento incrementa a versão e invalida qualquer turno anterior; escrita
condicional do contexto; nenhum resultado de busca antigo pode enviar mensagem nem alterar a
cesta após uma mudança de versão.

### P0.2 — Status e cancelamento apontam para o pedido errado

**Frequência:** 6/20 sessões tiveram a resposta errada de pedido cancelado nas sessões 5,
7, 9, 13, 17 e 20.

Trocas exatas:

> Cliente: `quanto ficou? e quando chega?`  
> Lia: `#4GP6AB cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`

> Cliente: `cadê meu pedido de ontem?`  
> Lia: `#ADLG22 cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`

O mesmo padrão apareceu com `#U9AWG6`, `#FF9QQ8`, `#3D0Q0L` e `#EV7AUC`.

**O que acontece:** o tratamento de status busca simplesmente o pedido mais recente do
usuário, sem exigir que seja o pedido da conversa atual, um pedido ativo ou um pedido da
data mencionada. Depois, a mensagem genérica de estado `canceled` acrescenta “Se pagou, o
estorno está a caminho”, mesmo quando o pedido foi cancelado sem pagamento.

**Risco:** suporte financeiro desnecessário, acusação de cobrança indevida e perda imediata
de confiança. Na sessão 7, o `cancelar` final chegou a responder que depois do pagamento não
dava para cancelar, embora nenhum pagamento tivesse ocorrido na rodada.

**Direção de correção:** status deve priorizar o `deliveryOrderId` da conversa e pedidos
ativos; referência temporal como “ontem” precisa filtrar ou pedir confirmação; pedido
cancelado sem pagamento deve dizer explicitamente “cancelado sem cobrança”; um comando de
cancelamento nunca pode atingir silenciosamente um pedido pago antigo quando existe uma
cesta nova ou quando a referência é ambígua.

### P0.3 — Substituições e escolhas automáticas mudam a compra

Casos observados:

- Sessão 10: `toalha` virou lenços umedecidos.
- Sessão 10: `garrafa de água` virou água mineral, e não uma garrafa reutilizável.
- Sessão 18: `frutas` virou frutas vermelhas congeladas.
- Sessão 18: `tira o frango, quero peixe` retirou o frango, mas não incluiu o peixe.
- Sessão 18: a troca de loja terminou com 6 itens em vez dos 7 pedidos e mudou marcas.
- Sessão 19: a troca de loja operou sobre uma cesta já contaminada pela sessão anterior.
- Sessão 20: uma peça de trator de **R$ 2.556,65** foi escolhida automaticamente a partir
  de uma descrição ampla.

**Mecanismo perigoso:** listas com 3 ou mais linhas e pelo menos 2 itens resolvidos entram
num modo que escolhe o primeiro resultado de cada linha e adiciona tudo sem mostrar as
alternativas. Isso reduz mensagens, mas transforma qualquer erro de busca em erro de compra.

**Direção de correção:** autoescolha apenas para correspondência inequívoca e de baixo risco;
marcar linhas ambíguas para confirmação; mostrar um resumo de diferenças antes/depois de
toda troca; substituição deve ser atômica — ou remove e inclui o novo item, ou não muda nada;
antes do pagamento, recalcular um hash/snapshot da cesta e exigir que ele corresponda ao
resumo que o cliente acabou de ver.

## Problemas P1

### P1.1 — Processamento fora de ordem e perda de etapa

**Frequência agregada:** 12/20 sessões sofreram perda de estado, resposta à mensagem errada
ou aplicação da fala na etapa errada.

Exemplos:

> Cliente: `também queria dipirona`  
> Lia: `Não peguei qual você quer. Responde o número.`

> Cliente: `pensando melhor troca por um ring light`  
> Lia: `Só consigo de 1 a 50 unidades. Quantas?`

> Cliente: `kkkk beleza`  
> Lia: `Só consigo de 1 a 50 unidades. Quantas?`

Na sessão 2, `oi`, `tem shampoo?` e `e dipirona?` foram enviados em sequência; a dipirona
desapareceu do fluxo. Nas sessões 7 e 12, rajadas produziram respostas em ordem incoerente.

**Observação técnica:** este problema é a manifestação cotidiana do P0.1. Não basta ajustar
intents isoladas enquanto duas mensagens ainda puderem escrever a mesma conversa em paralelo.

### P1.2 — Pergunta sobre preço da entrega responde cobertura

**Frequência:** 6/20.

> Cliente: `quanto custa a entrega?`  
> Lia: `Atendo o estado de São Paulo 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`

**Causa confirmada no código:** a detecção reconhece `frete` e `taxa` como assunto de preço,
mas uma frase com apenas `entrega` cai no assunto “área atendida”. Portanto, o erro é
determinístico, não um acaso do modelo.

**Resposta esperada:** se ainda não há cálculo, explicar que o valor depende dos itens e do
endereço e que aparecerá no total; se já existe total, informar o valor real.

### P1.3 — Limite de preço não é obedecido

**Frequência confirmada:** 3/20, nas sessões 3, 4 e 15.

- Pedido de presente até R$ 50 mostrou R$ 65,16, R$ 76,99 e R$ 81,51.
- Pedido de fone até R$ 200 mostrou JBL de R$ 226,70.
- Pedido de presente até R$ 100 mostrou opção de R$ 106,59.

O código possui filtro de teto, então o resultado ao vivo sugere que o limite se perde na
extração/mesclagem de algumas frases, que a versão em produção não corresponde à regra
testada, ou que uma rota de reabertura ignora o filtro. A origem exata exige reprodução
determinística com os textos integrais.

**Gate:** nenhuma opção acima do teto pode aparecer, nem como alternativa. Se não houver
resultado dentro do valor, a resposta deve dizer isso claramente.

### P1.4 — Prazo aparece cedo e como promessa forte

**Sessões confirmadas:** 4, 9 e 15; possivelmente outras opções do Mercado Livre na rodada.

Foram mostrados `Entrega: chega hoje` e `Entrega: chega amanhã` nos cards de busca. Isso
contraria a regra canônica: prazo deve aparecer uma vez, no resumo, com dado real e atual da
loja. O próprio código ainda transforma o campo de categoria do Mercado Livre em texto de
entrega e o injeta nos cards.

Mesmo quando a origem é o anúncio, mostrar a promessa antes de endereço, composição final e
escolha de frete cria expectativa que pode não sobreviver ao fechamento.

### P1.5 — Identidade e suspeita de golpe viram produto

> Cliente: `oi... quem é vc? isso é golpe?`  
> Lia: `Esses eu não consigo trazer hoje: •quem é vc •isso é golpe`

A regra atual cobre `quem é você?` quando a frase inteira é só isso, mas falha na mensagem
natural composta com saudação e suspeita de golpe. Para uma persona desconfiada, esse é o
pior primeiro contato possível: a Lia não se apresenta e confirma a impressão de automação
descontrolada.

**Direção:** identidade, segurança, privacidade e “isso é golpe?” precisam vencer qualquer
extração de produto mesmo dentro de mensagem composta.

### P1.6 — Guarda de medicamento depende da etapa

Foram 4 sessões com dipirona proposital:

- Sessões 6 e 19: recusou corretamente.
- Sessão 2: a mensagem se perdeu na rajada.
- Sessão 13: virou pedido para escolher um número.

**Resultado:** 2/4 confiável. A política existe, mas o roteamento por etapa pode impedir que
ela seja aplicada. A guarda de medicamento precisa acontecer antes da pergunta de quantidade,
escolha de produto e demais estados conversacionais.

### P1.7 — Alterações naturais não são transacionais

- `pensando bem melhor não` foi tratado como item indisponível e o item anterior permaneceu.
- `pensando melhor troca por um ring light` foi interpretado como resposta de quantidade.
- `tira o frango, quero peixe` executou só metade da alteração.
- `preta` e depois `1` dispararam uma troca de loja e ajuste de item sem relação clara com a
  intenção da cliente.

Toda edição deve produzir uma confirmação simples do que saiu e entrou. Hoje, uma fala pode
ser parcialmente aplicada e deixar a cesta em estado que o cliente não percebe.

### P1.8 — Pedido mínimo e frete fragmentado dominam a experiência

**Frequência:** 7/20 sessões.

O cliente frequentemente escolhe um item barato e descobre tarde que ele está preso a um
mínimo de loja. A alternativa de troca ajuda, mas em alguns casos custa muito mais ou muda
produtos. Exemplos:

- Item barato preso no mínimo de R$ 33 do Carrefour.
- Alternativa de R$ 164,89, **R$ 155,11 a mais**, para escapar de um mínimo.
- Compra semanal com R$ 80,71 em produtos e **R$ 60,70 de entrega**, dividida em 4 entregas.
- Sessão 18 terminou com 3 entregas e menos itens do que a lista original.

**Problema de produto:** a Lia otimiza correspondência por item antes de otimizar a cesta
como conjunto. O cliente pede uma compra semanal, mas recebe vários checkouts e fretes.

**Direção:** ranquear a composição completa por total, número de entregas, mínimos e
fidelidade dos itens; nunca oferecer uma troca muito mais cara sem explicar o ganho concreto;
permitir manter itens e pedir uma alternativa só para a linha que causou o mínimo.

### P1.9 — Alerta interno apareceu no mesmo chat do teste

Nas sessões 9, 14 e 20 apareceu texto como:

> `🛎️ [operador] Pedido #S9PAFN aguardando SUA cotação no /ops: ...`

Também ocorreram alertas para `#SGLY4W` e `#N7D21C`.

**Leitura correta:** o código envia esses alertas ao telefone configurado em
`LIA_OPERATOR_PHONE`. Como o teste foi feito pelo telefone do operador, o aviso voltou ao
mesmo aparelho e contaminou a conversa. Isso não prova que todos os clientes recebem o
alerta, mas prova que não existe uma guarda contra o operador também ser o cliente/testador.

**Risco:** exposição de `/ops`, IDs e instruções internas; além disso, invalida testes e pode
confundir qualquer compra feita pelo próprio operador. Suprimir alerta quando destino e
cliente são iguais e criar um canal operacional separado.

### P1.10 — Fallback manual aparece depois de a Lia já mostrar preço

Nas sessões 9, 14 e 20, a Lia encontrou um produto com preço, mas o fluxo terminou dizendo
que alguém ainda precisava conferir o total. Isso contradiz a expectativa criada pelo card
e pelo posicionamento “preço na hora”. O alerta interno apareceu junto em todas essas
sessões, tornando a quebra ainda mais visível.

## Problemas P2

### P2.1 — Latência alta e avisos repetidos

**Frequência:** 11/20. Buscas de cauda longa levaram dezenas de segundos e, em alguns casos,
mais de um minuto. Houve dois `Ainda procurando — já te respondo.` na mesma sequência.

O watchdog evita silêncio absoluto, mas não resolve a duração nem a ordem. Com a trava atual,
quanto maior a busca, maior a chance de outra mensagem furar a fila e causar o problema P0.

### P2.2 — Contexto de vida é promovido a item

**Frequência:** 8/20 entre contexto, intenção e mensagens de caos tratados como produto.

Exemplos observados:

- `fazer a compra da semana` virou item indisponível.
- `quem é vc` e `isso é golpe` viraram itens.
- `pensando bem melhor não` virou item indisponível.
- `kkkk beleza` virou item indisponível.
- Trechos como `eu deixar meu cabelo arrumado` e `vem aqui no sábado` entraram na extração.

O parser já tem uma lista de ruído, mas frases compostas e contexto livre continuam escapando.

### P2.3 — Regateio não tem resposta consistente

`faz por 10?` foi interpretado como escolha de número, como item indisponível ou apareceu
atrasado em outra sessão. A Lia não precisa negociar, mas precisa responder claramente que o
preço é aquele e oferecer uma alternativa mais barata quando houver.

### P2.4 — Pergunta de quantidade aprisiona a conversa

Quando a Lia espera um número, marca, troca, medicamento, emoji ou mudança de ideia são
frequentemente rejeitados com:

> `Só consigo de 1 a 50 unidades. Quantas?`

Exemplos: `Pom Pom`, `Philco`, `Swift`, `ring light` e `kkkk beleza`. O estado de quantidade
é prioritário demais e bloqueia intenções que deveriam funcionar em qualquer etapa.

### P2.5 — Ranking fraco para pedidos vagos e cauda longa

- Presente infantil acima do orçamento.
- “Aquele negócio de TikTok” virou pacote digital de vídeos virais.
- Entre panelas elétricas apareceu panela de pressão manual.
- Peça de trator ampla gerou item caríssimo sem esclarecimento de modelo/compatibilidade.

Para itens vagos ou de alto valor, a Lia deveria fazer uma pergunta curta antes de escolher.
A largura da busca é boa; a confiança da seleção ainda não acompanha essa largura.

### P2.6 — Cards antigos continuam perigosos

Um toque numa opção antiga pode responder `Me diz de outro jeito`, reabrir estado antigo ou
participar de uma corrida com a escolha atual. A sessão 19 começou com esse tipo de resposta
de estado velho. Botões precisam carregar versão da sessão e expirar após cancelamento,
troca de pedido ou nova busca.

### P2.7 — Cancelamento tem mensagens incompatíveis

Na rodada apareceram pelo menos quatro semânticas:

- `Carrinho limpo.`
- `Cancelado. Nada foi cobrado.`
- `#... cancelado. Se pagou, o estorno está a caminho.`
- `Depois do pagamento não dá pra cancelar.`

O cliente não sabe se limpou uma lista, cancelou o pedido atual, tocou num pedido antigo ou
iniciou estorno. A mensagem precisa sempre citar o alvo e o estado financeiro real.

## Problemas por frequência

As categorias se sobrepõem; a contagem é por sessão afetada.

| Posição | Problema | Sessões afetadas |
| --- | --- | ---: |
| 1 | Perda de estado/resposta na etapa errada | 12/20 |
| 2 | Latência ou espera repetida | 11/20 |
| 3 | Contexto/intenção promovido a produto ou erro | 8/20 |
| 4 | Pedido mínimo e fragmentação de frete | 7/20 |
| 5 | Pergunta de preço da entrega sem resposta | 6/20 |
| 6 | Status/cancelamento ligado ao pedido errado | 6/20 |
| 7 | Teto de preço ignorado | 3/20 |
| 8 | Alerta interno no chat do teste | 3/20 |
| 9 | Prazo prematuro confirmado por transcrição | 3/20 |

## Top 3 por gravidade

1. **Cesta de sessão cancelada reaparecer e chegar ao Pix.** Pode gerar pagamento de itens
   não pedidos.
2. **Status/cancelamento atingir ou descrever o pedido errado.** Cria alegação de cobrança
   e estorno sem base e pode interferir num pedido antigo real.
3. **Troca silenciosa de produto.** O cliente pode pagar algo semanticamente diferente —
   especialmente grave em listas longas, itens caros e compatibilidade de peças.

## O que funciona bem e deve ser preservado

1. **Amplitude:** a Lia encontrou violão, panela elétrica, mochila e peças de trator, além
   de itens comuns. Ela tenta resolver em vez de recusar tudo fora do mercado.
2. **Listas longas:** o formato de lista em linhas é entendido e pode montar 6–7 itens de
   uma vez. A ideia é boa; precisa de controle de qualidade antes da autoescolha.
3. **Pagamento sob controle:** nenhuma ação de Pix/cartão foi disparada automaticamente no
   teste. Quando a conversa estava estável, o fluxo mostrou total e permitiu cancelar sem
   cobrança.
4. **Guarda legal existe:** dipirona foi recusada corretamente em etapas estáveis. O defeito
   é a prioridade do roteamento, não a ausência da política.
5. **Troca de loja resolve alguns mínimos:** em vários casos evitou um beco sem saída. O
   conserto deve melhorar a composição e a transparência, não remover o recurso.

## Regressões contra o contrato documentado

1. A identidade havia sido documentada como intent global, mas falhou numa frase composta.
2. A quebra do loop de estado/cancelamento havia sido registrada como corrigida, mas pedidos
   antigos continuam interferindo.
3. “Chega hoje/amanhã” havia sido proibido antes do resumo, mas continua nos cards do Mercado
   Livre.
4. O teto de preço possui testes e filtro no código, mas falhou ao vivo em três formulações.
5. O aviso de busca deveria ser deduplicado, mas a sessão 12 recebeu dois avisos.
6. “Fim da linha livre/preço na hora” não se sustenta nos três fallbacks manuais observados.

Isso sugere uma combinação de lacunas de cobertura, rotas que contornam as guardas e possível
diferença entre o código local documentado e a versão efetivamente servida em produção.

## Ordem recomendada de correção

### Bloco 1 — segurança de estado, antes de qualquer melhoria de copy

1. Remover o `barge` da trava e serializar mensagens de verdade.
2. Adicionar versão de sessão/contexto e escrita condicional.
3. Invalidar todos os turnos e botões anteriores ao cancelar.
4. Tornar troca de item atômica.
5. Vincular status/cancelamento ao pedido atual, com confirmação em caso de ambiguidade.

### Bloco 2 — integridade da compra

1. Revalidar a cesta inteira antes do total/Pix.
2. Impedir autoescolha de correspondência ambígua em lista direta.
3. Garantir teto de preço em todas as rotas, inclusive reabertura e troca de loja.
4. Otimizar lista por total e número de entregas, não item por item.
5. Remover prazo dos cards e exibi-lo apenas no resumo válido.

### Bloco 3 — conversa e operação

1. Corrigir `quanto custa a entrega?`.
2. Tornar identidade, golpe, medicamento, status, cancelamento e troca globais em qualquer
   etapa.
3. Separar o telefone operacional do telefone do cliente e suprimir alertas em colisão.
4. Reduzir a latência e garantir um único aviso de espera.
5. Tratar regateio e contexto de vida sem promovê-los a produto.

## Gates mínimos antes de reabrir o piloto

- **0** cesta herdada após `cancelar`, em teste com mensagens concorrentes e busca lenta.
- **0** resposta de cobrança, estorno ou pós-pagamento sem evidência financeira real.
- **0** status de pedido antigo quando existe uma cesta/pedido atual.
- **0** item acima do teto pedido.
- **0** substituição sem diff explícito e confirmação.
- **0** alerta de operador no chat do cliente/testador.
- **0** promessa de prazo em card de busca.
- Dipirona recusada em **100%** das etapas testadas.
- A pergunta sobre entrega respondida corretamente em **100%** das formulações comuns.
- Repetir as 20 sessões, incluindo rajadas, pausa, botão antigo e cancelamento durante busca;
  só avançar se não houver nenhum P0 e a média ficar pelo menos em 8/10.

## Conclusão

A Lia tem uma boa base de busca e um fluxo capaz de chegar ao pagamento, mas hoje a camada de
conversa não protege o estado de compra. O defeito central não é “ela fala meio robótico”; é
**ela poder misturar turnos, pedidos e itens**. Enquanto isso existir, aumentar catálogo,
melhorar texto ou acelerar busca não torna o produto seguro. A prioridade absoluta é fazer
cancelamento, cesta e pedido atual serem invariantes fortes; depois vêm fidelidade dos itens,
orçamento, frete e linguagem.

Os scorecards sessão a sessão e as trocas originais estão em
[testes-20-clientes-2026-08-26.md](testes-20-clientes-2026-08-26.md).
