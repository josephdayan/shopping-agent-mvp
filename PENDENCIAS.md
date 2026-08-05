# Lia — checklist de lançamento

_Última atualização: 2026-08-04._

Este é o painel canônico de progresso do projeto. Marque um item com `[x]` somente quando
o critério descrito estiver comprovado. Quando uma decisão mudar, atualize também
[AGENTS.md](AGENTS.md) e [STATUS.md](STATUS.md).

> **Remodelagem concierge (2026-07-20).** O produto ativo virou um concierge manual no
> WhatsApp (largura + cotação/compra do operador + motoboy saindo da base do operador).
> Racional e contrato em [AGENTS.md](AGENTS.md) (topo). Muitos itens abaixo, escritos para a
> automação por varejista, viram **referência do fluxo legado** (atrás de
> `LIA_MANUAL_CONCIERGE=false`). O P0 atual é **de prontidão operacional no estado de São Paulo**:
> escopo geográfico rígido, configuração segura, operador e gates fiscais/financeiros. A
> primeira validação com pedidos reais é opcional e fica para a decisão do operador; não é
> uma pendência de desenvolvimento. Código do fluxo manual: TypeScript, lint, testes focados
> e build verdes (`tests/manual-concierge.test.ts`).

> **Estado vigente (02/08).** A Lia opera somente em SP, com bloqueio rígido de UF, e o
> concierge manual está publicado em Production com `LIA_MANUAL_CONCIERGE=true`,
> `LIA_REQUIRE_REAL_COURIER_DISPATCH=true`, `PURCHASE_AUTOMATION_MODE=cart_only` e base do
> operador configurada. A conta Mercado Pago da aplicação `LIA - APP` foi confirmada pelo dono
> como PJ; a rotina fiscal do MEI está em [docs/rotina-fiscal-mei.md](docs/rotina-fiscal-mei.md).
> O dono opera a operação; não há contratação de operador agora. A validação com pedidos reais
> fica para quando ele considerar o sistema pronto e não é pendência de desenvolvimento.

> **Vitrine ampliada (02/08).** Por decisão do dono, as lacunas de demanda foram fechadas: a
> vitrine passou de **7.652 itens em 11 lojas** para **17.264 itens em 18 lojas**. Entraram
> Drogaria São Paulo (4.675), Pague Menos (1.540), Natural da Terra (1.000), Cobasi (998),
> Divvino (998), Imigrantes Bebidas (406) e Giuliana Flores (204) — todos com dados reais e CDN
> de imagem testado. Nas farmácias, a proibição de medicamento (ANVISA) virou **tripla guarda**:
> allowlist de categoria + deny-regex na colheita e `withoutMedicine` em runtime. A terceira foi
> necessária: a auditoria achou cetoconazol, metronidazol e ciclopirox classificados pela loja
> em categorias cosméticas. A mesma auditoria pegou o lado pet: Cobasi trazia 65 medicamentos
> veterinários e 56 dietas de prescrição; a Petz, 58 itens de "Nutrição Clínica". 227 itens
> removidos no total; `tests/anvisa-pharmacy.test.ts` trava as duas regras.
> Leroy Merlin não entrou: bloqueia fetch (403) e a imagem exige uma visita por produto.
> Detalhes em [AGENTS.md](AGENTS.md) e no [README das vitrines](src/lib/stores/README.md).

> **03/08 — Browserbase removido; catálogo com rotina mensal.** O navegador remoto saiu do
> produto inteiro: busca ao vivo, os 3 compradores automatizados, o lease de Context, o
> workflow de compra, as rotas de preflight/sessão viva do `/ops`, o cron de prewarm e as
> dependências `@browserbasehq/sdk`/`playwright-core`. Tudo isso já era código morto (atrás de
> `manualConciergeEnabled()` e de `PURCHASE_AUTOMATION_ENABLED=false`). A **Oba** deixou de
> depender dele: a API pública dela responde direto e virou catálogo de **1.494 itens**.
> Preço agora se atualiza por rotina mensal — `npm run catalog:refresh` (`--dry` simula),
> que recolhe as 10 lojas com API/SSR aberta e resume o que mudou. Suíte **210/210 verde**,
> `tsc`, lint e build limpos. Detalhes em [AGENTS.md](AGENTS.md).

> **03/08 — PUBLICADO.** Os 27 commits locais foram enviados ao GitHub e o deploy
> `dpl_BKzUbC4brKprMqrdMYJQ7QDnt5Kr` (commit `cf131f5`) ficou `READY` em Production.
> Smoke verificado: landing 200, `/ops` 200, webhook 403 (assinatura exigida) e as rotas
> Browserbase removidas respondendo 404 (`/api/cron/prewarm-search`,
> `/api/ops/internal-preflight`, `/api/ops/live-retailer-session`) — prova de que o código
> novo está no ar. Produção agora tem: 18 lojas (~17,4 mil itens), guardas ANVISA/MAPA em
> runtime, Oba com catálogo de 1.494 itens e zero Browserbase. O piloto pode começar.

> **03/08 — vitrine híbrida ligada.** A Lia deixou de só anotar: agora procura o pedido nas
> 18 lojas e mostra até 3 opções com foto para o cliente escolher; o que não tem match vira
> linha livre e o operador garimpa — a largura continua intacta. Três regras novas travam a
> qualidade: (1) **piso de relevância próprio do concierge** (`conciergeMatchIsStrong`) — no
> concierge um palpite errado é pior que nenhum, porque a linha livre resolve de verdade; o
> caso real que motivou foi "conserto de torneira" casando com "Espumante Concerto"; (2)
> **escolher não fecha a lista** — o cliente segue somando e só fecha com "só isso"; (3)
> **fechar com escolha pendente não descarta o item** — ele vira linha livre. Suíte 220
> testes (219 verdes; 1 flake de conexão do Postgres que passa isolado), `tsc`, lint e build
> limpos.

> **03/08 — One-Click reativado por decisão do dono.** O cartão nativo no WhatsApp (Meta
> Cloud API direta + Pagar.me) deixa de ser "adiado": a ativação começou. Código e migrations
> já estão em produção. Em 03/08 a Infobip NEGOU a habilitação. Em 04/08 o ticket foi aberto
> diretamente no Suporte da Meta (`37565409896407734`); em 05/08 a Meta o **encerrou com
> resposta padronizada**, sem análise e sem aceitar réplica. Não há porta self-serve: o
> One-Click fica **estacionado** até a GA ou um Solution Partner que habilite sem migrar o
> sender. A dúvida técnica do Pagar.me foi
> resolvida por documentação: `recurrence_cycle` é só de recorrência externa; o adaptador
> atual está correto e nenhum e-mail ao PSP é necessário. O piloto não espera:
> Pix + Checkout Pro cobrem cartão até lá. Plano completo e divisão do trabalho em
> [PENDENCIAS.md](PENDENCIAS.md) (seção One-Click) e [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).

> **05/08 — decisão do dono: cartão salvo SEM esperar a Meta.** "Se não vai ser automático,
> no mínimo deixa o cartão salvo" — redigitar cartão a cada compra é atrito inaceitável. O
> desenho aprovado reusa a infraestrutura One-Click já pronta (página `/cartao` com
> `tokenizecard.js` → Pagar.me, `PaymentCredential` tokenizada, cobrança idempotente por
> `PaymentAttempt`, webhook de reconciliação): a única troca é o gatilho da recompra — botões
> comuns de resposta do WhatsApp ("Pagar com cartão •••• 1234") em vez do `order_details`
> nativo da Meta, que segue estacionado atrás de `LIA_ENABLE_WA_PAYMENTS`. Flag nova e
> independente (`LIA_ENABLE_SAVED_CARD`), desligada até o sandbox validar com as chaves
> Pagar.me (criação da conta segue sendo ação do dono). Recusa/indisponibilidade cai no
> Checkout Pro, que permanece como fallback permanente.

> **Como ler este arquivo.** `[x]` é concluído; `[ ]` é trabalho ainda necessário no caminho
> atual; `[~]` é adiado, opcional, risco aceito ou referência do fluxo legado. O arquivo antigo
> continha dezenas de tarefas da automação por varejista, One-Click e expansão; elas continuam
> registradas para referência, mas não bloqueiam o concierge manual em SP.

## Como usar

- **P0:** bloqueia aceitar pedidos pagos ou pode causar perda financeira, jurídica ou operacional.
- **P1:** necessário para o lançamento público.
- **P2:** melhoria posterior; não deve atrasar a operação inicial em SP.
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
- [~] Fluxo completo cotar → cobrar → comprar → entregar validado com pedido real pelo operador;
  validação real fica para quando o dono declarar o sistema pronto.
- [ ] Operação, jurídico e pós-venda aprovados para lançamento público.

## P0 — antes de aceitar pedidos pagos em São Paulo

### Concierge manual — prioridade vigente

- [x] Implementar a jornada livre: lista → `awaiting_operator_quote` → cotação no `/ops` →
  aprovação → Pix/cartão → compra → despacho pela base do operador → entrega. Coberta por testes
  focados, copy e demonstração local mockada em 21/07.
- [x] Criar o kit de operação: botão único **“Comprei — despachar motoboy”** e
  [runbook de uma página](docs/operador-runbook.md).
- [x] Definir quem opera o piloto: decisão do dono em 02/08 — **ele mesmo opera** os
  primeiros pedidos (cotação, compra e despacho no `/ops`). Contratação de operador fica
  para depois do piloto, se houver volume.
- [x] Separar/concluir a migration Oba inacabada e publicar o concierge em deploy limpo. Não
  misturar a publicação com o trabalho paralelo do Oba.
- [x] Limpar os preflights internos sem pagamento de Production após autorização explícita:
  12 removidos; 7 pedidos pagos foram preservados para conciliação/estorno.
- [~] (Opcional, após a prontidão) Registrar pedidos reais, tempo de cotação, margem depois do
  frete, falhas e satisfação. Essa validação é decisão do operador e não bloqueia o código.
- [x] Falhar fechado quando produção Meta não tiver despacho real do courier; o modo mock permanece
  disponível somente para testes locais.
- [x] Bloquear a publicação de cotação de motoboy quando a base do operador não tiver endereço e
  CEP configurados; a checagem também é repetida no despacho.
- [x] Configurar e conferir `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` em
  Production antes de liberar o botão de despacho real; variáveis Sensitive, redeploy
  `dpl_5kTpBbsitN6BgP5vcQrDh22AfqP4`.

### Cotação e cobrança

- [x] No concierge manual, o operador cota produtos, frete, modalidade e prazo antes de a Lia
  cobrar; o cliente só recebe Pix/cartão depois da cotação. O checkout automatizado por varejista
  continua legado e não é caminho crítico.
- [x] Mostrar no WhatsApp resumo da cotação, endereço, modalidade, prazo, total e validade. Coberto
  por `opsPublishManualQuote` e `tests/manual-concierge.test.ts`.
- [x] Implementar expiração curta da cotação e impedir pagamento de cotação vencida. O teste do
  concierge confirma que uma cotação vencida é cancelada sem liberar cobrança.
- [x] Revalidar antes da compra: no fluxo manual, qualquer alteração de item/preço/frete/prazo
  exige nova cotação do operador; o runbook bloqueia substituição automática e compra sem conferência.
- [x] Política de divergência: item faltante ou preço alterado não é substituído automaticamente;
  o operador avisa, recota ou estorna o item conforme o procedimento documentado.
- [x] Garantir idempotência entre pedido, cobrança e despacho. O pedido aberto é reutilizado, a
  emissão usa atualização condicional, pagamentos/provedores usam suas chaves e o despacho repetido
  retorna o despacho existente. Coberto por teste do concierge.
- [x] Impedir nova tentativa automática quando o resultado financeiro for incerto; a regra está
  no runbook de `needs_human` e nos guards de compra.

### Compra segura

- [x] Manter produção com `PURCHASE_AUTOMATION_MODE=cart_only`.
- [x] Não armazenar cartão, CVV, senha ou credenciais do varejista no banco/documentação.
- [x] Exigir confirmação explícita no momento de qualquer compra final: o cliente escolhe Pix/cartão
  após a cotação e o operador só pode marcar a compra depois de o pedido estar `paid`.
- [x] Tratar login, OTP, CAPTCHA, CVV e 3DS como `needs_human`. A detecção Carrefour
  cobre login/sessão expirada, CAPTCHA e 3DS; os testes unitários confirmam a classificação.
- [x] Implementar fila ou isolamento por conta/Context Browserbase para impedir carrinhos
  concorrentes. O lease persistente por Context bloqueia mistura de carrinhos entre workers;
  `RETAILER_BUSY` volta a `preflight_queued` e o workflow tenta de novo a cada minuto por até
  uma hora. Leases vencidos só podem ser retomados após 15 min, e testes unitários cobrem
  concorrência, expiração e falha de infraestrutura.
- [~] Validar recuperação segura quando a sessão Browserbase expirar. Isso pertence ao fluxo legado
  `LIA_MANUAL_CONCIERGE=false`; o concierge atual não usa Browserbase no caminho crítico. Em 16/07 foi
  implantada uma rota autenticada e página operacional que criam uma sessão viva do mesmo
  Context para login humano. Em 19/07, a autenticação remota foi explicitamente bloqueada
  pelo Carrefour; não repetir nem tentar contornar. Reavaliar este critério por varejista,
  começando pela sessão Petz já validada.
- **Decisão do dono em 02/08:** as rotações de credenciais abaixo foram **abandonadas como
  gate de piloto** ("esquece isso"). Os itens permanecem registrados como risco conhecido e
  aceito; nenhuma rotação foi executada. Reabrir somente por novo pedido explícito ou
  incidente.
- [~] Rotacionar todas as credenciais que já tenham sido expostas em conversas e atualizar
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
- [~] Rotacionar a senha Carrefour exposta no chat em 16/07. Não persistir o valor em
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
- [~] Rotacionar o PIN de registro do WhatsApp que estava salvo em um Markdown local
  ignorado pelo Git. O valor foi removido em 16/07; guardar o novo somente no cofre de
  segredos, nunca em Markdown, chat ou logs.

### Financeiro, fiscal e jurídico

- [x] Confirmar que a conta Mercado Pago PJ está apta ao modelo e aos volumes previstos;
  decisão tomada: recebimento e operação financeira serão sempre na PJ. **02/08:** o dono
  confirmou no painel do Mercado Pago que a aplicação `LIA - APP` em Produção está vinculada
  à conta PJ. As variáveis `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_URL` e
  `MERCADO_PAGO_WEBHOOK_SECRET` já existem na Vercel Production. A rotação de credenciais
  expostas permanece registrada separadamente como risco aceito.
- [x] Decisão operacional de titularidade: a PJ/MEI é a compradora/titular da operação perante
  o cliente e o varejista. Não há obrigação de contratar contador fixo.
- [ ] Definir o tratamento de compras para destinatários diferentes usando uma conta central.
  Esta é uma decisão jurídica/comercial do dono; não vou inventar a política.
- [ ] Validar nos termos dos varejistas se o uso operacional da conta central é permitido.
  Esta confirmação depende de consulta/aceite externo e não é resolvida por código.
- [x] Regra de pós-venda: antes do pagamento, o cliente pode limpar a lista; depois do pagamento
  não há cancelamento iniciado pelo cliente nem substituição; item faltante gera estorno do
  próprio item; atraso é comunicado ao cliente.
- [x] Fechar o procedimento operacional e o registro de estorno parcial por item. O operador
  executa o estorno no provedor, informa valor (integral ou parcial) e referência no `/ops`, e
  só então o cliente é avisado; o estorno integral continua excepcional. Runbook e UI atualizados.
- [x] Responsabilidade de comunicação por atraso: avisar o cliente assim que a Lia souber do
  atraso, sem prometer compensação ou substituição.
- [x] Documentar a rotina fiscal da Lia. Decidido e documentado em 02/08 em
  [docs/rotina-fiscal-mei.md](docs/rotina-fiscal-mei.md): enquadramento de serviço de
  intermediação; NF do produto é a do varejista; NFS-e pelo Emissor Nacional só quando PF
  pedir ou cliente for PJ; rotina mensal DAS + relatório de receitas + DASN anual. Resta uma
  confirmação contábil pontual pré-lançamento público (receita bruta = markup ou total).

### Cartão One-Click no WhatsApp — REATIVADO por decisão do dono (03/08)

> **Decisão de 03/08:** o dono quer o One-Click ativo o quanto antes ("vamos fazer isso").
> O desenho continua o canônico: Meta Cloud API direta + Pagar.me V5, sem 360dialog. O código
> e as migrations já estão em produção. **A Infobip respondeu NÃO** — essa rota para a
> allowlist morreu; a rota vigente é o Suporte Direto da Meta (ticket pedindo a habilitação
> da Payments API BR na WABA, sem migração de sender). O piloto NÃO espera por isso: Pix +
> Checkout Pro cobrem o cartão enquanto isso.
>
> **Pergunta técnica ao Pagar.me RESOLVIDA por documentação (03/08), sem e-mail:**
> `recurrence_cycle=first|subsequent` marca transações de **recorrência externa** (assinatura
> gerida fora do motor Pagar.me) e é opcional — "não cria uma cobrança recorrente". A recompra
> da Lia é **avulsa, iniciada e confirmada pelo cliente** no WhatsApp: o campo não se aplica e
> **o adaptador atual (`card_id` sem `recurrence_cycle`) está correto como está**. A regra de
> "CVV só na primeira" também é do contexto de recorrência; para cobrança avulsa com `card_id`
> a doc não exige CVV (one-click-buy é caso de uso documentado) — o comportamento do antifraude
> é o que o sandbox valida. A liberação do domínio para o `tokenizecard.js` é feita pelo
> próprio dashboard (configurações da conta), sem e-mail. Contatos humanos, se precisar:
> `relacionamento@pagar.me` (geral, seg–sex 9h–18h, tel 4004-1330) e `homologacao@pagar.me`
> (fase de homologação); chat no dashboard após criar a conta.

- [x] **(dono)** Abrir ticket no Suporte Direto da Meta pedindo a habilitação da **Payments
  API BR** na WABA `Lia Delivery` (+55 11 97844-4813), mantendo Cloud API direta, sem migração
  de sender. Concluído em 04/08: protocolo **`37565409896407734`**, status inicial **Open**,
  assunto **Dev: Cloud API** e tipo **Messages API and Webhook**, no Business ID
  `1802515380110705`. O formulário não aceitou português; a solicitação equivalente foi enviada
  em inglês. [Registro do chamado](https://business.facebook.com/direct-support/case-detail/37565409896407734/?business_id=1802515380110705).
  **Desfecho em 05/08:** a Meta **encerrou o chamado no mesmo dia**, com resposta padronizada
  (triagem "STANDARD" + documentação antiga de On-Premises), sem analisar a arquitetura da
  Lia; o caso está **Closed** e não aceita réplica. Conclusão: **não existe porta self-serve**
  para a Payments API BR em Cloud API direta hoje. Frente **estacionada** aguardando (a) GA da
  API ou (b) Solution Partner que patrocine a habilitação **sem migrar o sender** e confirme o
  Pagar.me como PSP participante. O piloto segue com Pix + Checkout Pro; reavaliar na rotina
  mensal.
  Rota Infobip: **negada** em 03/08.
  **Expectativa verificada em 03/08 (ser honesto):** a Payments API BR está em **beta
  fechado/disponibilidade limitada** — a Meta escolhe quem entra ("select customers", doc da
  Sinch) e as habilitações documentadas passam por BSPs abrindo ticket pelos clientes (doc da
  Exotel). Para uma empresa em Cloud API direta, o Suporte Direto é a única porta self-serve —
  o ticket é barato e vale abrir, mas **a chance de aprovação de um MEI em beta fechado é
  baixa no curto prazo e não há prazo**. Pré-requisito adicional descoberto: a WABA precisa de
  **Meta Product Catalog vinculado** (doc da CM.com). Plano B vigente: cartão continua no
  Checkout Pro até a Payments API BR virar disponibilidade geral; reavaliar a cada ciclo.
- [ ] **(dono)** Criar/ativar conta Pagar.me PJ, emitir as chaves e liberar o domínio
  `liadelivery.com.br` para o `tokenizecard.js` no dashboard (Configurações da conta).
  Nenhum e-mail é necessário; `homologacao@pagar.me` só se a homologação travar.

- [x] Aplicar as migrations `20260714110000_whatsapp_one_click_payments` e
  `20260714123000_pagarme_one_click` no ambiente de produção. Aplicadas em 15/07;
  a ativação do One-Click continua bloqueada pelas dependências externas abaixo.
- [x] Enviar em 18/07 a solicitação técnica a Samuel Santana/Infobip e ao Customer Success
  (`success@infobip.com`), com a exigência de preservar WABA, número, Cloud API/Graph API e
  webhook, sem migração/compartilhamento de sender/BSP sem autorização separada.
- [x] Encerrar a rota Infobip: a resposta de 03/08 foi negativa para a habilitação; não criar
  conta de teste, migrar sender nem manter essa frente como gate. A rota vigente é o chamado
  direto à Meta `37565409896407734`.
- [~] Obter a allowlist da Payments API BR para a WABA brasileira na Meta e confirmar o
  shape definitivo do webhook de confirmação. Ticket `37565409896407734` aberto em 04/08 e
  **encerrado pela Meta em 05/08 com resposta padronizada**, sem análise. Frente estacionada
  até GA ou Solution Partner patrocinador (sem migração de sender, Pagar.me como PSP).
- [~] Confirmar por escrito se Mercado Pago PJ é suportado nesse desenho, quem gera o
  `credential_id`, custos/mínimos, prazo de onboarding e se algum BSP precisa assumir a
  WABA ou o número. Não substituir o desenho Pagar.me já implementado sem essa evidência.
- [~] Configurar Pagar.me V5: chaves, domínio liberado para `tokenizecard.js`, webhook e
  os eventos de pedido/cobrança/cartão descritos no guia.
- [x] Resolver a classificação `recurrence_cycle`: a documentação Pagar.me confirma que o
  campo representa recorrência externa e é opcional; a recompra da Lia é avulsa e iniciada
  pelo cliente, portanto o adaptador atual (`card_id` sem `recurrence_cycle`) está correto.
  CVV/3DS e antifraude continuam sendo validados no sandbox da conta antes da ativação.
- [~] Executar primeira compra e recompra reais em sandbox; verificar CVV/3DS, recusa,
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
- [~] Validar ao vivo os novos estados de entrega direta e o fluxo de estorno no `/ops`,
  sem usar pedidos legados como massa de teste. Implantação em produção confirmada em 18/07.
- [x] Registrar eventos suficientes para auditar cada transição sem expor dados sensíveis. O `/ops`
  agora acrescenta eventos de compra, despacho, entrega, estorno e valor/referência do estorno às
  notas operacionais, sem guardar segredos ou dados de cartão.

## Referência legada — automação por varejista (não bloqueia o concierge manual)

### Petz

- [x] Conta persistente autenticada no Browserbase.
- [x] Endereço reconhecido no checkout.
- [x] Busca, produto, sacola, frete e prazo validados ao vivo.
- [x] Checkout alcançado sem finalizar compra.
- [~] Portar para Petz a orquestração de cotação antes da cobrança, com validade curta,
  hash de itens/total/frete/prazo e falha fechada.
- [~] Executar pedido técnico Petz em `cart_only` e validar o resumo no WhatsApp e no `/ops`,
  sem cobrança ou compra. Em 19/07 o job técnico chegou ao SKU/preço/subtotal reais, mas a sacola
  completa não mostrou frete/prazo no Context; investigar a etapa de entrega antes do retry.
- [~] Testar cartão salvo e verificar quando CVV/3DS/antifraude são exigidos.
- [~] Testar Pix do varejista apenas para entender o fluxo; não misturar com o Pix pago à
  Lia sem desenho financeiro explícito.
- [~] Validar rastreio e comunicação pós-compra da entrega Petz.
- [~] Executar primeiro pedido controlado entregue pela própria Petz.

### Carrefour

- [x] Busca ao vivo com URL e preço reais.
- [x] Automação de carrinho preparada.
- [x] Registrar o bloqueio da autenticação remota: em 19/07 o Carrefour recusou a sessão
  Browserbase por política de segurança, apesar da configuração de runtime estar válida.
- [~] Obter API/parceria oficial ou confirmação de um ambiente autorizado antes de retomar
  automação de autenticação/checkout. Até lá, manter essa frente pausada e sem contorno de WAF.
- [x] Rejeitar o fallback de handoff: por decisão do operador em 19/07, o cliente não receberá
  links nem concluirá a compra no Carrefour; a Lia deve manter a experiência ponta a ponta.
- [~] Desenhar um teste Carrefour com operação humana invisível no navegador comum, sem automação,
  apenas como ponte interna e sem tratá-lo como solução de escala.
- [~] Avaliar um modelo Carrefour com shopper próprio/controlado comprando na loja física e entrega
  posterior, incluindo cotação final, substituições, pagamento, NF, cadeia fria e logística.
- [~] Preparar proposta comercial Carrefour com escopo explícito de catálogo, estoque por região,
  simulação de frete/prazo, criação de carrinho/pedido, pagamento, webhook e pós-venda. Marketplace
  Seller e API merchant do iFood não atendem a esse escopo de compra do consumidor.
- [~] Não testar endpoints internos VTEX/Carrefour, automação local, extensão, proxy residencial ou
  fingerprint como substitutos do Browserbase sem autorização escrita do varejista.
- [~] Validar ao vivo o checkout com endereço, estoque, frete e prazo.
- [~] Confirmar separadamente o fluxo de Carrefour alimentar e não alimentar.
- [~] Validar pagamento, antifraude, nota fiscal, rastreio e entrega direta.
- [~] Executar primeiro pedido controlado entregue pelo próprio Carrefour.

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
- [~] Implementar primeiro o conector Oba em `cart_only`, usando seleção regional antes da sacola e
  falha fechada quando um item do catálogo não tiver estoque para o CEP. Validar persistência,
  checkout, total final e promessa selecionada sem abrir pagamento.
- [~] Confirmar com o Oba uma rota comercial para concierge/automação; o canal oficial de WhatsApp
  torna a conversa plausível, mas não é autorização automática.
- [~] Manter Mambo como fallback regional após o Oba. O núcleo público funciona, mas os termos
  publicados vinculam conta individual ao CPF e proíbem compartilhamento; não usar conta central
  em piloto sem validação comercial/jurídica.
- [~] Manter Savegnago como candidato regional e confirmar cobertura do CEP do piloto antes do teste.
- [~] Avaliar Pão de Açúcar em sessão descartável antes de criar Context persistente; a home pública
  respondeu `200`, mas emitiu cookies específicos de bot management.
- [~] Depriorizar St. Marche enquanto o Grupo Hortus estiver em recuperação judicial; não construir
  dependência operacional sem reavaliar continuidade e eventual aquisição pela Cencosud.

### Cobasi e Leroy Merlin — candidatos ainda não integrados

- [x] Validar em 20/07 o fluxo público da Cobasi até o login: produto real, sacola, CEP público,
  frete, prazo e total; a sacola técnica foi limpa, sem login, pagamento ou pedido.
- [x] Validar em 20/07 o fluxo público da Leroy até o login: produto vendido e entregue pela
  Leroy, CEP público, entrega domiciliar, frete, prazo e total; a sacola técnica foi limpa, sem
  login, pagamento ou pedido.
- [~] Implementar e validar primeiro o conector Cobasi em `cart_only`, com Context isolado,
  revalidação e falha fechada sem estoque/frete/prazo/total.
- [~] Só avaliar conector Leroy após Cobasi; restringir produtos a “Vendido e entregue por Leroy
  Merlin” e obter validação comercial/termos antes de qualquer piloto.
- [~] Não priorizar Sephora: a sessão pública não chegou à sacola/checkout de modo estável.

### Boticário

- [x] Busca ao vivo com URL e preço reais.
- [x] Automação de carrinho preparada.
- [x] Reexecutar a cobertura automatizada em 19/07: suíte de 210 testes sem falhas, com 168 aprovados
  e 42 integrações de banco puladas por indisponibilidade externa.
- [~] Estender o comprador para capturar frete e promessa de entrega; hoje ele valida apenas
  SKU/quantidade/subtotal e não satisfaz a cotação antes da cobrança.
- [~] Validar ao vivo o checkout com endereço, estoque, frete e prazo em ambiente Browserbase
  configurado. Em 19/07 o ambiente confirmou SKU/quantidade/subtotal reais, mas a loja não expôs
  a confirmação de CEP para calcular frete/prazo; o job falhou fechado sem cobrança ou compra.
- [~] Validar titularidade, pagamento, antifraude, nota fiscal e entrega direta.
- [~] Validar rastreio e comunicação pós-compra.
- [~] Executar primeiro pedido controlado entregue pelo próprio Boticário.

## P1 — qualidade para lançamento público

### Conversa e experiência do cliente

- [x] Ajustar a conversa para pedir endereço completo uma vez e sempre confirmá-lo no resumo
  do pedido. O onboarding exige rua/número + CEP e a cotação manual repete o endereço.
- [~] Não mostrar produto sem URL real, preço atual e possibilidade de montar carrinho.
  Regra do fluxo legado de catálogo; o concierge manual envia a cotação do operador.
- [x] Resolver ambiguidades de tamanho, sabor, cor, quantidade e substituição antes da
  cobrança.
- [x] Informar claramente quem entrega e nunca prometer “hoje” sem cotação ao vivo. A cotação
  manual mostra modalidade e prazo; a promessa de hoje só aparece quando o operador informa.
- [x] Criar mensagens para produto indisponível, mudança de preço, atraso, falha de compra
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
- [x] Criar testes de idempotência, cotação vencida, preço alterado e pagamento duplicado.
  O concierge cobre cotação vencida e despacho repetido em `tests/manual-concierge.test.ts`;
  o fluxo legado cobre hash/preço, duplicidade One-Click e expiração da tentativa de pagamento.
- [x] Criar testes unitários do payload Meta, parser, idempotência Pagar.me e resposta
  ambígua do PSP. Os testes de banco aguardam as migrations em um Postgres de teste.
- [x] Criar testes de queda do Browserbase, varejista indisponível e sessão expirada.
  `tests/carrefour-buyer.test.ts` cobre erro Browserbase 401/503, indisponibilidade exibida
  pelo varejista e sessão expirada; os casos falham fechados sem checkout.
- [~] Medir latência p50/p95 por varejista; meta inicial de 15–30 s para cotação completa. É
  métrica do fluxo legado por varejista, não do concierge manual atual.
- [ ] Configurar alertas para falha de webhook, cobrança, carrinho, compra e estorno.

### Validação real e lançamento público (decisão do operador)

- [~] Definir grupo, limite de pedidos, ticket máximo, região e horário da primeira validação;
  fica para quando o dono decidir iniciar a validação real.
- [~] Rodar de 5 a 10 pedidos concierge controlados, com compra manual e acompanhamento humano,
  quando o operador decidir validar.
- [~] Registrar sucesso, tempo, margem, falhas, estornos e satisfação de cada pedido.
- [~] Corrigir todos os incidentes financeiros P0 encontrados no piloto.
- [ ] Aprovar checklist final de operação, jurídico, financeiro e suporte.
- [ ] Definir critérios objetivos de `go/no-go` para abrir ao público.

## P2 — expansão depois da prontidão inicial (adiado)

- [~] Obter parceiro local ou contrato merchant/courier que autorize retirada por terceiro
  para oferecer same-day fora da entrega do varejista.
- [~] Reavaliar Uber Direct somente para parceiros com autorização operacional formal.
- [~] Criar pool de contas/Contexts isolados para aumentar concorrência por varejista.
- [~] Avaliar novas lojas usando o mesmo gate: busca real, carrinho, entrega, termos,
  pagamento e pós-venda.
- [~] Automatizar conciliação financeira e cálculo de margem por pedido.
- [~] Criar painel de SLA por loja e modalidade de entrega.

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
