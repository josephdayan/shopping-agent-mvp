# Alternativas ao comprador do Muse para a Lia

Pesquisa ampliada em 24/09/2026, por Codex. Complementa [a conversa e análise do Muse](muse-lia-viabilidade-conversa-2026-09-24.md). Fontes públicas primárias consultadas nesta data; nenhum serviço contratado, credencial cadastrada, agente executado em loja ou pagamento realizado.

## 1. Conclusão e prioridade

**Existe infraestrutura pública mais pronta do que montar Muse Spark + navegador do zero.** As descobertas mais relevantes são Skyvern para executar o checkout e Kernel/Browser Use + Agentcard para combinar navegador com pagamento aprovado no celular. Isso aumenta a viabilidade de um protótipo; ainda não demonstra compra autônoma nas lojas brasileiras da Lia.

Minha recomendação técnica, sem alterar a decisão operacional de 15/09:

1. **Manter VTEX + Pix como referência para as lojas já sondadas.** É o caminho com mais evidência nossa, embora falte justamente fechar o pedido e obter/pagar o Pix.
2. **Comparar Skyvern e Browser Use como executores em uma loja**, começando em ambiente de teste sem dinheiro. Avaliar minutos humanos economizados e reconciliação, além da navegação.
3. **Investigar Agentcard Vault + Kernel como experiência de cartão do cliente**, se quisermos a compra direta na loja. Há documentação específica de tokenização Mercado Pago, mas não de uma compra completa da Lia.
4. **Tratar parceria com uma loja como alternativa própria.** Um endpoint autorizado de pedido, Pix ou conta comercial pode resolver mais que trocar o navegador.
5. Adiar emissão internacional cara e APIs limitadas aos EUA. Não abrir sete integrações em paralelo.

## 2. Dois produtos possíveis, com consequências diferentes

### Revisão após a objeção sobre Browserbase

O dono perguntou por que essas opções seriam melhores, dado o fracasso anterior com
Browserbase. A comparação anterior destacou conveniência de integração mais do que
evidência de resolução dos obstáculos. **Não demonstramos superioridade operacional.**

O histórico de 19–20/07 mostra problemas diferentes: Carrefour recusou o ambiente remoto
no login mesmo com a conta funcionando no navegador comum; Petz não expôs frete/prazo
no Context; Boticário deixou o cálculo de CEP indisponível; houve ainda seletor invalidado
por redesenho da sacola. Oba chegou a `cart_ready`, sem pedido. Não foi simplesmente
falta de cartão salvo ou de um modelo mais capaz.

Um agente pode reduzir a manutenção de seletores e navegar melhor quando os controles
estão disponíveis; isso é hipótese a medir. Cofre pode facilitar pagamento quando o
checkout já está acessível. Nenhum desses diferenciais prova que login bloqueado,
entrega indisponível ou antifraude deixarão de impedir a compra.

**Prioridade refinada:** não recomendar migração de fornecedor com base no catálogo de
recursos. Primeiro identificar a barreira por loja e exigir evidência de que a alternativa
resolve essa mesma barreira. VTEX tem evidência de preparação em outras lojas, não de
superioridade no mesmo checkout nem de conclusão. Para o Carrefour bloqueado, a rota
continua sendo acesso autorizado/parceria. O ranking da seção 1 é de candidatos de
pesquisa, não de substitutos comprovados para Browserbase.

Fontes locais: [registro Carrefour](automacao-compra-carrefour.md) e histórico de
19–20/07 em `AGENTS.md`. Interfaces atuais conferidas: [Browser Use](https://docs.browser-use.com/cloud/quickstart)
e [Skyvern](https://www.skyvern.com/docs/cloud/managing-credentials/credit-card-credentials).

| Modelo | Como o dinheiro circula | O que precisa funcionar | Consequência para a Lia |
| --- | --- | --- | --- |
| Lia compra para o cliente | Cliente paga Lia; Lia paga varejista com Pix ou cartão da operação | Cobrança atual + executor da loja + pagamento de saída | Mais próximo do produto atual; mantém conciliação e estorno em duas operações |
| Agente usa cartão pessoal do cliente | Carteira autoriza pagamento direto ao varejista | Cofre/carteira, consentimento, executor e autenticação do banco | Exige definir taxa da Lia, cobrança dessa taxa, suporte, comprovantes e estornos |

**Cartão salvo no PSP que cobra a Lia não é uma credencial universal para pagar outra loja.** Tampouco basta cobrar primeiro e mandar o mesmo cartão pessoal pagar o varejista: isso duplicaria a cobrança do produto. A arquitetura de pagamento precisa ser escolhida antes de integrar uma carteira.

Para reproduzir a conveniência desejada, o caminho mais curto pode manter o primeiro modelo: cliente confirma e paga a Lia; nos bastidores, a Lia compra. Isso não obriga cadastrar o cartão pessoal em cada loja. A carteira direta é outra hipótese de produto, não um requisito para automatizar o operador.

## 3. Comparação das alternativas

| Opção | O que entrega | O que permanece em aberto | Avaliação para a Lia |
| --- | --- | --- | --- |
| Skyvern | Agente, workflows, sessões e credenciais de checkout | Execução BR, plano de intervenção humana, tratamento de cartão | Candidato forte a executor; não homologado como cofre de clientes |
| Browser Use Cloud | Agente por API ou navegador controlável por nosso código | Pagamento, limites financeiros e verificação do pedido | Candidato para substituir o executor, sem trocar o produto inteiro |
| Kernel + Agentcard Vault | Navegador, credenciais substitutas e aprovação do pagamento no celular | Cobertura exata do checkout, BRL, autenticação, contratação | Combinação nova mais interessante para a experiência de carteira |
| Agentcard Purchase API | Pedido conversacional com carrinho e confirmação estruturados | Lojas e entrega no Brasil; exemplos de endereço EUA/Canadá | Bom desenho de referência; implantação BR não demonstrada |
| Rye Universal Checkout | URL → checkout → pedido, com meios de pagamento próprios | Padrão EUA, cesta de um produto, frete sem seleção | Baixa aderência ao piloto atual |
| TinyFish | Agente por objetivo ou navegador via CDP, perfis e cofre de login | Evidência de pagamento e conciliação nas nossas lojas | Alternativa de infraestrutura; não lidera a lista |
| VTEX + Pix | Checkout HTTP já sondado pela Lia | Transação final, desafio, obtenção do Pix e confirmação | Maior evidência local; falta fechar o elo decisivo |
| Stark / Visa / Mastercard | Emissão ou autorização de pagamentos para agentes | Acesso comercial e execução do pedido | Complementos; não substituem o comprador |

As classificações são julgamento de engenharia baseado em documentação e histórico local, não resultados de benchmark nosso.

## 4. Skyvern: o mais parecido com um operador pronto

O Skyvern documenta credencial de cartão com número, validade e CVV, injetada no navegador fora do prompt. O agente reconhece campos de checkout e pode receber o identificador da credencial por execução. Isso se aproxima diretamente de “cadastrei uma vez e o agente preenche”. [Documentação de cartões](https://www.skyvern.com/docs/cloud/managing-credentials/credit-card-credentials).

Há API, workflows, sessões persistentes e integração com cofres. O fornecedor publicou um relato de compra automática incluindo carrinho, entrega e número do pedido; é demonstração do próprio fornecedor, sem comprovação de lojas brasileiras. [Produto](https://www.skyvern.com/products), [relato da compra](https://www.skyvern.com/blog/skyverns-first-autonomous-order/).

**Ponto a esclarecer antes de usar cartão real:** o anúncio fala em tokens de curta duração, enquanto a documentação operacional descreve dados do cartão e preenchimento de CVV. Não tratar essas descrições como prova de emissão de cartão descartável, limite de gasto ou isolamento completo. Precisamos da arquitetura efetiva e da cobertura contratual aplicável. [Anúncio](https://www.skyvern.com/blog/surprise-launch-day-1-credit-card-support/).

Isso é material para a Lia: o PCI SSC proíbe retenção de CVV após autorização por comerciantes/prestadores, inclusive em serviços de concierge, mesmo cifrado. Não estamos concluindo que o fornecedor viole a regra; a documentação pública não resolve o enquadramento. Não propor guardar CVV de clientes como atalho. Emissão tem exceções específicas, e cartão da própria operação é um cenário diferente a avaliar. [PCI SSC, FAQ 1280](https://www.pcisecuritystandards.org/faqs/1280/), [FAQ 1574 sobre dispositivos e cofres](https://www.pcisecuritystandards.org/faqs/1574/).

**Uso que eu testaria primeiro:** preparar e verificar a cesta sem credencial de pagamento; depois comparar execução supervisionada. A compra real requer esclarecer o ponto acima ou usar outro meio, como Pix. Isso permite avaliar o agente sem confundir navegação boa com carteira pronta.

## 5. Browser Use: contratar o executor e conservar os controles da Lia

A API V4 oferece dois caminhos: enviar uma tarefa ao agente hospedado ou criar navegador e conectar Playwright/CDP. Existe intervenção humana por visualização ao vivo e continuação na mesma sessão enquanto o navegador estiver disponível. [Quickstart](https://docs.browser-use.com/cloud/quickstart), [intervenção humana](https://docs.browser-use.com/cloud/agent/human-in-the-loop).

É um encaixe possível no executor, preservando `checkoutDigest`, `beginPurchase` e `executionUnknown` da Lia. Mas a lógica atual precisa continuar fora do agente; delegar “compre até R$ X” por prompt não reproduz os controles de orçamento e aprovação.

Um limite explícito é útil: os `secretBindings` restringem onde o segredo pode ser digitado, mas a própria documentação alerta que o valor pode ficar acessível pela página/CDP depois da digitação. Não equivalem a uma carteira que mantém o cartão fora do navegador. [Secrets](https://docs.browser-use.com/cloud/guides/secrets).

A Agentcard documenta conexão ao Browser Use e exige anexar o mecanismo de pagamento antes da tarefa de compra; se a execução migrar de navegador, é preciso interromper e conferir a integração. Portanto a combinação é documentada, não apenas uma ideia nossa, mas depende de coordenação entre serviços. [Integração](https://docs.agentcard.sh/vault/integrations/agent-browsers/browser-use).

## 6. Kernel + Agentcard: a alternativa de carteira que merece investigação

### O que foi encontrado

A Agentcard separa Vault, Issuing e Purchase API. O **Vault** afirma aceitar cartões de qualquer país e transacionar na moeda do comerciante; essa é uma indicação mais favorável ao Brasil que o recorte público do Link, mas ainda uma declaração do fornecedor. O produto **Issuing** tem preço padrão anunciado de US$5.000/mês, incompatível com a escala atual da Lia. [Página e FAQ oficiais](https://www.agentcard.sh/).

No fluxo documentado do Vault, o agente usa dados substitutos; uma requisição reconhecida ao processador é pausada; o titular aprova no próprio dispositivo; o cartão real vai ao processador e a resposta volta ao navegador. A confirmação do pedido continua sendo responsabilidade da integração da loja, separada da aprovação financeira. [Fluxo de compra](https://docs.agentcard.sh/vault/completing-a-purchase).

O **Kernel**, provedor de navegador, documenta integração nativa com Agentcard. Sua tabela inclui **Mercado Pago**, limitada a requisição de cartão novo em `api.mercadopago.com/v1/card_tokens`, mediante preparação prévia do checkout. Não é suporte genérico a todo Mercado Pago, a cartão salvo, Pix ou Mercado Livre. Payloads e endpoints diferentes não recebem automaticamente o mesmo tratamento. O documento também distingue valor apenas exibido de valor efetivamente verificado. [Integração Kernel](https://kernel.sh/docs/integrations/wallets/agentcard).

### Por que ainda não está resolvido

- A página comercial fala em 23 processadores; a referência do SDK direto enumera sete e o Kernel tem sua própria tabela. Cobertura precisa ser verificada na combinação e versão escolhidas. [Reconhecedores](https://docs.agentcard.sh/api-reference/vault/recognizers), [cobertura](https://docs.agentcard.sh/api-reference/vault/coverage-get).
- Nenhuma evidência consultada comprova Drogaria SP, Cobasi ou Pague Menos com essa integração. Uma loja VTEX usar um adquirente por trás não significa que o navegador faça a requisição reconhecida.
- Tokenizar cartão não vincula necessariamente a cobrança futura ao total exibido. Exigir comprovação de valor/moeda no fluxo escolhido, ou manter bloqueio externo antes da cobrança; um teto informado ao modelo não resolve isso.
- A aprovação pode abrir uma página no celular e haver 3DS. Ainda não é “aprovar apenas no botão de WhatsApp” nem execução sem qualquer intervenção.
- Cartão brasileiro, moeda BRL, endereço com CEP/CPF, parcelamento, reembolso e suporte são verificações diferentes. Não inferir todas de “any country”.

**Veredito:** vale uma prova em loja sintética e qualificação comercial/técnica. É a alternativa mais específica descoberta para cartão pessoal sem entregar o número ao agente. A documentação não permite prometer adoção imediata no Brasil.

### Purchase API é um produto separado

A API `/buy` devolve carrinho estruturado, exige confirmação do hash e distingue resultado parcial, pedido colocado e cobrança incerta. Prevê consultar a conversa após timeout antes de reenviar. Porém a documentação de endereço descreve ZIP americano ou código canadense; a lista de lojistas precisa ser consultada com token. Não concluir suporte brasileiro do campo opcional `country`. [Purchase API](https://docs.agentcard.sh/vault/integrations/ecommerce-apis/purchase-api).

Esses controles reforçam a arquitetura que a Lia já possui parcialmente. O retorno “agente terminou” nunca deve ser suficiente para marcar `comprado`.

## 7. Rye: a promessa é atraente, o escopo atual não encaixa

A documentação de limitações restringe pedidos padrão aos **EUA**, permite outras regiões sob negociação enterprise, não suporta login, limita a um produto distinto por checkout e não oferece escolha entre fretes. Isso prejudica tanto a lista de compras quanto a entrega rápida da Lia. Um enum antigo contendo `BR` não comprova cobertura. [Limitações](https://rye.com/docs/api-v2/developer-notes).

O fluxo Drawdown permite saldo pré-financiado; o desenvolvedor cobra o usuário e paga os pedidos com esse saldo. A mecânica se parece com o modelo atual da Lia, mas exigiria disponibilidade regional, custos e responsabilidades comerciais definidos. [Drawdown](https://rye.com/docs/api-v2/payment-providers/drawdown).

**Correção da pesquisa anterior:** descrever Rye apenas como “botting terceirizado sem opt-in” é incompleto. A documentação atual descreve bot identificado, requisições assinadas e allowlisting pelo lojista; Akamai exige opt-in do comerciante para essa rota. Isso não comprova acordo com as lojas da Lia, mas mostra uma via legítima de acesso negociado. [RyeBot](https://rye.com/docs/api-v2/ryebot).

Não priorizaria engenharia para Rye enquanto os requisitos Brasil, múltiplos itens e frete selecionável estiverem fora do serviço disponível à Lia.

## 8. Outras possibilidades

**TinyFish:** tem agente por objetivo e navegador CDP, com perfis persistentes. O cofre documentado permite login sem pôr valores no prompt, mas a descrição consultada não comprova carteira de pagamento comparável ao Link/Agentcard nem pedido brasileiro concluído. Útil como candidato secundário para busca, preenchimento e preparação. [APIs](https://docs.tinyfish.ai/), [credenciais](https://docs.tinyfish.ai/key-concepts/credentials).

**Visa/Mastercard:** há progresso brasileiro real. A Visa documentou transação controlada com BB em março e programa Agentic Ready no Brasil com emissores em abril. O Mastercard Agent Pay também já foi identificado na análise principal. Isso justifica explorar parceria, sem confundir piloto do ecossistema com API self-service já liberada para a Lia. [Transação BB/Visa](https://www.visa.com.br/sobre-a-visa/noticias-visa/nova-sala-de-imprensa/bb-visa-primeira-transacao-agentica-brasil.html), [Agentic Ready Brasil](https://www.visa.com.br/sobre-a-visa/noticias-visa/nova-sala-de-imprensa/visa-agentic-ready-comercio-agentico-brasil.html).

**Cartão corporativo por API, como Stark:** permanece candidato para o dinheiro da operação, não para importar o token do cartão pessoal do cliente. Avaliar somente depois de provar que a loja aceita a execução e de identificar o pagamento como gargalo. As capacidades e lacunas do SDK estão no documento principal.

**Parceria direta com um varejista:** hipótese nossa, sem acordo firmado. Em vez de cobrir qualquer loja, começar com uma loja que aceite pedido por integração autenticada ou acesso explícito do agente, com catálogo, reserva de estoque, SLA, confirmação e cancelamento. Pode ser menos engenharia e mais trabalho comercial. Para o consumidor, a experiência de pedir pelo WhatsApp pode ser a mesma.

**Agente local / operação assistida:** útil como comparação com o ambiente remoto, mas não explica sozinho os obstáculos. A Lia já viu bloqueio remoto no Carrefour e desafios/CVV em compras assistidas. Um navegador persistente local não transforma autenticação nem antifraude em problema resolvido. Não reabrir a rota bloqueada mediante troca de proxy ou fingerprint.

## 9. Custos e viabilidade econômica

Preços anunciados em 24/09/2026, em USD, sem conversão cambial e sem estimar uma compra real da Lia:

| Serviço | Referência pública | O que incluir na conta |
| --- | --- | --- |
| Skyvern | Hobby US$29/mês; Pro US$149/mês | Créditos por execução; intervenção humana anunciada no Enterprise, portanto confirmar plano necessário |
| Browser Use | Navegador US$0,02/h + tráfego; agente = tokens + 20% | Browser, rede e modelo são cobranças separadas; não usar só o preço/hora |
| Kernel | Headless ≈ US$0,06/h; com interface ≈ US$0,48/h | Modelo, app invocation, carteira e eventuais planos além do navegador |
| TinyFish Browser | US$0,002/min = US$0,12/h | É a infraestrutura; agente e pagamento não estão implícitos nesse valor |

Fontes: [Skyvern](https://www.skyvern.com/pricing), [Browser Use](https://browser-use.com/pricing), [Kernel](https://kernel.sh/docs/info/pricing), [TinyFish](https://www.tinyfish.ai/browser). Recursos e preços podem mudar. O plano gratuito não prova acesso ao conjunto necessário ao piloto.

O acordo atual com operador é R$400/mês, com volume inicial estimado de 5–15 pedidos, sem adicional automático por pedido. A divisão contábil seria R$80 a R$26,67 por pedido nesse intervalo, **não economia marginal**: enquanto o acordo continuar, automatizar alguns pedidos não elimina o valor mensal. [Runbook local](operador-runbook.md).

A avaliação deve medir:

`custo efetivo por pedido confirmado = (infra + modelos + serviços financeiros + manutenção amortizada + intervenção + perdas/retrabalho) / pedidos confirmados`

Dividir pelo número de tentativas esconderia falhas. Registrar também prazo, confirmação correta de estoque/frete e minutos do operador. No piloto, o ganho mais provável a testar é capacidade e rapidez; ainda não temos evidência de redução de custo total.

## 10. Experimento que diferencia as opções

Esta é uma proposta pronta para avaliação futura, não execução autorizada de compras.

| Etapa | Pergunta | Evidência de saída |
| --- | --- | --- |
| Qualificar | Aceita empresa brasileira, BRL e o fluxo exato? | Documentação/condições para a conta; cartões e lojas elegíveis; custo e limites |
| Checkout sintético | Agente prepara certo e respeita as travas? | Variante/quantidade/endereço/total corretos; teste de troca de preço, timeout e resultado incerto |
| Comparar preparação | Skyvern ou Browser Use economiza trabalho frente à VTEX e ao operador? | Mesmo conjunto de casos, sem pagamento, por loja; duração, custo e intervenção |
| Pagamento supervisionado | A loja cria e paga o pedido uma vez? | Número da loja + estado do pagamento + total/frete/endereço conciliados |
| Acompanhar | Entrega e exceções funcionam? | Tracking, entrega, eventual cancelamento/estorno e custo real |

Para começar, escolher **uma** loja já acessível na sondagem, por exemplo Drogaria SP; não afirmar que ela aceita algum fornecedor novo. Não criar compras só para descobrir cobertura geográfica declarada. Nenhuma meta de 20 preparações ou cinco pedidos transforma sozinha o piloto em operação confiável.

O executor deverá devolver dados verificáveis, como `storeOrderId`, total, moeda, entrega e estado do pagamento, e manter `unknown` quando faltarem evidências. As funções existentes em `src/lib/purchase-execution.ts` são um ponto de partida, não um certificado de que uma integração nova está protegida.

## 11. Perguntas concretas para fornecedores — ainda não enviadas

1. Uma empresa brasileira pode operar o serviço hoje? Com consumidor brasileiro, cartão emitido no Brasil e BRL, em quais modalidades?
2. Para Drogaria SP, Cobasi e Pague Menos, há cobertura comprovada ou é necessário adaptar o checkout? Há suporte ao endpoint real do pagamento, além do nome do processador?
3. Como impedem cobrança acima do aprovado quando a primeira chamada só tokeniza o cartão? Como vinculam estabelecimento, carrinho, moeda e endereço?
4. Como tratam 3DS, CPF, parcelamento, expiração de sessão, timeout após envio e pedido criado sem resposta?
5. O que o agente, o navegador, logs e gravações conseguem ver? Qual o tratamento de CVV e qual serviço cobre esse tratamento contratualmente?
6. Como consultamos pedido/cobrança, evitamos duplicação e fazemos cancelamento/estorno? Qual é o custo completo por pedido e por falha?

Não houve contato comercial ou envio de dados nesta pesquisa. Não há parecer do Claude: a tentativa anterior ficou bloqueada pela sessão do Mac. O usuário pediu seguir aprofundando a análise por Codex.
