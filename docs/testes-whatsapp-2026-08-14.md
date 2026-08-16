# Testes manuais da Lia no WhatsApp — 14/08/2026

Foram feitas 15 rodadas no chat da Lia pelo WhatsApp Web, simulando uma pessoa sem conhecimento prévio do catálogo ou do fluxo. Nenhum botão de Pix/cartão foi acionado e nenhum pagamento foi realizado. Quando uma rodada chegou ao pagamento, ela foi cancelada por texto.

| Rodada | Cenário | Resultado | Melhoria observada |
|---|---|---|---|
| 1 | Sabonete líquido para as mãos; 2 unidades | Sucesso até Pix/cartão; cancelado sem cobrança | Primeira resposta demorou cerca de 15s; esclarecer melhor “Pagar” versus fechar a lista. |
| 2 | Ração para cachorro + carregador USB-C | Caiu em cotação manual no `/ops`; cancelado | Explicar claramente o fallback manual e revisar cotação instantânea para cesta de lojas diferentes. |
| 3 | Leite sem lactose, mais barato; depois papel | Leite escolhido, mas o novo item não foi consolidado; bloqueio de mínimo antes do pagamento | Não anunciar indisponibilidade antes de mostrar opções; consolidar itens adicionados depois da primeira escolha. |
| 4 | Cotonete para cachorro, sem remédio | Recusa segura de remédio; cotonete encontrado; Pix/cartão; cancelado | Separar melhor aviso de medicamento de item de higiene e evitar “não disponível” prematuro. |
| 5 | Shampoo barato, qualquer marca; “Outras opções” | Chegou ao pagamento, mas montou cesta contraditória com Seda e Pom Pom; cancelado | Invalidar escolha pendente ao trocar opções e evitar carregar produto antigo para a nova seleção. |
| 6 | Presente de aniversário para criança de 6 anos, até R$100 | Chegou ao pagamento, mas tratou o limite como produto e ultrapassou o orçamento; cancelado | Interpretar orçamento como restrição, não como item; respeitar o teto informado. |
| 7 | Flores simples para a mãe | Opção encontrada; Pix/cartão; cancelado | Evitar dizer que não há opção antes de concluir a busca. |
| 8 | Café em pó 500g; troca de endereço para CEP 01310-100 | Endereço alterado; Pix/cartão; cancelado | Pedir CEP e endereço completo de modo mais direto; corrigir pontuação duplicada em “SP..”. |
| 9 | Vinho tinto suave; mais caixas de bombom e café | Cesta mista e cálculo de três entregas; Pix/cartão; cancelado | Manter o resumo completo após adicionar itens e interpretar quantidades relativas (“mais duas”). |
| 10 | Pedido de remédio para dor, depois hidratante, café, esponja e água | Remédio recusado, mas texto auxiliar virou produto; cesta perdeu itens e bateu no mínimo | Ignorar texto de preenchimento; preservar itens confirmados e consolidar a cesta após bloqueio de mínimo. |
| 11 | Carregador USB-C, explicitamente não veicular | Caiu em cotação manual no `/ops`; cancelado | Informar ao cliente que a cotação manual é necessária e investigar o fallback de frete. |
| 12 | Água com gás, entrega hoje se possível; depois café | Água e café preservados; Pix/cartão; cancelado | Separar urgência de entrega do nome do produto e não responder indisponibilidade antes das opções. |
| 13 | Quatro caixas de bombom, qualquer marca; depois “mais três iguais” | Produto encontrado, mas a quantidade quatro foi ignorada e “4” não ajustou a linha | Capturar quantidade no primeiro pedido, aceitar número após a escolha e resolver “o mesmo produto” pelo SKU. |
| 14 | Ração para gato adulto, sem remédio | Opção correta; 3 unidades; Pix/cartão; cancelado | Reformular “sem remédio” como preferência por alimento, sem sugerir que o cliente pediu medicamento; mostrar peso/unidade com clareza. |
| 15 | Café 500g; tentativa de entregar em Belo Horizonte pelo CEP 30130-010 | Cotação de SP cancelada sem cobrança; CEP fora de SP corretamente enviado à lista de espera | A frase natural sobre Belo Horizonte foi ignorada inicialmente; detectar cidade/UF fora de SP antes de mostrar pagamento do endereço antigo. |

## Resumo

- 15 rodadas concluídas.
- 10 rodadas chegaram a exibir Pix/cartão; nenhuma cobrança foi feita.
- 2 rodadas caíram no fluxo de cotação manual.
- Os problemas mais repetidos foram interpretação de restrições e quantidades, mensagens de indisponibilidade antecipadas, perda de itens na cesta e troca de endereço reconhecida tarde demais.
- Em uma rodada houve navegação acidental para outro chat causada por um seletor amplo; nenhuma mensagem foi enviada naquele chat e o teste voltou imediatamente para Lia.

## Prioridades de melhoria

1. Tornar o parser mais resistente a orçamento, urgência, cidade/UF, quantidades e frases auxiliares.
2. Não emitir “não disponível” antes de finalizar a busca e apresentar as opções candidatas.
3. Preservar e reconciliar a cesta e as escolhas pendentes ao usar “Outras opções”, adicionar itens ou atingir o mínimo.
4. Reconhecer endereço/cidade fora de SP assim que o cliente mencionar o destino, antes de oferecer pagamento.
5. Deixar explícito quando a cotação manual é o próximo passo e por que o pagamento ainda não aparece.

## Re-teste pós-publicação — 15/08/2026 (10 rodadas)

Após o deploy informado como `dpl_EUQX9nHBBpYRQGHaSSmkb4wfT3n4`, foram feitas mais 10 rodadas no mesmo chat, sem acionar Pix/cartão. Toda rodada que chegou ao pagamento foi cancelada por texto e a Lia confirmou que nada foi cobrado.

| Rodada | Cenário | Resultado | Melhoria observada |
|---|---|---|---|
| 1 | Presente de aniversário para criança de 6 anos, até R$100 | **Sucesso no critério principal**: uma escolha exibida, R$96,79, sem tratar o orçamento como item; caiu em cotação manual explicada e foi cancelado | Confirmar se “uma escolha” é intencional quando só há um candidato dentro do teto; o fallback manual foi bem explicado. |
| 2 | Shampoo barato; depois “só shampoo normal, sem preferência de marca” | **Sucesso**: as mesmas três opções foram refinadas, sem segunda escolha; uma unidade ficou na cesta; total R$17,86; cancelado | Nenhum problema funcional observado. |
| 3 | Quatro caixas de bombom; depois +3 do mesmo; depois “5” | **Parcial**: estado correto de 4x → 7x → 5x do mesmo SKU e resumo final em 5x; a confirmação logo após a primeira escolha não mostrou “4x” | Exibir a quantidade solicitada também na confirmação intermediária, não apenas no resumo final. |
| 4 | Cotação aberta; troca para Belo Horizonte e CEP 30130-010 | **Sucesso**: pediu o novo CEP antes de mostrar pagamento, recusou BH por cobertura SP e enviou à lista de espera | Nenhum problema funcional observado. |
| 5 | Água com gás e café, com pedido de entrega hoje | **Parcial**: cesta mista, adição de quantidade e mensagem de mínimo preservando a cesta inteira funcionaram; total R$127,03; cancelado | “entrega hoje se der” virou uma falsa linha indisponível antes das opções; urgência precisa continuar sendo restrição, não produto. |
| 6 | Camiseta de futebol, qualquer time | **Parcial**: recusou honestamente e não abriu pedido; porém criou também uma linha indisponível para “qualquer time” | “qualquer time” deve ser qualificativo de marca/time, não segundo item. |
| 7 | Dois pacotes de papel higiênico e detergente neutro | **Parcial**: quantidades foram preservadas; depois ficou 4x papel + 2x detergente e o mínimo mostrou a cesta completa; cancelado | “2x pacotes” apareceu como indisponibilidade e a confirmação da escolha omitiu o 2x, apesar de o estado interno estar correto. |
| 8 | Hidratante corporal sem perfume, o mais barato possível | **Sucesso funcional com ressalva**: opções sem perfume, mais barata no topo por R$24,19, total R$29,09; sem ruído de item inexistente; cancelado | A lista ainda mostrou uma alternativa mais cara (R$32,89) mesmo com “mais barato possível”; decidir se o filtro deve restringir ou apenas ordenar. |
| 9 | Ração para gato adulto, três pacotes, sem remédio | **Parcial**: nenhum alerta indevido de medicamento, opções corretas, resumo final em 3x e total R$60,37; cancelado | “três pacotes” virou falsa indisponibilidade e a confirmação intermediária omitiu 3x; o resumo final preservou a quantidade. |
| 10 | Hidratante e, se tivesse, dipirona para dor de cabeça | **Parcial**: recusou somente o medicamento, deixou-o fora e prosseguiu com o item comum; total R$10,70; cancelado | A busca por “hidratante” escolheu sabonete hidratante, não um hidratante corporal inequívoco; melhorar a relevância sem perder a separação segura do medicamento. |

### Achados do re-teste

- Os quatro cenários prioritários: rodadas 1, 2 e 4 passaram; a rodada 3 passou no estado da cesta, mas ainda falha na confirmação textual imediata da quantidade.
- As correções de cesta, mínimo, cancelamento e troca de endereço se comportaram bem nos casos exercitados.
- Persistem três famílias de ruído: quantidades vazando para linhas de “indisponível”; qualificadores (“entrega hoje”, “qualquer time”) sendo tratados como itens; e confirmação intermediária omitindo quantidades já capturadas.
- O bloqueio de medicamento funcionou nas duas variações testadas: “sem remédio” não gerou aviso e um pedido explícito de dipirona foi recusado sem impedir o item comum.

## Re-teste pós-publicação — deploy `dpl_AW75PjcJaB44exEzNTLcaLirbZ1M` — 15/08/2026

Foram feitas mais 10 rodadas rebuscadas e encadeadas após o deploy `4cbbaae`. Nenhum Pix/cartão foi acionado; toda cesta que chegou ao pagamento foi cancelada antes da cobrança.

| Rodada | Cenário | Resultado | Melhoria observada |
|---|---|---|---|
| 1 | Churrasco: 2 kg de linguiça, carvão, pão de alho e “sem pimenta” | **Parcial**: montou 2x linguiça, 1x carvão e 1x pão de alho; confirmou quantidades e total de R$150,76 | “sem pimenta” ainda virou uma falsa linha indisponível. |
| 2 | Lancheira infantil, qualquer marca, até R$80, com preferência por espaço para garrafa; depois refinamento | **Falha de busca/refino**: não encontrou lancheira e o refinamento “sem precisar de espaço específico” virou outro item indisponível | Restrições negativas ou relaxamentos (“sem precisar de…”) precisam permanecer como modificadores. |
| 3 | Detergente + esponja, seguido de “troca a esponja por saco de lixo 30 litros” | **Parcial**: a troca em uma lista nova funcionou; o mínimo mostrou a cesta inteira, mas “mais um saco desses” reabriu busca genérica e perdeu os 30 litros | Diferenciar troca em lista nova de remoção em cesta existente e preservar tamanho/atributos em adições relativas. |
| 4 | 2 cafés em pó e leite sem lactose; depois “mais um desse café” | **Sucesso**: confirmação em 2x, adição correta para 3x do mesmo SKU, 1x leite sem lactose; total R$113,26 | Nenhum problema funcional observado. |
| 5 | Carregador USB-C não veicular, barato; “Outras opções” e seleção do cartão original | **Parcial**: o cartão antigo foi escolhido corretamente; “não veicular” e “algo barato” viraram ruído/segundo item, chegando a mostrar algodão | Preferências e preço precisam ser excluídos da lista de produtos antes do rerank. |
| 6 | Cotação aberta; “Antes de pagar, vou entregar em Campinas, CEP 13010-100” | **Falha de prioridade**: mostrou pagamento do endereço antigo; só “trocar endereço” interrompeu a cotação, pediu CEP e salvou o endereço completo | Reconhecer cidade/CEP e intenção de mudança antes do bloco de pagamento, mesmo em frase natural. |
| 7 | Três lembrancinhas infantis, até R$30 cada, qualquer tema, sem brinquedo barulhento | **Falha de extração**: “3x lembrancinha”, “cada” e “não brinquedo barulhento” viraram linhas/consultas separadas; opções não respeitaram claramente a restrição | Tratar “cada”, “qualquer tema” e negações compostas como quantidade/preferência, nunca como itens. |
| 8 | Cesta: 2 leites sem lactose, pão integral e manteiga sem sal; depois “mais um leite” | **Parcial**: cesta inicial correta, 2x confirmado e mínimo preservou todos os itens; “mais um leite” abriu busca genérica e adicionou leite integral separado | Adição relativa deve herdar a preferência do item referido quando houver contexto claro. |
| 9 | Quatro caixas de bombom, qualquer marca; +3 do mesmo; ajuste para 5x | **Sucesso**: confirmou 4x imediatamente, depois 7x e 5x do mesmo SKU; total R$125,85 | “não quero os muito amargos” ainda gerou uma falsa indisponibilidade auxiliar. |
| 10 | Viagem: shampoo, escova de dentes e dipirona | **Sucesso**: recusou somente a dipirona, manteve os dois itens comuns, fechou em 1x + 1x e total R$32,75 | Nenhum problema funcional observado. |

### Síntese desta rodada

- As correções de quantidade, referência por substantivo e confirmação imediata funcionaram nos casos mais importantes: rodadas 1, 4, 8 e 9 preservaram as quantidades; a rodada 9 repetiu 4x → 7x → 5x sem regressão.
- A seleção de cartão antigo após “Outras opções” também passou.
- O principal risco restante é a extração de modificadores: “sem pimenta”, “não veicular”, “qualquer tema”, “cada” e negações compostas ainda podem virar falsos produtos.
- A troca de endereço por frase natural continua crítica: a palavra/ação explícita “trocar endereço” funciona, mas a intenção natural ainda pode deixar o pagamento antigo visível.
- O bloqueio de medicamento permaneceu seguro: a dipirona foi excluída sem bloquear shampoo e escova.

## Nova rodada exploratória ao vivo — 15/08/2026 (sem alterações de código)

Foram executados 10 cenários novos no WhatsApp, simulando uma pessoa sem conhecimento
prévio do catálogo. Nenhum Pix ou cartão foi acionado. As cestas que chegaram ao pagamento
foram canceladas antes da cobrança, e a Lia confirmou que nada foi cobrado.

| Rodada | Cenário | Resultado | Melhoria observada |
|---|---|---|---|
| 1 | Lanche para quatro pessoas: quatro pães de queijo, suco de laranja, guardanapo e “sem canudo”; depois itens extras para testar o mínimo | **Parcial**: separou os três itens, capturou 4x pão de queijo e ignorou “sem canudo” como item; o mínimo do Carrefour impediu o fechamento automático e preservou o restante da cesta | O mínimo foi explicado de forma honesta, mas a experiência exige descobrir e adicionar itens da mesma loja para avançar. |
| 2 | Presente para a mãe: perfume floral, qualquer marca, nada muito doce | **Sucesso**: opções florais relevantes, “qualquer marca” não virou produto, a preferência “sem muito doce” foi mantida; caiu em cotação manual explicada e foi cancelado | Nenhum problema funcional observado. |
| 3 | Cabo USB-C de 2 metros para celular, não veicular, mais barato possível | **Falha de relevância**: retornou um carregador de parede, não um cabo de 2 m; “não veicular” foi respeitado, mas o tipo e o comprimento não | Exigir correspondência de categoria e comprimento antes de aceitar o candidato; não deixar “carregador” substituir “cabo”. |
| 4 | Leite sem lactose, qualquer marca; depois “pode colocar mais dois leites” | **Sucesso**: mostrou opções sem lactose e transformou o pedido relativo em 3x do mesmo SKU; o mínimo apareceu sem perder o item; cancelado | Nenhum problema funcional observado. |
| 5 | Iogurte natural e granola; depois “pensando bem, troca a granola por aveia em flocos” | **Falha de extração**: a troca funcionou e a cesta ficou com iogurte + aveia, mas “pensando bem” foi emitido como item indisponível | Filler conversacional (“pensando bem”) deve ser descartado antes da busca, inclusive em frases de troca. |
| 6 | Três lembrancinhas infantis, até R$30 cada, qualquer tema, sem brinquedo barulhento | **Parcial**: preservou 3x e as restrições, sem abrir linhas fantasmas; não encontrou opção compatível no catálogo | Diferenciar recusa honesta por lacuna de catálogo de falha de extração; ampliar a vitrine se essa categoria for relevante. |
| 7 | Dois sacos de lixo reforçados de 30 litros, qualquer marca; depois “mais um desses” | **Sucesso**: opção exata de 30 litros, 2x → 3x do mesmo SKU, chegou ao pagamento e foi cancelado sem cobrança | Uma das três opções iniciais não exibia 30 litros; o filtro de atributo deve valer para todos os cards, não só para a escolha feita. |
| 8 | Com pagamento aberto: “Antes de pagar, vou entregar em São Paulo, CEP 01310-100” | **Falha parcial**: cancelou a cotação antiga e não cobrou, mas ignorou o CEP já presente e pediu o CEP novamente; depois processou o CEP, pediu endereço completo e salvou o endereço público de teste | Consumir cidade/CEP embutidos na frase natural antes de responder com “mande o CEP”; manter a proteção que esconde o pagamento antigo. |
| 9 | “Sem remédio hoje; quero um shampoo normal, qualquer marca” | **Falha de roteamento**: não exibiu alerta indevido de medicamento, mas interpretou “sem remédio” como tentativa de remover item inexistente e não buscou shampoo | “Sem remédio” precisa ser uma preferência/negação de categoria, não um comando de remoção quando vem junto de um novo pedido. |
| 10 | Dois cafés moídos até R$25 cada, qualquer marca, não descafeinado e, se der, entrega amanhã | **Parcial**: capturou 2x café e permitiu chegar ao pagamento; porém “chega amanhã” virou linha indisponível e também exibiu alternativas de R$29,69 acima do teto explícito | Urgência deve virar modificador de entrega, nunca item; teto explícito deve excluir cards acima do limite, não apenas ordenar. |

### Síntese da nova rodada

- Acertos confirmados: quantidade relativa por SKU, preservação de restrições, bloqueio seguro de pagamento e cancelamento sem cobrança.
- Falhas novas ou persistentes: categoria/atributo do produto (“cabo de 2 m”), fillers (“pensando bem”), negação “sem remédio” no início de pedido, urgência (“chega amanhã”) e teto explícito aparecendo acima do limite.
- A troca de endereço ficou segura contra cobrança no endereço velho, mas ainda não interpreta o CEP quando ele já vem na mesma frase.
- Esta rodada é evidência de comportamento ao vivo, não de correção implementada; nenhum arquivo de código foi alterado.

## Nova rodada independente ao vivo — 15/08/2026

Depois das alterações informadas pelo operador, foram executados 10 cenários independentes,
sem usar a rodada anterior como estado de conversa. Nenhum Pix ou cartão foi acionado; os
casos que chegaram à cotação foram cancelados antes da cobrança.

| Rodada | Cenário | Resultado | Melhoria observada |
|---|---|---|---|
| 1 | Cabo USB-C de 2 m para celular, não veicular e barato | **Falha**: não trouxe opções e separou “barato” como uma linha indisponível adicional; listou “cabo usb-c 2 metros para celular sem veicular” como não disponível | Preferência de preço não pode virar item; quando não houver cabo compatível, a recusa deve ser uma só e explicar o tipo/comprimento. |
| 2 | Iogurte natural + granola; troca por aveia “pensando bem” | **Sucesso**: encontrou os dois itens corretos, descartou granola, não criou item para “pensando bem”, confirmou 1x + 1x e foi cancelado | Nenhum problema funcional observado. |
| 3 | “Sem remédio hoje; quero um shampoo normal, qualquer marca” | **Sucesso**: pesquisou shampoo, não exibiu alerta indevido de medicamento, mostrou opções e permitiu escolher; cancelado | A confirmação de uma unidade implícita não mostra “1x”, mas o fluxo ficou correto. |
| 4 | Dois cafés até R$25 cada, não descafeinado, “se der entrega amanhã” | **Falha de extração**: “Para domingo” virou busca indisponível e o pedido foi dividido em “café moído” e “cafés moídos cada sem descafeinado”; não chegou a uma cesta coerente | Contexto temporal, “cada” e urgência precisam permanecer como modificadores do café, não criar consultas/itens. |
| 5 | Dois sacos de lixo 30 L, qualquer marca; “mais um desses” na mesma mensagem | **Falha**: respondeu com mensagem genérica de recomeço e não interpretou a cesta | Aceitar quantidade, atributo e adição relativa na mesma mensagem, ou responder claramente qual parte não foi entendida. |
| 6 | Dois sacos 30 L; depois +3; fechar; mudar para Campinas com CEP na frase | **Parcial**: opções passaram a respeitar 30 L; 2x → 5x funcionou; ao dizer “Antes de pagar, vou entregar em Campinas, CEP 13010-100”, cancelou a cotação antiga sem repetir o CEP e pediu endereço completo; após salvar o endereço, voltou a pedir o que comprar e não retomou automaticamente a cesta | A troca de endereço ficou segura, mas precisa preservar/recalcular a cesta depois do endereço completo. |
| 7 | Lembrancinha para criança de 6 anos, até R$100, sem brinquedo barulhento | **Sucesso**: uma opção dentro do teto, restrição negativa preservada, sem linha fantasma; escolhido e cancelado | Nenhum problema funcional observado. |
| 8 | Leite sem lactose, qualquer marca; “mais dois leites” na mesma mensagem | **Parcial**: encontrou leite sem lactose, mas criou uma segunda linha genérica “leite” em vez de herdar a restrição para os dois adicionais | Resolver a referência relativa dentro da mesma mensagem, não apenas quando ela vem em turno separado. |
| 9 | Quatro bombons; +3 do mesmo; número solto “5” | **Sucesso**: confirmou 4x, passou para 7x, ajustou para 5x do mesmo SKU, chegou ao pagamento e foi cancelado sem cobrança | Nenhum problema funcional observado. |
| 10 | Escova macia e pasta de dente “para uma viagem”, sem remédio | **Parcial**: encontrou escova e creme dental, não alertou sobre medicamento, mas criou “Para uma viagem” como terceiro item | Motivo/contexto (“para uma viagem”) deve ser ignorado na extração, sem afetar os dois produtos válidos. |

### Síntese da rodada independente

- 4 casos passaram plenamente; 3 foram parciais; 3 tiveram falha clara de extração ou roteamento.
- Quantidade relativa por SKU, troca de item, teto de presente e bloqueio de medicamento funcionaram em parte dos casos.
- Os problemas mais claros agora são: contexto inicial (“Para domingo”, “Para uma viagem”), preferência (“barato”), composição de uma mesma mensagem e preservação da cesta após troca de endereço.
- Todos os pagamentos foram evitados e nenhum código foi alterado durante esta rodada.

## Próxima rodada pós-deploy — 16/08/2026 (`8cff5c1`)

Após o deploy informado como `8cff5c1`, foram executados 10 cenários novos no chat da Lia,
com mensagens naturais e combinações de quantidade, preferências, contexto e troca de
endereço. Nenhum Pix ou cartão foi acionado. Toda cotação que chegou ao pagamento foi
cancelada antes da cobrança; a Lia confirmou que nada foi cobrado.

| Rodada | Cenário | Resultado | Melhoria observada |
|---|---|---|---|
| 1 | Escova macia e pasta de dente “para uma viagem”, sem remédio | **Falha**: encontrou escova e creme dental, não alertou sobre medicamento, mas registrou “Para uma viagem” como terceiro item | Contexto (“para uma viagem”) ainda precisa ser descartado antes da extração de produtos. |
| 2 | Dois cafés moídos até R$25 cada, qualquer marca, não descafeinado, para domingo | **Sucesso**: apresentou uma opção dentro do teto e, após a escolha, confirmou 2x do mesmo café; não criou linha para domingo, “cada” ou “qualquer marca” | Nenhum defeito funcional observado neste cenário. |
| 3 | Cabo USB-C de 2 m para celular, não veicular e barato | **Sucesso de segurança da busca**: recusou honestamente por falta de opção compatível, sem trazer carregador/algodão e sem transformar “barato” em item | Se houver catálogo compatível, ainda vale validar o filtro de comprimento e tipo; neste caso a recusa foi limpa. |
| 4 | Saco de lixo reforçado de 30 L; “mais um desses” na mesma mensagem | **Sucesso**: escolheu a opção exata e confirmou 2x do mesmo SKU, preservando os 30 litros | Nenhum problema funcional observado. |
| 5 | Leite sem lactose; “mais dois leites” na mesma mensagem | **Sucesso**: mostrou apenas opções sem lactose e confirmou 3x do mesmo leite, sem abrir uma linha integral genérica | Nenhum problema funcional observado. |
| 6 | Dois pães de queijo e dois sucos de laranja para o café da manhã | **Sucesso**: identificou 2 itens, confirmou 2x de cada e não gerou linhas duplicadas; cancelado | Nenhum problema funcional observado. |
| 7 | Quatro caixas de bombom; depois +3 do mesmo; depois “5” | **Sucesso**: confirmou 4x, passou para 7x e ajustou para 5x do mesmo SKU; cancelado | Nenhum problema funcional observado. |
| 8 | Com pagamento aberto, mudar para Campinas com CEP 13010-100 e depois informar endereço completo | **Parcial**: cancelou a cotação antiga antes de qualquer pagamento, pediu endereço completo e recotou mantendo 2x do café; porém armazenou/exibiu o novo endereço como “CEP.”, sem os dígitos informados | Preservar a cesta funcionou; corrigir a captura e a exibição do CEP na recotação. |
| 9 | Duas caixas de bombom e uma lembrancinha até R$100, sem brinquedo barulhento | **Sucesso com indisponibilidade honesta**: recusou somente a lembrancinha sem criar linha fantasma, mostrou bombom e confirmou 2x do item disponível; cancelado | Quando um item não estiver no catálogo, manter a recusa única e deixar claro que os demais pedidos continuam disponíveis. |
| 10 | Churrasco: carvão, pão de alho e linguiça sem pimenta; “mais um carvão” | **Parcial**: contexto de churrasco não virou item, confirmou 2x carvão e encontrou os 3 produtos; mas propagou “sem pimenta” também para pão de alho, embora a frase qualificasse a linguiça | Restringir a negação ao substantivo/segmento correto; não espalhar “sem X” para itens vizinhos. |

### Síntese da rodada de 16/08

- **7 sucessos, 2 parciais e 1 falha clara**.
- Os consertos de quantidade e adição relativa passaram nos casos prioritários: 2x → 3x
  no saco, 1x → 3x no leite dentro da mesma mensagem e 4x → 7x → 5x no bombom.
- O plural em uma cesta com dois produtos também passou: 2x pão de queijo + 2x suco,
  sem linha duplicada.
- A troca de endereço ficou protegida contra pagamento no endereço antigo e a cesta foi
  preservada na recotação. O defeito restante é de parsing/exibição do CEP, que perdeu os
  dígitos no endereço atualizado.
- Persistem dois riscos de NLU: contexto inicial (“para uma viagem”) tratado como produto e
  escopo de negação (“sem pimenta”) aplicado a mais de um item.
- Esta é uma observação de comportamento ao vivo contra o deploy informado pelo operador;
  nenhum arquivo de código foi alterado durante a rodada.
