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
