# Plano: um jeito viável de executar a compra na loja — 10/09/2026

**Estado: proposta para decisão do dono. Nenhum código, conta, compra ou deploy nesta entrega.**

Pergunta do dono (10/09): "está muito difícil de operar; não é realista comprar manualmente
pra todos os clientes nem escalável; não está dando pra implementar a compra automatizada
que bolamos; impossível que não exista forma melhor que uma tarefa agendada do meu GPT.
Pense e planeje algo realmente viável. O resto já está feito."

Método: leitura de tudo que foi tentado (Browserbase, manual, tarefa horária do ChatGPT,
comprador local com cartão salvo), 6 pesquisas factuais na web (Pix por API bancária,
checkout VTEX, Mercado Livre, trilhos de agente no Brasil, fiscal/legal, infraestrutura),
5 propostas independentes, 15 críticas adversariais, uma síntese e um crítico de
completude, além de verificação direta no checkout público das lojas e das evidências
reais registradas hoje em [evidências de validação](evidencias-validacao-compra-pix-2026-09-10.md).

---

## 1. A verdade estrutural (o que nenhum truque muda)

1. **Não existe API de compra do lado do comprador no Brasil.** Zinc/Rye são só EUA/Canadá;
   Rappi, iFood e Lalamove só têm API do lado do lojista; Amazon "Buy for Me", Google UCP e
   Perplexity operam só nos EUA; a OpenAI desligou o checkout no ChatGPT em 03/2026. Visa
   Intelligent Commerce e Mastercard Agent Pay já rodam no Brasil, mas em programa fechado
   por emissor/adquirente: para um MEI independente é 2027, e ainda dependeria de cada loja
   aceitar token agêntico. Open Finance/ITP exige biometria do pagador a cada Pix e custa a
   partir de R$500/mês: ferramenta errada.
2. **Logo, todo caminho é "automatizar o site de consumidor de cada loja".** Cada loja é um
   projeto separado, pode ligar um desafio a qualquer momento, e a operação é contratualmente
   cinzenta (o Mercado Livre, nos Termos de 11/05/2026, tipifica como infração usar a conta
   para "intermediar operações de terceiros"; a Cobasi proíbe robôs e "fins comerciais").
3. **Portanto o objetivo correto não é "zero humano"; é "humano só em exceção, por um
   toque, quando ele puder, com fallback".** É o que Magic (2015) e Rappi "Qualquer Coisa"
   fazem. Hoje o dono faz 100% das compras de ponta a ponta e a única "automação" é uma tarefa
   de hora em hora que ainda exige o clique dele. O plano converte o papel dele de comprador
   para aprovador de exceções, e mede quantas exceções sobram.

## 2. O que já se sabe de verdade (evidência, não hipótese)

| Fato | Fonte |
|---|---|
| Pix (`paymentSystem 125`) existe no checkout de **6 das 9 lojas VTEX**: Drogaria SP, Pague Menos, Cobasi, Swift, Ri Happy, Natural da Terra. **Oba não tem Pix online** (só cartão e Google Pay). Kopenhagen (Akamai 403) e Divvino (WAF) nem deixam ler | curl no `orderForm` público em 10/09; tela real da Oba em 10/09 |
| **Pague Menos exige "Não sou um robô" mesmo com Pix selecionado**; o botão de finalizar fica desabilitado até o desafio. Reprovada para automação | tela real em 10/09 |
| A VTEX documenta que **seu** reCAPTCHA não se aplica a pedidos sem cartão; a Pague Menos contradiz isso na tela, ou seja, o desafio é configuração/camada **da loja**. Os flags estáticos do checkout são idênticos nas 4 candidatas: **só uma sondagem real por loja responde** | [VTEX applicable-cases](https://developers.vtex.com/docs/guides/applicable-cases); curl no `/checkout/` das 4 |
| **Cobasi e Swift pararam em código enviado ao e-mail operacional**, não em CAPTCHA. A caixa não era legível pelo comprador. Isso é autenticação legítima do titular, não burla | tela real em 10/09 |
| Já existe no repo um **leitor Gmail por OAuth somente leitura** que extrai o código e preenche o "Acesso Rápido" da Swift; validado com respostas simuladas, sem credencial real ainda (`npm run purchase-worker:mailbox-check`) | `scripts/retail-buyer`, `tests/retail-mailbox.test.ts` |
| O copia-e-cola do Pix na VTEX vem em `paymentAppData.payload.code` na resposta do conector e é renderizado num **modal** do checkout; não está no `orderPlaced` nem em e-mail. A captura por API pura sem navegador **não está documentada** e endpoints `pub` irmãos já respondem 403 em Ri Happy, Cobasi e Drogaria SP (permissão por conta). **O navegador local continua necessário** | [guia Pix VTEX](https://developers.vtex.com/docs/guides/payments-integration-pix-instant-payments-in-brazil); curl em 10/09 |
| **Pagar um Pix de terceiro por API existe e um MEI abre sozinho.** Asaas: `POST /v3/pix/qrCodes/decode` (nome/CNPJ do recebedor, valor, tipo) + `POST /v3/pix/qrCodes/pay`, sem mensalidade, QR dinâmico grátis, limites iniciais R$5.000 dia / R$1.000 noite, **sem chave de idempotência no request**. Efí: `PUT /v2/gn/pix/:idEnvio/qrcode`, **`idEnvio` idempotente**, mas exige conta Efí Empresas, webhook na chave do pagador e elevação do limite (nasce em R$1,00). Inter exclui MEI das APIs; Mercado Pago e Nubank PJ não têm API de saída | [Asaas](https://docs.asaas.com/reference/pagar-um-qrcode) · [Efí](https://dev.efipay.com.br/docs/api-pix/envio-pagamento-pix/) |
| Devolução Pix da loja volta obrigatoriamente à conta pagadora (até 90 dias), **iniciada pelo recebedor**; se a loja devolver em vale, não volta Pix nenhum | [Bacen pix-api](https://github.com/bacen/pix-api) |
| A tarefa horária do ChatGPT é fisicamente incompatível com Pix de loja: o QR vale 15–60 min | guia Pix VTEX |
| O teto vigente é **R$500 por pedido e R$500 por dia** (`purchase-policy.ts`): a partir do 5º–8º pedido do dia tudo vira manual, independentemente de CAPTCHA | código |
| Intermediação/agenciamento (CNAE 7490-1/04) **não é ocupação de MEI**; revenda cabe, mas o GMV inteiro conta no teto de R$81 mil/ano. A partir de 01/01/2027 o MEI emite documento fiscal também para PF | pesquisa 5 (fontes secundárias; confirmar com contador) |
| A conta Mercado Pago que recebe os clientes é **pessoal**; os Termos (cl. 1.3.2) vedam "movimentações que ocultem ou substituam obrigações de terceiros" | [Termos MP](https://www.mercadopago.com.br/ajuda/termos-e-condicoes_300) |
| Volume real: 3 pedidos com razão de pagamento (R$63). O problema é tornar a compra executável e repetível, não escalar | `scripts/review-metrics.mts` |

## 3. O caminho recomendado

Quatro mudanças em relação ao que está no repo hoje, nesta ordem de importância:

**A. Pix da loja pago por API bancária, em vez de cartão salvo.** Mata CVV, 3DS, antifraude de
cartão e chargeback do lado da compra. O servidor decodifica o copia-e-cola, confere valor
exato em centavos e recebedor contra uma allowlist por loja (o CNPJ costuma ser do PSP da
loja, aprendido na primeira compra com um toque do dono), reserva `PurchaseSpend` e paga.
Uma tentativa de pagamento por job, gravada antes da chamada; timeout = estado incerto com
humano, nunca segunda tentativa. Provedor escolhido por **idempotência e ausência de
confirmação humana por transação**, não por velocidade de cadastro: Efí como primário se o
limite for elevado a tempo, Asaas como alternativa com regra de tentativa única.

**B. Caixa de e-mail operacional legível por máquina (já implementada, falta o consentimento
OAuth real).** Resolve dois problemas com uma peça: o código/chave de acesso que Cobasi e
Swift mandam antes do pagamento, e o rastreio (pedido criado, pago, faturado, enviado com
link, entregue) que hoje não existe. Guardas: só remetentes dos domínios das lojas
habilitadas, nunca seguir link fora do domínio da loja, leitura logada. **Fronteira escrita:
ler código endereçado à própria conta operacional é autenticação; qualquer desafio antibot
(reCAPTCHA, hCaptcha, "não sou um robô") fica fora, sem exceção.**

**C. Conta própria da Lia por loja, envelhecida, no Chrome local com IP residencial.** Não
convidado com e-mail novo por pedido: isso é o padrão mais suspeito para antifraude (conta
nova, dispositivo com muitos CPFs, e-mail descartável) e Cobasi/Swift exigiram login de
qualquer jeito. Continua o comprador Playwright já escrito (`scripts/retail-buyer`), como
serviço `launchd` com `caffeinate`, heartbeat visível no `/ops` e Tailscale para intervenção
remota. Nuvem e navegadores gerenciados pioram o desafio (IP de datacenter) e vendem
"anti-detecção", fora da política. Mac mini dedicado só depois de 20–30 compras medidas.

**D. Exceções por um toque no WhatsApp do operador, com orçamento de exceções.** O webhook
já reconhece o telefone do dono (`isAdminPhone`). Catálogo: recebedor novo na loja [Pagar e
memorizar / Recusar]; acima do teto [Autorizar R$X / Estornar]; Pix recusado ou QR expirado
[Refazer / Estornar]; sem confirmação da loja em 30 min [Confirmar / Estornar]; item faltando
[Estornar item / Pedir reenvio]; comprador em silêncio 10 min (aviso). Meta: menos de 10% dos
pedidos das lojas homologadas passam por um toque; CAPTCHA não conta como toque, conta como
reprovação da loja.

### Fluxo por pedido quando as camadas passarem

Cliente paga a Lia (Pix MP ou cartão Pagar.me) → `PurchaseJob` (existe) → comprador local
reclama em 15 s (existe) → abre o perfil da loja; se pedir código, o leitor de e-mail entrega
em segundos → monta a cesta com `receiverName` do cliente e o SLA cotado (existe) → confere
hash da cesta/endereço/frete (existe) → seleciona Pix → clique único → captura o
copia-e-cola (resposta do conector ou modal) → **servidor**: decode, guardas, reserva, pay,
poll até confirmado → e-mail "pedido criado/pago" confirma por segunda fonte → cliente avisado
(existe) → e-mails de faturado/enviado/entregue viram `DeliveryEvent` (existe) → estorno da
loja concilia por `endToEndId` e libera o estorno ao cliente (existe).

**Invariantes:** um payout por job (unique no banco); nunca repetir o clique de finalizar
(gera segundo pedido); timeout bancário = humano; nenhuma compra automática sem
`PurchaseSpend` reservado na mesma transação; estorno ao cliente por arrependimento em 7 dias
(CDC art. 49) **não espera** a devolução da loja, coberto por reserva de caixa.

## 4. Gates antes de qualquer código pesado (semana 1)

A diferença de método: as tentativas anteriores construíram e depois descobriram o bloqueio.
Aqui cada gate custa R$0 ou ~R$25 e responde uma pergunta só. **Só depois de E3 e E6
passarem começa o protótipo.**

| # | Experimento | Custo | Sucesso |
|---|---|---|---|
| E0 | Consentimento OAuth real da caixa operacional; `mailbox-check` passa; leitor lê um código de teste em < 60 s com log | R$0, ~1h | código lido sem toque |
| E1 | Dono: decisões da seção 5 registradas em AGENTS.md | R$0, ~2h | decisões escritas |
| E2 | **Sondagem R$0** até a tela de pagamento com Pix selecionado, sem criar pedido, em: Ri Happy, Drogaria SP (nunca chegaram ao pagamento), Cobasi e Swift (agora com e-mail legível), Natural da Terra. Pergunta única: o botão de finalizar habilita sem desafio? | R$0 | ≥ 1 loja habilita |
| E3 | **1 pedido real** na primeira loja aprovada: capturar o copia-e-cola, medir validade do QR, **pagar pelo app do banco**, conferir e-mails no alias, número do pedido e o que sai na NF/etiqueta | ~R$25 | código capturado sem intervenção; pedido confirmado |
| E4 | Repetir E3 em 2 sessões separadas por > 24h na mesma loja (fechar/reabrir navegador) | ~R$50 | 2/2 sem desafio |
| E5 | Perguntas por escrito a Efí e Asaas: pagamento de QR de terceiro em produção sem ação crítica humana; limites; como recuperar resposta perdida antes do ID | R$0 | resposta escrita |
| E6 | Pagar por API um QR dinâmico de **terceiro** de R$1 (não da própria conta) pelo provedor aprovado em E5 | R$1 | confirmado sem tocar no app |
| E7 | Um cancelamento legítimo de pedido pago por Pix: para onde e em quanto tempo a loja devolve | R$0 líquido | devolução chega na conta pagadora com o e2e |

Ordem de candidatas: Ri Happy e Drogaria SP primeiro (Pix e login não obrigatório verificados,
nunca testadas até o pagamento; atenção: Drogaria SP teve código que **não chegava** em 08/09,
o que o leitor não resolve), depois Cobasi e Swift. Pague Menos e Oba estão reprovadas.
Kopenhagen e Divvino só se o Chrome real passar do WAF.

## 5. Decisões que só o dono pode tomar

1. **Modelo comercial: revenda ou mandato.** *Revenda* (conta e CPF/CNPJ da Lia na loja,
   markup embutido como hoje, NF no nome da Lia, produto entregue ao cliente): zero mudança
   de produto, cabe no MEI, mas o GMV consome o teto de R$81 mil e exige NF de entrada.
   *Mandato* (CPF do cliente, NF no cliente, taxa de serviço em linha separada, modelo Rappi):
   receita = só a taxa, mas **não cabe no MEI** e exige coletar CPF, aceite de termos e tornar
   a taxa visível; markup oculto + NF no CPF do cliente é juridicamente incoerente (CC art. 668,
   CDC art. 31). **Recomendação: piloto de 30 pedidos em revenda, sem mudar o produto; decidir
   com o contador antes de escalar e antes de 2027.**
2. **Elevar o teto diário.** R$500/dia é o limite real da automação (4–8 pedidos). Sugestão:
   manter R$500/pedido e subir o dia para R$2.000 depois de 5 compras reais sem incidente.
3. **Provedor de Pix-out** (Efí ou Asaas) pela resposta de E5, e **quem paga o float**:
   a conta pagadora precisa de saldo; com entrada no MP e reposição semanal, o float é o
   teto diário × dias até repor (R$3.500 a R$500/dia). Cartão de entrada liquida em D14/D30
   no MP, o que multiplica o float. **Alternativa recomendada (fase 2): receber o Pix do
   cliente na mesma conta PJ que paga a loja** (Efí/Asaas cobram Pix com webhook; o
   `pixAdapter` do repo é trocável), zerando float e transferência manual e tirando o dinheiro
   de terceiros da conta MP pessoal.
4. **Confirmar se o MP de entrada já é PJ** (o repo se contradiz) e, se não, não admitir
   clientes externos além do piloto antes disso.
5. **Aceitar por escrito:** Pague Menos e Oba fora; Mercado Livre fora da compra automática
   (Termos); nada de resolver CAPTCHA por serviço ou proxy.
6. **Quem cobre a fila de exceções e o pós-venda** (troca, item faltando, SAC) e em que
   horário. A automação tira o dono da rotina de compra, não da cobertura humana.
7. **O que fazer se nenhuma loja passar E2** (seção 8).

## 6. O que se reaproveita e o que falta construir

Reaproveitado sem reescrever: `purchase-policy.ts` (teto e reserva atômica),
`purchase-execution.ts` (hash da cesta, `executionUnknown` que nunca retenta),
`purchase-worker.ts` (fila durável, lease por loja, claim a cada 15 s), `scripts/retail-buyer`
(orderForm VTEX, `receiverName`, SLA, perfis Chrome, leitor Gmail OAuth), `delivery-events.ts`
(dedupe e recibo Meta), estorno idempotente no MP, `/ops`, `isAdminPhone`.

| A construir (só após E3 + E6) | Dias |
|---|---|
| `VtexBuyer` com Pix: `paymentData` 125, clique final, captura do copia-e-cola (resposta do conector + fallback do modal), validação EMV/CRC, detecção de desafio sem tentar resolver | 2 |
| Conector Pix-out com interface neutra (Efí/Asaas): decode, guardas, pay, consulta; modelo `PixPayout` com unique por job; rota do comprador para entregar o código ao servidor | 2,5 |
| Estados `pix_captured → pix_paid → store_confirmed` no worker; timeouts; telemetria por compra (loja, passo, desafio/erro) | 1 |
| Parser dos e-mails transacionais VTEX → `DeliveryEvent`; correlação loja↔pedido por número; alarme de silêncio (sem e-mail em X h) | 2 |
| Exceções por um toque no WhatsApp do operador (botões assinados) + espelho no `/ops` | 1,5 |
| Conciliação `CREDIT_REFUND` → `refund_pending`; estorno parcial por item; reserva de caixa | 1 |
| `launchd` + `caffeinate` + heartbeat + runbook Tailscale; aposentar a tarefa horária do ChatGPT | 0,5 |
| Preferência por loja executável na vitrine (sem trocar item escolhido) + relatório semanal por loja | 1 |
| Testes, migrations pendentes (3 já escritas + `PixPayout`), deploy, docs | 1,5 |

Total ≈ 13 dias de código, **depois** dos gates. Custo recorrente novo: ~R$0 (caixa, listener
e Tailscale grátis; energia do Mac). Por pedido: R$0 (Asaas, QR dinâmico) a ~1,19% mín.
R$0,50 (Efí, tarifa de envio PJ segundo a comunidade; confirmar em E5). Semana 1: ~R$75 em
mercadoria que fica com o dono + R$1.

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Nenhuma loja emite o QR sem desafio (placar hoje: 0 de 4, mas 2 por motivo resolvível) | E2 custa R$0 e decide antes de qualquer código; ver seção 8 |
| Desafio aparece hoje e não amanhã (configuração da loja muda sem aviso) | E4 mede repetição; telemetria por compra; loja com desafio em 1 de 3 sai da allowlist |
| Copia-e-cola só legível no modal | fallback de DOM já previsto; loja que não entregar sai |
| Provedor exige confirmação humana por transação, ou tarifa come a margem | E5 por escrito antes de E6; interface neutra para trocar |
| Pagamento duplicado | `idEnvio` idempotente (Efí) ou tentativa única (Asaas); unique por job; timeout = humano |
| Loja cancela depois do Pix pago (irreversível, sem chargeback) ou devolve em vale | primeira compra de cada loja com ticket baixo; conciliação pelo e2e; exceção manual se vier vale |
| Antifraude recusa CNPJ pagador ≠ CPF do pedido ou destinatário diferente | nunca testado; E3/E4 com destinatário diferente medem; Pix reduz os gatilhos documentados (são de cartão) |
| Caixa de e-mail + Mac ligado como ponto único de falha | heartbeat com alerta em 10 min; alarme de silêncio de e-mail; no-break; Mac mini quando o volume justificar; a fila durável retoma e o estorno automático protege o cliente |
| Dinheiro de terceiros em conta MP pessoal | piloto só com o dono como cliente até confirmar PJ; fase 2 unifica entrada e saída na conta PJ |
| Enquadramento (MEI × mandato) e NF obrigatória em 2027 | decisão com contador antes de escalar; piloto em revenda |
| Cesta com mais de uma loja (o pedido típico "ração, shampoo e vinho") | continua um job por loja, assistida; a vitrine passa a preferir loja executável quando o produto é equivalente |

## 8. Se nenhuma loja passar E2

Não inventar rota. Opções honestas, em ordem: (a) **enviar ao cliente o Pix do próprio
varejista** e cobrar a taxa da Lia à parte (muda a monetização; dois pagamentos; o QR de 15–60
min corre contra o cliente); (b) contratar um operador de compras por hora, com a fila do
`/ops` e o leitor de e-mail já valendo; (c) encolher para a única loja que funcionar. Em
qualquer cenário a caixa legível, o rastreio por e-mail e o Pix-out continuam úteis.

## 9. Por que isto é diferente do que já foi tentado

- **Browserbase:** navegador remoto com IP de datacenter, bloqueado. Aqui a infraestrutura é
  o Chrome local já existente; o que muda é a credencial (Pix, não cartão) e o acesso à caixa.
- **Manual:** o dono sai da rotina nas lojas que passarem e fica só na exceção por um toque.
- **Tarefa horária do GPT:** latência de 1h contra QR de 15–60 min; ainda exigia o clique. Aqui
  o pagamento é síncrono e determinístico no servidor, em segundos.
- **Comprador com cartão salvo:** morreu no CVV por recompra e no antifraude de cartão. Pix
  mata CVV, 3DS e chargeback; **não mata o desafio da loja**, por isso o teste vem antes do código.
- **Guest checkout com e-mail novo por pedido** (ideia que circulou hoje): descartada; piora o
  sinal antifraude e as lojas exigiram login mesmo assim.

## 10. Caminhos descartados (uma linha cada)

- **Mercado Livre como trilho único:** Termos de 11/05/2026 tipificam intermediar operações
  de terceiros como infração; sem convidado; antibot; só 4 das 18 marcas com loja oficial.
- **Zinc/Rye, Rappi/iFood/Lalamove por API, "Zinc do Brasil":** não existem para o comprador.
- **Open Finance/ITP:** biometria do pagador a cada Pix; R$500+/mês.
- **Visa Intelligent Commerce / Mastercard Agent Pay:** programa fechado; 2027 para MEI.
- **Cartão virtual PJ:** continua pedindo CVV e passando pelo antifraude de cartão.
- **Navegadores gerenciados, VPS, proxies residenciais, resolvedores de CAPTCHA:** IP de
  datacenter piora o desafio; "anti-detecção" e burla estão fora por política.
- **Mercado Pago como pagador / Banco Inter:** sem API de saída / MEI sem acesso às APIs.
- **Agente de navegador com LLM (Stagehand, computer use) como caminho principal:**
  não-determinismo onde há dinheiro e não resolve CAPTCHA; reserva para localizar elemento em
  loja não-VTEX num ciclo futuro.
- **Parceria com varejista, bens digitais, mais catálogos:** vetados pelo dono.

## 11. O que este plano não resolve

Lojas fora de VTEX+Pix (Carrefour proibido, Petz/Boticário/Droga Raia/Kalunga com Akamai,
Cacau Show, Decathlon, Imigrantes, Giuliana) e Oba continuam manuais ou saem da vitrine
executável. CAPTCHA onde aparece. Pós-venda (troca, SAC) continua humano. Enquadramento
fiscal. Prazo de entrega (é o do checkout da loja). E não valida demanda: com 3 pedidos e
R$63 de razão, isto torna a compra executável, não prova mercado.

---

## 12. Cruzamento com o plano do Codex — 11/09/2026

Cruzado com [plano de validação Pix](plano-validacao-compra-pix-2026-09-10.md) e
[evidências](evidencias-validacao-compra-pix-2026-09-10.md), escritos pelo Codex no mesmo dia,
sem combinação prévia.

**Convergência independente (sinal forte).** Os dois chegaram ao mesmo desenho: Pix da loja
no lugar de cartão salvo; gates baratos antes de código; comprador no Chrome local; provedor
bancário escolhido por condição comprovada (ação crítica, limites, timeout), não por cadastro;
Pague Menos, Oba e Mercado Livre fora; nada de burlar desafio; uma loja por cesta; teto
R$500. O Codex está uma etapa à frente na execução (4 lojas sondadas, leitor Gmail OAuth
somente leitura escrito e testado, 577/577) e uma etapa atrás na estratégia (sem
enquadramento fiscal, sem desenho de exceções, sem tesouraria, sem plano B).

**Discordâncias reais e a conclusão de cada uma:**

1. **Ordem comercial.** O Codex (Etapa 4) cria o pedido Pix na loja *antes* de cobrar o
   cliente. Isso gera pedido não pago na loja a cada cotação abandonada (o próprio texto diz
   que "um pedido não pago ainda altera o estado da loja"), é sinal ruim para antifraude e
   corre contra o QR de 15–60 min. **Conclusão: cliente paga primeiro; preço e frete exatos
   pela `simulation` na cotação; pedido na loja só com dinheiro em caixa, em segundos. Hash
   da cesta e plano B já cobrem a deriva de preço.**
2. **Primeira loja.** Codex: Cobasi ou Swift. Este plano: Ri Happy e Drogaria SP. **Conclusão:
   Swift é a primeira candidata de fato** (leitor já conectado ao "Acesso Rápido", Pix
   verificado, cesta mínima R$22,40 com frete), Cobasi em seguida (item de R$2,80, mas
   reCAPTCHA invisível na página de acesso e código de cadastro ainda não conectado ao
   leitor). Ri Happy e Drogaria SP entram como sondagens paralelas a R$0. Drogaria SP tem um
   problema que o leitor não resolve: em 08/09 o código **não chegava**.
3. **Host.** Codex exige máquina dedicada para aprovar a Etapa 3 (5 compras). **Conclusão:
   as 5 compras podem rodar no Mac atual como serviço `launchd` (diagnóstico); o piloto de
   30 exige o host dedicado.** Mac mini antes do piloto, não antes dos gates.
4. **Teto diário.** Este plano propunha subir para R$2.000/dia após 5 compras; o Codex mantém
   R$500/dia e até 3 pedidos/dia no piloto. **Conclusão: o Codex está certo; subir só depois
   dos 30 pedidos.** A seção 5.2 fica corrigida por esta.
5. **Provedor bancário.** Codex: Asaas primeiro, Efí só se falhar. Este plano: Efí primeiro
   por `idEnvio` idempotente. A própria evidência do Codex registra que o Asaas não tem chave
   de idempotência. **Conclusão: perguntar aos dois em paralelo (custo zero) e decidir pela
   resposta escrita; não sequencial.**
6. **Critério de sucesso.** Codex: 29 de 30 sem intervenção e ≤ 5 min pago→confirmado. Este
   plano: < 10% de exceções por um toque. **Conclusão: os dois, em níveis diferentes**: 29/30
   é o gate da loja homologada (só pedidos admitidos); "< 10% de toques" é a métrica
   operacional sobre todos os pedidos, porque cobertura e sucesso são coisas distintas, como
   o próprio Codex separa.

**Adotado do Codex neste plano:** a tabela de casos simulados antes de dinheiro real (Pix
vencido, resposta bancária perdida, notificação duplicada, pago sem confirmação da loja,
divergência, queda e reinício, cancelamento disputando pagamento); "uma loja, um vendedor,
uma conta, uma compra por vez"; teto R$500 total para a prova, compartilhado com o diário;
nunca usar cliente não informado como teste; cobertura medida separada do sucesso.

**Adotado deste plano no fluxo do Codex:** decisão fiscal (revenda no piloto; mandato exige
ME/SLU; documento fiscal para PF em 2027); conta MP pessoal (cl. 1.3.2) → piloto só com o
dono como cliente até a conta PJ; CDC art. 49 → estorno ao cliente não espera a devolução da
loja; exceções por um toque no WhatsApp do operador; tesouraria (float = teto × dias até
repor; fase 2 receber o Pix do cliente na mesma conta PJ que paga a loja); Mercado Livre fora
por Termos; plano B se nenhuma loja passar.

**Higiene pendente no material do Codex:** a seção "Decisão proposta" ainda diz "a candidata
inicial é a Pague Menos", contradizendo a execução registrada acima dela; `config.json`
do comprador ainda lista Oba e Pague Menos; o leitor só conhece domínios de Cobasi e Swift e
só o "Acesso Rápido" da Swift está conectado; a Etapa 4 diz "recebimento pelo Pagar.me",
mas o Pix de entrada é Mercado Pago.

**Placar real e próximo passo físico.** Lojas: 0 de 4 passaram, 2 por motivo resolvível.
Banco: inconclusivo, nenhuma conta aberta. Leitor: escrito, sem consentimento OAuth real.
**Há um único passo que destrava tudo e é do dono: criar o cliente OAuth no Google Cloud
(escopo Gmail somente leitura) para a caixa operacional e rodar
`npm run purchase-worker:mailbox-authorize`.** Depois disso, a sondagem da Swift custa R$0.
