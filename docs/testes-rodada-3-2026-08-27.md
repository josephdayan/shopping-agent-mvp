# Testes da Lia — Rodada 3

Data: 2026-08-27  
Canal: WhatsApp, Lia (+55 11 97844-4813)  
Protocolo: 20 sessões em ordem fixa; intervalo mínimo de 2 minutos entre sessões; nenhuma ação de pagamento; `cancelar` ao fim de cada sessão.

## Scorecards

Os scorecards serão preenchidos após cada sessão, com as mensagens literais observadas e a auditoria item a item.

### Sessão #6 | Persona: Seu Jorge (A6) | Missão: café; regatear depois do total

- **Objetivo cumprido?** Não — travou antes do total. Após escolher o café, a Lia tratou o trecho narrativo `seu Jorge aqui` como pedido separado e não conseguiu voltar ao café.
- **Auditoria da cesta/total:** não houve total. O café escolhido foi `Café Torrado e Moído Extra Forte Pilão Almofada 500g — R$ 31,89`; nenhum pagamento foi aberto.
- **Nº de “não entendi”/respostas-robô:** 0 “não entendi” literais; 1 resposta de estado inadequada (`Anotei café — a gente escolhe em seguida.`). **Esperas acima de 30s:** 1; a Lia avisou `Ainda procurando — já te respondo.`
- **Momentos ruins (transcrição exata):**
  - Cliente: `seu Jorge aqui, queria um café moído pra passar em casa` → Lia: `Achei os 2 itens. Vamos um de cada vez: café moído, depois seu Jorge aqui.`
  - Cliente: `só o café mesmo` → Lia: mostrou `Opções de seu Jorge aqui:` com `Imagem São Jorge Metal Colorido Proteção Fé Painel Carro — R$ 20,98`, `Imagem São Jorge Resina 20cm Cor Colorido — R$ 207,96` e `Imagem São Jorge Resina 30cm Cor Colorido — R$ 248,67`.
  - Cliente: `não quero isso, só o café` → Lia: `Anotei café — a gente escolhe em seguida.`; em seguida manteve as opções de São Jorge na conversa.
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 2/10 — eu não conseguiria chegar ao preço nem negociar; também não escolheria o item inventado pelo sistema.

### Sessão #7 | Persona: Pedro (A4) | Missão: pedir entrega mais rápida depois do total

- **Objetivo cumprido?** Sim, parcialmente: chegou ao total e respondeu ao pedido de rapidez; a Lia informou que aquele pedido só tinha uma modalidade.
- **Auditoria da cesta/total:** bateu 100%. Resumo: `1x Arroz Branco Swift 1kg — R$ 4,29`; `Produtos: R$ 4,29`; `Entrega: R$ 15,90 · pela própria loja`; `Total: R$ 20,19`. Soma das linhas: `R$ 4,29 = Produtos R$ 4,29`; `R$ 4,29 + R$ 15,90 = R$ 20,19`. Item e quantidade conferem. Não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente: `quero a entrega mais rápida` → Lia: `Essa entrega só tem uma modalidade — não consigo acelerar esse pedido. Quer fechar assim, ou prefere que eu procure o item em outra loja?`
  - Cliente: `cancelar` → Lia: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 8/10 — eu entendi a limitação e não fui empurrado para pagar; a alternativa de procurar outra loja apareceu sem eu pedir claramente por isso.

### Sessão #8 | Persona: Júlia (A5) | Missão: cesta com café + leite; trocar o café por algo improvável

- **Objetivo cumprido?** Sim no comportamento da troca: a Lia removeu o café e tentou buscar o novo pedido. Não houve fechamento porque o novo item não foi encontrado.
- **Auditoria da cesta/total:** não houve total. Antes da troca, a cesta continha `1x Café Torrado e Moído Equilibrado L'or Torras Gourmet 250g — R$ 20,89` e `1x Leite UHT Integral Carrefour Classic 1L — R$ 5,38`. Depois, a Lia informou que tirou o café; o leite permaneceu e não apareceu nenhum novo café na cesta observada. Não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0 “não entendi”; 1 mensagem automática de busca (`Procurando as melhores opções…`). **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente: `tira o café, quero café de centeio orgânico da Islândia` → Lia: `Tirei Café Torrado e Moído Equilibrado L'or Torras Gourmet 250g.`
  - Lia: `🔎 Procurando as melhores opções…` → `café de centeio orgânico da Islândia eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.`
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 8/10 — a troca foi compreensível e não deixou o café antigo junto, mas a resposta “não consigo trazer hoje” é menos clara do que dizer que não encontrou o produto.

### Sessão #9 | Persona: Rafa (A2) | Missão: pilha; testar botão de uma mensagem antiga

- **Objetivo cumprido?** Sim. A Lia rejeitou corretamente o botão antigo, depois permitiu escolher uma pilha atual.
- **Auditoria da cesta/total:** não houve total. A escolha atual foi `1x Pilha Duracell Aa P Com 2 Unidades — R$ 27,49`; não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente clicou no botão antigo de `Imagem São Jorge Resina 30cm Cor Colorido — R$ 248,67` → Lia: `Esse botão é de uma conversa antiga 🙂 As opções de agora são essas:` e mostrou novamente as opções de pilha.
  - Cliente escolheu a pilha atual → Lia: `Quantas unidades de Pilha Duracell Aa P Com 2 Unidades? Ou digita a quantidade direto aqui.`
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 9/10 — a conversa identificou o botão antigo sem contaminar a escolha atual; só não cheguei ao total porque a missão pedia cancelar logo após escolher.

### Sessão #10 | Persona: Pedro (A4) | Missão: presente até R$50; pedir “outras” três vezes

- **Objetivo cumprido?** Parcialmente. A primeira sugestão coube no limite e, após os três pedidos, a Lia sinalizou que não tinha mais opções; não apresentou três alternativas novas.
- **Auditoria da cesta/total:** não houve total. O único produto mostrado foi `Cuide-se bem Combo Presente Cuide-se Bem Rosa e Algodão: Sabonete 2x80g + Caixa Presenteável — R$ 29,58`, dentro do limite de R$50. Não houve escolha nem pagamento.
- **Nº de “não entendi”/respostas-robô:** 0 “não entendi”; 2 respostas repetidas após esgotar as opções. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente: `outras` / `outras` / `outras` → Lia: `Essas são todas as opções de presente pra menina de 8 anos que eu tenho. Responde o número, ou pula pra seguir sem esse item.`
  - Lia respondeu mais duas vezes, literalmente: `De presente pra menina de 8 anos eu já mostrei tudo que tenho. Me diz uma marca, tipo ou faixa de preço que eu procuro diferente.`
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 6/10 — não entrou produto acima do limite, mas dois retornos idênticos depois de “todas as opções” passam sensação de repetição.

### Sessão #12 | Persona: Júlia (A5) | Missão: lista de cinco básicos + uma furadeira boa

- **Objetivo cumprido?** Sim no comportamento esperado da lista: os cinco itens básicos entraram automaticamente e a furadeira ficou separada para escolha.
- **Auditoria da cesta/total:** não houve total. A cesta montada pela lista mostrou exatamente: `1x Arroz Branco Swift 1kg — R$ 4,29`; `1x Feijão Preto Swift 1kg — R$ 7,12`; `1x Café Tradicional Vácuo Carrefour 500 g — R$ 21,89`; `1x Leite UHT Integral Carrefour Classic 1L — R$ 5,38`; `1x Pão Francês — R$ 1,71`. A furadeira não entrou sozinha; a Lia mostrou opções separadas: `Furadeira Impacto Profissional 750w 13mm 220v — R$ 360,45`, `Furadeira Parafusadeira Brushless Com 2 Baterias 2 Ah Tecepo Verde-limão 60hz — R$ 283,74` e `Furadeira e Parafusadeira DEWALT DCD7771D2 Com Carregador Bivolt, 2 Baterias 2 Ah — R$ 1.159,97`. Não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente enviou: `1 arroz` / `1 feijao` / `1 cafe` / `1 leite` / `1 pao` / `uma furadeira boa`.
  - Lia: `Montei a cesta da sua lista: •1x Arroz Branco Swift 1kg — R$ 4,29 •1x Feijão Preto Swift 1kg — R$ 7,12 •1x Café Tradicional Vácuo Carrefour 500 g — R$ 21,89 •1x Leite UHT Integral Carrefour Classic 1L — R$ 5,38 •1x Pão Francês — R$ 1,71 Pra ajustar: troca X por Y ou tira X.`
  - Lia: `Opções de furadeira:` seguida das três opções e preços acima.
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 9/10 — segurou a furadeira cara fora da cesta e montou os básicos sem interrogatório.

### Sessão #13 | Persona: Seu Jorge (A6) | Missão: shampoo + protetor solar + escova de dente

- **Objetivo cumprido?** Não — a Lia encontrou os três produtos reais, mas também criou um quarto item a partir de `seu Jorge aqui` e a sessão foi cancelada antes do total.
- **Auditoria da cesta/total:** não houve total. Produtos reais identificados: shampoo, protetor solar e escova de dente. O item indevido `seu Jorge aqui` não foi escolhido. Não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0 “não entendi”; 1 erro de entendimento de narrativa. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente: `seu Jorge aqui, to precisando de um shampoo, um protetor solar e uma escova de dente, coisa simples de farmacia` → Lia: `Achei os 4 itens. Vamos um de cada vez: shampoo, depois protetor solar e escova de dente e seu Jorge aqui.`
  - Depois de escolher a escova, Lia: `Agora seu Jorge aqui.` e mostrou `Imagem São Jorge Metal Colorido Proteção Fé Painel Carro — R$ 20,98`.
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?` (a busca de São Jorge ainda apareceu antes da limpeza).
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 4/10 — eu não conseguiria completar uma compra de farmácia sem lidar com o item inventado pela apresentação do meu nome.

### Sessão #14 | Persona: Rafa (A2) | Missão: rajada pilha/carregador; manter apenas pilha

- **Objetivo cumprido?** Não — a rajada perdeu o estado: o carregador continuou ativo depois de `aa esquece o carregador`, e a pilha foi descartada.
- **Auditoria da cesta/total:** não houve total. Nenhum produto foi confirmado na cesta; a Lia mostrou pilhas e um carregador, mas terminou perguntando quantidade do carregador. Não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 1 `Não entendi. Me diz os itens que você quer.`; 1 mensagem de descarte incorreto (`Deixei pilha de fora...`). **Esperas acima de 30s:** não houve aviso formal, embora a rajada tenha gerado respostas fragmentadas.
- **Momentos ruins (transcrição exata):**
  - Cliente enviou rapidamente: `oi` / `tem pilha?` / `e carregador?` / `aa esquece o carregador`.
  - Lia: `Deixei pilha de fora. Se quiser, me diz de outro jeito que eu procuro.`
  - Lia: `Não entendi. Me diz os itens que você quer.`
  - Mesmo depois de `aa esquece o carregador`, Lia mostrou `Opções de carregador:` e `Carregador De Parede Ultra Rápido I2go Com 1 Saída Usb-C Power Delivery 20w Plus — R$ 98,89`.
  - Cliente: `só a pilha, sem carregador` → Lia: `Quantas unidades de Carregador De Parede Ultra Rápido I2go Com 1 Saída Usb-C Power Delivery 20w Plus? Ou digita a quantidade direto aqui.`
  - Cliente: `cancelar` → Lia: `Carrinho limpo. O que você quer agora?`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 1/10 — eu abandonaria a compra porque a última alteração foi ignorada e o item que eu queria saiu.

### Sessão #15 | Persona: Dona Cida (A3) | Missão: violão; silêncio de 8–10 minutos e retomada

- **Objetivo cumprido?** Sim. Depois de 8 minutos e 20 segundos sem interação, a Lia retomou o item e permitiu escolher uma opção, chegando ao total.
- **Auditoria da cesta/total:** bateu 100%. Resumo: `1x Violão Meu Primeiro Violão - Em Madeira — R$ 458,13`; `Produtos: R$ 458,13`; `Entrega: R$ 0,00 · pela própria loja`; `Total: R$ 458,13`. Soma: `R$ 458,13 + R$ 0,00 = R$ 458,13`. Produto e quantidade conferem; não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0. **Esperas acima de 30s:** não houve aviso durante o silêncio; a Lia só havia mandado `Procurando as melhores opções…` antes da pausa.
- **Momentos ruins (transcrição exata):**
  - Cliente: `Oi, meu neto quer um violão.` → Lia: `Opções de meu neto quer um violão:` e mostrou `Violão Mt 30 Blue Sunburst - O F E R T A — R$ 310,09` e `Violão Meu Primeiro Violão - Em Madeira — R$ 458,13`.
  - Após 8m20s, Cliente: `meu neto que pediu isso ai` → Lia: `Quantas unidades de Violão Meu Primeiro Violão - Em Madeira? Ou digita a quantidade direto aqui.` A frase foi tratada como escolha do segundo item, em vez de uma nova pergunta.
  - Cliente: `1 unidade` → Lia: `✅ 1x Violão Meu Primeiro Violão - Em Madeira Escolhe aí embaixo — ou manda o próximo item direto.`
  - Cliente: `cancelar` → Lia: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 8/10 — a retomada preservou o item e não houve cobrança, mas a Lia escolheu uma das opções sem confirmar qual o cliente queria.

### Sessão #16 | Persona: Júlia (A5) | Missão: lista semanal de sete itens; conferir “óleo”, frete e entregas

- **Objetivo cumprido?** Parcialmente. A Lia encontrou seis itens e informou honestamente que não achou o óleo; foi possível chegar ao total dos seis encontrados.
- **Auditoria da cesta/total:** as seis linhas do resumo bateram 100% com as escolhas: `1x Arroz Branco Swift 1kg — R$ 4,29`; `1x Feijão Preto Swift 1kg — R$ 7,12`; `1x Café Tradicional Vácuo Carrefour 500 g — R$ 21,89`; `1x Leite UHT Integral Carrefour Classic 1L — R$ 5,38`; `1x Banana Nanica Unidade — R$ 1,36`; `1x Sabão em Pó Brilhante Limpeza Total 2,2Kg Tamanho Família — R$ 28,48`. O pedido de `oleo` não entrou e foi explicitamente recusado: `óleo eu não achei — o resto achei e tá logo abaixo.`
  - Soma das linhas: `4,29 + 7,12 + 21,89 + 5,38 + 1,36 + 28,48 = R$ 68,52`, igual a `Produtos: R$ 68,52`.
  - Entrega: `R$ 48,80 · pela própria loja (3 entregas)`; total: `R$ 117,32`; `R$ 68,52 + R$ 48,80 = R$ 117,32`. Não houve divergência de centavos e não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 0 “não entendi”; 1 aviso de busca. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente: `arroz, feijao, cafe, leite, banana, oleo, sabao em po` → Lia: `óleo eu não achei — o resto achei e tá logo abaixo.`
  - Lia: `Achei os 6 itens. Vamos um de cada vez: arroz, depois feijão e café e leite e banana e sabão em pó.`
  - Lia: `Entrega: R$ 48,80 · pela própria loja (3 entregas)`.
  - Cliente: `cancelar` → Lia: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 8/10 — os itens e valores do resumo ficaram exatos, mas o pedido semanal terminou com seis de sete itens e três entregas.

### Sessão #17 | Persona: Bia (A7) | Missão: creme dental barato; rejeitar a primeira leva e aceitar outra

- **Objetivo cumprido?** Parcialmente. A primeira leva foi rejeitada, mas `nao gostei` não gerou uma segunda busca. Só após um pedido explícito por Sorriso apareceu uma nova leva, da qual escolhi um item.
- **Auditoria da cesta/total:** bateu 100% no pedido finalmente escolhido: `1x Creme Dental Sorriso Kolynos 90g Edição Limitada — R$ 4,02`; `Produtos: R$ 4,02`; `Entrega: R$ 4,90 · pela própria loja`; `Total: R$ 8,92`. Soma: `R$ 4,02 + R$ 4,90 = R$ 8,92`. Não houve pagamento.
- **Nº de “não entendi”/respostas-robô:** 1 `Não entendi. Me diz os itens que você quer.`; 1 resposta de descarte automático. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Primeira opção: `Creme Dental Closeup Proteção Bioativa Contra o Ácido do Açúcar Sabor Menta Refrescante 70g — R$ 3,84`.
  - Cliente: `nao gostei` → Lia: `Deixei creme dental de fora. Se quiser, me diz de outro jeito que eu procuro.` e `Não entendi. Me diz os itens que você quer.`
  - Cliente: `me mostra outra opção` → Lia: `Me diz de outro jeito — marca, tamanho — que eu procuro.`
  - O botão de `Creme Dental Sorriso Kolynos 90g Edição Limitada — R$ 4,02` da primeira leva foi tratado como antigo: `Esse botão é de uma conversa antiga 🙂 Me diz o que você precisa que eu busco de novo.`
  - Cliente: `quero creme dental Sorriso` → Lia mostrou três opções novas; escolha final: `Creme Dental Sorriso Kolynos 90g Edição Limitada — R$ 4,02`.
  - Cliente: `cancelar` → Lia: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; segundo `cancelar` → `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 6/10 — consegui concluir com valor baixo e soma correta, mas a rejeição natural não levou diretamente a novas alternativas.

### Sessão #11 | Persona: Marlene (A1) | Missão: “o mesmo de sempre”; confirmar antes do total

- **Objetivo cumprido?** Sim. A Lia recuperou a última compra, perguntou antes de prosseguir, mostrou o total e foi cancelada sem pagamento.
- **Auditoria da cesta/total:** bateu 100%. Resumo: `1x Escova de Dente Colgate Classic Clean 3 Unidades — R$ 12,69`; `Produtos: R$ 12,69`; `Entrega: R$ 6,90 · pela própria loja`; `Total: R$ 19,59`. Soma: `R$ 12,69 + R$ 6,90 = R$ 19,59`. Produto, marca, tamanho e quantidade conferem com o item recuperado.
- **Nº de “não entendi”/respostas-robô:** 0. **Esperas acima de 30s:** 0 avisadas.
- **Momentos ruins (transcrição exata):**
  - Cliente: `qero o mesmo de sempre` → Lia: `Achei sua última compra: •1x Escova de Dente Colgate Classic Clean 3 Unidades — R$ 12,69 É isso? Responde sim que eu fecho o total — ou me diz o que mudar.`
  - Cliente: `sim` → Lia: `🛒 Seu pedido: •1x Escova de Dente Colgate Classic Clean 3 Unidades — R$ 12,69 Produtos: R$ 12,69 Entrega: R$ 6,90 · pela própria loja Total: R$ 19,59 📍 Rua Engenheiro Edgar Egidio de Souza 221 ap 13 Escolhe abaixo como quer pagar.`
  - Lia: `Preço garantido por 5 min. Escolhe Pix ou cartão pra eu gerar o pagamento.`
  - Cliente: `cancelar` → Lia: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`
  - Cliente: `cancelar` → Lia: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Nota:** 9/10 — o pedido antigo foi mostrado e confirmado antes do total; não fui levado diretamente ao pagamento.

### Sessão 1 — Pedro (A4)

Missão: arroz e café; chegar ao pagamento sem pagar; esperar 2 minutos; enviar `mudei de ideia, cancela`; perguntar `cadê meu pedido?`; enviar `cancelar` novamente.

- Objetivo: sim; chegou ao menu de pagamento e foi encerrada sem pagamento.
- Auditoria: resumo final com 1x Arroz Branco Swift 1kg — R$4,29 e 1x Café Torrado e Moído Tradicional Melitta 500g — R$36,29. Produtos R$40,58; entrega R$25,80; 2 entregas; total R$66,38. A soma das linhas bateu exatamente (R$4,29 + R$36,29 = R$40,58).
- Troca: a Lia nomeou o antigo e o novo com preços: `Café Torrado e Moído Equilibrado L'or Torras Gourmet 250g (R$ 20,89) → Café Torrado e Moído Tradicional Melitta 500g (R$ 36,29)`. A troca foi explícita; o café final não era o inicialmente escolhido.
- Três respostas literais: 1) `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; 2) após `cadê meu pedido?`: `#9ZQKJ1 (1x Arroz Branco Swift 1kg, 1x Café Torrado e Moído Tradicional Melit…) cancelado — nada foi cobrado. Quer pedir de novo? Além desse, seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal.`; 3) após novo `cancelar`: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- Segurança: nenhum botão de Pix/cartão foi tocado. O pedido antigo pago foi apenas registrado, conforme instrução.
- Espera acima de 30s: não houve aviso automático capturado; houve a espera manual obrigatória de 2 minutos no menu.
- Nota: 8/10.

### Sessão 3 — Dona Cida (A3)

Missão: uma mensagem longa com contexto familiar e pedido de shampoo; auditar o que foi entendido; escolher shampoo e cancelar.

- Objetivo: sim; a Lia entendeu somente shampoo, mostrou opções, chegou ao total e foi cancelada sem pagamento.
- Mensagem enviada: `oi minha filha, meu neto vem sabado, vou receber a familia toda em casa, quero deixar meu cabelo bem arrumado, me ve um shampoo bom, que nao seja muito caro`.
- Auditoria: 1x Shampoo Pom Pom Suave 200ml — R$10,96; produtos R$10,96; entrega R$6,90; total R$17,86. Soma correta e nenhum item narrativo entrou na cesta.
- Escolha: a Lia mostrou Shampoo Pom Pom Suave 200ml R$10,96, Shampoo Antissal Niely Gold 275m R$13,19 e Shampoo Seda Chá Verde e Cítricos 325ml R$14,19. Foi escolhido o primeiro.
- Ponto positivo: não repetiu o defeito da rodada anterior de transformar o neto, a família ou a preferência de preço em produtos.
- Cancelamentos literais: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; depois de repetir `cancelar`: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- Espera acima de 30s: não houve aviso automático capturado.
- Nota: 9/10.

### Sessão 4 — Marlene (A1)

Missão: um item barato de mercado (leite); aceitar a troca de loja se oferecida; auditar a troca e o total.

- Objetivo: sim; aceitou a troca de loja, chegou ao pagamento e cancelou.
- Pedido inicial: `oi qero um leite barato pra casa`; escolha: Leite UHT Integral Carrefour Classic 1L — R$5,38.
- Troca literal: `Leite UHT Integral Carrefour Classic 1L (R$ 5,38) → Leite UHT Integral Piracanjuba 1L (R$ 8,24)`. A Lia informou antigo, novo e os dois preços.
- Auditoria final: 1x Leite UHT Integral Piracanjuba 1L — R$8,24; produtos R$8,24; entrega R$9,90; total R$18,14. A soma bateu; não houve item extra nem duplicado.
- Cancelamentos literais: `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; depois de repetir `cancelar`: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- Espera acima de 30s: não houve aviso automático capturado.
- Nota: 9/10.

### Sessão 5 — Bia (A7)

Missão: fone Bluetooth até R$150; responder apenas `Philco`; conferir se o refinamento traz fone Philco, escolher um e cancelar.

- Objetivo: parcial; escolheu um fone e cancelou, mas o refinamento por marca saiu do tipo de produto.
- Primeiras opções: Fones de Ouvido Sem Fio Kaidi KD-790 Bluetooth Branco — R$47,19; Fone De Ouvido Bluetooth Sem Fio Philips Tah1205/00 Preto — R$138,60. Ambos eram fones e estavam dentro do teto.
- Resposta enviada: `Philco`.
- Falha literal: a Lia respondeu `Anotei Philco — a gente escolhe em seguida.` e mostrou novamente Kaidi e Philips. Depois de escolher o Philips, a própria conversa continuou com `Agora Philco.` e exibiu `Philco Multi Cook R$ 420,34`, `Air Fryer Philco 6,5L ... R$ 386,53` e `Air Fryer Philco 9L ... R$ 572,86`. Nenhum era fone e todos ultrapassavam R$150.
- Auditoria: não houve total. O único item escolhido foi 1x Fone De Ouvido Bluetooth Sem Fio Philips Tah1205/00 Preto; o item Philco não foi escolhido.
- Cancelamentos literais: primeiro `Carrinho limpo. O que você quer agora?`; segundo `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- Espera acima de 30s: não houve aviso automático capturado.
- Nota: 4/10.

### Sessão 2 — Marlene (A1)

Missão: pasta de dente; no meio da escolha perguntar `quanto ficou? e quando chega?` e `cadê meu pedido de ontem?`; escolher e cancelar.

- Objetivo: sim; chegou ao menu de pagamento e foi cancelada.
- Perguntas no meio: a `quanto ficou? e quando chega?`, a Lia respondeu `Falta você escolher as opções que eu mandei — aí eu fecho total, entrega e prazo de uma vez.`. À pergunta `cadê meu pedido de ontem?`, respondeu `#YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) confirmado, separando os itens. Te aviso quando sair pra entrega.`. A resposta trouxe código, data relativa e item antigo, mas chamou de ontem algo de terça.
- Auditoria: 1x Creme Dental Closeup Proteção Bioativa Contra o Ácido do Açúcar Sabor Menta Refrescante 70g — R$3,84; produtos R$3,84; entrega R$4,90; total R$8,74. Soma correta, sem troca de produto.
- Cancelamentos literais: primeira `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; segunda `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- Espera acima de 30s: não houve aviso automático capturado.
- Nota: 8/10.

### Sessão 18 — Pedro (A4)

Missão: montar uma cesta, chegar ao total, trocar o endereço para Campinas e ver o total recalculado; não pagar e cancelar.

- **Objetivo cumprido?** Não. A cesta chegou ao pagamento, mas a troca de endereço não foi concluída: depois de `vou mandar pra casa da minha irmã em Campinas, CEP 13010-100`, a Lia respondeu apenas `Esse preço venceu. Fecho um novo antes de cobrar qualquer coisa.` e não pediu os demais campos nem mostrou novo endereço ou total.
- **Auditoria do total exibido antes da troca:** bateu 100%. Resumo literal: `1x Café Torrado e Moído Tradicional Melitta 500g — R$ 36,29`; `Produtos: R$ 36,29`; `Entrega: R$ 9,90 · pela própria loja`; `Total: R$ 46,19`. Soma: `R$ 36,29 + R$ 9,90 = R$ 46,19`. O endereço ainda era `Rua Engenheiro Edgar Egidio de Souza 221 ap 13`, portanto não houve auditoria de um total pós-Campinas.
- **Falha de fluxo:** depois de escolher café Carrefour, a mensagem `e arroz` não acrescentou arroz; disparou a troca do café para Melitta por causa do mínimo: `Café Tradicional Vácuo Carrefour 500 g (R$ 21,89) → Café Torrado e Moído Tradicional Melitta 500g (R$ 36,29)`. A troca foi explícita, mas a intenção de adicionar arroz foi perdida.
- **Cancelamentos literais:** primeiro `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`; segundo, a mesma resposta literal.
- **Esperas acima de 30s:** o preço venceu enquanto a sessão aguardava autorização e processamento; não houve novo total depois disso.
- **Nota:** 4/10 — os preços e a troca de loja ficaram claros, mas mudar o destino não produziu uma confirmação utilizável nem um total recalculado.

### Sessão 19 — Seu Jorge (A6)

Missão: comprar café; no meio perguntar `isso é golpe? quem é você?`, depois perguntar `quanto custa a entrega?`, ver o total e cancelar.

- **Objetivo cumprido?** Sim, com troca automática de loja para superar o mínimo do Carrefour; o total apareceu e não houve pagamento.
- **Auditoria da cesta/total:** bateu 100%. Resumo: `1x Café Torrado e Moído Tradicional Melitta 500g — R$ 36,29`; `Produtos: R$ 36,29`; `Entrega: R$ 9,90 · pela própria loja`; `Total: R$ 46,19`. Soma: `R$ 36,29 + R$ 9,90 = R$ 46,19`. Marca, tamanho, quantidade e entrega conferem com a troca escolhida.
- **Falha de interpretação:** a abertura `seu Jorge aqui, queria um café` gerou `seu Jorge aqui eu não achei — o resto achei e tá logo abaixo.`; a Lia tratou o nome do cliente como se fosse um item, embora tenha encontrado o café.
- **Pergunta de identidade/golpe:** `isso é golpe? quem é você?` → `Funciona assim: Você me diz o que precisa Eu mostro o total, o frete e o prazo Você paga por Pix ou cartão Eu compro e acompanho até chegar 🛵 Também entendo status, trocar endereço, tira o item X e repete o de sempre. O que você precisa?` A resposta foi compreensível, mas veio acompanhada de uma lista de recursos e repetiu a instrução de pagamento.
- **Pergunta de entrega:** `quanto custa a entrega?` → `O frete depende da distância até você 🛵 Te mostro o valor exato junto com o total quando fechar a cesta.`
- **Cancelamentos literais:** primeiro `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; segundo `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Esperas acima de 30s:** 1 espera durante a busca, sem aviso de demora capturado.
- **Nota:** 8/10 — respondeu bem às dúvidas de confiança e frete e fechou com soma correta; perde pontos por transformar `seu Jorge aqui` em produto e depender da troca de loja.

### Sessão 20 — Marlene (A1)

Missão: compra normal de 2–3 itens de mercado; fechar até o pagamento, auditar e cancelar.

- **Objetivo cumprido?** Sim. A Lia entendeu os três itens, conduziu a escolha um por vez, chegou ao menu de pagamento e foi cancelada sem pagamento.
- **Auditoria da cesta/total:** bateu 100%. Resumo: `1x Arroz Branco Swift 1kg — R$ 4,29`; `1x Leite UHT Integral Carrefour Classic 1L — R$ 5,38`; `1x Sabão em Pó Brilhante Limpeza Total 2,2Kg Tamanho Família — R$ 28,48`. `Produtos: R$ 38,15`; `Entrega: R$ 32,80 · pela própria loja (2 entregas)`; `Total: R$ 70,95`. Soma item a item: `R$ 4,29 + R$ 5,38 + R$ 28,48 = R$ 38,15`; `R$ 38,15 + R$ 32,80 = R$ 70,95`. Marcas, tamanhos e quantidades conferem; não houve duplicação.
- **Momentos ruins (transcrição exata):** `Entrega: R$ 32,80 · pela própria loja (2 entregas)` — o frete ficou quase tão alto quanto os produtos, embora tenha sido informado antes do pagamento.
- **Cancelamentos literais:** primeiro `Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.`; segundo `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic Clean …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.`
- **Esperas acima de 30s:** 0 avisadas; a busca apresentou opções sem aviso de demora.
- **Nota:** 8/10 — foi a sessão mais próxima do uso cotidiano, com cesta correta e total correto; perde pontos pelo frete de R$32,80 em duas entregas.

## Relatório final comparativo

### 1. Notas

| Sessão | Persona | Nota |
|---:|---|---:|
| 1 | Pedro | 8 |
| 2 | Marlene | 8 |
| 3 | Dona Cida | 9 |
| 4 | Marlene | 9 |
| 5 | Bia | 4 |
| 6 | Seu Jorge | 2 |
| 7 | Pedro | 8 |
| 8 | Júlia | 8 |
| 9 | Rafa | 9 |
| 10 | Pedro | 6 |
| 11 | Marlene | 9 |
| 12 | Júlia | 9 |
| 13 | Seu Jorge | 4 |
| 14 | Rafa | 1 |
| 15 | Dona Cida | 8 |
| 16 | Júlia | 8 |
| 17 | Bia | 6 |
| 18 | Pedro | 4 |
| 19 | Seu Jorge | 8 |
| 20 | Marlene | 8 |
| **Média** |  | **6,80/10** |

### 2. Comparação com a rodada anterior

- **Média:** 6,80/10, contra 4,15/10 na rodada anterior — melhora de 2,65 pontos.
- **“Não entendi” literal:** 2 ocorrências, nas sessões 14 e 17, contra 13 na rodada anterior. Somando respostas automáticas inadequadas/repetitivas do mesmo tipo, foram 9 ocorrências em 6 sessões.
- **Perda de estado funcional:** 5/20 (S5, S6, S13, S14 e S18), contra 3/20. Os casos foram refinamento que saiu do tipo de produto, nome virando item, rajada que manteve item cancelado e `e arroz` que não foi adicionado.
- **Cesta contaminada:** 0/20, contra 1/20. Nenhum resumo final observado trouxe item extra não escolhido.
- **Totais com soma divergente:** 0. Foram auditados 12 resumos com total; em todos, a soma das linhas de produtos e da entrega bateu exatamente com o total exibido, sem diferença de centavos.
- **Segurança:** nenhum Pix, cartão, código ou dado de pagamento foi acionado. Todas as 20 sessões terminaram com `cancelar`; as respostas finais apontaram a compra antiga paga `#YAQHF8`, que é resíduo real documentado, não uma cobrança desta rodada.

### 3. Top 5 problemas por frequência

1. **Resíduo de pedido antigo depois do cancelamento — 20/20 sessões.** A segunda confirmação repetiu: `Não tem compra em aberto pra cancelar. Seu pedido #YAQHF8 (de terça — 1x Escova de Dente Colgate Classic …) está pago e em andamento — esse segue normal; qualquer coisa nele, me fala o número.` É factual, mas para uma pessoa que não reconhece o pedido parece uma cobrança ou um pedido que ela acabou de criar.
2. **Frete alto ou múltiplas entregas — 6/20 sessões.** Exemplos: S16 `Entrega: R$ 48,80 · pela própria loja (3 entregas)`; S20 `Entrega: R$ 32,80 · pela própria loja (2 entregas)`; S1 chegou a 2 entregas e R$25,80. O valor aparece, mas a cesta pequena pode parecer inviável.
3. **Nome/contexto narrativo interpretado como produto — 4/20 sessões.** S6: `Achei os 2 itens. Vamos um de cada vez: café moído, depois seu Jorge aqui.`; S13: `Achei os 4 itens... e seu Jorge aqui.`; S15: `Opções de meu neto quer um violão:`; S19: `seu Jorge aqui eu não achei — o resto achei e tá logo abaixo.`
4. **Correção natural que não preserva a intenção — 4/20 sessões.** S5, após `Philco`, mostrou `Philco Multi Cook` e air fryers, não fones; S14, após `aa esquece o carregador`, manteve `Opções de carregador`; S17, `nao gostei`, virou `Não entendi`; S18, `e arroz`, não acrescentou arroz e disparou troca do café.
5. **Recuperação fraca após rejeição ou esgotamento — 3/20 sessões.** S10 repetiu duas vezes: `De presente pra menina de 8 anos eu já mostrei tudo que tenho. Me diz uma marca, tipo ou faixa de preço que eu procuro diferente.`; S17 exigiu `quero creme dental Sorriso` para voltar a buscar; S5 repetiu opções fora do refinamento pedido.

### 4. Top 3 problemas por gravidade

1. **Risco de item errado entrar no pedido.** O caso mais grave foi S5: a marca `Philco` trocou o contexto de fone por eletrodomésticos acima do limite; S14 manteve um carregador que havia sido retirado. Um cliente distraído poderia escolher algo diferente do que pediu.
2. **Troca de endereço sem conclusão.** Em S18, `vou mandar pra casa da minha irmã em Campinas, CEP 13010-100` resultou em `Esse preço venceu. Fecho um novo antes de cobrar qualquer coisa.`, sem confirmar Campinas, pedir o endereço completo ou mostrar um total novo. Isso deixa o cliente sem saber para onde iria a compra.
3. **Confusão com dinheiro e pedidos antigos.** A mensagem recorrente `seu pedido #YAQHF8 ... está pago e em andamento` aparece logo depois de cancelar uma sessão nova. Mesmo sendo um pedido real antigo, a proximidade com o cancelamento pode fazer o cliente achar que foi cobrado ou que a Lia misturou suas compras.

### 5. As 3 melhores coisas

1. **Auditoria financeira transparente:** os 12 resumos auditados fecharam linha a linha, inclusive produtos, entrega, número de entregas e total.
2. **Barreira de pagamento funcionando:** nenhum fluxo exigiu ou acionou pagamento durante o teste; `cancelar` respondeu `Cancelado. Nada foi cobrado.` e a repetição confirmou ausência de compra aberta.
3. **Boas guardas em vários fluxos:** o botão antigo da S9 foi identificado como antigo; a furadeira cara da S12 não entrou sozinha; as trocas de loja da S4, S18 e S19 nomearam produto antigo, novo e preços.

### 6. Veredito

**Não deixaria minha mãe usar isso sem ajuda ainda.** A compra comum funcionou e os valores foram confiáveis, mas um nome dito na saudação pode virar produto, uma rajada pode deixar o item errado ativo e a troca de endereço pode terminar sem confirmação. Para eu responder “sim”, faltam isolamento forte entre intenções, confirmação explícita antes de qualquer item ambíguo ser escolhido, recuperação natural de rejeições e um fluxo de endereço que sempre termine com endereço e total recalculados visíveis.
