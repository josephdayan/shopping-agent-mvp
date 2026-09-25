# Muse da Meta e compras automáticas na Lia

Data: 24/09/2026. Documento preparado por Codex a pedido do dono para revisão no Claude, modelo solicitado **Fable 5.1, esforço Extra**.

## 1. Objetivo e conclusão

O dono quer a experiência: **cadastrar o pagamento uma vez, pedir um produto pelo WhatsApp, aprovar o total e receber a confirmação de que a compra foi realizada**, com o trabalho de checkout acontecendo nos bastidores.

**Conclusão da análise:** há viabilidade técnica para um protótipo de comprador com Muse Spark e navegador próprio. Não há evidência suficiente para afirmar viabilidade operacional de compra autônoma nas lojas brasileiras da Lia. Não encontramos API pública para alugar/controlar o navegador hospedado do aplicativo Muse. O caminho documentado é usar o modelo via API e fornecer ambiente, execução, credenciais, pagamentos e controles próprios.

**Recomendação:** avaliar um experimento isolado e pequeno, condicionado ao acesso real à API, com comparação contra os meios já existentes. Não reabrir toda a estratégia de compra automática nem contratar infraestrutura financeira antes de provar onde está o ganho. O modelo pode melhorar a navegação; não há prova de que elimine bloqueios de loja, autenticação, antifraude ou falhas de pagamento.

Estado desta investigação: pesquisa de fontes primárias e leitura de código local; sem chamada autenticada à Meta Model API, sem execução do modelo, sem emissão de cartão e sem compra. Documentação e afirmações de fornecedores são evidência de interfaces anunciadas, não testes nossos.

**Ampliação posterior em 24/09:** a pesquisa de [alternativas de compra por agentes](alternativas-compra-agentes-2026-09-24.md) encontrou Skyvern, Browser Use e Kernel + Agentcard como candidatos mais prontos do que construir todo o ambiente. A prioridade de provar acesso ao Muse vale apenas se escolhermos esse modelo; não bloqueia avaliar outros executores. Agentcard Vault declara cartões de qualquer país e Kernel documenta um fluxo específico Mercado Pago, sem comprovar checkout brasileiro da Lia. Rye padrão é EUA e tem restrições de cesta/frete. Continua sendo pesquisa, sem alteração operacional.

## 2. Registro de toda a conversa

Este registro cobre todos os pedidos, esclarecimentos e respostas substantivas desta conversa sobre Muse. As falas do dono estão reproduzidas; as respostas de Codex estão consolidadas, não são transcrição literal. Resultados brutos de ferramentas, instruções internas e dados privados alheios ao tema não foram incluídos.

### 2.1. Pergunta inicial

**Dono:** “O que da pra gente aprender do Muse da meta pra usar pra Lia?”

**Codex:** pesquisou o lançamento, a página do produto e o relato de design. Sugeriu começar pela necessidade concreta do cliente; reduzir esforço de escolha com recomendação e comparação de total/prazo; acompanhar pedidos em segundo plano; facilitar recompra por memória; concentrar a aprovação nas ações importantes; e considerar execução/parcerias. Priorizou recompra, recomendação conferida e acompanhamento. Observou que conversar no WhatsApp sozinho não diferencia a Lia, já que o Muse também usa o canal. Essa resposta ficou ampla demais para o interesse real do dono.

### 2.2. Correção de foco: comprar com pagamento já configurado

O dono selecionou o trecho sobre execução, parcerias e fechamento ainda não provado.

**Dono:** “To falando mais da parte de comprar q o muse faz, q ele ja deixa automatico o cartao salvo e eh so pedir q ele compra achei top”

**Codex:** reconheceu a correção. Explicou a carteira Link da Stripe: conexão do pagamento, preparação do pedido, aprovação do total e finalização. Em lojas que aceitam Link há pagamento pela carteira; nas demais, credencial de cartão virtual de uso único. Separou cobrar o cliente da Lia e pagar o varejista. Encontrou código local de cartão salvo com confirmação pelo WhatsApp, mas não verificou a ativação em produção. Propôs investigar carteira para agentes/emissão virtual no Brasil e execução do checkout.

Exemplo de experiência desejada: cliente pede a ração de sempre; Lia apresenta item, total, entrega e final do cartão; cliente confirma; Lia retorna com o pedido comprado.

### 2.3. Investigação solicitada

O dono selecionou a proposta de investigar infraestrutura de pagamento e fechamento.

**Dono:** “Entao investiga essa possibilidade. Como q ele faz a compra?”

**Codex:** consultou o artigo técnico de segurança do Muse, Link CLI, documentação de pagamentos/UCP, Shopify, Mastercard e o SDK oficial Stark Bank. Encontrou:

- Navegador Chromium numa VM dedicada do aplicativo Muse; subagente navega e preenche formulários.
- Credenciais isoladas e autorização por camada externa ao agente.
- Uso de cartão já salvo na loja, carteira Link ou cartão temporário.
- Link CLI/API para agentes terceiros, atualmente documentado para consumidores dos EUA; agente e varejista podem estar fora dos EUA.
- Aprovação pública Link ocorre no site/app Link; experiência mais embutida pode depender de integração comercial específica.
- UCP documentado para catálogo/checkout integrado, com catálogo em private preview e cobertura anunciada sem Brasil.
- Stark Bank tem funções de emissão, leitura controlada de dados de cartão, regras e cancelamento. Candidato para cartão **da operação**, não substituto automaticamente equivalente à carteira pessoal Link.
- Mastercard Agent Pay teve transações reais controladas na região, incluindo Brasil; não foi encontrada liberação self-service pronta para a Lia.

Codex sugeriu avaliar Stark e um checkout em uma loja. A análise atual refina essa prioridade: primeiro verificar acesso ao modelo e barreira de checkout; não presumir que emissão de cartão seja o gargalo principal.

### 2.4. Esclarecimento sobre o último trecho do checkout

O dono selecionou “Ainda precisamos provar a conclusão do pedido”.

**Dono:** “Entendi, como q a muse faz isso?”

**Codex:** explicou o ciclo de ler a tela, agir, observar resultado e continuar, até o checkout e o envio aprovado. A documentação do aplicativo descreve leitura por árvore de acessibilidade. O usuário pode assumir o navegador; o agente pausa. A carteira também documenta autenticação adicional. Não foi encontrada garantia de conclusão universal sem intervenção. Codex distinguiu aprovação do cartão de pedido efetivamente confirmado e explicitou que o algoritmo completo de reconciliação pós-clique do Muse não estava publicado nas fontes consultadas.

### 2.5. Reutilização do navegador do Muse

**Dono:** “Daria pra usar esse navegador da nuvem da muse?”

**Codex:** não encontrou API pública do navegador pronto do aplicativo. Encontrou a Meta Model API com ferramenta de computer use para Muse Spark: o desenvolvedor envia screenshots, recebe ações e as executa no seu próprio navegador/desktop. A documentação diz explicitamente que a Meta não fornece VM ou navegador por essa API. Propôs avaliar Muse Spark controlando navegador próprio, sem assumir que isso inclua Link, cofre, sessões ou controles do aplicativo.

### 2.6. Pedido atual

**Dono:** “Analisa a viabilidade disso e faz um md de toda a conversa. Depois, entra no claude via computer use, abre uma nova sessao no projeto da lia, e pergunta qq ele acha sobre o md e a ideia e a viabilidade. Modelo: fable 5.1 extra”

Este documento é o material dessa avaliação. O pedido autoriza compartilhar este conteúdo no projeto Lia do Claude para segunda opinião. Não solicita implementação, deploy, compra, contratação de serviço financeiro nem reativação de automação.

### 2.7. Mac bloqueado e pedido de aprofundamento

**Dono:** “Desbloquea vc to no cel”.

**Codex:** tentou novamente o acesso por computer use, mas a sessão bloqueada impediu abrir o Claude. Não conseguiu desbloquear automaticamente; nenhum documento foi enviado e nenhum modelo selecionado.

**Dono:** “Ta estuda mais o assunto vc entao e analisa mais possibilidades como essa”.

**Codex:** ampliou a pesquisa para executores hospedados, carteira de cartão pessoal, compra por API, pagamentos no Brasil e parceria com loja. O relatório complementar compara Skyvern, Browser Use, Kernel + Agentcard, Rye, TinyFish, VTEX + Pix e parceiros financeiros; distingue compra com recursos da Lia de pagamento direto do cliente ao varejista. Inclui preços públicos, limites documentados, proposta de validação e correções de afirmações anteriores. Não houve integração, compra nem mudança de runtime.

## 3. O que é reaproveitável — e o que é um produto diferente

**Esclarecimento posterior do dono:** “Eu tive minha experiencia com browserbase como vc sabe mas n deu certo. Pq osso sseria melhor?”

**Codex:** revisou o histórico de julho. Não há demonstração de que os novos fornecedores
superem Browserbase nas lojas da Lia. Agente e cofre podem reduzir código e facilitar
preenchimento, mas não comprovam solução para bloqueio de login, ausência de frete/prazo
ou controles indisponíveis. A recomendação foi refinada para exigir prova sobre a barreira
da loja antes de recomendar migração; detalhes no relatório de alternativas.

| Componente | Evidência | Consequência para a Lia |
| --- | --- | --- |
| Navegador da VM do aplicativo Muse | Arquitetura publicada; nenhuma API pública de locação/controle encontrada | Não planejar integração direta como dependência disponível |
| Muse Spark via Meta Model API | Computer tool documentado, exemplo com `muse-spark-1.3` | Pode ser um motor de decisão de ações, condicionado ao acesso da conta |
| Runtime do navegador | A API diz que nós fornecemos ambiente e driver | Precisamos hospedar ou contratar Chromium, persistência e observabilidade |
| Cofre e Sentinel do aplicativo | Componentes internos descritos pela Meta | Não vêm automaticamente com a API do modelo |
| Link Agent Wallet | CLI/API e OAuth documentados; consumidores EUA | Não é solução confirmada para consumidores brasileiros |
| Cartão corporativo Stark | SDK documenta emissão/consulta/limites/cancelamento | Pode pagar compras da operação, condicionado à contratação e homologação |
| Checkout integrado Shopify/UCP | Canais próprios e elegibilidade limitada | Não equivale a API universal de compra nas lojas da Lia |

**Distinção técnica importante:** o subagente de navegador do aplicativo Muse usa árvore de acessibilidade e uma interface restrita. A API pública de computer use consultada descreve screenshots e ações de mouse/teclado. Usar o mesmo nome/modelo não replica exatamente o sistema interno, seu treinamento operacional, suas integrações ou sua taxa de sucesso.

O anúncio de julho da Model API falava em public preview para desenvolvedores nos EUA. As páginas atuais consultadas documentam a API, mas não conseguimos comprovar a elegibilidade da conta brasileira da Lia. **Acesso real é o primeiro gate**, sem inferir disponibilidade a partir de uma página de documentação acessível.

## 4. Viabilidade aplicada ao estado real da Lia

### 4.1. O que já existe localmente

Leitura realizada em 24/09, sem execução dos compradores:

- `src/lib/order-payments.ts`: cadastro inicial e confirmação de cartão salvo no chat, sujeito a flags e disponibilidade do provedor. Não validado em produção nesta conversa.
- `src/lib/purchase-worker.ts`: `ensurePurchaseJobForPaidOrder` respeita o kill-switch antes de criar job.
- `src/lib/purchase-execution.ts`: evidência estruturada do checkout, conferência e hash, aprovação, reserva de orçamento, `submissionId`, estado `outcome_unknown` e registro de compra com número/total.
- `scripts/retail-buyer/browser.ts`: perfil persistente Chrome via Playwright e comprador VTEX existente; não foi iniciado.
- `scripts/vtex-api-probe.mts`: sondagem HTTP documentada em 23/09.
- `docs/operador-runbook.md`: rota humana atual via `/ops`.

O novo modelo deve ser considerado um adaptador de navegação, não motivo para reescrever o razão de pagamentos e a máquina de estados. O código existente é uma base a auditar, não prova de que todos os controles necessários a um agente visual já estejam presentes.

### 4.2. Evidência histórica que limita a hipótese

- A decisão vigente de 15/09 é operação humana. Pesquisa não revoga essa decisão.
- O projeto já usou navegador remoto. O Carrefour bloqueou autenticação no Browserbase em julho, embora o navegador comum do operador funcionasse. A orientação vigente pausa esse caminho e não autoriza contorno de bloqueio.
- Uma compra real assistida na Pague Menos foi registrada em setembro; houve intervenção de CAPTCHA, e a recompra exigiu CVV. Isso não foi compra autônoma repetível.
- A sondagem VTEX de 23/09 chegou à escolha de Pix em três lojas. Não executou a transação que cria pedido, nem comprovou leitura/pagamento do Pix e recebimento.
- Alguns caminhos antigos citados em documentação, como `src/workflows/purchase-order.ts` e `src/lib/purchasing/`, não estavam presentes na busca atual. Para implementação, seguir os arquivos realmente existentes.

Consequência: trocar seletor fixo por agente visual pode corrigir dificuldade de interpretar telas. Não resolve por si só sessão bloqueada, restrição do varejista, indisponibilidade de pagamento ou exigência de uma pessoa.

### 4.3. Julgamento por dimensão

| Dimensão | Avaliação | Prova que falta |
| --- | --- | --- |
| Construir o ciclo screenshot → ação | Viável tecnicamente pela interface documentada | Chamada autenticada e teste em ambiente sintético |
| Usar o navegador hospedado do aplicativo Muse | Sem caminho público encontrado | Oferta/documentação ou acordo específico da Meta |
| Navegação nas lojas brasileiras | Incerta por loja e ambiente | Execuções medidas em ambiente permitido |
| Pagamento salvo do cliente | Implementação parcial já existe na Lia | Ativação e comportamento reais do fluxo atual |
| Pagamento da operação por cartão virtual | Candidato técnico plausível | Elegibilidade, contrato, custo, credencial efêmera e autorização real |
| Conclusão sem intervenção | Não demonstrada | Compra autorizada, comprovante, reconciliação e repetição |
| Custo por pedido | Calculável, ainda não medido | Tokens, tempo de navegador, falhas, suporte e custos do provedor |
| Substituir operador agora | Não sustentado pela evidência | Confiabilidade e economia melhores no volume real |

## 5. Arquitetura proposta para avaliação

```text
Pedido da Lia
  → cotação e consentimento vinculados a item/endereço/valor/prazo
  → job isolado, com trava da conta/carrinho
  → navegador próprio na nuvem
       ↔ Muse Spark: screenshot → proposta de ação
       ↔ executor: verifica permissão e executa ação permitida
  → conferência estruturada independente do checkout
  → liberação financeira específica e revalidação
  → execução única
  → confirmação da loja + total + número do pedido
  → acompanhamento / reconciliação / exceção humana
```

Proposta de divisão de responsabilidades:

- O modelo interpreta a interface e propõe ações. Não decide que pode gastar além do pedido.
- O executor guarda o estado e aplica limites; o modelo não edita aprovações, orçamento ou razão.
- Credenciais são preenchidas por componente separado, fora de contexto/logs/screenshots do modelo. Número de cartão e CVC não entram no banco da Lia nem no chat. A mera existência de um endpoint que retorna CVV não demonstra conformidade ou desenho seguro pronto.
- Pré-pagamento exige correspondência de item, variante, vendedor, quantidade, endereço, entrega, moeda e total. Mudança relevante invalida autorização.
- Uma queda após o envio resulta em `outcome_unknown`. Não clicar novamente sem reconciliação.
- Timeout, CAPTCHA, login e autenticação adicional têm estados explícitos e saída humana. Sem tentar contornar bloqueios.
- Um único agente por carrinho/conta; o modelo não inicia compras paralelas na mesma sessão.

**Problema de implementação a não subestimar:** esconder um botão por seletor ou pedir ao modelo “não compre ainda” não é barreira financeira suficiente. Um agente pode enviar formulário por teclado ou alcançar outro caminho. A prova inicial deve usar ambiente sintético sem pagamento real; no varejista, a barreira precisa ser auditável fora do modelo. Domínio permitido sozinho não distingue consulta de compra.

O modelo não traz o Sentinel da Meta. Criar um mediador universal de tráfego equivalente seria projeto grande; para a Lia, um escopo de loja estreito com ações e estados explicitamente limitados é mais realista para avaliar.

## 6. Economia: referências e hipóteses separadas

A página consultada da Meta informa Standard a US$1,25 por milhão de tokens de entrada, US$4,25 de saída e US$0,15 de entrada em cache. Diz que Standard não usa prompts/completions para treinar os modelos. O tier Contributor tem outra política e não deve ser escolhido automaticamente para dados dos clientes. Fonte [S9].

Exemplos aritméticos, **não estimativas medidas do checkout da Lia**, sem cache:

| Consumo acumulado de uma execução | Inferência |
| --- | --- |
| 100 mil tokens de entrada + 10 mil de saída | US$0,1675 |
| 500 mil de entrada + 50 mil de saída | US$0,8375 |

Screenshots e histórico reenviado podem aumentar o consumo. Precificar pelo uso retornado na API, incluindo tentativas que falham, e não pelo tamanho da mensagem inicial. Não há cotação cambial assumida nesta análise.

Como referência de infraestrutura, a página Browserbase consultada anuncia Developer a US$20/mês, com 100 horas de navegador e excedente a US$0,12/h. Isso é referência de custo, não recomendação de contratação nem evidência de aceitação de lojas. No baixo volume, o custo fixo por pedido pode dominar. Planos/recursos e retenção precisam ser conferidos antes de contratar. Fonte [S10].

Fórmula para decidir:

`custo por pedido concluído = (inferência de todas as tentativas + navegador + pagamentos + operação humana + incidentes + manutenção alocada) / pedidos efetivamente concluídos`

A margem do pedido precisa absorver esse custo depois de produto, frete, taxa da cobrança e estornos. Comparar contra tempo humano efetivamente poupado; reduzir minutos não elimina automaticamente custo fixo contratado. Uma automação que frequentemente chama o operador pode ainda ajudar na preparação, mas não sustenta promessa de autonomia.

## 7. Experimento recomendado, ainda não executado

### Etapa A — acesso e comparação barata

1. Confirmar a disponibilidade comercial/geográfica da Meta Model API para a conta da Lia, acesso ao `computer` e ao modelo escolhido. Não pedir/registrar segredos em chat.
2. Implementar, se aprovado como próximo trabalho, um driver isolado contra checkout sintético com dados fictícios. Testar navegação, mudança de preço, estado inesperado, timeout e tentativa repetida.
3. Medir o motor atual e Muse Spark sob a mesma tarefa e ambiente. O critério é ganho observado, não marca do modelo.

### Etapa B — preparação de uma loja elegível

4. Selecionar uma loja com acesso permitido e histórico compatível, excluindo a rota Carrefour atualmente bloqueada. Não escolher loja apenas porque o catálogo funciona.
5. Executar um lote proposto de 20 preparações com isolamento/limpeza, sem pedido ou cobrança real, em diferentes horários e com diversidade de variantes/entregas.
6. Registrar item correto, total, endereço, frete, prazo, duração, custo, motivo de interrupção e minutos humanos. Proposta inicial: ao menos 18/20 preparações corretas e zero ações financeiras indevidas para justificar o teste seguinte. É critério de triagem, não garantia estatística de produção.

### Etapa C — fechamento controlado

7. Somente com autorização específica e limite definido: poucas compras reais supervisionadas; confirmar pedido da loja, cobrança, entrega e reconciliação de falha/estorno. A autorização desta conversa é para análise e consulta ao Claude, não para essas compras.
8. Cinco compras bem-sucedidas, por exemplo, seriam sinal inicial; não provam confiabilidade suficiente para ativação geral. Ampliar amostra/escopo apenas após avaliar incidentes e custo.
9. Comparar com o caminho VTEX + Pix-out já em investigação. Pode ser mais simples concluir uma integração estreita de API do que construir um comprador visual geral.

**Parar o experimento** se acesso comercial não estiver disponível, se o site bloquear o ambiente, se desafios exigirem intervenção frequente ou se a economia não superar o fluxo humano. Não trocar proxy/fingerprint ou reabrir repetidamente sessões para forçar passagem.

## 8. Correções e cuidados com as conclusões anteriores

- “API oficial de compra não existe no Brasil” é amplo demais como afirmação universal. O que o histórico sustenta é que não encontramos uma API aberta, adequada e homologada para o fluxo e as lojas da Lia. Checkout VTEX documentado e pilotos de pagamentos existem, com escopos diferentes.
- Link público e integração Muse não têm necessariamente a mesma experiência de aprovação; não prometer um botão nativo no WhatsApp usando apenas o CLI.
- Cartão virtual da operação não reutiliza o token de cartão do cliente salvo no PSP. São duas operações e responsabilidades distintas.
- Limites de valor/categoria/país do Stark não equivalem automaticamente ao vínculo por estabelecimento do Link. O SDK de regras consultado não comprova todas as mesmas restrições, nem cancelamento seguro de cada modalidade de autorização/captura.
- Usar Muse Spark por API não fornece a VM do aplicativo nem comprova a mesma performance do agente interno.
- Documentação de computer use não comprova acesso brasileiro. A ausência de bloqueio numa página pública não basta.
- Não há evidência nossa de compra feita pelo Muse em Cobasi, Pague Menos, Drogaria SP ou Mercado Livre no Brasil.
- A visão “só pedir e compra” precisa separar cadastro inicial, consentimento do valor e exceções. A experiência anunciada não garante ausência total de intervenção.

## 9. Perguntas para a revisão independente do Claude

1. Você concorda com a conclusão de viabilidade técnica condicional e operacional ainda não provada? O que está errado ou exagerado?
2. Confira as fontes primárias atuais. Muse Spark computer use está disponível para uma conta brasileira? Existe API do navegador/VM do aplicativo que não encontramos?
3. A troca de motor resolve um problema real da Lia ou repete o experimento de navegador remoto com o mesmo bloqueio fundamental?
4. O caminho mais promissor é navegador visual, VTEX + Pix-out, cartão corporativo por API, parceria de pagamento, ou manter operador? Compare com o código e as evidências históricas.
5. Quais requisitos faltam para credenciais/cartões fora do contexto do modelo, limite financeiro fora do prompt, isolamento de sessão e reconciliação de resultado incerto?
6. Qual experimento mínimo separaria navegação melhor de checkout realmente autônomo, sem abrir uma frente grande de desenvolvimento?
7. Avalie economia em baixo volume, esforço de implementação e manutenção. Separe números medidos, fontes e hipóteses.
8. Dê um veredito: investigar agora, adiar ou descartar; apresente a razão, os bloqueios e os critérios que mudariam sua avaliação.

Pedido ao revisor: produzir parecer crítico e independente, checar fontes em vez de tratar as respostas de Codex como fatos, e apontar especialmente o que já existe no projeto. A tarefa é análise; não implementar, comprar, contratar, fazer deploy ou religar automação. Não transmitir credenciais ou dados de clientes.

## 10. Fontes consultadas

- **[S1] Meta, arquitetura e segurança do aplicativo Muse:** https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse — VM, cofre, navegador e aprovações. Resumo nesta seção e nas seções técnicas não implica acesso a código interno.
- **[S2] Meta, computer use:** https://dev.meta.ai/docs/computer-use — protocolo screenshot/ações; ambiente é responsabilidade do desenvolvedor.
- **[S3] Meta Model API:** https://dev.meta.ai/docs/overview ; https://dev.meta.ai/docs/quickstart ; https://dev.meta.ai/resources/blog/build-with-muse-spark — interfaces, autenticação e anúncio inicial de disponibilidade.
- **[S4] Stripe/Link:** https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link ; https://link.com/agents ; https://docs.stripe.com/agentic-commerce/link-cli — integração Muse e restrição a consumidores EUA.
- **[S5] Link, credenciais e integração:** https://docs.stripe.com/agentic-commerce/link-cli/use-link-wallet-pay-online ; https://github.com/stripe/link-cli — autorização, credenciais, exceções e integração embutida.
- **[S6] Checkout integrado:** https://docs.stripe.com/agentic-commerce/link-cli/commerce-agents-ucp ; https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/meta — escopo do catálogo/protocolo e canal Meta.
- **[S7] Stark Bank, SDK oficial:** https://github.com/starkbank/sdk-python/blob/master/starkbank/corporatecard/__corporatecard.py ; https://github.com/starkbank/sdk-python/blob/master/starkbank/corporaterule/__corporaterule.py — funções e regras verificadas por leitura do código, sem chamada à API.
- **[S8] Mastercard:** https://www.mastercard.com/news/latin-america/en/newsroom/press-releases/pr-en/2026/march/mastercard-advances-agentic-payments-in-latin-america-and-the-caribbean-with-live-transactions-completed-across-the-region/ ; https://www.mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay.html — testes controlados e registro de agentes.
- **[S9] Preços Meta:** https://dev.meta.ai/docs/pricing-rate-limits — valores consultados em 24/09; confirmar antes de contratar.
- **[S10] Infraestrutura:** https://www.browserbase.com/pricing — referência de plano e consumo; não valida acesso às lojas.
- **[S11] Produto/design Muse:** https://ai.meta.com/muse/ ; https://introducing.muse.ai/ ; https://about.fb.com/br/news/2026/09/conheca-o-muse-o-primeiro-agente-de-ia-pessoal-do-mundo-feito-para-todos/ ; https://about.fb.com/br/news/2026/09/tudo-o-que-anunciamos-no-meta-connect-2026/ — contexto da primeira resposta e conectores anunciados.
- **[S12] Evidência local:** `AGENTS.md`, `STATUS.md`, `PENDENCIAS.md`, `docs/api-compra-lojas-2026-09-23.md`, `docs/operador-runbook.md`, `src/lib/order-payments.ts`, `src/lib/purchase-worker.ts`, `src/lib/purchase-execution.ts`, `scripts/retail-buyer/browser.ts`.

## 11. Parecer do Claude (Fable 5.1, esforço extra) — 24/09/2026

Sessão nova no projeto Lia, aberta pelo dono. O revisor leu este documento, o relatório de
alternativas, o diff não commitado de `AGENTS.md`/`STATUS.md`/`PENDENCIAS.md`, o código citado
e checou as fontes primárias da Meta e da Stripe na data.

**Veredito: descartar Muse Spark como frente de trabalho.** A conclusão do documento está
correta, mas o veredito ficou suave. O gate 1 (acesso) já falhou e o que faria o Muse valer a
pena não vem pela API.

Checagem de fontes (24/09):

- `dev.meta.ai/docs/computer-use`: existe a ferramenta; entrada é screenshot, ações são clique
  por pixel, teclado, scroll; exemplo com `muse-spark-1.3`. Texto literal: não há VM no servidor,
  a Meta não roda navegador nem desktop para o desenvolvedor.
- Blog de lançamento da Model API: preview público **para desenvolvedores nos EUA**, cadastro
  self-serve. `dev.meta.ai/unavailable?reason=geo` existe e diz que a API não está disponível
  na região. Conta brasileira não entra hoje. Página de política geográfica
  (`ai.developer.meta.com/legal/geographic-use-policy`) não renderizou; é a fonte a reler se a
  Meta anunciar expansão.
- Preços Standard confirmados: US$1,25 / US$4,25 / US$0,15 por milhão (entrada / saída / cache).
  Tier Contributor troca desconto por permissão de treino; não usar com dados de cliente.
- Blog de segurança do Muse: navegador Chromium atrás de virtualização, subagente lê árvore de
  acessibilidade, não DOM. Nenhuma API pública para alugar ou controlar esse navegador.
- Link Agent Wallet: `link.com/agents` diz "disponível nos EUA, em breve no mundo todo"; README
  do `link-cli` diz "só contas Link dos EUA"; índice da Stripe marca preview privado com lista
  de espera. A página `docs.stripe.com/agentic-commerce/link-cli` devolveu 404 ao fetcher, então
  a frase "agente e varejista podem estar fora dos EUA" (§2.3) fica **não verificada**.

Respostas às perguntas da §9:

1. Concordo com "tecnicamente plausível, operacionalmente não provado". Exagero: tratar o
   acesso como "não comprovado" quando a fonte diz EUA. Falta: o documento não diz que a Lia já
   tem chave OpenAI e poderia montar o mesmo loop visual hoje com outro modelo; o modelo da Meta
   não traz nada específico.
2. Não disponível para conta brasileira. Não existe API do navegador/VM do app.
3. Repete o experimento do Browserbase. Carrefour barrou login remoto na camada anti-bot (19/07);
   Pague Menos exigiu CAPTCHA e CVV (set/09). Nenhum é "o modelo não entendeu a tela".
4. VTEX + Pix-out nas três lojas abertas. Única rota com evidência própria, sem navegador, sem
   CAPTCHA observado até o Pix, custa um pedido de R$15–20 para provar. Carrefour é caso de
   parceria, não de motor. Operador continua como fallback e para as demais lojas.
5. Os controles da §5 já existem em `src/lib/purchase-execution.ts` e `purchase-worker.ts`
   (hash da cesta, reserva de orçamento, `submissionId`, `outcome_unknown`, kill-switch antes do
   job). O que não existe é o executor visual, e é exatamente o que o Muse não fornece.
6. O experimento mínimo já estava pronto desde 23/09: `scripts/vtex-api-probe.mts --buy` em uma
   loja. A Etapa A do documento compara coisas erradas: não há "motor visual atual" para medir;
   o comprador em `scripts/retail-buyer` navega por seletor fixo e usa o modelo só para extrair
   endereço. As 20 preparações medem navegação, não o gate decisivo (reCAPTCHA no `transaction`
   e emissão do Pix).
7. Economia: margem de um pedido de R$100 é R$10 (markup progressivo). Uma tentativa visual
   de 500k/50k tokens custa US$0,84 só de inferência, mais navegador e tentativas falhas. O
   operador custa R$400 fixos por mês para 5–15 pedidos e não some ao automatizar parte dos
   pedidos. No volume atual nenhuma automação paga; quando pagar, a resposta é API sem tokens de
   visão, não agente visual.
8. Descartar agora. Mudaria a avaliação: Model API aberta para conta brasileira **e** Meta com
   navegador hospedado ou carteira fora dos EUA. Mesmo assim seria troca de modelo numa
   arquitetura visual que a Lia não tem e que os obstáculos das lojas não justificam construir.

O que o documento acerta e vale guardar: a separação entre "Lia compra com dinheiro próprio" e
"cartão pessoal do cliente paga o varejista" (produtos diferentes, com taxa, estorno e nota
fiscal diferentes); a barreira financeira fora do modelo; o diagnóstico do Browserbase.

**Decisão do dono na mesma sessão:** não seguir com Muse nem qualificar Skyvern, Browser Use,
Agentcard ou Stark agora. Autorizado o teste de fechamento VTEX na Drogaria São Paulo (um
pedido real, R$15–20, Pix pago pelo dono). Se passar, repetir em Cobasi e Pague Menos; se duas
de três passarem, decidir religar compra automática só para elas, por API, com operador nas
exceções. Se falhar, operador fica e a energia vai para pedidos. Registro em `STATUS.md` e
`PENDENCIAS.md` de 24/09.
