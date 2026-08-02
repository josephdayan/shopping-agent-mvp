# Lia — checklist de lançamento

_Última atualização: 2026-08-02._

Este é o painel canônico de progresso do projeto. Marque um item com `[x]` somente quando
o critério descrito estiver comprovado. Quando uma decisão mudar, atualize também
[AGENTS.md](AGENTS.md) e [STATUS.md](STATUS.md).

> **Remodelagem concierge (2026-07-20).** O produto ativo virou um concierge manual no
> WhatsApp (largura + cotação/compra do operador + motoboy saindo da base do operador).
> Racional e contrato em [AGENTS.md](AGENTS.md) (topo). Muitos itens abaixo, escritos para a
> automação por varejista, viram **referência do fluxo legado** (atrás de
> `LIA_MANUAL_CONCIERGE=false`). Novo P0 do piloto: **rodar 5–10 pedidos concierge manuais**
> medindo demanda, margem após frete e tempo por pedido; titularidade/NF seguem bloqueio
> antes do público. Código do fluxo manual: TypeScript, lint, testes focados e build verdes
> em 2026-07-20 (`tests/manual-concierge.test.ts`).

> **Atualização de 21/07.** `bb48c2e` (fluxo), `ededf6a` (docs) e `7ab8453` (kit do operador)
> estão verdes localmente. Uma demonstração mockada percorreu cotação de R$100 → Pix
> confirmado → compra → despacho Uber Direct da base do operador → entrega, incluindo mensagens
> ao cliente; não houve cobrança. O concierge não foi implantado porque o deploy atual incluiria
> uma migration Oba inacabada de outro trabalho. A decisão é contratar um operador. Existem 19
> pedidos técnicos na fila de Production, cuja limpeza requer autorização explícita.

> **Atualização de 02/08.** O deploy limpo de 24/07 está online e foi conferido por endpoints
> públicos. O worktree local ainda precisa ser consolidado para que `main`/Git representem o
> artefato publicado. Foi adicionada uma guarda de produção: provider Meta não aceita despacho
> mockado e o motoboy exige endereço + CEP configurados da base do operador. Antes de dinheiro
> real, preencher a base na Vercel, manter `LIA_MANUAL_CONCIERGE=true` e
> `PURCHASE_AUTOMATION_MODE=cart_only`, e validar o bloqueio com um pedido técnico isolado.

## Como usar

- **P0:** bloqueia o piloto ou pode causar perda financeira, jurídica ou operacional.
- **P1:** necessário para o lançamento público.
- **P2:** melhoria posterior; não deve atrasar o piloto controlado.
- Registre evidência curta no próprio item ou no documento relacionado antes de marcá-lo.
- “Código pronto” não significa “validado”: teste ao vivo, deploy e operação são etapas
  distintas.

## Visão geral

- [x] Canal de WhatsApp ativo em produção.
- [x] Cobrança Mercado Pago integrada.
- [x] Busca ao vivo preparada para Oba, Petz e Boticário.
- [x] Carrefour removido do produto ativo em 19/07: registro, roteamento, cron, comprador,
  endpoint/tela operacional e defaults novos deixaram de apontar para ele. O histórico da
  decisão permanece documentado, mas não há fallback ativo para Carrefour.
- [x] Carrinho/checkout da Petz validado ao vivo sem finalizar compra.
- [x] Produção protegida em modo `cart_only`.
- [x] Fundamento de One-Click Meta + Pagar.me implementado atrás de flag, com tentativa
  idempotente, página de tokenização e reconciliação por webhook. Evidência:
  `docs/whatsapp-one-click-pagarme.md`; build e testes focados de 14/07/2026.
- [ ] Fluxo completo cotar → cobrar → comprar → entregar validado em piloto.
- [ ] Operação, jurídico e pós-venda aprovados para lançamento público.

## P0 — antes do primeiro piloto com dinheiro real

### Concierge manual — prioridade vigente

- [x] Implementar a jornada livre: lista → `awaiting_operator_quote` → cotação no `/ops` →
  aprovação → Pix/cartão → compra → despacho pela base do operador → entrega. Coberta por testes
  focados, copy e demonstração local mockada em 21/07.
- [x] Criar o kit de operação: botão único **“Comprei — despachar motoboy”** e
  [runbook de uma página](docs/operador-runbook.md).
- [ ] Contratar e treinar o operador antes do primeiro pedido real.
- [ ] Separar/concluir a migration Oba inacabada e publicar o concierge em deploy limpo. Não
  misturar a publicação com o trabalho paralelo do Oba.
- [ ] Limpar os 19 pedidos técnicos de Production **somente após autorização explícita**.
- [ ] Rodar 5–10 pedidos concierge reais, registrando tempo de cotação, margem depois do frete,
  falhas e satisfação. A demonstração mockada não conta como piloto.
- [x] Falhar fechado quando produção Meta não tiver despacho real do courier; o modo mock permanece
  disponível somente para testes locais.
- [ ] Configurar e conferir `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` em
  Production antes de liberar o botão de despacho do piloto.

### Cotação e cobrança

- [ ] Montar a sacola real e calcular estoque, preço, frete e prazo **antes** de cobrar o
  cliente. Implementado para Oba, Petz e Boticário em 19/07: a cotação só é publicada quando
  o comprador retornar esses quatro campos e falha fechada em `needs_human`. **Oba foi validado
  ao vivo em Production em `cart_only`:** o job técnico chegou a `cart_ready` com arroz Camil
  1 kg R$ 5,99, frete R$ 9,90, janela do varejista e total R$ 15,89 no CEP público `01310-100`.
  A migration de default Oba foi aplicada e conferida. Próximo critério: validar o fluxo atual
  de Petz e Boticário ao vivo, ainda sem WhatsApp, cobrança ou compra. **Tentativas de 19/07:**
  Petz confirmou SKU/preço/subtotal, mas não expôs frete/prazo nem na sacola completa; o retry
  revelou re-render transitório ao limpar a sacola e o seletor foi endurecido; o retry chegou à
  rota real `/checkout/cart/<id>`, mas continuou sem frete/prazo expostos. Boticário confirmou
  SKU/quantidade/subtotal, mas não liberou a confirmação de CEP do painel de frete; “Entrega
  Rápida” leva só a uma página informativa e foi descartada como rota de cotação. O diagnóstico
  final encontrou o campo `postalCode`, mas a sacola o marcou como desabilitado (`data-disabled=true`);
  não forçar nem contornar esse gate do varejista.
  **Retestes novos de 20/07:** Petz voltou a chegar à sacola completa sem entrega exposta;
  Boticário voltou a confirmar item/subtotal sem prazo domiciliar. O parser passou a rejeitar
  publicidade de frete grátis e retirada como se fossem cotação. Ambos permanecem `needs_human`.
  Ambos falharam fechados em `needs_human`; nenhuma mensagem, cobrança ou compra ocorreu.
  **Sessão assistida Petz (20/07):** o `/ops` foi publicado com abertura de Context vivo isolado,
  sem criar sacola ou executar ação financeira, e a sessão Petz foi aberta para o operador marcar
  entrega no endereço. Ela inicia na home da loja para evitar a aba remota vazia. Após essa escolha
  na UI do varejista, repetir somente o preflight técnico. A sessão permanece viva por até uma hora.
  O visualizador embutido do Codex não sustentou interação visual estável; a sessão foi aberta no
  Safari, sem alterar Context, carrinho ou pagamento.
  **Persistência/retry (20/07):** o `/ops` ganhou encerramento autenticado das sessões vivas do
  Context para salvar a ação manual antes do preflight. O retry novo continuou apenas na rota
  `/checkout/cart/<id>`, com item/subtotal mas sem controles, frete ou prazo. O CTA explícito
  “ir/continuar para checkout” também não foi exposto. Petz permanece `needs_human`.
  **Reteste Boticário (20/07):** SKU B88468, quantidade e subtotal R$ 16,90 foram confirmados
  novamente. A sacola ainda deixou `postalCode` bloqueado e não exibiu prazo domiciliar; “frete
  grátis” e retirada foram tratados apenas como promoções. Permanece `needs_human`.
  **Substituições a validar:** priorizar Pão de Açúcar (mercado em São Paulo) e Cobasi (pet),
  sempre com entrega do próprio varejista, Context isolado e preflight `cart_only`. Savegnago
  permanece candidato de interior paulista. A triagem oficial é favorável, mas nenhum deles deve
  aparecer ao cliente até a cotação ao vivo passar.
  **Smoke Cobasi (20/07):** passou em navegação anônima com CEP técnico `01310-100`: produto
  real, sacola, modalidades Cobasi Já/Econômica, frete, prazo e total apareceram antes de
  pagamento; carrinho técnico limpo. Priorizar agora Context isolado, conector e preflight
  `cart_only` da Cobasi. **Pão de Açúcar:** a rota pública foi interceptada por
  `az-request-verify` antes de produto/CEP; não integrar sem nova evidência de acesso permitido.
  **Evidência de deploy:** a prévia Vercel `dpl_GHsPBkvKhrw4zAUZsoh5uT6P5jac` ficou `Ready` em
  19/07. A auditoria de nomes de variáveis confirmou `BROWSERBASE_API_KEY`, Contexts Petz/Boticário
  e ausência de `OBA_BROWSER_CONTEXT_ID` em Production; nenhum valor foi lido ou exposto. A tentativa
  única e segura de criar um Context vazio respondeu `401 Unauthorized`. **Correção posterior
  em 19/07:** a nova chave foi gerada no painel autenticado, validada ao criar o Context vazio do
  Oba e gravada como Sensitive em Production, assim como `OBA_BROWSER_CONTEXT_ID`. Arquivos
  temporários e área de transferência foram limpos. **Primeiro preflight em Production:** o job
  técnico terminou em `needs_human` por `PURCHASE_WORKER_ERROR` porque o comprador fechava a
  página antes de `buildSnapshot` concluir. A correção (`return await`) passou em TypeScript e
  204 testes (162 aprovados; 42 integrações de banco puladas), foi publicada no deploy
  `dpl_CpcjWKyHrteDuiQQ2DU9NZbj5Pwz` e o retry chegou a `cart_ready`, com todos os campos
  exigidos. Não houve WhatsApp, cobrança ou compra.
- [ ] Mostrar no WhatsApp resumo da cotação, endereço, modalidade, prazo e validade.
  O núcleo já é genérico para Oba/Petz/Boticário; falta evidência ao vivo de cada varejista.
- [ ] Implementar expiração curta da cotação e impedir pagamento de cotação vencida.
  Implementado no núcleo genérico; a expiração cancela a cotação e libera o Context. Falta
  validação ao vivo no novo conjunto de varejistas.
- [ ] Revalidar itens, quantidade, total, endereço, frete e prazo imediatamente antes da
  compra.
- [ ] Definir a política para diferença de preço após pagamento: limite automático,
  aprovação do cliente ou estorno.
- [ ] Garantir idempotência entre pedido, cobrança, carrinho e tentativa de compra.
- [ ] Impedir nova tentativa automática quando o resultado do clique financeiro for
  incerto.

### Compra segura

- [x] Manter produção com `PURCHASE_AUTOMATION_MODE=cart_only`.
- [x] Não armazenar cartão, CVV, senha ou credenciais do varejista no banco/documentação.
- [ ] Exigir confirmação explícita no momento de qualquer compra final durante o piloto.
- [x] Tratar login, OTP, CAPTCHA, CVV e 3DS como `needs_human`. A detecção Carrefour
  cobre login/sessão expirada, CAPTCHA e 3DS; os testes unitários confirmam a classificação.
- [x] Implementar fila ou isolamento por conta/Context Browserbase para impedir carrinhos
  concorrentes. O lease persistente por Context bloqueia mistura de carrinhos entre workers;
  `RETAILER_BUSY` volta a `preflight_queued` e o workflow tenta de novo a cada minuto por até
  uma hora. Leases vencidos só podem ser retomados após 15 min, e testes unitários cobrem
  concorrência, expiração e falha de infraestrutura.
- [ ] Validar recuperação segura quando a sessão Browserbase expirar. Em 16/07 foi
  implantada uma rota autenticada e página operacional que criam uma sessão viva do mesmo
  Context para login humano. Em 19/07, a autenticação remota foi explicitamente bloqueada
  pelo Carrefour; não repetir nem tentar contornar. Reavaliar este critério por varejista,
  começando pela sessão Petz já validada.
- [ ] Rotacionar todas as credenciais que já tenham sido expostas em conversas e atualizar
  os ambientes de produção. **Urgente em 15/07:** credenciais Browserbase/Vercel apareceram
  em saída de diagnóstico; o token OIDC local da Vercel já foi renovado sem expor valor.
  Ainda falta regenerar a chave Browserbase e atualizar os ambientes. Uma sessão persistente
  do Context Carrefour foi aberta em 15/07 somente para a reautenticação manual; depois dela
  será necessário validar o login antes do próximo teste ao vivo. **Não usar a chave de
  reposição enviada em chat em 15/07, mesmo com autorização posterior:** ela também foi
  exposta; regenerar outra diretamente no painel e configurá-la na Vercel sem compartilhá-la
  em conversa. A validação da variável puxada de produção retornou
  `401 Missing x-bb-api-key`; após salvar a nova chave, implantar antes de abrir novo
  preflight. A URL correta de Environment Variables já foi aberta no navegador embutido,
  mas a Vercel pediu login manual antes da edição. Após tentar salvar somente em Production,
  a leitura atual via `vercel env pull` ainda retornou `BROWSERBASE_API_KEY` sem valor;
  confirmar no painel que a edição foi efetivamente salva antes do deploy. A edição exibida
  tinha prefixo `sk_live_`, não compatível com Browserbase: substituir por chave nova
  `bb_live_`, marcar Sensitive e só então implantar. A segunda leitura de Production após a
  alegada correção também não trouxe a variável; não implantar nem reabrir o preflight. O
  painel depois confirmou a variável Sensitive atualizada em Production e o novo deploy
  ficou Ready em 15/07; a chave não é baixada localmente pelo CLI por ser Sensitive. Falta
  validar o preflight implantado. A reautenticação informada em 15/07 não permaneceu válida:
  o retry de 16/07 chegou a `LOGIN_REQUIRED`. Uma nova sessão viva foi aberta; falta o login
  humano e repetir a cotação, sem cobrar nem comprar.
- [ ] Rotacionar a senha Carrefour exposta no chat em 16/07. Não persistir o valor em
  código, banco, `.env`, documentação ou memória operacional; concluir o login somente na
  sessão viva e trocar a senha antes do piloto. Em 18/07, o operador optou por adiar a troca;
  nenhuma alteração foi feita. A conta/Context Carrefour continua bloqueada para piloto até a
  rotação pelo titular.
- **Atualização 18/07:** a parte Browserbase desta pendência foi concluída: a chave foi
  regenerada, o valor intermediário exibido na rotação foi invalidado e substituído, e a chave
  final foi gravada como Sensitive em Production. O redeploy da versão `9a06eab` ficou `Ready`.
  Isto não valida autenticação Browserbase no runtime nem libera preflight; permanecem nesta
  pendência a senha Carrefour, o PIN WhatsApp e os segredos Mercado Pago/Uber expostos.
- **Direção do operador em 18/07:** pausar novas rotações de credenciais. Prioridade de
  execução passa a ser validar a cotação Carrefour em `cart_only` e os estados de entrega/
  estorno recém-implantados no `/ops`, sem cobrança ou compra. Os itens de segurança seguem
  abertos como bloqueios de piloto e só devem ser retomados mediante pedido explícito.
- **Validação funcional 18/07:** o preflight técnico de produção foi acionado em `cart_only`
  e não abriu WhatsApp, cobrança ou compra. O resultado foi `needs_human` /
  `CONFIGURATION_REQUIRED`: o runtime recusou a credencial Browserbase Carrefour. Corrigir e
  confirmar a configuração já existente antes de novo retry; o deploy `Ready` por si só não
  comprovou autenticação em produção.
- **Correção 18/07:** foi identificado que `BROWSERBASE_API_KEY` em Production continha um
  valor `sk_live_`, incompatível com Browserbase. A chave correta foi copiada diretamente do
  painel oficial para a variável Sensitive (sem expor o valor), e o deploy
  `EEaegLWbmNtiwG6opHEbWirJBX57` ficou `Ready`. O retry técnico passou da configuração e
  terminou em `LOGIN_REQUIRED`: Browserbase/Context respondem no runtime; falta somente a
  reautenticação humana Carrefour para validar carrinho, frete e prazo. Sem WhatsApp,
  cobrança ou compra.
- **Reavaliação 19/07:** a nova sessão viva confirmou bloqueio explícito do Carrefour na rota
  de autenticação por política de segurança. Como a configuração Browserbase já estava
  comprovada e o login funciona no navegador comum do operador, o checkout remoto Carrefour
  deixou de ser caminho viável para o piloto. Pausar retries e priorizar Petz; só reabrir
  Carrefour com API/parceria oficial ou ambiente autorizado. Sem WhatsApp, cobrança ou compra.
- [ ] Rotacionar o PIN de registro do WhatsApp que estava salvo em um Markdown local
  ignorado pelo Git. O valor foi removido em 16/07; guardar o novo somente no cofre de
  segredos, nunca em Markdown, chat ou logs.

### Financeiro, fiscal e jurídico

- [ ] Confirmar que a conta Mercado Pago PJ está apta ao modelo e aos volumes do piloto.
- [ ] Definir quem é o comprador perante o varejista e quem aparece como titular da nota
  fiscal.
- [ ] Definir o tratamento de compras para destinatários diferentes usando uma conta
  central.
- [ ] Validar nos termos de Petz, Carrefour e Boticário se o uso operacional da conta
  central é permitido.
- [ ] Definir processo de cancelamento, troca, devolução, item faltante e chargeback.
- [ ] Definir responsabilidade e comunicação quando o varejista atrasar ou não entregar.
- [ ] Confirmar emissão fiscal e tributação da taxa/serviço cobrado pela Lia.

### Cartão One-Click no WhatsApp

- [x] Aplicar as migrations `20260714110000_whatsapp_one_click_payments` e
  `20260714123000_pagarme_one_click` no ambiente de produção. Aplicadas em 15/07;
  a ativação do One-Click continua bloqueada pelas dependências externas abaixo.
- [x] Enviar em 18/07 a solicitação técnica a Samuel Santana/Infobip e ao Customer Success
  (`success@infobip.com`), com a exigência de preservar WABA, número, Cloud API/Graph API e
  webhook, sem migração/compartilhamento de sender/BSP sem autorização separada.
- [ ] Aguardar a resposta técnica escrita da Infobip: matriz de compatibilidade de
  `order_details` / `offsite_card_pay`, Mercado Pago PJ, `credential_id`, webhook, sandbox,
  custos e limites. Não criar/usar conta de teste, alterar canal ou ativar One-Click antes
  dessa confirmação.
- [ ] Obter a allowlist da Payments API BR para a WABA brasileira na Meta e confirmar o
  shape definitivo do webhook de confirmação.
- [ ] Confirmar por escrito se Mercado Pago PJ é suportado nesse desenho, quem gera o
  `credential_id`, custos/mínimos, prazo de onboarding e se algum BSP precisa assumir a
  WABA ou o número. Não substituir o desenho Pagar.me já implementado sem essa evidência.
- [ ] Configurar Pagar.me V5: chaves, domínio liberado para `tokenizecard.js`, webhook e
  os eventos de pedido/cobrança/cartão descritos no guia.
- [ ] Confirmar com o Pagar.me, antes do sandbox real, se a primeira cobrança e as recompras
  avulsas confirmadas no WhatsApp devem usar `recurrence_cycle=first|subsequent`, quando
  CVV/3DS é exigido e se a conta operará como PSP ou Gateway. O adaptador atual envia
  `card_id` sem `recurrence_cycle`; ajustar código e testes somente com essa resposta.
- [ ] Executar primeira compra e recompra reais em sandbox; verificar CVV/3DS, recusa,
  resposta perdida e reconciliação antes de ativar `LIA_ENABLE_WA_PAYMENTS=true`.

### Operação mínima

- [x] Garantir acesso segregado ao painel `/ops` sem reutilizar o segredo da API pública.
  `OPS_TOKEN` foi criado como Sensitive em Production e Preview em 16/07 e o redeploy de
  produção ficou `Ready`; o painel foi autenticado sem expor o valor.
- [x] Adaptar os estados do pedido para entrega direta do varejista, removendo a premissa
  obrigatória de retirada/motoboy. Implementado localmente em 16/07 com
  `retailer_preparing → retailer_out_for_delivery → delivered`; estados de retirada/courier
  permanecem apenas para pedidos legados ou parceiros formalmente autorizados.
- [x] Adaptar `/ops` para exibir cotação, varejista, modalidade, prazo, rastreio e exceções.
  Implementado e coberto por build/testes em 16/07; implantado em produção no redeploy de
  18/07, mas ainda falta validar ao vivo com massa técnica nova.
- [x] Criar procedimento humano para `needs_human`, com responsável e tempo máximo de
  resposta. Runbook: `docs/operacao-piloto-needs-human-estorno.md` (operador de plantão,
  reconhecimento em até 10 min e decisão em até 30 min na janela do piloto).
- [x] Criar procedimento de estorno quando a compra não puder ser concluída. O `/ops` agora
  separa `refund_pending` de `refunded`, exige referência do provedor antes de confirmar ao
  cliente e o runbook documenta a sequência segura.
- [ ] Validar ao vivo os novos estados de entrega direta e o fluxo de estorno no `/ops`,
  sem usar pedidos legados como massa de teste. Implantação em produção confirmada em 18/07.
- [ ] Registrar eventos suficientes para auditar cada transição sem expor dados sensíveis.

## P0 — validação por varejista

### Petz

- [x] Conta persistente autenticada no Browserbase.
- [x] Endereço reconhecido no checkout.
- [x] Busca, produto, sacola, frete e prazo validados ao vivo.
- [x] Checkout alcançado sem finalizar compra.
- [ ] Portar para Petz a orquestração de cotação antes da cobrança, com validade curta,
  hash de itens/total/frete/prazo e falha fechada.
- [ ] Executar pedido técnico Petz em `cart_only` e validar o resumo no WhatsApp e no `/ops`,
  sem cobrança ou compra. Em 19/07 o job técnico chegou ao SKU/preço/subtotal reais, mas a sacola
  completa não mostrou frete/prazo no Context; investigar a etapa de entrega antes do retry.
- [ ] Testar cartão salvo e verificar quando CVV/3DS/antifraude são exigidos.
- [ ] Testar Pix do varejista apenas para entender o fluxo; não misturar com o Pix pago à
  Lia sem desenho financeiro explícito.
- [ ] Validar rastreio e comunicação pós-compra da entrega Petz.
- [ ] Executar primeiro pedido controlado entregue pela própria Petz.

### Carrefour

- [x] Busca ao vivo com URL e preço reais.
- [x] Automação de carrinho preparada.
- [x] Registrar o bloqueio da autenticação remota: em 19/07 o Carrefour recusou a sessão
  Browserbase por política de segurança, apesar da configuração de runtime estar válida.
- [ ] Obter API/parceria oficial ou confirmação de um ambiente autorizado antes de retomar
  automação de autenticação/checkout. Até lá, manter essa frente pausada e sem contorno de WAF.
- [x] Rejeitar o fallback de handoff: por decisão do operador em 19/07, o cliente não receberá
  links nem concluirá a compra no Carrefour; a Lia deve manter a experiência ponta a ponta.
- [ ] Desenhar um teste Carrefour com operação humana invisível no navegador comum, sem automação,
  apenas como ponte interna e sem tratá-lo como solução de escala.
- [ ] Avaliar um modelo Carrefour com shopper próprio/controlado comprando na loja física e entrega
  posterior, incluindo cotação final, substituições, pagamento, NF, cadeia fria e logística.
- [ ] Preparar proposta comercial Carrefour com escopo explícito de catálogo, estoque por região,
  simulação de frete/prazo, criação de carrinho/pedido, pagamento, webhook e pós-venda. Marketplace
  Seller e API merchant do iFood não atendem a esse escopo de compra do consumidor.
- [ ] Não testar endpoints internos VTEX/Carrefour, automação local, extensão, proxy residencial ou
  fingerprint como substitutos do Browserbase sem autorização escrita do varejista.
- [ ] Validar ao vivo o checkout com endereço, estoque, frete e prazo.
- [ ] Confirmar separadamente o fluxo de Carrefour alimentar e não alimentar.
- [ ] Validar pagamento, antifraude, nota fiscal, rastreio e entrega direta.
- [ ] Executar primeiro pedido controlado entregue pelo próprio Carrefour.

### Homologação de novos supermercados

- [x] Definir gates: catálogo real, carrinho isolado, cotação pré-cobrança, sessão persistente,
  entrega do varejista, bloqueio financeiro, termos e autorização comercial.
- [x] Executar triagem pública sem login em 19/07. Oba, Mambo e Savegnago retornaram `200` para
  orderForm anônimo VTEX e catálogo com SKU/preço.
- [x] Validar o núcleo público Oba no CEP `01310-100`: seleção regional de dois SKUs, carrinho
  anônimo de R$ 18,98, estoque, Convencional R$ 9,90 (`0bd`, seis janelas) e Express R$ 14,90
  (`2h`, sem janela no horário). Carrinho esvaziado; sem login, pagamento ou pedido.
- [x] Validar o núcleo público Mambo no mesmo CEP: dois SKUs, carrinho anônimo de R$ 22,78 e
  Entrega Agendada R$ 12,90 (`2h`, 19 janelas). Carrinho esvaziado; sem login, pagamento ou pedido.
- [ ] Implementar primeiro o conector Oba em `cart_only`, usando seleção regional antes da sacola e
  falha fechada quando um item do catálogo não tiver estoque para o CEP. Validar persistência,
  checkout, total final e promessa selecionada sem abrir pagamento.
- [ ] Confirmar com o Oba uma rota comercial para concierge/automação; o canal oficial de WhatsApp
  torna a conversa plausível, mas não é autorização automática.
- [ ] Manter Mambo como fallback regional após o Oba. O núcleo público funciona, mas os termos
  publicados vinculam conta individual ao CPF e proíbem compartilhamento; não usar conta central
  em piloto sem validação comercial/jurídica.
- [ ] Manter Savegnago como candidato regional e confirmar cobertura do CEP do piloto antes do teste.
- [ ] Avaliar Pão de Açúcar em sessão descartável antes de criar Context persistente; a home pública
  respondeu `200`, mas emitiu cookies específicos de bot management.
- [ ] Depriorizar St. Marche enquanto o Grupo Hortus estiver em recuperação judicial; não construir
  dependência operacional sem reavaliar continuidade e eventual aquisição pela Cencosud.

### Cobasi e Leroy Merlin — candidatos ainda não integrados

- [x] Validar em 20/07 o fluxo público da Cobasi até o login: produto real, sacola, CEP público,
  frete, prazo e total; a sacola técnica foi limpa, sem login, pagamento ou pedido.
- [x] Validar em 20/07 o fluxo público da Leroy até o login: produto vendido e entregue pela
  Leroy, CEP público, entrega domiciliar, frete, prazo e total; a sacola técnica foi limpa, sem
  login, pagamento ou pedido.
- [ ] Implementar e validar primeiro o conector Cobasi em `cart_only`, com Context isolado,
  revalidação e falha fechada sem estoque/frete/prazo/total.
- [ ] Só avaliar conector Leroy após Cobasi; restringir produtos a “Vendido e entregue por Leroy
  Merlin” e obter validação comercial/termos antes de qualquer piloto.
- [ ] Não priorizar Sephora: a sessão pública não chegou à sacola/checkout de modo estável.

### Boticário

- [x] Busca ao vivo com URL e preço reais.
- [x] Automação de carrinho preparada.
- [x] Reexecutar a cobertura automatizada em 19/07: suíte de 210 testes sem falhas, com 168 aprovados
  e 42 integrações de banco puladas por indisponibilidade externa.
- [ ] Estender o comprador para capturar frete e promessa de entrega; hoje ele valida apenas
  SKU/quantidade/subtotal e não satisfaz a cotação antes da cobrança.
- [ ] Validar ao vivo o checkout com endereço, estoque, frete e prazo em ambiente Browserbase
  configurado. Em 19/07 o ambiente confirmou SKU/quantidade/subtotal reais, mas a loja não expôs
  a confirmação de CEP para calcular frete/prazo; o job falhou fechado sem cobrança ou compra.
- [ ] Validar titularidade, pagamento, antifraude, nota fiscal e entrega direta.
- [ ] Validar rastreio e comunicação pós-compra.
- [ ] Executar primeiro pedido controlado entregue pelo próprio Boticário.

## P1 — qualidade para lançamento público

### Conversa e experiência do cliente

- [ ] Ajustar a conversa para pedir endereço completo uma vez e sempre confirmá-lo no
  resumo do pedido.
- [ ] Não mostrar produto sem URL real, preço atual e possibilidade de montar carrinho.
- [ ] Resolver ambiguidades de tamanho, sabor, cor, quantidade e substituição antes da
  cobrança.
- [ ] Informar claramente quem entrega e nunca prometer “hoje” sem cotação ao vivo.
- [ ] Criar mensagens para produto indisponível, mudança de preço, atraso, falha de compra
  e estorno.
- [ ] Medir abandono e tempo em cada etapa da conversa.

### Testes e confiabilidade

- [x] `npx tsc --noEmit` aprovado após as mudanças atuais.
- [x] Testes focados de busca, compra e política aprovados.
- [x] Alinhar os evals históricos que esperam apenas CEP ao contrato atual de endereço
  completo. Os cenários agora simulam endereço completo + CEP e clientes recorrentes.
- [x] Deixar a suíte `npm test` inteira verde. A rodada de 16/07 passou com 210 testes
  (168 aprovados e 42 integrações puladas por banco indisponível); `npx tsc --noEmit`, lint
  e `npm run build` também passaram.
- [ ] Criar testes de idempotência, cotação vencida, preço alterado e pagamento duplicado.
  Já existem coberturas de hash/preço, duplicidade One-Click e expiração da tentativa de
  pagamento; ainda faltam regressões de banco para expiração da cotação do varejista e
  idempotência de `place_order`.
- [x] Criar testes unitários do payload Meta, parser, idempotência Pagar.me e resposta
  ambígua do PSP. Os testes de banco aguardam as migrations em um Postgres de teste.
- [x] Criar testes de queda do Browserbase, varejista indisponível e sessão expirada.
  `tests/carrefour-buyer.test.ts` cobre erro Browserbase 401/503, indisponibilidade exibida
  pelo varejista e sessão expirada; os casos falham fechados sem checkout.
- [ ] Medir latência p50/p95 por varejista; meta inicial de 15–30 s para cotação completa.
- [ ] Configurar alertas para falha de webhook, cobrança, carrinho, compra e estorno.

### Piloto e lançamento

- [ ] Definir grupo, limite de pedidos, ticket máximo, região e horário do piloto.
- [ ] Rodar de 5 a 10 pedidos concierge controlados, com compra manual e acompanhamento humano.
- [ ] Registrar sucesso, tempo, margem, falhas, estornos e satisfação de cada pedido.
- [ ] Corrigir todos os incidentes financeiros P0 encontrados no piloto.
- [ ] Aprovar checklist final de operação, jurídico, financeiro e suporte.
- [ ] Definir critérios objetivos de `go/no-go` para abrir ao público.

## P2 — expansão depois do piloto

- [ ] Obter parceiro local ou contrato merchant/courier que autorize retirada por terceiro
  para oferecer same-day fora da entrega do varejista.
- [ ] Reavaliar Uber Direct somente para parceiros com autorização operacional formal.
- [ ] Criar pool de contas/Contexts isolados para aumentar concorrência por varejista.
- [ ] Avaliar novas lojas usando o mesmo gate: busca real, carrinho, entrega, termos,
  pagamento, pós-venda e piloto.
- [ ] Automatizar conciliação financeira e cálculo de margem por pedido.
- [ ] Criar painel de SLA por loja e modalidade de entrega.

## Registro de marcos

- **2026-07-24:** **deploy de produção limpo.** Concierge + kit do operador + **11 vitrines
  (~7,7 mil produtos reais)** + fix de roteamento foram para Production (`dpl_9upchNgpPZ15…`,
  READY; `liadelivery.com.br` respondendo). Suíte completa **209/209 verde** (com banco),
  TypeScript, lint e build limpos. Carrefour e Decathlon restaurados como vitrine (checkout
  automatizado segue proibido); Ri Happy (1.196), Swift (925), Kopenhagen (248) colhidos pela
  API pública VTEX; Kalunga/Cacau Show/Droga Raia em seed real menor (sites bloqueados).
  Bug corrigido: dica de vocação testava query com acento contra regex sem acento ("ração"
  ia pro Carrefour em vez da Petz). Commits `73102d0`, `b57d6a5`, `38f5e3d`, `64f37b5`.
  **Próxima decisão de produto:** a vitrine profunda ainda não aparece pro cliente no
  concierge (fluxo é livre → operador); mostrar opções com foto = "vitrine híbrida" (proposta,
  não construída — risco de regressão no fluxo de escolha, decisão do dono).
- **2026-07-21:** o fluxo concierge foi demonstrado localmente em ambiente mockado, do pedido à
  entrega, sem cobrança. O kit do operador ficou pronto; os commits `bb48c2e`, `ededf6a` e
  `7ab8453` permanecem fora de Production até a publicação limpa, pois uma migration Oba paralela
  ainda está inacabada. Decidido contratar operador; limpeza dos 19 pedidos técnicos aguarda
  autorização explícita.

- **2026-07-14:** entrega direta do varejista definida como fluxo principal; retirada por
  motoboy deixou de ser premissa padrão.
- **2026-07-14:** Petz validada até a tela final de pagamento, sem concluir compra.
- **2026-07-14:** checklist canônico criado.
- **2026-07-14:** One-Click BR foi implementado com Meta Cloud API direta e Pagar.me;
  360dialog não é dependência de runtime. Ativação permanece bloqueada por allowlist,
  configuração externa e validação sandbox.
- **2026-07-15:** fluxo Carrefour foi alterado em código para cotar no checkout antes de
  cobrar: o carrinho `cart_only` precisa expor total, frete e prazo; o cliente confirma a
  forma de pagamento depois da cotação com validade curta. TypeScript, testes focados e
  build passaram; migration, deploy e validação ao vivo continuam pendentes.
- **2026-07-15:** migrations pendentes (One-Click e expiração da cotação) foram aplicadas
  em produção, e a cotação Carrefour foi implantada. A validação ao vivo corrigiu o gesto
  de regionalização para Enter, mas parou em `LOGIN_REQUIRED` antes de limpar/adicionar
  qualquer item; reautenticar o Context Carrefour é o próximo passo.
- **2026-07-16:** `OPS_TOKEN` dedicado foi criado como segredo Sensitive em Production e
  Preview; o redeploy de produção ficou `Ready` e o painel `/ops` foi autenticado. A fila
  existente contém pedidos legados e cancelados, que não devem ser usados no preflight. Um
  pedido técnico isolado foi criado em `cart_only`, usando SKU exato e a região já salva no
  Context, sem endereço real, cobrança ou compra. Ele terminou em `PREFLIGHT_NEEDS_HUMAN`;
  não validou conjuntamente item, total, frete e prazo. Retomar somente para diagnosticar e
  fazer o checkout expor esses dados.
- **2026-07-16:** diagnóstico concluído em etapas. A UI atual usa o submit do formulário de
  CEP e o carrinho completo expõe item R$ 1,99, frete a partir de R$ 9,90, prazo a partir de
  sábado e total R$ 11,89. O conector foi corrigido para essa tela, recebeu parsers por linha,
  `orderFormId`, limpeza segura e mensagens por campo. O job técnico foi tornado reutilizável,
  ganhou GET de status, página `/ops/teste-carrefour` e logs finais. Após corrigir CEP, espera,
  falso login e carrinho antigo, o bloqueio atual é `LOGIN_REQUIRED`; sessão viva aberta para
  login humano. Nenhuma mensagem, cobrança ou compra ocorreu.
- **2026-07-16:** após o login humano, o preflight chegou ao minicarrinho e falhou fechado
  porque o CTA do carrinho completo não foi exposto. Foi implementado fallback para a rota de
  resumo, sem ação financeira. A primeira publicação pré-construída falhou em runtime porque o
  Prisma do macOS não continha o binário Linux ARM; o schema foi corrigido, o artefato
  reconstruído e o novo deploy de produção ficou `Ready`. O POST voltou a responder 200, mas o
  workflow atual retornou `LOGIN_REQUIRED`; uma sessão viva nova aguarda login humano.
- **2026-07-16:** o painel Browserbase autenticado foi confirmado e uma sessão Carrefour nova
  foi aberta. A reautenticação humana não foi concluída, sem causa confirmada; o operador pediu
  nova tentativa em outro momento. Não houve preflight adicional, mensagem, cobrança ou compra.
- **2026-07-16:** a fila já presente por Context Browserbase foi extraída para um coordenador
  testável e recebeu cobertura de concorrência, lease vencido e falha de banco. O comportamento
  operacional permanece: `RETAILER_BUSY` reprograma o preflight, sem abrir checkout nem executar
  ação financeira. Não houve teste ao vivo, cobrança ou compra nesta alteração.
- **2026-07-16:** a operação de entrega direta foi implementada localmente com estados próprios,
  painel de promessa/rastreio e bloqueio de courier externo. Cancelamento pago passou a exigir
  `refund_pending`, execução no provedor e referência antes de `refunded`; foi criado o runbook
  de `needs_human`/estorno. Um PIN salvo em Markdown local foi removido e permanece pendente de
  rotação. TypeScript, lint, 210 testes e build passaram; não houve deploy, navegador, cobrança,
  compra ou mensagem real.
- **2026-07-18:** a chave Browserbase exposta foi regenerada e substituída como segredo Sensitive
  de Production; o primeiro valor intermediário exibido na rotação foi invalidado e trocado por
  uma chave limpa. O redeploy de produção da versão `ops-direct-retailer-delivery` / `9a06eab`
  ficou `Ready`. Não houve preflight, sessão nova, cobrança ou compra; autenticação Browserbase,
  senha Carrefour, PIN WhatsApp e segredos Mercado Pago/Uber continuam pendentes.
- **2026-07-19:** a configuração Browserbase de produção foi comprovada, mas a sessão viva do
  Carrefour foi bloqueada na autenticação pela política de segurança do varejista. A automação
  Carrefour/Browserbase foi retirada do caminho crítico: busca pública permanece; checkout só
  volta com API/parceria oficial ou ambiente autorizado. O piloto passa a priorizar Petz e a
  portabilidade do fluxo cotar-antes-de-cobrar. Não houve WhatsApp, cobrança ou compra.
- **2026-07-19:** o operador rejeitou o handoff de links; o cliente não deve terminar a compra.
  Restam como pontes de curto prazo operação humana invisível ou shopper controlado, e como solução
  de escala parceria homologada Carrefour/app de delivery. Marketplace Seller, API merchant do
  iFood, VTEX interno e automação local não são atalhos aprovados.
- **2026-07-19:** criada a estratégia de homologação por varejista. Oba, Mambo e Savegnago passaram
  na triagem pública de orderForm e catálogo VTEX. Na validação seguinte, Oba e Mambo selecionaram
  dois SKUs disponíveis para o CEP público `01310-100`, montaram carrinhos anônimos e devolveram
  frete e estimativa/janelas; os carrinhos foram esvaziados. Oba vira a escolha primária para
  mercado/essenciais e Mambo o fallback regional em São Paulo. Não houve login, pagamento ou pedido;
  persistência, checkout bloqueado e autorização comercial continuam pendentes.
- **2026-07-19:** Boticário foi reavaliado. A suíte de 210 testes terminou sem falhas (168 aprovados,
  42 integrações de banco puladas), mas o comprador atual só revalida SKU, quantidade e subtotal.
  Frete e promessa ainda precisam ser implementados e validados em Browserbase vivo.
