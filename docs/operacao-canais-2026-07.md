# Operação, canais e formalização — julho de 2026

Foto operacional da Lia em julho/agosto de 2026, atualizada em 02/08/2026. Este documento separa o que já foi ativado do
que ainda impede a operação pública em escala. Para o produto e arquitetura, veja
[STATUS.md](../STATUS.md) e [CLAUDE.md](../CLAUDE.md).

> Decisão vigente: entrega do próprio varejista é o fluxo principal. A premissa
> `clique-e-retire + qualquer motoboy` foi invalidada pelas políticas oficiais da Petz e
> do Carrefour. Detalhes em
> [decisoes-operacionais-2026-07-14.md](decisoes-operacionais-2026-07-14.md).

> Atualização de produto em 19/07: Carrefour não é mais um canal ativo. Os três conectores
> ativos são Oba Hortifruti, Petz e O Boticário. Oba entrou com cotação Browserbase em
> `cart_only`; Petz e Boticário foram endurecidos para exigir frete e prazo. Esta atualização
> agora tem validação ao vivo de preflight no Oba; Petz e Boticário ainda aguardam o preflight
> atual. Nenhum conector tem homologação comercial nem compra final habilitada.

> **Atualização de 21/07 — fluxo ativo.** A Lia é agora concierge manual: o operador cota e
> compra qualquer pedido, e o motoboy sai da sua base com o pacote em mãos. O ciclo completo foi
> demonstrado localmente, mockado e sem cobrança. O deploy do concierge aguarda separação de uma
> migration Oba inacabada; até lá, os conectores permanecem apenas referência/fluxo legado. A
> operação decidiu contratar um operador; os 19 pedidos técnicos em Production não serão limpos
> sem autorização explícita.

## Já encaminhado ou ativo

| Frente | Situação | Observação operacional |
| --- | --- | --- |
| Domínio e landing | Ativo | `liadelivery.com.br` está no ar com HTTPS. |
| Meta / WhatsApp oficial | Ativo | Sender `+55 11 97844-4813` aprovado e registrado na Cloud API, com webhook assinado. |
| Canal de teste | Legado | Twilio Sandbox fica como referência de teste; a produção usa a Cloud API da Meta. |
| E-mail do domínio | Configurado | `contato@liadelivery.com.br` está configurado no ImprovMX e é o canal para resolver a verificação da Meta. |
| Formalização | Encaminhada | MEI/CNPJ aberto; falta alinhar a conta Mercado Pago PJ e emissão de nota. |
| Pix | Real e testado | Mercado Pago gera Pix copia-e-cola e recebe confirmação pelo webhook. |
| Cartão | Real | Checkout Pro gera link hospedado; a taxa é repassada ao cliente. |
| Cartão One-Click | Código pronto, não ativado | Meta Cloud API direta + Pagar.me; depende de allowlist BR, migrations, domínio/chaves/webhook e sandbox. Não usa 360dialog. |
| Qualificação externa de Payments | Em andamento | Em 18/07, Samuel Santana enquadrou o volume de MVP (2.000–10.000 mensagens/mês) em Self-Service, remeteu dúvidas técnicas ao Customer Success e ofereceu conta de teste. Não há aprovação técnica, garantia de Cloud API direta, Mercado Pago PJ ou `credential_id`; não aceitar teste que altere WABA/número/sender sem autorização. |
| Motoboy | Técnica pronta para o concierge | Uber Direct: OAuth e cotação validados. No fluxo ativo, o courier retira o pacote **na base do operador**, nunca no balcão do varejista. |
| Operação interna | Concierge pronto localmente, pendente de deploy limpo | `/ops` recebe a cotação manual, reaproveita pagamento e une compra + despacho no botão **“Comprei — despachar motoboy”**. Demonstração mockada completa em 21/07; falta piloto real. |
| Acesso ao `/ops` | Ativo | `OPS_TOKEN` dedicado, Sensitive em Production e Preview, criado e implantado em 16/07; não substitui `API_TOKEN`. |
| Área atendida | Em revisão | Estado de SP e guarda de 12 km são legado do motoboy. Na entrega direta, o checkout da loja decide cobertura por CEP. |
| Piloto por varejista | Oba/Petz em preparação | Oba cobre mercado/essenciais e chegou a `cart_ready` em preflight Browserbase de Production; Petz já tem checkout observado. Boticário aguarda preflight. Carrefour foi desativado. |

## Atualização operacional — 02/08/2026

O deploy de 24/07 foi reconciliado nos commits `cc3b371` e `fb12645` e o deploy
`dpl_8RejxiZ3UrAg8qUwDbQPc3NhMrac` ficou `Ready`, reassumindo `liadelivery.com.br`. A checagem
anterior retornou landing 200, `/ops` acessível, APIs internas 401 sem credencial e webhook
403 sem assinatura.

O snapshot publicado foi consolidado nos commits `cc3b371` e `971c2a4`; `main` local foi avançada
por fast-forward e o worktree ficou limpo. O push remoto de `main` ainda é separado e não foi
executado.

Para o piloto, foi acrescentado um bloqueio de segurança no despacho: provider Meta não pode
confirmar ao cliente um rastreio mockado. Além disso, o courier só parte depois de existir
`LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` válidos. A Vercel tem os Contexts e
credenciais históricas, e agora também `LIA_MANUAL_CONCIERGE=true` e
`LIA_REQUIRE_REAL_COURIER_DISPATCH=true`, mas ainda não tem esses dados explícitos da base do
operador.

Antes de qualquer cobrança/compra real, o operador deve preencher a base, conferir
`LIA_MANUAL_CONCIERGE=true`, manter `PURCHASE_AUTOMATION_MODE=cart_only`, e executar um pedido
técnico isolado. Mercado Pago PJ/NF, titularidade, pós-venda, rotação da senha Carrefour/PIN do
WhatsApp e 5–10 pedidos reais continuam pendentes.

## Meta e WhatsApp: estado correto

A Lia usa a WhatsApp Cloud API em produção. O sender `+55 11 97844-4813` foi aprovado
como `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e associado
ao webhook `https://liadelivery.com.br/api/whatsapp/webhook`. O webhook valida assinaturas
da Meta antes de processar qualquer mensagem.

Em 16/07, foi recebida de Samuel Santana, da Infobip, uma resposta comercial sobre o
possível fluxo de WhatsApp Payments com `order_details` / `offsite_card_pay` e Mercado Pago
PJ. A Infobip documenta oficialmente WhatsApp Payments para Brasil e orienta acionar o
gerente de conta ou suporte para implementação, o que torna o contato uma via plausível de
habilitação. Fontes: [WhatsApp Payments](https://www.infobip.com/docs/whatsapp/whatsapp-payments)
e [funcionalidades adicionais](https://www.infobip.com/docs/whatsapp/additional-functionality).

O contato pediu projeções de transações/mensagens, classificação Utility/Marketing, países
e canais antes de envolver os especialistas. A resposta deve tratar os números como
estimativas de MVP e registrar como requisitos a preservação da WABA, do número, da Graph
API, do webhook e da integração direta com a Cloud API. A documentação padrão de cadastro
de sender da Infobip também contempla conexão/migração do número para a API deles
([sender registration](https://www.infobip.com/docs/whatsapp/get-started/before-starting-embedded-signup));
portanto, não conceder essa mudança implicitamente. O contato não constitui allowlist,
aprovação do PSP nem emissão de `credential_id`; esses pontos, custos, prazo e arquitetura
final precisam ser confirmados por escrito.

Em 18/07, Samuel informou que o volume projetado (2.000–10.000 mensagens/mês, com foco
inicial em WhatsApp) se enquadra no modelo Self-Service. Ele não respondeu as perguntas de
arquitetura: encaminhou `order_details` / `offsite_card_pay`, Mercado Pago PJ,
`credential_id`, webhooks, sandbox e limitações ao Customer Success
(`success@infobip.com`) e ofereceu abrir uma conta de teste. Portanto, a resposta correta é
pedir uma confirmação técnica escrita, não tratar a oferta como habilitação. A conta de teste
só pode ser solicitada se a Infobip confirmar que ela não exige migração ou compartilhamento
de WABA/número/sender, mantém a Graph API e o webhook existentes e descreve exatamente quais
recursos de Payments estarão disponíveis para teste.

O contato técnico foi enviado ao Customer Success em 18/07, com Samuel em cópia. A Lia
aguarda confirmação escrita; nenhuma conta de teste foi criada, nenhum canal foi alterado e
o One-Click permanece desligado.

Na frente Pagar.me, a revisão documental de 16/07 confirmou que o `tokenizecard.js` envia
os dados diretamente ao PSP e requer domínio liberado, e que pedidos podem usar `card_id`.
A documentação atual também distingue `recurrence_cycle=first|subsequent` e orienta que o
CVV apareça apenas na primeira transação de recorrência externa. Como o adaptador atual usa
`card_id` sem marcar o ciclo, é obrigatório confirmar com o Pagar.me como classificar a
primeira compra e as recompras avulsas confirmadas no WhatsApp antes de alterar o payload ou
testar cartão real. Fontes: [Tokenizecard JS](https://docs.pagar.me/reference/pagarme-js),
[criar pedido](https://docs.pagar.me/reference/criar-pedido-2) e
[cartão de crédito](https://docs.pagar.me/reference/cart%C3%A3o-de-cr%C3%A9dito-1).

## Rotina operacional de um pedido (concierge ativo)

1. Cliente fala com a Lia pelo WhatsApp, informa endereço e itens — de qualquer loja.
2. Ao encerrar a lista, a Lia cria `awaiting_operator_quote`.
3. O operador cota custo, frete, modalidade e prazo no `/ops`; a Lia envia a cotação.
4. Cliente aprova e paga por Pix ou cartão.
5. O operador compra os itens e, com o pacote na base, usa **“Comprei — despachar motoboy”**.
6. A Lia acompanha e comunica até a entrega. Entrega própria do varejista continua alternativa.

Para “entrega hoje”, a Lia pode usar a modalidade same-day do próprio varejista ou comprar
manualmente e chamar o courier **a partir da base do operador**. Não enviar documento do titular
a entregador on-demand e não usar o courier para retirada no balcão da loja.

## Antes de abrir o piloto

- Usar Mercado Pago PJ e definir emissão de nota fiscal; hoje o Pix ainda está em nome
  pessoal.
- Regenerar token do Mercado Pago e segredo/credenciais da Uber que foram expostos em chat,
  depois atualizar a Vercel.
- Validar termos, nota fiscal, troca/devolução e uso de conta central para múltiplos
  destinatários.
- Mover a confirmação de preço/frete/prazo real para antes da cobrança do cliente.
- Fazer 5–10 pedidos controlados com entrega do varejista, medindo cotação, aprovação,
  prazo, divergência de preço/estoque e pós-venda.
- Não pilotar retirada por terceiro na Petz/Carrefour como fluxo de escala.
- Para One-Click, seguir integralmente
  [whatsapp-one-click-pagarme.md](whatsapp-one-click-pagarme.md) antes de ligar a flag.

## Limites atuais

Uma cesta continua limitada a uma loja. A busca ao vivo e o carrinho Browserbase reduzem
desatualização, mas preço, estoque, frete e prazo ainda devem ser revalidados antes da
cobrança e da compra. Cada Context Browserbase já usa lease persistente e fila: somente um
carrinho pode operar por vez; conflitos voltam a `preflight_queued` para retry controlado.

O preset geográfico atual deve ser tratado apenas como filtro comercial. Para entrega do
varejista, distância até uma unidade não substitui a resposta do checkout.

## Atualização operacional — 16/07/2026

Foi criado um `OPS_TOKEN` dedicado no projeto Vercel, marcado como Sensitive em Production e
Preview, sem revelar seu valor nem substituir `API_TOKEN`. O redeploy de produção subsequente
ficou `Ready`, e a autenticação do painel `/ops` foi confirmada. A fila exibiu somente pedidos
legados pagos e alguns cancelados; eles não devem ser reutilizados para o preflight atual. Foi
criado um pedido técnico isolado com SKU Carrefour exato e somente a região persistida no
Context, em `cart_only`; nenhum endereço real foi copiado, nem houve WhatsApp, cobrança ou
compra. O workflow retornou `PREFLIGHT_NEEDS_HUMAN`, pois não confirmou juntos item, total,
frete e prazo. O diagnóstico de 16/07 confirmou que esses campos estão no carrinho completo,
não no minicarrinho: item R$ 1,99, frete a partir de R$ 9,90, prazo a partir de sábado e total
R$ 11,89. O conector e a operação foram corrigidos e implantados, incluindo submit do CEP,
parsers por linha, limpeza segura, status/logs e `/ops/teste-carrefour`. O retry Browserbase
avançou até `LOGIN_REQUIRED`; uma sessão viva foi aberta para reautenticação humana. Não houve
WhatsApp, cobrança ou compra, e os valores mapeados ainda não são cotação operacional validada.
As credenciais Carrefour enviadas no chat em 16/07 não foram persistidas. O inspetor remoto
não ofereceu campos automatizáveis com segurança; uma nova sessão viva ficou aberta para
login humano, e a senha deve ser rotacionada antes do piloto.

Depois do login humano, o preflight superou a etapa de autenticação mas falhou fechado porque
o minicarrinho não expôs o CTA para o resumo completo. Há um fallback seguro para abrir somente
`/checkout/cart`, publicado em 16/07. A primeira publicação pré-construída revelou que o Prisma
gerado no macOS não incluía o binário do runtime Linux ARM da Vercel; o schema foi corrigido, o
artefato reconstruído e o novo deploy ficou `Ready`. O POST do preflight voltou a responder 200,
mas o workflow atual falhou fechado em `LOGIN_REQUIRED`; uma sessão viva nova aguarda login
humano. Nenhuma cobrança, compra ou mensagem foi disparada e a cotação real permanece pendente.

Na sequência de 16/07, o painel Browserbase autenticado foi confirmado e outra sessão Carrefour
foi aberta para login humano. A autenticação não foi concluída, sem causa confirmada, e o teste
foi adiado pelo operador. Não abrir novas sessões nem repetir o preflight até uma nova tentativa
coordenada. Nenhuma cobrança, compra ou mensagem foi disparada.

Também em 16/07, a fila por Context foi extraída para um coordenador testável. A cobertura
confirma que carrinhos concorrentes não se misturam, que um lease vencido pode ser recuperado e
que falhas de banco/configuração não viram retry de Context ocupado. O lease é persistente, dura
15 minutos e o workflow repete conflitos a cada minuto por até uma hora. Não houve navegador,
checkout, cobrança ou compra nesta alteração.

Ainda em 16/07, a operação do `/ops` foi alinhada localmente ao fluxo de entrega direta. Os
estados novos são `retailer_preparing` e `retailer_out_for_delivery`; o sistema impede que um
pedido `retailer_delivery` acione Uber Direct ou outro courier externo. O painel expõe promessa,
validade da cotação e rastreio do varejista, mantendo retirada apenas para parceiros autorizados.

Cancelamento depois do pagamento agora cria `refund_pending`. O cliente só recebe confirmação
de estorno depois que o operador executa a devolução no provedor e registra a referência, quando
o pedido muda para `refunded`. O procedimento canônico está em
[operacao-piloto-needs-human-estorno.md](operacao-piloto-needs-human-estorno.md). Um PIN de
registro encontrado em Markdown local foi removido e precisa ser rotacionado. TypeScript, lint,
210 testes e build passaram; essa frente ainda não foi implantada ou validada ao vivo.

## Atualização de segurança — 18/07/2026

A chave Browserbase exposta foi regenerada e substituída na Vercel como segredo Sensitive de
Production. Um valor intermediário exibido durante a operação foi invalidado e substituído por uma
chave limpa sem ser registrado. A Vercel publicou com sucesso (`Ready`) um redeploy de produção da
versão `ops-direct-retailer-delivery` / `9a06eab`; isso também torna essa revisão do `/ops`
implantada, embora ainda sem validação ao vivo com pedido técnico novo.

Não foi criado preflight, sessão de varejista, cobrança ou compra. O teste Carrefour continua
dependente da reautenticação humana coordenada; a senha Carrefour, o PIN WhatsApp e os segredos
Mercado Pago/Uber expostos seguem pendentes de rotação.

### Prioridade operacional — 18/07/2026

O operador pediu para pausar novas rotações de credenciais e concentrar o trabalho no
funcionamento do produto. A próxima frente é validar o preflight Carrefour em `cart_only` e os
estados de entrega/estorno já implantados no `/ops`, sem cobrança ou compra. As pendências de
segurança permanecem registradas como bloqueios para piloto e não devem ser retomadas sem novo
pedido explícito.

Na validação funcional coordenada em 18/07, o botão técnico de produção iniciou o preflight
Carrefour em `cart_only`. O job terminou fechado em `needs_human` / `CONFIGURATION_REQUIRED`:
o runtime recusou a credencial Browserbase Carrefour. Não houve sessão de varejista, WhatsApp,
cobrança ou compra. Corrigir a configuração existente e confirmar autenticação antes de novo
retry; o estado `Ready` do deploy não é evidência suficiente.

Na investigação seguinte, foi constatado que `BROWSERBASE_API_KEY` em Production tinha prefixo
`sk_live_`, portanto não era uma chave Browserbase. A chave correta foi copiada diretamente do
painel Browserbase para a variável Sensitive, sem ser registrada, e o redeploy
`EEaegLWbmNtiwG6opHEbWirJBX57` ficou `Ready`. O novo retry avançou para `LOGIN_REQUIRED`, o que
valida autenticação Browserbase e abertura do Context pelo runtime. Falta a reautenticação humana
Carrefour para a cotação completa; não houve WhatsApp, cobrança ou compra.

### Reavaliação do varejista — 19/07/2026

A nova sessão viva Carrefour chegou à autenticação e recebeu bloqueio explícito de segurança do
varejista. Isso ocorreu depois de o runtime comprovar a configuração Browserbase ao avançar até
`LOGIN_REQUIRED`; portanto, repetir configuração ou criar novas sessões não resolve o bloqueio
observado. Não contornar WAF, fingerprint, CAPTCHA ou política do varejista.

O piloto operacional passa a usar Petz como primeira candidata, porque produto, sacola, frete,
prazo e checkout já foram validados ao vivo nesse conector. Antes de dinheiro real, portar a
cotação pré-cobrança para Petz e executar um pedido técnico em `cart_only`. Carrefour permanece
na busca e só volta ao checkout automatizado por API/parceria oficial ou ambiente autorizado.
Não houve WhatsApp, cobrança ou compra nessa tentativa.

O handoff foi rejeitado pelo operador em 19/07: o cliente não receberá links nem concluirá a compra
no Carrefour. A experiência deve permanecer ponta a ponta na Lia. Como ponte interna, um operador
pode montar manualmente a compra em navegador comum sem expor essa etapa ao cliente, mas isso não
é automação nem solução de escala. Uma segunda alternativa é um shopper próprio/controlado comprar
fisicamente e a Lia coordenar a entrega, o que exige desenho operacional e fiscal separado.

A rota de escala é comercial: Carrefour informa que opera versões da loja por sites parceiros e
apps de delivery homologados. Solicitar acesso com escopo de catálogo, estoque, cotação, criação de
pedido, pagamento, eventos e pós-venda. Não confundir com Marketplace Seller, que integra quem vende
no Carrefour, nem com APIs iFood públicas, voltadas à operação do merchant. A capacidade genérica de
checkout headless da VTEX também não autoriza consumir endpoints internos Carrefour.

### Programa de homologação de lojas — 19/07/2026

O supply passa a ser selecionado pela capacidade comprovada do varejista, não pela amplitude da
marca. Petz é a referência técnica existente. Para supermercado, a triagem pública colocou Oba em
primeiro lugar: storefront VTEX, orderForm anônimo e catálogo/SKU/preço responderam normalmente,
além de a rede já vender por delivery e WhatsApp. Mambo e Savegnago apresentaram a mesma base VTEX;
Mambo tem restrição explícita de conta individual e Savegnago depende da região atendida.

Pão de Açúcar permanece interessante pela cobertura, mas sua home já emitiu cookies específicos de
gestão de bots e precisa de teste descartável antes de Context persistente. St. Marche foi pausado
por risco de continuidade após a recuperação judicial informada pelo Grupo Hortus.

O smoke test seguinte usou apenas o CEP público `01310-100` e carrinhos anônimos. No Oba, dois SKUs
regionalmente disponíveis formaram uma sacola de R$ 18,98; a simulação retornou Convencional por
R$ 9,90 (`0bd`, seis janelas) e Express por R$ 14,90 (`2h`, sem janela disponível naquele horário).
No Mambo, dois SKUs formaram R$ 22,78 e a Entrega Agendada retornou R$ 12,90 (`2h`, 19 janelas).
Os dois orderForms foram esvaziados ao final. O primeiro passe havia detectado itens anunciados mas
sem estoque regional, portanto todo futuro conector deve simular o SKU para o CEP antes da sacola.

Oba é a escolha primária para mercado/essenciais; Mambo fica como fallback regional em São Paulo.
Ainda faltam conector persistente, login/checkout bloqueado, total final selecionado, autorização
comercial e piloto. Não houve pagamento ou pedido.

O Boticário permanece uma fonte possível de beleza, mas não está completamente homologado: sua
busca e carrinho/subtotal têm cobertura automatizada, enquanto o comprador ainda não extrai frete
nem promessa. A suíte de 210 testes passou (168 aprovados, 42 integrações de banco puladas), sem
checkout Browserbase vivo nesta rodada.
