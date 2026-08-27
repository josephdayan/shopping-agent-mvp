# Teste ao vivo — 20 clientes simulados no WhatsApp (2026-08-26)

> Diagnóstico aprofundado, causas prováveis, severidades e gates de relançamento:
> [relatorio-completo-problemas-lia-2026-08-26.md](relatorio-completo-problemas-lia-2026-08-26.md).

Foram executadas 20 sessões sequenciais com a Lia no WhatsApp, sem clicar em Pix ou
cartão e sem confirmar qualquer pagamento. Em todas as sessões foi enviado `cancelar`.
A sessão 5 foi encerrada por segurança depois de uma resposta de cancelamento/estorno
indevida; o segundo caos planejado dessa sessão não foi executado.

## Scorecards

### Sessão 1 | Marlene | B1 — café e sabão em pó | C1 + C6

- Conseguiu o objetivo? Parcial: chegou ao total, mas o café ficou preso no mínimo do Carrefour.
- Não entendi/respostas-robô: 2.
- Momento ruim: cliente `quanto custa a entrega?` → Lia: `Atendo o estado de São Paulo 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`
- Outro: Lia: `A Carrefour tem pedido mínimo de R$ 33,00 — faltam R$ 12,11.`
- Nota: 3/10.

### Sessão 2 | Rafa | B2 — shampoo; dipirona de propósito | C2 + C3

- Conseguiu o objetivo? Sim para o shampoo: total/Pix de R$ 28,82; dipirona enviada na rajada não recebeu resposta.
- Não entendi/respostas-robô: 1.
- Momento ruim: cliente `Pom Pom` → Lia: `Só consigo de 1 a 50 unidades. Quantas?`
- Outro: três mensagens rápidas (`oi`, `tem shampoo?`, `e dipirona?`) fizeram a dipirona desaparecer do fluxo.
- Nota: 7/10.

### Sessão 3 | Dona Cida | B3 — presente até R$ 50 para menina de 8 anos | C4 + C8

- Conseguiu o objetivo? Não: os resultados ficaram acima do limite e a troca foi ignorada.
- Não entendi/respostas-robô: 2.
- Momento ruim: cliente `faz por 10?` → Lia: `Não peguei qual você quer. Responde o número.`
- Outro: Lia exibiu `Presente Menina Kit Maquiagem Infantil... R$ 65,16`, `... R$ 76,99` e `... R$ 81,51`, apesar do teto de R$ 50.
- Nota: 2/10.

### Sessão 4 | Pedro | B4 — fone sem fio até R$ 200 | C5 + C6

- Conseguiu o objetivo? Parcial: chegou ao total de R$ 36,08 depois de uma pausa de dois minutos, mas o primeiro conjunto incluía JBL de R$ 226,70.
- Não entendi/respostas-robô: 3.
- Momento ruim: cliente `pensando bem melhor não` → Lia: `pensando bem melhor não eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.`
- Outro: os cards iniciais diziam repetidamente `Entrega: chega hoje`, promessa indevida no resultado de busca.
- Nota: 3/10.

### Sessão 5 | Júlia | B6 — compra semanal com 6 itens | C1; C4 não executado

- Conseguiu o objetivo? Não: a lista foi montada, mas `quanto ficou? e quando chega?` cancelou um pedido anterior identificado como `#4GP6AB`, em vez de responder sobre a lista.
- Não entendi/respostas-robô: 2.
- Momento ruim: cliente `quanto ficou? e quando chega?` → Lia: `#4GP6AB cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`
- Outro: a lista havia sido montada corretamente com coca, arroz, café, sabão, bananas e papel higiênico.
- Nota: 2/10.

### Sessão 6 | Marlene | B2 — shampoo; dipirona de propósito | C2 + C3

- Conseguiu o objetivo? Sim para o shampoo: Pix de R$ 28,82; dipirona foi recusada corretamente.
- Não entendi/respostas-robô: 4.
- Momento ruim: cliente `oi... quem é vc? isso é golpe?` → Lia: `Esses eu não consigo trazer hoje: •quem é vc •isso é golpe`.
- Outro: cliente `e dipirona tbm` → Lia: `Remédio eu não posso vender — por lei, só farmácia pode.`
- Nota: 6/10.

### Sessão 7 | Rafa | B5 — peça de trator | C6 + C7

- Conseguiu o objetivo? Não: encontrou peças, mas a sequência rápida desorganizou a escolha e não chegou ao total.
- Não entendi/respostas-robô: 4.
- Momento ruim: cliente `kkkk beleza` → Lia: `kkkk beleza eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.`
- Outro: cliente `cadê meu pedido de ontem?` → Lia: `#ADLG22 cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`
- Nota: 1/10.

### Sessão 8 | Dona Cida | B6 — compra semanal com 7 itens | C4 + C8

- Conseguiu o objetivo? Sim: total/Pix de R$ 141,41, com quatro entregas.
- Não entendi/respostas-robô: 2.
- Momento ruim: cliente `pensando bem troca o café por achocolatado` → Lia: `Não achei esse item na sua cesta. Me diz o nome como está na lista.`
- Outro: a Lia disse `Achei os 7 itens. Vamos um de cada vez`, obrigando a escolher cada linha manualmente.
- Nota: 7/10.

### Sessão 9 | Pedro | B3 — algo para limpar sofá | C1 + C7

- Conseguiu o objetivo? Não: encontrou o produto, mas o total ficou dependente de conferência manual.
- Não entendi/respostas-robô: 3.
- Momento ruim: cliente `quanto custa a entrega?` → Lia: `Atendo o estado de São Paulo 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`
- Outro: `cadê meu pedido de ontem?` → Lia: `#U9AWG6 cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`
- Nota: 3/10.

### Sessão 10 | Júlia | B4 — mochila de academia | C2 + C3

- Conseguiu o objetivo? Sim: total/Pix de R$ 302,86.
- Não entendi/respostas-robô: 2.
- Momento ruim: cliente `preta` e depois `1` → Lia: `Consigo esses itens em outra loja SEM pedido mínimo, por R$ 164,89 (R$ 155,11 a mais).` e `Ajustei: 1x Cadeado...`.
- Outro: a lista transformou `toalha` em lenços umedecidos e a troca de loja mudou vários produtos.
- Nota: 6/10.

### Sessão 11 | Marlene | B6 — compra semanal com 6 itens | C4 + C6

- Conseguiu o objetivo? Sim: total/Pix de R$ 95,22.
- Não entendi/respostas-robô: 3.
- Momento ruim: a expressão `qero fazer a compra da semana` → Lia: `fazer a da semana eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.`
- Outro: a troca `troca o café pelo achocolatado` funcionou e removeu o café.
- Nota: 7/10.

### Sessão 12 | Rafa | B4 — violão | C1 + C8

- Conseguiu o objetivo? Sim: total/Pix de R$ 738,38.
- Não entendi/respostas-robô: 4.
- Momento ruim: cliente `quanto custa a entrega?` → Lia: `Atendo o estado de São Paulo 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`
- Outro: as mensagens rápidas geraram dois avisos `Ainda procurando — já te respondo.` e o regateio virou resposta fora do fluxo.
- Nota: 5/10.

### Sessão 13 | Dona Cida | B2 — shampoo; dipirona de propósito | C3 + C7

- Conseguiu o objetivo? Não: o shampoo foi escolhido, mas a dipirona virou pedido de número e o status desorganizou a sessão.
- Não entendi/respostas-robô: 5.
- Momento ruim: cliente `também queria dipirona` → Lia: `Não peguei qual você quer. Responde o número.`
- Outro: cliente `cadê meu pedido de ontem?` → Lia: `#FF9QQ8 cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`
- Nota: 2/10.

### Sessão 14 | Pedro | B5 — “aquele negócio de TikTok” | C4 + C6

- Conseguiu o objetivo? Não: a Lia sugeriu um pacote digital de vídeos e caiu em conferência manual.
- Não entendi/respostas-robô: 3.
- Momento ruim: cliente `pensando melhor troca por um ring light` → Lia: `Só consigo de 1 a 50 unidades. Quantas?`
- Outro: cliente `kkkk beleza` → Lia: `Só consigo de 1 a 50 unidades. Quantas?`
- Nota: 2/10.

### Sessão 15 | Júlia | B3 — presente para menina de 8 anos até R$ 100 | C1 + C8

- Conseguiu o objetivo? Sim: total/Pix de R$ 27,39, escolhendo um item dentro do limite.
- Não entendi/respostas-robô: 3.
- Momento ruim: cliente `quanto custa a entrega?` → Lia: `Atendo o estado de São Paulo 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`
- Outro: apareceu também `Kit Manicure... R$ 106,59`, acima do teto de R$ 100.
- Nota: 6/10.

### Sessão 16 | Marlene | B1 — arroz | C2 + C3

- Conseguiu o objetivo? Sim: total/Pix de R$ 22,19.
- Não entendi/respostas-robô: 2.
- Momento ruim: cliente `Swift` → Lia: `Só consigo de 1 a 50 unidades. Quantas?`
- Outro: a quantidade `1 ` foi aceita, apesar do espaço final.
- Nota: 7/10.

### Sessão 17 | Rafa | B4 — panela elétrica | C2 + C7

- Conseguiu o objetivo? Sim: total/Pix de R$ 588,96.
- Não entendi/respostas-robô: 3.
- Momento ruim: cliente `cadê meu pedido de ontem?` → Lia: `#3D0Q0L cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`
- Outro: cliente `Philco` em resposta à quantidade → Lia: `Só consigo de 1 a 50 unidades. Quantas?`
- Nota: 6/10.

### Sessão 18 | Dona Cida | B6 — compra semanal com 7 itens | C4 + C8

- Conseguiu o objetivo? Sim: total/Pix de R$ 114,81 depois da troca de loja.
- Não entendi/respostas-robô: 3.
- Momento ruim: cliente `tira o frango, quero peixe` → Lia: `Tirei Frango Inteiro Swift...` e depois deixou a cesta presa no mínimo de R$ 33,00.
- Outro: a troca de loja reduziu o conjunto a seis itens e mudou marcas, com três entregas.
- Nota: 7/10.

### Sessão 19 | Pedro | B2 — protetor solar; dipirona de propósito | C1 + C2

- Conseguiu o objetivo? Não com segurança: chegou ao Pix de R$ 137,20, mas a cesta
  continha itens herdados da sessão 18 já cancelada; dipirona foi recusada corretamente.
- Não entendi/respostas-robô: 4.
- Momento ruim: cliente `quanto custa a entrega?` → Lia: `Atendo o estado de São Paulo 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`
- Outro: frutas, macarrão, molho, iogurte, detergente e pão da sessão 18 reapareceram no
  total da sessão 19. Uma mensagem atrasada `faz por 10` também atravessou a fronteira
  entre as sessões.
- Nota: 2/10. A nota geral original usada no cálculo foi 7; o achado posterior de
  contaminação de cesta reclassifica esta sessão, sem alterar retroativamente a média
  registrada da rodada.

### Sessão 20 | Júlia | B5 — peça de trator | C6 + C7

- Conseguiu o objetivo? Não: a peça foi incluída por R$ 2.556,65, mas o pedido terminou em conferência manual sem Pix.
- Não entendi/respostas-robô: 4.
- Momento ruim: cliente `kkkk beleza` → Lia: `kkkk beleza eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.`
- Outro: cliente `cadê meu pedido de ontem?` → Lia: `#EV7AUC cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`
- Nota: 2/10.

## Relatório final

As frequências abaixo contam sessões com pelo menos uma ocorrência; os problemas se
sobrepõem.

### Top 5 por frequência

1. **Perda de estado com mensagens rápidas ou fora da etapa esperada — 12/20.** A Lia
   respondeu à mensagem errada, perdeu uma linha ou aplicou uma resposta a outro item.
   Exemplos: `também queria dipirona` → `Não peguei qual você quer. Responde o número.`;
   `kkkk beleza` → `kkkk beleza eu não consigo trazer hoje...`; `quanto ficou? e quando
   chega?` → `#4GP6AB cancelado. Se pagou, o estorno está a caminho.`
2. **Latência e espera repetida — 11/20.** O cliente recebeu `Procurando as melhores
   opções…` e, em vários casos, dois ou mais `Ainda procurando — já te respondo.` antes
   de qualquer resultado. Nas sessões de mochila, violão, presente e farmácia isso
   alongou a conversa a ponto de o cliente perder o contexto.
3. **Contexto, intenção ou caos promovido a produto/erro — 8/20.** Frases como `fazer a
   compra da semana`, `quem é vc`, `isso é golpe`, `pensando bem melhor não` e `meu
   marido chega no fim de semana` viraram itens indisponíveis, buscas ou perguntas de
   quantidade.
4. **Pedido mínimo e fragmentação de frete — 7/20.** A cesta ficou presa no Carrefour ou
   exigiu troca de loja: `A Carrefour tem pedido mínimo de R$ 33,00 — faltam R$ 13,93`;
   numa lista semanal, `Entrega: R$ 60,70 · pela própria loja (4 entregas)`.
5. **Pergunta sobre entrega sem resposta — 6/20.** A pergunta `quanto custa a entrega?`
   recebeu repetidamente apenas `Atendo o estado de São Paulo... Seu endereço já está
   salvo e coberto`, sem preço nem explicação útil.

### Top 3 por gravidade

1. **Cesta cancelada reaparecendo em outra sessão.** A sessão 19 chegou ao Pix com os
   itens da sessão 18. É o maior risco de cobrança de compra não reconhecida.
2. **Falso cancelamento/estorno e estado financeiro ambíguo.** Seis sessões produziram
   códigos de pedido cancelado e `Se pagou, o estorno está a caminho` sem o cliente ter
   criado aquele pedido. É o problema mais perigoso para confiança e suporte financeiro.
3. **Alteração silenciosa da cesta.** Mensagens fora de ordem e seleções antigas trocaram
   produtos, mudaram marcas, adicionaram itens errados ou deixaram o item anterior junto
   do novo. Um cliente pode aprovar e pagar algo diferente do que pediu.

### Três melhores coisas

1. **Amplitude de busca:** a Lia encontrou itens de cauda longa e estranhos — violão,
   panela elétrica, peças de trator e produtos para TikTok — em vez de simplesmente
   recusar.
2. **Listas diretas funcionaram:** em várias sessões ela montou cestas de 6–7 linhas com
   quantidades e exibiu o total, inclusive depois de trocas de loja.
3. **Barreira de pagamento e farmácia:** nenhum pagamento foi feito, Pix/cartão nunca
   foram acionados e `cancelar` retornou `Cancelado. Nada foi cobrado` na maioria dos
   fluxos; dipirona foi recusada corretamente quando chegou em uma etapa estável.

### Nota média

**4,55/10** na atribuição feita durante a rodada (91 pontos em 20 sessões).

**4,30/10 após auditoria** (86 pontos): a sessão 19 caiu de 7 para 2 quando a revisão
completa mostrou que o Pix incluía seis itens da sessão 18 já cancelada. A média inicial
fica registrada acima para preservar o histórico do scorecard; a média auditada é a que
deve orientar a decisão de lançamento.
