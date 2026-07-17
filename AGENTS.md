# Lia — contexto obrigatório para agentes

_Última atualização: 2026-07-16._

Leia este arquivo antes de planejar, responder sobre o estado do produto ou alterar o
projeto. Ele é a memória canônica curta da Lia. Para detalhes, leia também:

1. [STATUS.md](STATUS.md) — estado técnico e operacional;
2. [PENDENCIAS.md](PENDENCIAS.md) — checklist canônico de progresso e lançamento;
3. [docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md) —
   evidências e decisão operacional vigente;
4. [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md) — canais e piloto;
5. [docs/automacao-compra-carrefour.md](docs/automacao-compra-carrefour.md) — automação
   segura de compra;
6. [CLAUDE.md](CLAUDE.md) — histórico de arquitetura e decisões.

Em caso de conflito, prevalece a decisão mais recente documentada neste arquivo e no
registro de 14/07/2026. Não ressuscite uma premissa histórica sem nova evidência.

## O produto

A Lia é uma concierge de compras pelo WhatsApp. O cliente descreve o que quer, a Lia busca
produtos reais, monta uma sacola no varejista, calcula preço/frete/prazo, cobra por Pix ou
cartão, revalida e compra sob política controlada. Pix e o fallback de cartão usam Mercado
Pago; o cartão de recompra nativo no WhatsApp usa Pagar.me + Cloud API direta da Meta.

O fluxo principal vigente é **entrega feita pelo próprio varejista ao cliente**.

“Entrega hoje” só pode ser prometida quando:

- o próprio varejista oferecer same-day no checkout; ou
- existir parceiro/merchant que autorize formalmente retirada por courier.

## Decisão que não pode ser esquecida

A premissa antiga abaixo foi invalidada em 14/07/2026:

> comprar numa conta central por clique-e-retire e mandar qualquer motoboy buscar.

Por quê:

- Petz exige, na retirada por terceiro, documento de quem retira e documento original do
  titular, além de aguardar liberação do pedido;
- Carrefour não alimentar exige documentos do terceiro/titular, token e pode usar
  biometria;
- Carrefour alimentar exige autorização assinada e documentos do terceiro/titular;
- Uber Direct funcionar tecnicamente não autoriza o balcão a liberar uma compra de
  consumidor e o uso para varejista terceiro precisa de validação comercial.

Consequência: Uber Direct permanece como conector opcional para parceiros compatíveis, não
como fulfillment padrão. Não enviar documentos pessoais a entregadores on-demand.

Fontes e detalhes:
[docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md).

## Fluxo-alvo vigente

1. Cliente informa itens e endereço no WhatsApp.
2. Lia busca opções reais e resolve ambiguidades.
3. Lia monta uma sacola temporária antes de cobrar.
4. O checkout do varejista determina estoque, preço, frete, modalidade e prazo para o CEP.
5. Lia mostra a cotação com validade curta.
6. Cliente paga a Lia por Pix, Checkout Pro ou, quando habilitado, One-Click nativo no
   WhatsApp com Pagar.me.
7. Lia revalida itens, total, endereço e prazo.
8. Compra segue em `cart_only`/aprovação explícita durante o piloto.
9. Varejista entrega; Lia acompanha e comunica o cliente.

O comportamento legado que cobra primeiro e só monta a sacola depois deve ser invertido.

## O que foi validado de verdade

### Petz

- conta autenticada em Context persistente do Browserbase;
- endereço salvo e reconhecido pelo checkout;
- busca, produto, sacola, frete e prazo reais;
- checkout alcançado sem finalizar compra;
- formas vistas: cartão, Pix, NuPay, Click to Pay e boleto;
- modalidades vistas: padrão, expressa, agendada e retirada, variáveis por CEP/horário;
- opção de salvar cartão para compras futuras;
- botão financeiro final identificado como `Pagar agora`;
- nenhuma compra foi finalizada.

No teste noturno de 14/07/2026 em São Paulo, a menor promessa domiciliar era o dia
seguinte. Isso não é SLA: sempre cotar ao vivo.

### Busca e carrinho

- Carrefour, Petz e Boticário têm busca ao vivo com links/preços reais;
- Petz e Boticário usam cache curto de 15 minutos;
- produção falha fechada: sem URL/preço real, não mostrar opção;
- compradores Petz/Boticário montam e revalidam carrinhos em Browserbase;
- carrinhos antigos são limpos pelos conectores antes de um novo preflight;
- o job persiste o ID da sessão para revalidação, não credenciais/cartão;
- cada Context Browserbase é isolado por um lease persistente no banco: o workflow enfileira
  conflitos como `RETAILER_BUSY`, tenta novamente a cada minuto por até uma hora e nunca mistura
  carrinhos. Leases abandonados expiram em 15 minutos; falhas de banco/configuração não são
  disfarçadas como fila. A regressão é coberta em `tests/purchase-context-lease.test.ts`.

### Cotação Carrefour antes da cobrança

- **Implementado em código em 15/07:** com a automação Carrefour habilitada, a Lia cria
  a cotação pendente, monta o carrinho em `cart_only` e só mostra Pix/cartão após o
  checkout expor total, frete e promessa de entrega do varejista;
- a cotação expira em 5 minutos por padrão, exige escolha explícita de Pix/cartão depois
  do resumo e libera o Context se vencer ou for cancelada;
- o checkout falha fechado para `needs_human` se não expuser itens, total, frete ou prazo;
- migrations aplicadas e versão implantada em produção em 15/07/2026;
- em 16/07, a UI atual foi mapeada ao vivo: o modal de CEP fecha pelo botão
  `button[type=submit]` (Enter não fechou), e frete/prazo aparecem no carrinho completo,
  não no minicarrinho. Para o SKU técnico, a tela mostrou item R$ 1,99, frete a partir de
  R$ 9,90, prazo a partir de sábado e total R$ 11,89, além do mínimo de R$ 30. Isto valida
  seletores/parsers da UI, não o workflow Browserbase;
- o conector foi alterado para abrir o carrinho completo, ler rótulos/valores em linhas
  separadas, capturar `orderFormId`, limpar carrinho antigo pelo checkout e diagnosticar o
  campo faltante. TypeScript, lint, 8 testes Carrefour, a suíte de 203 testes (161 passaram,
  42 dependentes do banco foram pulados) e build passaram;
- após deploys e retries controlados, o workflow avançou por CEP ausente, regionalização,
  falso positivo de login e carrinho antigo; o bloqueio final verdadeiro é
  `LOGIN_REQUIRED` no Context persistente. Foi criada e aberta uma sessão viva para login
  humano. **A validação Browserbase de estoque, frete, prazo, cartão e 3DS continua pendente.**
  Não tratar o mapeamento da UI como evidência de cobertura ou cotação operacional.
- após a reautenticação humana em 16/07, o preflight confirmou que o login passou, mas o
  minicarrinho não expôs seu CTA para o carrinho completo (`MANUAL_ACTION_REQUIRED`). O
  conector passou a abrir somente a rota de resumo `/checkout/cart` como fallback seguro.
  A publicação inicial via artefato pré-construído revelou incompatibilidade do Prisma gerado
  no macOS com o runtime Linux ARM da Vercel; `linux-arm64-openssl-3.0.x` foi incluído nos
  `binaryTargets`, o artefato foi reconstruído e a produção ficou `Ready` em 16/07. O POST
  do preflight voltou a responder 200, mas o workflow atual falhou fechado em `LOGIN_REQUIRED`;
  uma nova sessão viva foi aberta para login humano. Nenhuma ação financeira foi executada.
- Ainda em 16/07, o painel Browserbase foi acessado com sucesso e uma sessão Carrefour nova foi
  aberta, mas a reautenticação humana não foi concluída. O operador pediu para pausar e tentar
  em outro momento. Não abrir novas sessões nem repetir o preflight até a próxima tentativa
  coordenada; o motivo da falha não foi confirmado. Nenhuma ação financeira foi executada.

### Pagamentos e canal

- Mercado Pago Pix e Checkout Pro estão integrados;
- WhatsApp Meta Cloud API está ativo em produção;
- domínio de produção: `https://liadelivery.com.br`;
- confirmar situação PJ/NF do Mercado Pago antes do lançamento público;
- Pix e Checkout Pro do Mercado Pago permanecem o caminho ativo.
- O One-Click BR (Meta Cloud API direta + Pagar.me) está implementado, mas permanece
  desligado até a allowlist da Meta, chaves/domínio/webhook Pagar.me e migrations serem
  configurados. Não depende de 360dialog. Ver
  [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).
- Em 16/07, Samuel Santana, da Infobip, respondeu sobre `order_details` /
  `offsite_card_pay` com Mercado Pago PJ e pediu volume, categoria das mensagens, países e
  canais para encaminhar a oportunidade. A Infobip documenta WhatsApp Payments no Brasil e
  orienta acionar gerente/suporte, portanto o contato é uma via plausível de habilitação.
  Isso ainda é somente qualificação comercial: não confirma elegibilidade, compatibilidade
  do Mercado Pago, geração de `credential_id`, custos ou preservação da WABA/número. O
  onboarding padrão da Infobip também contempla registrar/migrar o sender para a API deles;
  a resposta deve exigir explicitamente Cloud API direta, Graph API/webhook atuais e nenhum
  compartilhamento ou migração de BSP sem autorização separada.
- A revisão da documentação Pagar.me V5 em 16/07 confirmou `tokenizecard.js`, domínio
  liberado e cobrança por `card_id`, mas também expôs um gate a confirmar com o PSP: a API
  distingue `recurrence_cycle=first|subsequent` e orienta CVV apenas na primeira transação
  de recorrência externa. O adaptador atual usa `card_id` sem marcar o ciclo. Isto não é
  falha validada ao vivo, mas precisa de resposta do Pagar.me e eventual ajuste/teste antes
  do sandbox real e antes de ligar a flag.

### Deploy e testes

- produção foi implantada e estava `Ready` após as mudanças de busca/carrinho;
- `npx tsc --noEmit` passou;
- testes focados de compra/busca/política passaram;
- em 15/07, os evals foram alinhados ao onboarding de endereço completo e `npm test` passou
  integralmente (201 testes). O build local de produção também passou; isso não substitui
  validação ao vivo de checkout ou piloto.
- em 16/07, a operação de entrega direta foi implementada localmente com estados explícitos
  `retailer_preparing` e `retailer_out_for_delivery`. O `/ops` agora mostra modalidade,
  promessa e rastreio do varejista, bloqueia courier externo em `retailer_delivery` e mantém
  os estados antigos apenas para parceiros formalmente autorizados. Cancelamento pago virou
  fluxo auditável `refund_pending -> refunded`: a confirmação ao cliente só ocorre depois de
  registrar a referência real do provedor. O runbook de `needs_human`/estorno está em
  `docs/operacao-piloto-needs-human-estorno.md`. TypeScript, lint, 210 testes (168 passaram,
  42 dependentes do banco foram pulados) e build passaram. Alteração ainda não implantada nem
  validada ao vivo.

## Segurança e limites financeiros

- Produção deve permanecer com `PURCHASE_AUTOMATION_MODE=cart_only` até piloto auditado.
- Nunca clicar no botão final de compra sem confirmação explícita no momento da ação.
- Nunca repetir automaticamente um clique financeiro quando o resultado for incerto.
- CAPTCHA, OTP, login, CVV e 3DS viram `needs_human`; não burlar desafios.
- O hash que protege uma aprovação deve incluir itens, total, frete e promessa de entrega;
  uma mudança em qualquer um deles invalida a aprovação anterior.
- Não guardar número de cartão ou CVV. O Pagar.me recebe os dados diretamente pelo
  `tokenizecard.js`; a Lia persiste somente IDs tokenizados, últimos quatro dígitos e o
  registro de consentimento necessários para a recompra.
- Não pedir cartão pelo chat. O usuário digita dados financeiros diretamente no checkout
  seguro do provedor/varejista.
- Um PIN de registro do WhatsApp estava salvo em um Markdown local ignorado pelo Git. O valor
  foi removido em 16/07; ele deve ser rotacionado e mantido apenas no cofre de segredos antes
  do piloto. Não registrar PINs em Markdown, chat ou logs.
- Credenciais já expostas em chats ou em diagnósticos locais devem ser rotacionadas e
  atualizadas na Vercel. Em 15/07, uma saída de diagnóstico incluiu credenciais de
  Browserbase/Vercel: tratá-las como expostas e rotacioná-las antes do piloto. O token OIDC
  local da Vercel foi renovado em 15/07 sem expor valores; ainda falta regenerar a chave
  Browserbase e atualizar os ambientes que a consomem. Em 15/07 foi aberta uma sessão
  persistente do Context Carrefour somente para reautenticação manual; não houve carrinho,
  checkout ou cobrança. Uma chave Browserbase de reposição foi colada em conversa em 15/07:
  ela também é exposta, não deve ser configurada mesmo com autorização posterior e precisa
  ser regenerada novamente. A validação da variável puxada de produção retornou
  `401 Missing x-bb-api-key`; não abrir novo preflight antes de configurar chave válida na
  Vercel e implantar. Em 15/07 a URL de Environment Variables da Vercel foi aberta no
  navegador embutido, mas exigiu login manual na conta Vercel antes da configuração. Após
  uma tentativa de salvar somente em Production, uma nova leitura de `vercel env pull`
  ainda não trouxe valor para `BROWSERBASE_API_KEY`; conferir no painel que a edição foi
  realmente salva com um valor não vazio antes de implantar. A tela de edição revelou em
  seguida um valor com prefixo `sk_live_`, que não é uma chave Browserbase (`bb_live_`):
  não implantar até substituir pelo segredo Browserbase correto e marcá-lo como Sensitive.
  Uma segunda leitura do Production após a alegada correção continuou sem a variável; o
  deploy e o preflight Carrefour permanecem bloqueados. Posteriormente, o painel confirmou
  `BROWSERBASE_API_KEY` como Sensitive, Production e "Updated just now"; um novo deploy de
  produção ficou Ready em 15/07. A confirmação de autenticação Browserbase ainda não pode
  ser feita localmente porque a variável Sensitive não é baixada pelo CLI; a sessão Carrefour
  foi reaberta para login humano antes de qualquer preflight. Em seguida, o operador informou
  que concluiu o login na tela; falta escolher o endereço salvo e o item de teste antes do
  preflight de carrinho, frete e prazo. Não houve item, checkout ou cobrança neste ciclo.
- Em 16/07, credenciais de login do Carrefour foram coladas diretamente no chat. Não
  persistir, repetir em logs/documentação, copiar para `.env` nem tratá-las como segredo
  reutilizável. A senha precisa ser rotacionada após a reautenticação controlada do Context
  e antes do piloto; o inspetor remoto não expôs campos seguros para automação, então a
  sessão viva ficou aberta para login humano.
- Manter idempotência, hash do carrinho e revalidação imediatamente antes de qualquer
  aprovação.
- Em 16/07, foi criado `OPS_TOKEN` dedicado (Sensitive, Production e Preview) sem
  substituir `API_TOKEN`; o redeploy de produção ficou `Ready` e o painel `/ops` foi
  autenticado com sucesso. O token não foi exibido nem registrado em documentação. A fila
  contém pedidos legados/pagos e alguns cancelados: não reutilizá-los para validar checkout.
  Em seguida, foi criado pelo painel um pedido técnico isolado com o SKU Carrefour exato
  então visível, usando somente a região já salva no Context persistente (nenhum endereço
  real foi copiado ou persistido). O workflow terminou em `needs_human` /
  `PREFLIGHT_NEEDS_HUMAN`: não conseguiu confirmar conjuntamente item, total, frete e prazo.
  O valor interno de R$ 1,99 não é cotação válida. Não houve WhatsApp, cobrança nem compra;
  a validação ao vivo continua pendente até o checkout expor todos esses campos.
- Em 16/07, a causa genérica acima foi decomposta com retries seguros. O endpoint técnico
  agora reutiliza o mesmo job, injeta somente o CEP público `01310-100`, possui status GET e
  uma página leve em `/ops/teste-carrefour`. O último retry limpou o carrinho anterior e
  terminou em `LOGIN_REQUIRED`; uma sessão viva do mesmo Context foi aberta para
  reautenticação humana. O detergente usado no mapeamento do navegador comum foi removido.
  Nenhuma etapa financeira foi aberta.

## Cobertura e cotação

- A antiga regra “cidade coberta + loja a até 12 km” é legado do motoboy.
- Para entrega direta, o checkout do varejista é a autoridade de cobertura, frete e prazo.
- Distância até loja pode continuar como filtro comercial ou para parceiros same-day, mas
  não prova entregabilidade.
- Meta de cotação por loja: busca 2–8 s; carrinho/frete 10–25 s; total normalmente
  15–30 s. Medir p95 antes de prometer SLA.
- Cotação deve expirar em poucos minutos e ser revalidada antes da cobrança e da compra.

## Bloqueios antes do lançamento

1. Definir juridicamente comprador, titular da NF, múltiplos destinatários, troca,
   devolução, chargeback e responsabilidade pelo pós-venda.
2. Validar nos termos de cada varejista o uso de uma conta central para diferentes clientes.
3. Validar ao vivo a cotação real antes da cobrança; o código Carrefour existe, mas o
   checkout Browserbase e os demais varejistas continuam pendentes.
4. Implantar e validar no `/ops` os estados de entrega/rastreio do varejista e o fluxo
   auditável de estorno, implementados e testados apenas localmente em 16/07.
5. Testar cartão salvo, CVV, 3DS, CAPTCHA e antifraude sem habilitar compra automática.
6. Pilotar 5–10 pedidos controlados com entrega direta.
7. Para same-day, obter parceiro local ou contrato merchant/courier antes de desenvolver
   nova automação de retirada.
8. Antes de ativar One-Click: confirmar as migrations de pagamento já aplicadas, liberar
   Payments API BR na WABA, liberar o domínio no Pagar.me e configurar as chaves/webhooks
   em produção.

## Estado dos conectores

- **Petz:** busca/carrinho/checkout validados; finalização financeira ainda bloqueada.
- **Carrefour:** busca e automação de carrinho; entrega direta deve substituir a premissa
  de retirada por motoboy.
- **Boticário:** busca e carrinho preparados; política de entrega/titularidade ainda precisa
  da mesma validação operacional.
- **Mercado Pago:** cobrança do cliente.
- **Pagar.me + Meta One-Click:** código pronto, flag desligada; depende da habilitação
  externa e de validação sandbox.
- **Browserbase:** navegação persistente e auditável nos varejistas.
  Falhas de credencial, indisponibilidade e sessão expirada devem ser classificadas de forma
  explícita e falhar fechadas; não transformá-las em tentativa de checkout.
- **Uber Direct:** opcional para parceiro que autorize courier.

## Mapa rápido do código

- conversa e orquestração: `src/lib/delivery-service.ts`;
- intenções: `src/lib/lia-intents.ts`;
- copy: `src/lib/lia-copy.ts`;
- conectores de lojas: `src/lib/stores/`;
- busca Browserbase: `src/lib/stores/browserbase-live-search.ts`;
- compra e política: `src/lib/purchasing/`;
- workflow durável: `src/workflows/purchase-order.ts`;
- pagamentos: `src/lib/payments/`;
- guia de ativação One-Click: `docs/whatsapp-one-click-pagarme.md`;
- webhook WhatsApp: `src/app/api/whatsapp/webhook/route.ts`;
- operação: `src/app/ops/` e `src/app/api/ops/`;
- convenções de estado/entrega/estorno: `src/lib/order-flags.ts`;
- runbook do piloto: `docs/operacao-piloto-needs-human-estorno.md`;
- schema: `prisma/schema.prisma`;
- testes: `tests/`.

## Regras para continuar o trabalho

- Preserve mudanças existentes: o worktree pode estar sujo e contém trabalho do usuário.
- Não trate documentação histórica como verdade operacional quando conflitar com este
  arquivo.
- **Ao encerrar toda conversa com avanço, decisão, descoberta, bloqueio ou validação
  relevante, atualize automaticamente os Markdown canônicos — mesmo sem pedido explícito.**
  No mínimo revise `AGENTS.md`, `STATUS.md`, `PENDENCIAS.md` e o documento operacional
  datado; registre com clareza o que foi implementado, validado, somente pesquisado e o
  que ainda depende de ação externa.
- Ao mudar uma decisão de produto, atualize primeiro este arquivo, depois `STATUS.md` e o
  documento datado correspondente.
- Ao concluir, criar ou repriorizar trabalho, atualize `PENDENCIAS.md` no mesmo momento.
- Diferencie sempre: implementado, validado ao vivo, implantado, pendente e hipótese.
- Não declare “pronto para lançamento” enquanto qualquer bloqueio acima estiver aberto.
