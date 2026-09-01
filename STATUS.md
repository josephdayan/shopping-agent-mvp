# Lia — Status do Projeto

## 01/09/2026 (3ª) — display name “Lia Delivery” novamente em análise

O WhatsApp Manager ainda mostrava como aprovado o nome público
`Lia Delivery by 67.742.955 Joseph Carlos Dayan`. A pedido do dono, a mudança para
**Lia Delivery** foi reenviada e agora consta como **In Review**. O texto antigo
permanece no WhatsApp até a decisão da Meta. Nenhuma alteração em código, número,
WABA, webhook ou pagamentos.

## 01/09/2026 (2ª) — polimento pós-bolha: Pagar, Pix sem eco, Ver detalhes, fim do "quantas unidades?"

Quatro pedidos do dono depois da primeira bolha real (#GAS8P9): botão pós-escolha
voltou a ser **"Pagar"**; a bolha Pix agora vai primeiro e **substitui** o texto de
instruções (só o copia-e-cola sai depois, como fallback universal); cards ganharam o
botão **"Ver detalhes"** em TODAS as lojas (link real do anúncio — reviews, fotos,
specs; Carrefour/Petz sem url por item usam link de busca da loja, validado ao vivo;
digitado "detalhes 2" também funciona); e a pergunta **"Quantas unidades?" morreu** —
escolha sem quantidade assume 1 un e o follow-up ganha o botão **"Mudar quantidade"**
(reabre 1/2/Outra pro último item). Detalhe em AGENTS.md (01/09 2ª).

## 01/09/2026 — bolha nativa de Pix NO AR: a Lia cobra com cara de app

A sonda ao vivo provou que a Graph aceita `pix_dynamic_code` no nosso número **sem
habilitação** (o 1º envio caiu na janela de 24h — erro 131047 —, o 2º chegou no
WhatsApp do dono). Envs ativadas na Vercel (`LIA_NATIVE_PIX=1` + recebedor "Lia
Delivery" com chave CNPJ Sensitive) e redeploy READY. Toda cobrança Pix real agora
sai com o copia-e-cola de sempre **e** a bolha nativa com botão "Pagar com Pix".
Ressalva aceita: o banco mostra o recebedor oficial (MEI = razão social com nome
civil). Falta: observar o 1º pedido real (log `[whatsapp:native-pix]`) e a v2
(enxugar textos + "pago ✅" nativo via webhook MP). Detalhe em AGENTS.md (01/09).

## 31/08/2026 — bolha nativa de Pix no chat (experimento atrás de flag)

Pagamento com cara de app dentro do WhatsApp: a cobrança Pix agora pode sair também
como `order_details` nativo (total + botão "Pagar com Pix" que abre o banco + copy
code), igual aos bots grandes. A doc da Meta não exige allowlist pra Pix dinâmico
(o cartão One-Click exigia e foi negado) — mas só o teste real confirma. Aditivo e
inofensivo: os textos de hoje continuam saindo antes da bolha, e falha na bolha nunca
bloqueia a cobrança. **Pra ligar (dono, na Vercel):** `LIA_NATIVE_PIX=1` +
`LIA_PIX_MERCHANT_NAME` + `LIA_PIX_KEY` + `LIA_PIX_KEY_TYPE` (chave da conta Mercado
Pago que recebe), depois um pedido de teste no próprio número olhando o log
`[whatsapp:native-pix]`. Detalhe em AGENTS.md (31/08).

## 30/08/2026 (3ª) — auditoria pós-rodadas 1–5: 479/479, sete lacunas fechadas

O pente-fino do código e a bateria integral contra o banco terminaram verdes: **479
testes, 479 aprovados, zero pulado**, mais TypeScript, lint e build de produção. A
auditoria encontrou e fechou sete lacunas residuais nos pontos novos: ambiguidade de
`quero sim`; dois vazamentos do teto no caminho Mercado Livre; alerta de suporte via IA
ausente durante escolha; confirmação financeira falsa ainda possível na resposta livre
da IA; cálculo prematuro de frete grátis no compositor; e redistribuição 2→2 com copy
contraditória/possibilidade de criar entrega adicional. Evidências e riscos externos que
continuam abertos em
[docs/auditoria-pos-rodadas-1-a-5-2026-08-30.md](docs/auditoria-pos-rodadas-1-a-5-2026-08-30.md).

## 30/08/2026 (2ª) — mudança de patamar: roteador LLM + cesta-como-conjunto no ar

Os dois ciclos estruturais aprovados pelo dono foram implementados e publicados: o
roteador LLM de fallback (a cauda infinita de frases deixa de precisar de regex nova —
"uma 51", "negocio de passar roupa" e "tira aquele negocio de lavar louça" resolvem
sozinhos, com filtro anti-promessa e dinheiro 100% determinístico) e a cesta-como-
conjunto V1 (lista grande escolhe a combinação de lojas que minimiza produtos+frete,
com cada troca anunciada — o frete fragmentado era o problema nº 2 há 3 rodadas).
Detalhe em AGENTS.md (30/08 2ª). Kill-switches: `LIA_LLM_ROUTER=false`,
`LIA_BASKET_COMPOSER_OFF=true`.

## 30/08/2026 — rodada 5 (4,30): funil de perguntas fechado no mesmo dia

Rodada 5 confirmou a recuperação (2,85 → 4,30; 11/11 totais; zero silêncio; zero
concessão em manipulação) e apontou a causa-mãe restante: pergunta sem intent virava
busca de produto. Ciclo do dia: 6 intents novos (cupom/promoção, cobrança indevida →
alerta URGENTE ao operador, agendamento, loja física, parcelamento, sondagem de
instruções) + backstop "essa eu não sei responder"; pergunta lateral reapresenta os
cards; ovos deduplicados também no caminho com IA (6+6=12 → 1 embalagem); teto por
extenso/"30 conto"; "quanto ficou mesmo?" com cobrança na mesa responde o total do
pedido; pivô "então me ve X" destrava escolha parada; comparação 1×2 honesta;
gilete/bombril/maisena → genérico certo. Detalhe em AGENTS.md (30/08). Relatório:
[docs/testes-rodada-5-2026-08-29.md](docs/testes-rodada-5-2026-08-29.md).

## 28/08/2026 — rodada 4 (protocolo hostil): 2,85/10 → ciclo grande de conserto

A rodada 4 foi desenhada pra mapear o teto (cliente difícil de verdade) e mapeou: média
**2,85**, com 19/20 sessões contendo resposta-robô ou silêncio — mas o dinheiro seguiu
intacto (12/12 totais certos, zero cobrança). O ciclo de conserto atacou as 8 famílias:
rede anti-silêncio estrutural (turno com zero respostas → fallback; mensagem sem texto
→ "só leio texto"; o webhook tinha um **400 mudo**), intents de confiança
(segurança/NF/CNPJ/quem entrega/preço vs site/pagar por terceiro/insulto), pausa e
retomada ("pera", "voltei", "na vdd quero sim" recupera cancelado), comando composto
executado em sequência, edição pós-total reabrindo o pedido, semântica de cesta
(quantidades, embalagem de ovos, teto global, correções embutidas, óleo de cozinha,
categoria de limpeza) e escolha com emoji/monossílabos. Detalhe em AGENTS.md (28/08).
Relatório do testador: [docs/testes-rodada-4-2026-08-28.md](docs/testes-rodada-4-2026-08-28.md).

**Nota de env**: `LIA_BUSINESS_INFO` (ex.: "Lia Delivery — CNPJ XX.XXX.XXX/0001-XX")
alimenta a resposta de CNPJ; sem ela a resposta é honesta sem número.

## 27/08/2026 (2ª) — rodada 3: média 6,80, dinheiro 12/12, achados novos consertados no dia

A rodada 3 (protocolo v3) validou o ciclo da rodada 2: média **4,15 → 6,80**, zero
cesta contaminada, zero divergência de total em 12 resumos auditados, e as guardas
novas (botão velho, furadeira, "de sempre", troca anunciada) funcionaram às cegas. Os
achados novos — auto-apresentação virando produto ("seu Jorge aqui" → imagem de São
Jorge), "meu neto quer um violão" como query inteira, narrativa ESCOLHENDO produto na
pausa, CEP engolido por cotação vencida (S18), "esquece o carregador" ignorado na
rajada e "não gostei" descartando o item — foram todos consertados e testados no
mesmo dia (AGENTS.md 27/08 2ª). Veredito do testador continua "ainda não deixaria
minha mãe usar sem ajuda"; os dois temas estruturais que sobraram são **frete
fragmentado (6/20 sessões)** e a recuperação pós-esgotamento de opções. Relatório:
[docs/testes-rodada-3-2026-08-27.md](docs/testes-rodada-3-2026-08-27.md).

**Ação do dono (continua): #YAQHF8 e #QTNL2T** — os dois pedidos pagos residuais
apareceram (rotulados com data e itens, como projetado) nos 20 encerramentos da
rodada. Conferir no painel Pagar.me se a chave é test ou live (`ch_VAolM1vcKiwjnK8m`)
e então estornar/entregar ou só cancelar no /ops.

## 27/08/2026 — rodada 2 (4,15/10): forense mudou o diagnóstico, consertos implementados

A rodada 2 confirmou o avanço em estado (perda 12/20 → 3/20) e derrubou a média por
UX/integridade (4,15). A forense no banco provou que os dois "P0s" não eram corrupção:
**#YAQHF8 é uma cobrança REAL de cartão (R$20,62, 25/08, Pagar.me) parada em `paid`** e
o "PlayStation fantasma" foi pedido pelo próprio telefone de teste e largado aguardando
pagamento — o bug real era a APRESENTAÇÃO (pedido antigo sem data nem itens). Sete
blocos de conserto implementados no mesmo dia (status ancorado em data+itens, memória de
cancelamento, guardas anti-turno-velho, troca de loja anunciada item a item, resumo com
preço por linha, pós-total com "mais barato"/"mais rápida" funcionando, narrativa fora
da extração, escolha destravada, "de sempre" com conferência). Detalhe em AGENTS.md
(27/08). Relatório do testador:
[docs/testes-rodada-2-2026-08-27.md](docs/testes-rodada-2-2026-08-27.md).

**Ação do dono (URGENTE): decidir o destino de 2 cobranças reais paradas** —
`#YAQHF8` (R$20,62, pago 25/08, nunca comprado) e `#QTNL2T` (R$80,93, pago 23/08,
`retailer_preparing` desde a compra): entregar ou estornar no /ops / Pagar.me.

## 26/08/2026 — 20 sessões ao vivo: piloto amplo bloqueado

Vinte sessões adversariais no WhatsApp, sem pagamento, deram média auditada **4,30/10**
(4,55 na atribuição inicial; sessão 19 rebaixada após auditoria). O achado P0 foi uma
cesta da sessão 18, já cancelada, reaparecer na sessão 19 e chegar ao Pix junto do item
novo. Outros bloqueadores: seis respostas de status/cancelamento para o pedido errado,
trocas silenciosas de produto, processamento fora de ordem, três tetos de preço violados
e prazo prematuro nos cards. A causa provável do vazamento de estado é a combinação de
trabalhos assíncronos por mensagem com a trava que permite `barge` após 15 segundos,
enquanto buscas podem durar muito mais.

Não tratar “12 chegaram ao total/Pix” como 12 compras válidas. O piloto amplo fica
bloqueado até zerar vazamento de sessão, falso estado financeiro e mutação silenciosa.
Relatório completo em
[docs/relatorio-completo-problemas-lia-2026-08-26.md](docs/relatorio-completo-problemas-lia-2026-08-26.md);
scorecards em
[docs/testes-20-clientes-2026-08-26.md](docs/testes-20-clientes-2026-08-26.md).

## 20/08 — silêncio absoluto não existe mais (watchdog + timeouts em camadas)

O reteste da mochila morreu em silêncio (teto da função dentro do waitUntil; OpenAI sem
timeout na 2ª extração do resgate; token ML de 55 dias custando 4s/busca). Agora:
watchdog de 45s avisa o cliente que a Lia continua no pedido; OpenAI e Mercado Pago com
timeout de 10s; resgate de última chance respeita orçamento de 90s do turno; rota
oficial do ML de castigo após 401 e env do token morto removida. Detalhe em AGENTS.md.
**Ação do dono (1 min):** conferir Fluid Compute ativo no projeto da Vercel.

## 19/08/2026 — rodada adversarial ao vivo: 5 sucessos, 1 parcial, 2 falhas

Foram testados 8 cenários difíceis no WhatsApp, sem alteração de código e sem cobrança.
Passaram churrasco com negação escopada, cauda longa de violão até R$500, troca de item,
presente com teto de R$100 e quantidade 4x → 7x → 5x em bombons. “Sem remédio” e “qualquer
time” não viraram produtos; “4” solto ajustou a quantidade.

Dois achados importantes contradizem o comportamento esperado documentado em 19/08: o
“mais barata” seco ainda escolheu o menor preço em vez de apenas navegar, e “Outras opções”
após uma escolha não reabriu a busca — respondeu pedindo para reformular. Repetir esses dois
casos depois de confirmar qual versão está servindo a sessão. A única rodada que chegou ao
pagamento foi cancelada antes da cobrança; a Lia confirmou que nada foi cobrado.

## 19/08 (2ª) — teste real da mochila: 5 defeitos de conversa fechados

"Mais barata" seco não compra mais nada (navega pras mais baratas); "Outras opções"
com escolha fechada reabre a última escolha e o novo pick SUBSTITUI o item na cesta;
"mais barato" solto reabre ordenado por preço; aviso "Procurando…" sai uma vez só; e a
recusa de uma linha com opções das outras na mesma mensagem ganhou escopo ("*sacola* eu
não achei — o resto achei e tá logo abaixo"). Detalhe e racional em AGENTS.md (entrada
19/08 2ª). Latência da busca fria do ML segue limitação conhecida do actor.

## Atualização 19/08/2026 — /admin com login de usuário e senha

Revisão completa pré-lançamento: `/admin`, `/api/admin/*` e `/api/conversations/*` (legado
do `/chat`) estavam sem autenticação em produção. Agora exigem login (`ADMIN_USER`/
`ADMIN_PASSWORD`, Sensitive na Vercel, falha fechado quando ausentes); sessão por cookie
httpOnly de 30 dias. O `/ops` continua com `OPS_TOKEN`, inalterado. Achados restantes da
revisão em andamento em sessões paralelas: Pix mock quando o Mercado Pago falha com
credenciais reais, e conversa presa após `opsCancelRefund` + `choosing_freight` sem TTL.

## Atualização 18/08/2026 — falha do Mercado Pago não vira mais cobrança de mentira

Corrigido um furo de dinheiro em `src/lib/payments/mercadopago.ts`: com
`MERCADO_PAGO_ACCESS_TOKEN` setado, um erro na chamada real (timeout/5xx) caía num
`catch` que logava `[pix:create:fallback-mock]` e devolvia um Pix **mock**
(`mockpix_...`) para um pedido real. Duas consequências: o cliente recebia um
copia-e-cola incolável com a dica de sandbox ("responda *paguei*") e, como
`delivery-service` trata pixId iniciado em "mock" como sandbox, esse "paguei" chamava
`markDeliveryOrderPaid` — pedido **pago sem dinheiro nenhum**. O mesmo padrão existia no
`createCheckoutLink` (link `https://mock.lia/...` enviado ao cliente).

Agora, com credencial real, o adapter lança `PaymentProviderError` (logs
`[pix:create:failed]` / `[checkout:create:failed]`). O cérebro trata a falha em vez de
disfarçá-la: avisa o cliente com `copy.paymentIssueFailed()` ("Não consegui gerar seu
pagamento agora — nada foi cobrado. Responde *pix* ou *cartão* que eu tento de novo."),
**mantém o pedido em `awaiting_payment`** (ou devolve a cotação para
`awaiting_quote_confirmation`, com o contexto da conversa junto), anota
`⚠️ Falha ao gerar a cobrança` no `/ops` e alerta o operador no WhatsApp
(`copy.operatorPaymentFailedAlert`). Repetir *pix*/*cartão* reemite a cobrança de
verdade: `resendCharge` passou a detectar pedido sem `pixCopiaECola` e reemitir pelo novo
`issueChargeForOrder` (usado também na criação do pedido), em vez de reenviar um código
que não existe. `handlePaidClaim` só aceita o atalho de sandbox quando
`paymentsAreMocked()`, então um pixId "mock" residual em produção não aprova nada. Mock
segue valendo sem credencial (dev/testes). Coberto por
`tests/payment-issue-failure.test.ts` (8 casos: adapter puro + evals com banco real e
`fetch` quebrado). `tsc` limpo e testes focados verdes. **Sem deploy** — publicação
depende de autorização do dono.

## Atualização 19/08/2026 — conversa não fica mais presa em pedido morto

Duas correções de conversa saíram de uma revisão dupla independente do
`src/lib/delivery-service.ts` (achados de 18/08):

- Cancelamento/estorno pelo operador (`opsCancelRefund`) agora **reseta o contexto da
  conversa**, como o pagamento já fazia. Antes, o cliente continuava ouvindo "ainda estou
  cotando" de um pedido cancelado; e, se a conversa estivesse na escolha de entrega, o
  toque no botão de frete caía em erro genérico repetido, sem saída além de "trocar
  endereço". `handleCancel` também limpa o ponteiro morto ao responder "não tem pedido".
- A escolha de entrega (`choosing_freight`) **expira**: entrou no TTL de abandono de 1h
  (`LIA_QUOTE_ABANDON_TTL_MS`) e a própria escolha guarda quando o frete foi consultado
  (`quotedAt`). Toque tardio cancela o pedido não-cotado em vez de publicar frete e data
  vencidos numa cotação pagável.

Cobertura nova em `tests/manual-concierge.test.ts`. Gate focado (`tsc` + suíte do
concierge) verde. **Sem deploy** — publicação depende de autorização do dono.

## Atualização 17/08/2026 — OAuth Mercado Livre em preparo

Foi preparada localmente uma integração OAuth segura para a API oficial de busca do Mercado
Livre: tokens cifrados no banco, callback de `liadelivery.com.br` com state anti-CSRF e fallback
para Apify. A criação da app **não aconteceu**: o DevCenter autenticado devolveu
`OPT02-EN1XAJYDKPNW` e retornou ao início após retry. Não houve deploy, migration aplicada,
segredo, token, compra ou notificação. O próximo passo é o dono regularizar a elegibilidade da
conta no DevCenter/suporte; a API não serve para compras ou rastreio de pedidos como comprador.

> Memória canônica para agentes: [AGENTS.md](AGENTS.md). Progresso e próximos passos:
> [PENDENCIAS.md](PENDENCIAS.md). Leia ambos antes de interpretar este status ou tomar
> decisões de produto.

_Última atualização: 2026-08-19. Doc de leitura rápida do estado atual. O histórico de
decisões ("por que esse modelo") está no [CLAUDE.md](CLAUDE.md); os ciclos recentes estão
em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md) e
[docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md). A revisão operacional
de hoje está em
[docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md)._

---

> **Revisão de copy 2026-08-17 — tom direto e prazo honesto.** O dono revisou as ~110
> mensagens automáticas de uma vez (levantamento completo em
> [docs/todas-as-mensagens-da-lia.md](docs/todas-as-mensagens-da-lia.md), com o texto antigo
> ao lado do novo). Régua vigente, aplicada em `src/lib/lia-copy.ts`: verbo na frente, sem
> preâmbulo de simpatia ("Prontinho", "Opa", "Fechado!", "Deixa comigo"), sem explicar a
> mecânica interna, no máximo 1 emoji, uma saída por mensagem, **sem lista de exemplos de
> produto** e **sem endereço/CEP fictício** (descrever os campos, nunca inventar um). O 💚
> caiu de 8 para 2 ocorrências. A apresentação da Lia agora é uma frase só, idêntica nos
> quatro pontos de entrada.
>
> **Regra que não pode ser quebrada: nada de prazo antes de cotar.** Quem manda no prazo é o
> checkout da loja e ele varia — às vezes é no mesmo dia, às vezes leva dias. Saiu "chega
> hoje" / "no mesmo dia" / "em ~1h" / "1 a 2 horas" de toda mensagem genérica (`help`,
> `serviceAnswer:eta`, `serviceAnswer:generic`). Junto disso caíram os fallbacks
> `etaMinutes ?? 40` e `?? 90` do `summary`/`manualQuoteSummary`: sem prazo real da loja, a
> linha de entrega sai só com o valor, nunca com um número inventado. O prazo aparece uma vez
> só, no resumo, e sempre com o dado que a loja devolveu.
>
> ✅ **Landing revisada (2026-08-18):** `page.tsx`, `layout.tsx`, `opengraph-image.tsx` e o
> mock do celular passaram pela mesma régua: zero "entrega no mesmo dia"/"chega hoje" (prazo
> só como "aparece antes de pagar", FAQ "Quando chega?" honesta), "paga no Pix" virou "Pix ou
> cartão" em todo lugar, e o letreiro perdeu os preços inventados. O mock usa as mensagens
> reais de `lia-copy.ts` (resumo com frete/prazo da loja, Pix em mensagem separada,
> `paymentConfirmed`). Também saiu o "sem mensalidade, sem taxa escondida" da FAQ (dono
> vetou em 18/08 — o markup embutido tornaria a frase falsa). Visual: paleta **Berinjela &
> lima** (roxo `#3A225E` + papel lilás `#F7F4FB` + lima `#D9FF5B`), escolhida pelo dono no
> seletor de paleta ao vivo (seletor temporário, removido após a escolha); CTAs e mock do
> celular em roxo/lima. O avatar `LiaWhatsAppAvatar`, o favicon e a arte da foto de perfil
> do WhatsApp foram refeitos em lima `#D9FF5B` + roxo `#3A225E` (o PNG novo foi entregue
> ao dono pra subir no app).

> **Remodelagem 2026-07-20 — concierge manual (fluxo ativo).** O produto passou a ser um
> concierge de WhatsApp com **largura** (pede qualquer coisa, de qualquer lugar), **cotação e
> compra manuais pelo operador** e **entrega na hora por motoboy que sai da base do operador**.
> A automação de checkout (Browserbase) saiu do caminho crítico (`LIA_MANUAL_CONCIERGE=true`,
> default). Ao fechar a lista, cria-se `awaiting_operator_quote`; o operador cota no `/ops` e o
> pedido reaproveita `awaiting_quote_confirmation` + a máquina de pagamento existente. Detalhes
> e racional em [AGENTS.md](AGENTS.md) (topo) e no registro datado. A seção abaixo descreve o
> fluxo legado de automação, mantido atrás da flag e ainda usado como referência/testes.

> **Estado em 21/07.** O fluxo concierge passou por uma demonstração local mockada completa:
> cotação manual de R$100, Pix confirmado, compra, despacho Uber Direct a partir da base do
> operador e entrega — incluindo as mensagens ao cliente; não houve cobrança real. Os commits
> `bb48c2e`, `ededf6a` e `7ab8453` estão verdes, mas o concierge ainda não foi implantado porque
> o deploy arrastaria uma migration Oba inacabada de outro trabalho. A decisão é contratar um
> operador. A fila de Production contém 19 pedidos técnicos e só pode ser limpa com aprovação
> explícita.

> **Atualização 02/08.** A Lia opera **somente no estado de São Paulo**. No concierge, o código
> rejeita qualquer UF fora de SP (e usa o prefixo do CEP como fallback quando o ViaCEP cai),
> independentemente dos overrides legados de cobertura. O deploy final de código foi publicado no
> commit `a700290` como `dpl_5kTpBbsitN6BgP5vcQrDh22AfqP4` (`Ready`), reassumindo `liadelivery.com.br`. As flags
> `LIA_MANUAL_CONCIERGE=true` e `LIA_REQUIRE_REAL_COURIER_DISPATCH=true` estão explícitas em
> Production. O código impede despacho mockado quando o provider é Meta e exige endereço + CEP
> reais da base do operador. A base foi configurada como Sensitive em Production; `PURCHASE_AUTOMATION_MODE=cart_only`
> e a compra automática desligada estão ativas. A primeira validação com pedidos reais não é
> pendência de desenvolvimento: fica a critério do operador depois que os gates abaixo estiverem
> concluídos.

> **Reconciliação de código.** O snapshot publicado foi consolidado no commit `a700290`; `main`
> local foi avançada por fast-forward até ele e o worktree está limpo. O push de `main` para o
> GitHub ainda não foi feito.

> **02/08 — 2ª rodada (decisões do dono + verificação).** O piloto será operado pelo próprio
> dono (sem contratar operador). Rotina fiscal decidida e documentada em
> [docs/rotina-fiscal-mei.md](docs/rotina-fiscal-mei.md). Rotação das credenciais expostas
> abandonada como gate de piloto (risco aceito). Conta Mercado Pago: conferir no painel se já
> é PJ (o dono acredita que sim; API local sem escopo para confirmar). Verificação técnica:
> suíte **213/213 verde com banco**, `tsc` limpo, produção `READY` no commit `a700290`,
> landing/`/ops`/webhook OK. Vitrine em runtime: **7.652 produtos em 11 lojas** — Carrefour
> 1.045, Petz 2.812, Boticário 1.380, Ri Happy 1.196, Swift 925, Kopenhagen 248, Kalunga 15,
> Droga Raia 13, Cacau Show 12, Decathlon 4 (filtro de imagem corta 13 dos 17), Oba 2
> (busca ao vivo em prod). Lacunas de demanda mapeadas (e-commerce/delivery BR): farmácia
> não-remédio (Droga Raia só 13 itens de seed), bebidas/adega dedicada, flores/presentes,
> eletrônicos/acessórios, moda básica e hortifruti fresco (Oba ao vivo cobre em tese). No
> concierge nada disso bloqueia pedido — item fora de vitrine vira linha livre que o operador
> cota; as lacunas afetam só a vitrine com foto.

> **02/08 — vitrine ampliada para 18 lojas / 17.264 itens.** As lacunas acima foram fechadas
> por decisão do dono. Novas: **Drogaria São Paulo (4.675)** e **Pague Menos (1.540)** para
> farmácia sem remédio, **Natural da Terra (1.000)** para hortifruti, **Cobasi (998)** como
> redundância de pet, **Divvino (998)** e **Imigrantes Bebidas (406)** para bebidas, e
> **Giuliana Flores (204)** para flores/presente. Dados reais, CDNs testados como hotlinkáveis.
> Nas farmácias a regra ANVISA virou **tripla guarda**: allowlist de categoria + deny-regex na
> colheita e `withoutMedicine` em runtime (`src/lib/stores/anvisa.ts`). A terceira foi
> necessária — a loja classifica medicamento dentro de categorias cosméticas (cetoconazol,
> metronidazol, ciclopirox passaram pelas duas primeiras). 18 itens removidos; regra travada em
> `tests/anvisa-pharmacy.test.ts`. A mesma auditoria pegou o lado pet: Cobasi (65 medicamentos
> veterinários + 56 dietas de prescrição) e Petz (58 itens da linha "Nutrição Clínica") agora
> passam por `withoutVeterinaryMedicine` — inclusive a busca ao vivo da Petz. Roteamento ganhou
> dicas de bebida e flor.
> **Leroy Merlin não entrou**: bloqueia fetch (403) e a listagem não expõe imagem sem uma visita
> por produto. Detalhes em [AGENTS.md](AGENTS.md) e [README das vitrines](src/lib/stores/README.md).

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
> já estão em produção. Em 03/08 a Infobip NEGOU a habilitação; em 04/08 o pedido foi aberto
> diretamente no Suporte da Meta, protocolo `37565409896407734` — **encerrado pela Meta em 05/08 com resposta padronizada, sem análise** —, categoria
> **Dev: Cloud API / Messages API and Webhook**. A Payments API BR segue em beta fechado e as
> habilitações documentadas passam por BSPs; o chamado não garante aprovação nem prazo. Plano B:
> Checkout Pro até a disponibilidade geral. A dúvida técnica do Pagar.me foi
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

> **05/08 — cartão salvo construído (sem Meta).** O modo `LIA_ENABLE_SAVED_CARD` foi
> implementado reusando o alicerce One-Click: primeira compra cadastra o cartão no link
> seguro `/cartao` e cobra; recompra é confirmada por botões comuns ("Pagar •••• 1234" /
> "Usar outro cartão", ids `cardpay:<attemptId>`/`cardother`), com formas por texto
> equivalentes. Desfechos viram texto comum; recusa cai no Checkout Pro; "outro cartão"
> expira a tentativa e re-cadastra. `cardOnFileEnabled()` garante que chave Pagar.me sem
> flag não muda o checkout. Testes novos em `tests/saved-card.test.ts` (6, com banco e
> mock Pagar.me): oferta, toque, replay sem dupla cobrança, texto, troca de cartão e
> resposta honesta sem pendência. Falta para ligar: conta/chaves/domínio/webhook Pagar.me
> (ação do dono) + sandbox real. A flag segue desligada.
> **Regra de produto (05/08):** depois da primeira compra, o cliente **nunca redigita o
> número do cartão**. Se o sandbox mostrar antifraude exigindo CVV, a contingência aprovada
> é o modo CVV-only na página `/cartao` (mostra "Pagar com •••• 1234" e pede só os 3
> dígitos). Conta de teste Pagar.me criada em 05/08 (grátis, loja "Lia Delivery"); a
> habilitação comercial/chaves live só acontece se a bateria de sandbox aprovar.

> **05/08 — 1ª bateria sandbox Pagar.me: contrato OK, simulador não habilitado.** Com as
> chaves da loja "Lia Delivery" (criada no plano à vista, pré-habilitação), a bateria provou
> na API real de teste: tokenização pela chave pública ✅, criação de cliente ✅, contrato de
> order/idempotência aceito ✅. Porém TODA aprovação falha: salvar cartão → 412 "card
> verification failed" (com e sem `verify_card`, cartões 4242… e 4000…0010) e cobrança →
> `not_authorized` 1011 "Número do cartão inválido" — mesmo seguindo as regras documentadas
> do Simulador PSP (Luhn válido + CVV 123). Conclusão: as chaves dessa loja são de PRODUÇÃO
> pré-habilitação (por isso sem o infixo `test_`), e o simulador NÃO roda nela. O caminho é a
> **conta de teste separada** (company.pagar.me → Contas → criar conta de teste), cujas chaves
> `sk_test_`/`pk_test_` ativam o simulador. Nenhum custo incorrido; a condição "só pago se
> funcionar" segue intacta.

> **05/08 — VEREDITO DO SANDBOX: o cartão salvo FUNCIONA.** Com a conta de teste
> "Lia Delivery - test" (chaves `sk_test_`/`pk_test_`), a bateria completa passou contra a
> API real: tokenização ✅, cliente ✅, **salvar cartão pelo adapter com verificação ligada** ✅
> (nenhuma mudança de código necessária), **cobrança com `card_id` SEM CVV APROVADA** ✅ (a
> pergunta central), replay com mesma Idempotency-Key devolve a MESMA order ✅ (dupla cobrança
> impossível), reconciliação `getOrder` ✅ e **recusa pelo antifraude → `declined`** ✅ (regra
> do Simulador PSP com documento 111…), acionando o fallback Checkout Pro. A condição do dono
> ("só pago se funcionar") está satisfeita. Nota: a 1ª bateria falhou porque as chaves da loja
> de produção pré-habilitação não rodam o simulador — o diagnóstico está no registro anterior.
> **Para ligar em produção falta:** (dono) habilitação comercial → chaves live; cadastrar
> `liadelivery.com.br` para o tokenizecard.js; chaves live + `PAGARME_WEBHOOK_TOKEN` +
> `LIA_PUBLIC_URL` na Vercel (Sensitive). (agente) cadastrar webhook com os 6 eventos, ligar
> `LIA_ENABLE_SAVED_CARD=true`, smoke real de R$ ~1 com estorno.

> **06/08 — busca da vitrine reconstruída: IA escolhe o produto + placar medido.** Caso real:
> "carregador usb c" devolvia 3 carregadores veiculares (mesmo item, 3 cores) com o carregador
> de parede USB-C parado em outra vitrine. A busca deixou de ser só léxica: candidatos largos
> nas 18 lojas (`gatherCrossStoreCandidates`) → **rerank por IA** (`rerankShoppingOptions`,
> 1 chamada batched por mensagem, skus validados, timeout 6s, kill-switch
> `LIA_SEARCH_RERANK_OFF`) → fallback determinístico melhorado (compostos usb-c, typo-fuzzy
> mais estrito — "miojo" não vira vinho "Miolo" —, marca sem typo, bônus de categoria, bônus
> "sem X", diversificação de cores) → nada serve = linha livre do operador. Quando o rerank
> roda, ele substitui o piso `conciergeMatchIsStrong`. Qualidade agora é MEDIDA:
> golden set com 32 casos (`tests/helpers/search-golden.ts`), regressão determinística no
> `npm test` e placar completo via `npx tsx scripts/eval-search.mts` — **31/32 determinístico
> · 32/32 com IA**. Busca ruim nova → vira caso no golden → mede → conserta.
> O método já se pagou: varrer 60 pedidos realistas achou 4 bugs não reportados —
> "cotonete" não achava o cotonete do catálogo, "leite" devolvia loção de pele
> ("Leite de Rosas"), "água" vinha com gás, e a penalidade nova de item-pet punia
> refrigerante porque em catálogo brasileiro **"PET" é a garrafa plástica**.
> Invariante que saiu do lote: **penalidade reordena, guarda exclui**. Fora do scorer,
> `score > 0` significa "casa ou não casa" — duas penalidades somadas derrubaram um match
> legítimo para -1 e quebraram o "tira o X" (o cliente não conseguia mais remover o item
> da cesta). Item que passou pelas guardas nunca cai abaixo de 1. Pego pelo eval de
> conversa legado, não pelo golden: os dois harnesses cobrem coisas diferentes.
> Bônus: `talk-env.mts` nunca carregava o `.env` (bug `__dirname` em ESM) — por isso os
> scripts locais rodavam "sem IA" mesmo com chave; corrigido.

> **10/08 — FRETE AO VIVO POR CEP (precisão final).** No fechamento, a Lia consulta o
> checkout real de cada loja da cesta (VTEX `orderForms/simulation`) com a CESTA e o CEP
> exatos do cliente — frete certo para aquele endereço, frete grátis aplicado pelo próprio
> site (validado: Swift devolveu R$0 em carrinho de R$499). Consultas em PARALELO com
> timeout de 4,5s (`LIA_LIVE_FREIGHT_TIMEOUT_MS`; medido: fria ~3s, quente ~0,6s) — teto
> real de espera extra do fechamento. 8 lojas abertas (Pague Menos, Drogaria SP, Cobasi,
> Oba, Swift, Divvino, Kopenhagen, Ri Happy); Carrefour/Petz bloqueiam → tabela por
> política. Resposta válida SEM opção de entrega = site não atende o CEP → cai pro
> operador (não se cobra entrega que não existe). Teto de sanidade `LIA_LIVE_FREIGHT_MAX`
> (150); kill-switch `LIA_LIVE_FREIGHT_OFF`. Fonte visível por loja na nota do /ops
> ("ao vivo"/"tabela"/"tarifa padrão") + log `[instant-quote:live]` por consulta — o 1º
> pedido real diz se o site trata o IP da Vercel diferente (se bloquear, fica na tabela
> sozinho). Módulo `src/lib/live-freight.ts`; unit 4/4 (fetch mockado), E2E 3/3
> (determinísticos via kill-switch no load-env).

> **09/08 (3ª) — COTAÇÃO INSTANTÂNEA: o cliente não espera mais no chat.** Decisão do dono
> ("na hora que estiver falando com a Lia é rolê esperar; depois pode esperar o quanto for"):
> cesta 100% de vitrine agora fecha com o TOTAL na mesma resposta — a Lia auto-publica a
> mesma cotação que o operador digitaria (`tryPublishInstantQuote` → `opsPublishManualQuote`,
> modo `retailer_delivery`) e o pedido chega ao `/ops` já indo pra pagamento; a espera fica
> na compra/entrega. **A entrega é pelo SITE de cada loja** (correção do dono na mesma
> conversa: "não é via Uber, é via site" — o operador compra no site e a loja entrega), então
> o frete é a POLÍTICA DO SITE, por loja ("2 lojas = 2 fretes"): env
> `LIA_STORE_FREIGHT_<LOJA>` + frete grátis por limiar `LIA_STORE_FREE_ABOVE_<LOJA>` (sobre
> o subtotal de custo daquela loja, como o site calcula); sem política configurada,
> `LIA_FREIGHT_DEFAULT` (18) com marca "(tarifa padrão)" na nota do `/ops` — gritando que
> falta calibrar. Linha livre (sem preço) mantém o caminho manual. Kill-switch
> `LIA_INSTANT_QUOTE=false`. Módulo `src/lib/instant-quote.ts` (puro). Política de preço
> defasado: a margem de 10% absorve; acima, avisar e estornar a diferença. Testes: 3 E2E +
> 4 de unidade. **Ação do dono:** preencher na Vercel o frete real do site de cada loja que
> usa (ex.: `LIA_STORE_FREIGHT_CARREFOUR=14.90`, `LIA_STORE_FREE_ABOVE_CARREFOUR=99`).

> **09/08 (2ª) — CARDS VALIDADOS EM PRODUÇÃO + botões pós-escolha.** Teste real do dono:
> "Quero um cotonete" → cards chegaram com foto e botão, escolha "2" funcionou — o fix do
> `safeMediaLink` (URL com `®`) está confirmado no mundo real; zero `meta-status-failed` no
> banco. Na sequência, pedido novo do dono implementado: a confirmação pós-escolha agora traz
> 3 botões — **Pagar** (fecha e cota), **Adicionar mais itens** e **Cancelar** — via
> `sendChoiceFollowUp` (ids caem nos ramos já existentes: "pagar", "adicionar_mais",
> "cancelar"); fallback = texto de sempre quando não é Meta ou o interativo falha.

> **17/08 — busca fria do ML mais rápida + tag de urgência no /ops (PUBLICADOS).**
> Pedido do dono ("30s → 10-15s?"): o teto é o actor. Medido: 4GB de memória derruba o
> run de 28,5s pra 21,1s (grátis — actor pay-per-event), `waitForFinish` elimina o
> polling e o prefetch dispara o ML em paralelo com a extração de IA (runs idênticos em
> voo são compartilhados). Busca fria ~30s → ~20-22s; cache 6h continua instantâneo.
> 10-15s ou menos exige a API oficial do ML (403 sem token de app) — o dono precisa
> criar um aplicativo em developers.mercadolivre.com.br. Alternativas descartadas com
> teste: outros actors (35s, piores) e fetch direto (bloqueio anti-bot). Também no ar:
> "urgente"/"pra hoje" vira nota `⚡ URGENTE` no pedido, alerta ⚡ e badge laranja
> "⚡ quer HOJE" no /ops — o operador escolhe o canal (Rappi/retirada agora vs. ML).
> Commits `dc0424a`+`ed797b2`, deploy `shopping-agent-asazb5e8i` `Ready`, smoke verde.
> Gate: tsc, ML 10/10, NLU 41/41, concierge E2E 36/36.

> **16/08 (3ª) — Mercado Livre como vitrine de cauda longa, ATRÁS DE FLAG.** Decisão do
> dono: com compra manual, o motivo de abandonar o ML (automatizar checkout) não existe
> mais — e as recusas dos 7 ciclos eram justamente cauda longa. Actor validado ao vivo
> (22–25s, 48 itens, ~R$0,03/busca, com prazo do anúncio). Conector desligado por padrão
> (`LIA_ENABLE_MERCADOLIVRE`), cache 6h, aviso antes de busca lenta, prazo do anúncio no
> card, guarda ANVISA aplicada. Review pré-ativação corrigiu dois desvios: o ML agora só
> roda quando nenhuma das 18 vitrines locais tem match forte (item cotidiano não espera
> actor pago/lento), e o prazo chega também ao card interativo da Meta. Suíte completa
> 340/340, tsc, lint e build verdes. **Ativado em Production em 16/08:** flag Sensitive
> `true`, commit `5040813`, deploy `dpl_9j9Yyn2fFWoCCWEUGDb8Bax7DMxZ` `READY`; smoke
> verde e sem erros novos. Falta apenas o primeiro pedido frio no WhatsApp provar a
> integração runtime com o token Sensitive.

> **16/08 (2ª) — 5º ciclo (10 rodadas): 4 consertos.** Ocasião/dia ("Para domingo",
> "Para uma viagem") e "barato" seco viram modificadores; plural não duplica no merge
> ("cafés moídos" ≈ "café moído"); adição relativa na mesma mensagem soma na linha
> anterior; trocar endereço com cotação na mesa preserva a cesta e re-cota sozinho.
> Gate de publicação agora é focado (decisão do dono).

> **16/08 — 4º ciclo (10 rodadas): 6 consertos + botão "Outra quantidade".** Cabo ≠
> carregador (golden `none` + prompt; catálogo não tem cabo USB-C — lacuna registrada);
> teto de preço sobrevive ao merge com a IA (era o "R$29,69 acima do teto"); tamanho
> pedido filtra TODOS os cards; "sem remédio" no começo não é remoção; "pensando bem"/
> "chega amanhã" são filler/urgência; destino com CEP embutido consome o CEP. Botões de
> quantidade: 1 · 2 · Outra quantidade (abre pergunta livre).

> **15/08 (2ª) — 3º ciclo (10 rodadas): 6 consertos.** Preferência negativa ("sem
> pimenta", "não veicular") vira atributo `sem X` do item anterior; "até R$30 cada" é
> teto; "vou entregar em Campinas" + CEP com pagamento aberto derruba a cotação velha e
> troca o destino; "mais um leite" herda o sku da cesta (não vira leite integral novo);
> "troca X por Y" em lista nova corrige a própria mensagem; lancheira recusa limpa.

> **15/08 — re-teste (10 rodadas): prioridades passaram; 5 ruídos restantes fechados.**
> "três pacotes" (acento no `\w`) e embalagem solta transferem quantidade; "qualquer
> <coisa>" é preferência; adversativa não esconde modificador; confirmação mostra "✅ 4x";
> "mais um desse café" mira pelo substantivo; "hidratante" não perde mais pro sabonete
> hidratante (regra principial + caso golden, 34 casos).

> **14/08 — 15 rodadas reais do dono → 7 consertos de NLU/fluxo.** Fragmento de frase
> ("até 100 reais", "qualquer marca", "se tiver") nunca mais vira item — orçamento vira
> teto de preço; "antes de pagar" não dispara pagamento e "entregar em <cidade>" troca o
> destino (rodada 15, a mais perigosa); "mais três do mesmo" soma no sku do último item;
> número solto ajusta quantidade; esclarecimento na escolha refina em vez de duplicar
> (rodada 5); "sem remédio" é negação; mensagem de mínimo mostra a cesta inteira;
> fallback manual explicado ao cliente e anotado no /ops. Relatório:
> docs/testes-whatsapp-2026-08-14.md.

> **15/08 — nova rodada ao vivo, sem alteração de código.** Em 10 cenários, passaram a
> adição relativa por SKU, a preservação de restrições e o cancelamento antes da cobrança.
> Permaneceram falhas observáveis: “cabo USB-C de 2 metros” retornou carregador de parede;
> “pensando bem”, “chega amanhã” e “sem remédio” foram mal roteados; cards acima de teto
> explícito apareceram; e o CEP embutido na frase de troca de endereço foi pedido novamente.
> A troca de endereço ainda derrubou a cotação velha antes do pagamento e nenhum Pix/cartão
> foi acionado. Evidência detalhada em `docs/testes-whatsapp-2026-08-14.md`.

> **15/08 — nome público do WhatsApp em revisão.** Para o número conectado da Lia
> (`+55 11 97844-4813`), foi enviado no WhatsApp Manager o novo nome visível **Lia Delivery**,
> removendo o sufixo com CNPJ e nome pessoal. A Meta registrou **In Review**; o texto antigo
> continua público até a aprovação. Não houve alteração de código, número ou pagamento.

> **19/08 — foto salva; nome ainda antigo.** A foto de perfil oficial (monograma lima em
> fundo berinjela) foi enviada e salva no WhatsApp Manager para `+55 11 97844-4813`.
> A checagem posterior mostrou o display name `Lia Delivery by 67.742.955 Joseph Carlos
> Dayan`, status **Approved**: a troca para **Lia Delivery** não está refletida. Não houve
> alteração de código, número ou cobrança. O Activity log registra `Name verification
> requested` em 17/08, sem evento de aprovação ou rejeição. Uma nova foto HD foi preparada
> em PNG 2048×2048, direto do vetor e com o símbolo 30% maior. O dono escolheu a composição
> anterior, com a estrela um pouco além da ponta do “L”; ela foi enviada e salva no WhatsApp
> Manager em 19/08. A Meta informou que a atualização pode levar alguns minutos para aparecer.

> **15/08 — nova rodada independente de conversa.** Dez cenários foram repetidos em uma
> conversa limpa, sem cobrança. Passaram troca de item, shampoo com “sem remédio”, presente
> até R$100 e sequência 4x → 7x → 5x de bombom. Persistiram ruídos quando “barato”, “Para
> domingo” ou “Para uma viagem” aparecem junto do pedido, quando leite e “mais dois” vêm na
> mesma mensagem, e a cesta não é retomada automaticamente após salvar novo endereço.
> Registro completo em `docs/testes-whatsapp-2026-08-14.md`.

> **11/08 (7ª) — 2ª revisão: 4 lacunas de concorrência fechadas.** Lock de turno por
> conversa (mensagens simultâneas não se apagam mais; colunas novas JÁ no banco);
> trocar endereço com pedido na fila ATUALIZA o pedido (e com pagamento emitido orienta
> a cancelar — nada fica órfão); falha parcial no envio da cotação não desalinha pedido
> e conversa; eco da simulação VTEX validado item a item (id+quantidade+itemIndex).

> **11/08 (6ª) — conversa duplicada dividia a cesta (achado ao consertar o dedupe).** Duas
> mensagens simultâneas do mesmo número abriam DUAS conversas ativas — cesta dividida,
> item sumindo, dedupe furado. Um número em produção tinha 86 conversas ativas. A criação
> virou upsert com id determinístico (`conv_<userId>`), atômico por chave primária. Suíte
> 297/297; golden 32/33 DET · 33/33 IA.

> **11/08 (5ª) — revisão de código: 6 P1 corrigidos antes de publicar.** Frete VTEX cobrava
> o frete de 1 item numa cesta de N (agora soma por item, item indisponível vai pro
> operador, preço ausente ≠ grátis); falha de envio ao publicar cotação deixava pedido
> zumbi (agora faz rollback pra fila do operador); pedido mínimo da loja não valia no
> concierge; botão "Trocar endereço" era engolido pelo menu de pagamento; escritas
> concorrentes podiam ressuscitar pedido cancelado (agora `updateMany` com status no
> WHERE); dedupe de webhook virou atômico com índice único PARCIAL (`sender='user'`,
> **já aplicado no banco**). Mais: TTL passa a medir a última mensagem (cliente ativo não
> é mais expirado), "troca X por Y" busca nas 18 vitrines, refino não apaga o histórico de
> paginação, `tail-messages` vira tail de verdade.

> **11/08 (4ª) — teste real do dono: card escolhia produto errado (id posicional) + "outras"
> com 1 opção + botão Trocar endereço.** "Escolher esse" agora carrega o SKU do card — toque
> em card antigo (pós-paginação) escolhe o produto DAQUELE card, nunca a posição da lista
> nova (`shownOptions` guarda o histórico). "Outras" completa até 3 do pool (12/loja).
> Resumo da cotação com botão "Trocar endereço" no lugar da instrução de digitar.

> **11/08 (3ª) — fim da linha livre: pede → preço na hora → acabou.** Decisão do dono: o
> "vou cotar" não existe mais no fluxo normal. Item sem preço nas 18 lojas = "não tenho
> como trazer" na mesma resposta (nunca entra na cesta); fechar com escolha aberta pede
> pra confirmar o item. Toda cesta é precificada e todo fechamento tem total NA HORA. O
> caminho do operador virou fallback técnico (falha de frete / kill-switch), cercado por
> alerta + expiração de 1h. Bônus: 151 palavras com encoding corrompido no seed Imigrantes
> corrigidas (destravou 30 águas e a penalidade da Coca "Sem Açúcar" que o mojibake
> driblava); "tônica/micelar/termal" viraram variante processada. Golden 32/33 · 33/33.

> **11/08 (2ª) — saída sempre visível + abandono expira sozinho.** Botão *Cancelar* no menu
> de pagamento e botão *Cancelar pedido* em toda mensagem de espera de cotação (Meta;
> texto puro segue aceitando "cancelar"). Cliente que some por 1h+ com cotação parada:
> pedido não-pago cancela sozinho (nota no /ops), conversa recomeça limpa (endereço fica)
> e a mensagem nova processa do zero — o zumbi não se repete. Pago e awaiting_payment
> nunca são tocados. Env: `LIA_QUOTE_ABANDON_TTL_MS` (60 min).

> **11/08 — "camiseta caiu na cotação" NÃO era a busca: pedido zumbi + falta de alerta ao
> operador.** O pedido de ração de sábado (26 min antes do deploy da cotação instantânea)
> ficou 2 dias em `awaiting_operator_quote` sem ninguém cotar no /ops, e a camiseta de
> hoje entrou nele (desenho de 07/08). Causa raiz: nenhum aviso ao operador. Fechado:
> alertas no WhatsApp do operador (`LIA_OPERATOR_PHONE` — **setar na Vercel + redeploy**)
> em cotação manual nova, item adicionado e pedido PAGO. Bônus do mergulho: card de
> sábado morreu por foto 404 no CDN (erro 131053, classe nova) — pré-flight de imagem no
> card Meta: foto morta = card sem foto, nunca card perdido. Desbloqueio do zumbi: cliente
> manda "cancelar". Testes novos: alerta E2E + card sem header.

> **10/08 — opções diversas + botão "Outras opções" + vistoria de rodagem.** Caso do dono:
> "carregador"/"ração" mostravam 3 variantes quase iguais. As 3 opções agora são produtos
> DISTINTOS (`sameProductVariant`: nome sem cor/medida, Jaccard ≥ 0.75; candidatos distintos
> primeiro no gather; regra 3 do rerank endurecida) — golden 32/33 DET · 33/33 IA, campo novo
> `distinctOptions`. Quem não gosta de nenhuma tem saída visível: botão **"Outras opções"**
> no último card Meta (`opt:outras`, mesmo ramo do texto), atalho anunciado no fallback
> numerado ("*outras*" seco funciona), paginação cross-store com diversidade e sem repetir
> variante do dispensado. A vistoria de rodagem completa (talk-lia) pegou e fechou um buraco
> antigo: paginação sem piso de relevância ("outras" de carregador devolvia Sérum Nivea
> "Cellular" e chip de operadora) — `conciergeMatchIsStrong` agora vale na paginação/refino.
> Suíte inteira verde local (283/283). **PUBLICADO no mesmo dia** com autorização do dono:
> push `93e8f78..a4fd0ef`, deploy `dpl_4Aa3SdK3pUEt5M5wBaM8H6s2rM6g` (commit `a4fd0ef`)
> `READY` em Production servindo `liadelivery.com.br`. Smoke: landing 200, `/ops` 200,
> webhook GET 403 / POST sem assinatura 401. Pendente de verificação humana: 1 conversa
> real tocando **"Outras opções"** no último card (card só se prova ao vivo;
> `scripts/tail-messages.mts` lê a evidência) e o log `[instant-quote:live]` do 1º pedido.

> **09/08 — falha da Meta agora é DURÁVEL no banco + tail de conversa.** Constatação: o
> conserto dos cards (09adb388, quinta ~12:40) nunca foi exercitado — as duas únicas
> mensagens no banco desde então são as do teste das 11:51 de quinta, ANTERIORES ao fix.
> E o runtime log do plano Hobby retém só 1h: se o teste real não for lido na hora, a
> evidência evapora. Fechado: `status: failed` da Meta agora também vira `Message`
> (sender `meta-status-failed`) na conversa do destinatário, e `scripts/tail-messages.mts`
> lê as últimas mensagens reais do banco a qualquer momento. Pendente: 1 teste real do
> dono ("quero um cotonete") para validar os cards com URL encodada.

> **07/08 (3ª) — cards de opção sumindo: URL de imagem com caractere não-ASCII + falha
> assíncrona invisível.** Teste real do dono às 11:51: "quero um cotonete" → header "Achei
> essas opções" e NENHUM card. Telemetria de produção: webhook 200, zero exceção — a Graph
> API aceita o card (2xx) e o fetcher da Meta descarta depois, silenciosamente; o suspeito é
> o `®` cru no path da imagem da Pague Menos ("hastes-flexiveis-cotonetes®-…"). Dois
> consertos: (1) `safeMediaLink` percent-encoda URL não-ASCII em todos os envios de mídia
> Meta (nunca re-encoda %XX legítimo); (2) o webhook agora LOGA `status: failed` da Meta
> com código e detalhes (`[whatsapp:meta:status-failed]`) — antes o callback de falha era
> ACKado e jogado fora, e não havia como saber o porquê. Próximo teste real mostra o erro
> exato nos runtime logs da Vercel se algo ainda falhar.

> **07/08 (2ª) — emoji literal era bug do minificador SWC; resolvido na raiz.** O
> `🙂` visto no WhatsApp vinha do SWC fundindo strings com emoji em template
> literals com escape duplo — 5 emojis de copy corrompidos no bundle, fonte sempre esteve
> certo. `serverMinification: false` + guarda `check-bundle-emoji.mjs` no build (falha se
> voltar). A linha livre agora conta que a Lia PROCUROU ("isso ainda não está na vitrine —
> consigo mesmo assim: o operador cota") — o caso "adaptador hdmi" (nenhuma loja tem) parecia
> "anotou sem procurar". Vitrine de eletrônicos/acessórios segue rasa (lacuna conhecida).

> **07/08 — PUBLICADO em produção.** Deploy `dpl_Hg6fJBVaD7a8xMWZPVsKqP5eFuPg` (commit
> `e8dea9f`, READY) com autorização do dono: busca com rerank por IA + golden set, consertos
> de matcher/onboarding, cotação sem engolir pedido novo, e os commits do cartão salvo de
> 05/08 (flag desligada — sem mudança de comportamento). Smoke: landing 200, `/ops` 200,
> webhook rejeitando sem assinatura. Verificação humana pendente: conversa real no WhatsApp
> (carregador usb c, cotonete, item durante cotação, emoji 🙂) e limpar pedidos antigos
> presos em `awaiting_operator_quote` no `/ops`.

> **07/08 — cotação do operador deixou de engolir pedido novo.** Screenshot de produção:
> "quero um cotonete" com pedido em `awaiting_operator_quote` respondia "segura aí" e
> descartava o item — o cliente teve que cancelar pra pedir de novo. Agora o item entra no
> mesmo pedido como linha livre, o operador vê a adição no /ops (nota ➕) e o cliente recebe
> "Anotei e já incluí na cotação". Regressão em `tests/manual-concierge.test.ts` (13 testes).
> Do mesmo screenshot: cotonete como linha livre e o emoji literal `🙂` são o
> código antigo no ar — resolvem com o deploy (o emoji não existe em nenhuma versão do
> fonte; conferir pós-deploy).

> **06/08 — onboarding: endereço deixou de virar lista de compras.** Achados ao validar a
> busca numa conversa real, mesma família de sintoma (busca devolvendo lixo), origem
> diferente: (1) endereço **com CEP na mesma mensagem** — a forma mais natural de responder —
> caía no parser de itens ("Já anotei: 1x apto 5") e a Lia repetia o pedido de endereço;
> agora é salvo, e do texto **cru** (o normalizado mandava "av paulista 1000 apto 5" pro
> motoboy); (2) endereço como **primeira mensagem** virava itens; agora é salvo; (3) pedido
> feito **enquanto a Lia espera o endereço** era descartado em silêncio; agora é guardado e
> buscado quando o endereço chega. 3 regressões novas em `tests/manual-concierge.test.ts`
> (12/12 verde).

## 1. O que é a Lia

**Concierge de compras do dia a dia no WhatsApp.** O cliente pede itens em linguagem natural;
um operador cota e compra o que for necessário, e a Lia só cobra por **Pix ou cartão** após a
aprovação do cliente. Pix e Checkout Pro usam Mercado Pago; o cartão nativo no WhatsApp,
quando habilitado, usa Meta Cloud API direta + Pagar.me. Na modalidade rápida, o motoboy retira
o pacote **na base do operador**; a entrega do varejista continua alternativa.

“Entrega hoje” no concierge é uma modalidade separada: só pode ser oferecida quando o operador
consegue comprar e entregar o pacote à sua própria base antes de despachar o courier. A alternativa
é a promessa same-day do próprio varejista. `Clique-e-retire + motoboy aleatório` continua fora do
modelo: o courier não retira no balcão da loja.

- **Receita:** markup de **10%** embutido no preço (produto e frete são pass-through).
- **Sem remédio** (ANVISA). **Fontes ativas:** Oba Hortifruti (mercado/essenciais), Petz e O
  Boticário. Carrefour foi removido do produto ativo após o bloqueio da sessão remota; Mambo
  ficou apenas como candidato pesquisado. O primeiro preflight ao vivo deve ser Oba ou Petz.
- **Moat:** a **largura** — "qualquer coisa, de qualquer loja, num WhatsApp só".

---

## 2. O fluxo completo do cliente (vigente em 05/08)

### Primeira compra (cliente novo)

```
1. 💬 "oi" → Lia pede endereço completo + CEP (uma vez; fica salvo).
2. 💬 Cliente pede em linguagem natural ("coca, ração e um vedante de torneira").
3. 🤖 Vitrine híbrida: item com match nas 18 lojas vira card com foto + botão
   "Escolher este" (até 3 opções); item sem match vira linha livre ("vou garimpar
   pra você"). NADA é recusado. Escolher não fecha a lista.
4. 💬 Cliente soma o que quiser → fecha com "só isso".
5. 👤 Operador cota no /ops (custo dos produtos + frete + modalidade + prazo) e publica.
6. 🤖 Cliente recebe o resumo com total e os botões Pix / Cartão:
   · Pix → copia-e-cola → confirmação na hora (webhook MP).
   · Cartão 1ª vez → link seguro /cartao → digita o cartão UMA única vez →
     cobra e SALVA a credencial (tokenizada no Pagar.me; a Lia não vê o número).
7. ✅ Pago → operador compra → motoboy da base do operador OU entrega do varejista.
8. 🤖 Lia comunica cada etapa até a entrega.
```

### Recompra (a mágica do cartão salvo)

```
1. 💬 Pede itens (ou "o de sempre") → mesmas opções → "só isso" → operador cota.
2. 🤖 No resumo, escolhendo cartão: chega o botão "💳 Pagar •••• 1234".
3. 👆 UM TOQUE. Pago. Sem número, sem CVV, sem sair do chat.
```

### Desvios já tratados (nenhum cliente fica preso)

- Cartão recusado → aviso + link Checkout Pro na hora.
- "Outro cartão" → expira a cobrança pendente e manda link novo de cadastro.
- Toque duplo no botão → cobra UMA vez (idempotência por tentativa).
- "Só isso" no meio das opções → o item pendente vira linha livre (não some).
- Pós-pagamento: sem cancelamento/substituição; item faltante = estorno do item;
  atraso = aviso. Antes de pagar, o cliente pode limpar a lista à vontade.

**Status do cartão salvo:** validado ponta a ponta no sandbox real do Pagar.me em 05/08
(inclusive cobrança sem CVV, replay e recusa). Em produção fica atrás de
`LIA_ENABLE_SAVED_CARD` (desligada) até a habilitação comercial + smoke real de R$ 1.

**Dinheiro:** cliente paga tudo (produtos +10% + frete) → cai na conta MP (Pix/link) ou
Pagar.me (cartão salvo) → você paga o varejista desse saldo → **sobra a margem de 10%**.
No cartão via Pagar.me o repasse leva ~15 dias (capital de giro no meio).

---

## 3. O que está PRONTO e REAL ✅

| Componente | Status |
|---|---|
| **Oba — mercado/essenciais** | ✅ Cotação Browserbase validada em Production em 19/07, ainda em `cart_only`: catálogo VTEX por SKU/vendedor, sacola isolada, simulação por CEP e estoque/frete/prazo obrigatórios. O job técnico chegou a `cart_ready` com arroz Camil 1 kg (R$ 5,99), frete R$ 9,90 e janela de entrega do varejista no CEP público `01310-100` (total R$ 15,89). A chave Browserbase e `OBA_BROWSER_CONTEXT_ID` são Sensitive; migration de defaults Oba aplicada e conferida. No fluxo ativo, a vitrine é referência e a cotação final é manual. |
| **Busca Petz** | 🟡 busca ao vivo + cache de 15 min. O preflight novo de 20/07 confirmou SKU/preço/subtotal, alcançou `/checkout/cart/<id>`, mas não recebeu frete/prazo ou controles de entrega no Context; falhou fechada em `needs_human`. O `/ops` agora abre uma sessão viva isolada, sem sacola/pagamento, para o operador selecionar entrega no endereço na Petz; depois disso, o preflight deve ser repetido. |
| **Busca Boticário** | 🟡 busca ao vivo + cache de 15 min; SKU, preço e URL reais. O novo preflight de 20/07 confirmou novamente SKU B88468, quantidade e subtotal de R$ 16,90, mas não recebeu prazo domiciliar. O link “Entrega Rápida” é informativo e o `postalCode` permanece bloqueado pelo varejista. O parser rejeita promoção de frete grátis e retirada como cotação. Permanece `needs_human`, sem cobrança ou compra. |
| **Multi-loja + roteamento** | ✅ Oba + Petz + Boticário; **1 loja por pedido**, escolhida por match. |
| **Pix (Mercado Pago)** | ✅ **REAL, testado com pagamento de verdade** — conta PJ confirmada pelo dono no painel para a aplicação `LIA - APP` em Produção; variáveis de acesso e webhook presentes na Vercel Production. |
| **Cartão (Checkout Pro)** | ✅ link hospedado no MP com taxa repassada; mesmo webhook do Pix |
| **Cartão One-Click (Meta + Pagar.me)** | 🟡 código concluído, flag desligada; primeira compra tokeniza no Pagar.me, recompra usa `order_details` nativo. Migrations aplicadas. Ticket Meta `37565409896407734` **encerrado em 05/08 com resposta padronizada** — sem porta self-serve; frente estacionada até GA ou Solution Partner (sem migrar sender). Faltam habilitação, configuração Pagar.me e sandbox. A documentação confirma que `recurrence_cycle` é de recorrência externa e não se aplica à recompra avulsa da Lia; o payload atual usa corretamente `card_id` sem o campo. Não usa 360dialog. |
| **Qualificação externa de WhatsApp Payments** | 🟡 A rota Infobip foi encerrada após a negativa de 03/08. O Suporte Direto da Meta **encerrou o ticket `37565409896407734` em 05/08** com resposta padronizada, sem análise. Frente estacionada até GA ou Solution Partner patrocinador; não migrar/compartilhar sender nem alterar WABA, número, Graph API ou webhook. |
| **Comandos de conversa** | ✅ status, "paguei" (verificado no MP em prod), limpar/cancelar antes do pagamento, trocar endereço, "tira X", "troca X por Y", repete o de sempre, ajuda |
| **Conversa / NLU** | ✅ reconstruída após review: onboarding preserva o pedido até o CEP, perguntas não viram item, total parcial, encerramento de lista, atendimento/reclamação, cancelamento e pagamento são contextuais |
| **Escolha de opções** | ✅ número, ordinal, preço, recomendação, marca/nome, refinamento e estreitamento de opções; "coca" entre duas Cocas não vira item novo |
| **Matcher dos catálogos** | ✅ piso de relevância + guardas de negação, produto humano/pet, espécie, tamanho e variante; básico/adulto/seco primeiro quando não há preferência explícita |
| **Testes de compra e conversa** | ✅ Em 19/07, TypeScript, lint, build e 204 testes passaram (162 aprovados; 42 integrações de banco puladas por indisponibilidade do Postgres remoto). Checkout ao vivo continua um gate separado. |
| **Cotação antes de cobrar** | 🟡 Implementada genericamente para Oba, Petz e Boticário: só libera pagamento depois de itens, total, frete e prazo. Oba e Boticário ainda precisam de preflight Browserbase ao vivo; Petz precisa validar o fluxo genérico atual. Compra final permanece bloqueada em `cart_only`. |
| **Motoboy (Uber Direct)** | ⚠️ OAuth + cotação funcionam, mas não autorizam retirada em varejistas de consumidor. Só usar com parceiro compatível. |
| **Cobertura** | ✅ O concierge aceita somente o estado de SP, com bloqueio rígido de UF/CEP. Dentro de SP, o checkout do varejista ou a cotação manual confirma se o endereço, frete e prazo são viáveis. A guarda de 12 km é apenas legado do fluxo antigo. |
| **Lojas (107 unidades geocodadas)** | ✅ dado útil para parceiros/same-day; proximidade não prova estoque, entrega ou prazo do varejista. |
| **Landing + domínio** | ✅ **liadelivery.com.br no ar** (HTTPS) — site novo (pôster Petróleo), domínio **verificado na Meta** |
| **Meta / WhatsApp oficial** | ✅ número aprovado, Cloud API ativa em produção e webhook assinado validado |
| **Opções pra escolher** | ✅ até 3 cards com foto + botão **Escolher este** na Meta; lista numerada como fallback |
| **Pedido mínimo** | ✅ por loja; avisa o cliente p/ completar. |
| **Painel do operador `/ops`** | ✅ publicado: cota qualquer lista, reaproveita pagamento e tem o botão único **“Comprei — despachar motoboy”**. O despacho real exige `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP`. |
| **Acesso ao `/ops`** | ✅ `OPS_TOKEN` dedicado, Sensitive em Production e Preview, criado e implantado em 16/07; não substitui `API_TOKEN` e não foi exposto. |
| **Onboarding de endereço** | 🟡 o endereço completo é pedido e persistido uma vez no fluxo e está coberto pelos evals; falta validar o resumo/cotação em checkout real. |
| **Markup 10%** | ✅ embutido no preço (sem linha de "taxa") |
| **Privacidade da loja** | ✅ a Lia não precisa expor o varejista ao cliente ("Procurando…"). |
| **Canal** | ✅ Meta Cloud API em produção; Twilio Sandbox é legado de teste. |
| **MEI (PJ/CNPJ) + e-mail** | ✅ MEI confirmado; não exige contador fixo. Manter relatório mensal/DASN e documentar a rotina fiscal da Lia. `contato@liadelivery.com.br` configurado no ImprovMX |

**Atualização operacional (02/08):** o `/ops` agora trata despacho repetido como operação
idempotente (não cria um segundo courier), registra eventos seguros de compra/despacho/entrega
e permite registrar o valor e a referência de estorno integral ou parcial antes de avisar o
cliente. A validação com pedidos reais continua separada e opcional.

---

## 4. O que FALTA para aceitar pedidos pagos (por prioridade)

O limite geográfico já está resolvido: o concierge opera somente no estado de São Paulo.
O código, o deploy e a proteção de compra estão prontos; a lista abaixo reúne apenas
configuração e decisões humanas que ainda impedem dinheiro real. A validação de pedidos fica
para quando o operador decidir, depois desses gates.

### 🔴 O que destrava o produto
- **Base para motoboy na hora:** `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` já
  estão configurados como Sensitive em Production. A entrega do próprio varejista pode ser
  usada quando o checkout confirmar essa modalidade.
- **Operação humana:** contratar o operador e usar [o runbook](docs/operador-runbook.md).
- **Fila técnica:** 12 preflights internos sem pagamento foram removidos com autorização. Restam
  7 pedidos `paid` antigos, preservados para conciliação ou estorno; não são lixo descartável.
- **Histórico do fluxo legado (19/07):** o Context persistente, a configuração e o preflight técnico do
  Oba já foram validados em Production em `cart_only`. Petz e Boticário chegaram a carrinhos reais,
  mas ambos falharam fechados antes de preço de entrega/prazo: Petz não expôs os campos na sacola
  completa; Boticário não liberou a confirmação de CEP. Resolver esses gates antes de repetir os
  preflights e obter a validação comercial/termos. Nenhuma etapa cobra ou compra.
- **Sessão de entrega Petz (20/07):** publicada e aberta pelo `/ops` para a seleção manual de
  entrega no endereço dentro da Petz. Ela abre já na página inicial da loja, sem carrinho,
  pagamento ou interação automática, e fica aberta por até uma hora. Não é validação de cotação: o próximo passo técnico é um
  novo preflight, após o varejista expor frete e prazo reais. O visualizador Browserbase embutido
  no Codex não se mostrou estável para o operador, então a sessão viva foi aberta no Safari.
  Após encerrar a sessão pelo `/ops` para persistir a ação manual, um retry fresco ainda chegou
  somente a `/checkout/cart/<id>` com SKU R$ 15,99; a etapa de entrega não apareceu. Permanece
  `needs_human`, sem evidência de frete/prazo e sem cobrança ou compra.
- **Handoff Carrefour rejeitado:** o cliente não receberá links para terminar a compra. A experiência
  deve continuar integralmente na Lia. Para testes internos, resta operação humana invisível no
  navegador comum; para um piloto operacional sem checkout web, avaliar shopper próprio em loja.
  Nenhum desses caminhos é tratado como automação escalável.
- **Carrefour de longo prazo:** negociar integração homologada de catálogo/cotação/pedido com o
  varejista ou um app de delivery parceiro. Marketplace Seller e APIs públicas do iFood são fluxos
  do lado da loja, não APIs para criar uma compra de consumidor.
- **Supply ativo:** Oba é a fonte de mercado/essenciais; Petz e Boticário completam pet e beleza.
  Mambo não integra o produto. Oba passou no teste público e no preflight Browserbase em
  Production, com carrinho, estoque, total, frete e janela reais antes da cobrança. Boticário
  passou a extrair frete e promessa, mas precisa validar ao vivo.
- **Próximos candidatos (pesquisa, não validação):** Pão de Açúcar é a primeira substituição para
  mercado em São Paulo; sua documentação oficial descreve seleção de entrega e frete/prazo por
  CEP. Cobasi é a primeira substituição para pet; a política oficial exige calcular frete/prazo
  no carrinho e oferece entrega própria. Savegnago é adequado apenas onde sua rede atende no
  interior paulista. Nenhum dos três novos candidatos está integrado ou aprovado.
- **Cobasi — pet (smoke ao vivo):** ✅ em 20/07, navegação anônima com CEP público `01310-100`
  adicionou produto real à sacola e o checkout mostrou Cobasi Já, Econômica, frete, prazo e total
  antes de pagamento; ao continuar, chegou ao login. O carrinho técnico foi limpo. **Leroy Merlin
  — casa/manutenção (smoke ao vivo):** ✅ produto vendido e entregue pela Leroy, CEP público,
  entrega domiciliar, frete, prazo e total reais; ao continuar, chegou ao login e a sacola foi
  esvaziada. Para Leroy, um futuro conector deve aceitar exclusivamente itens vendidos e entregues
  pela própria loja. 🟡 Nenhuma das duas tem conector, Context Browserbase, preflight de produção
  ou validação comercial. **Sephora:** chegou a produto/CEP, mas a sessão ficou instável antes da
  sacola; não é candidata. **Pão de Açúcar:** a rota pública foi bloqueada por `az-request-verify`
  antes de produto/CEP; não é candidato automatizável agora.
- **Titularidade e pós-venda:** ✅ decisão tomada: a operação financeira e a titularidade
  operacional são da PJ; antes do pagamento o cliente pode limpar a lista; depois do pagamento
  não há cancelamento iniciado pelo cliente nem substituição; item faltante gera estorno do
  próprio item; atraso é comunicado. A execução de estorno parcial ainda é manual e precisa de
  referência do provedor.
- **Fiscal:** 🟡 a empresa é MEI e não precisa de contador fixo. Para a rotina da Lia, PF é
  dispensado de NF salvo solicitação; PJ exige documento fiscal. Falta apenas documentar se o
  fluxo de mercadoria/serviço usa NF-e, NFS-e ou outro documento.
- **Pilotar entrega direta** com 5–10 pedidos controlados, sem prometer motoboy.
- **Testar checkout e cartão salvo** em `cart_only`, incluindo CVV, 3DS, CAPTCHA e antifraude.
- **Validar a revisão do `/ops`** para frete/prazo/rastreio do varejista e estorno auditável.
  A revisão está implantada; falta massa técnica nova. A orquestração de cotação antes da
  cobrança precisa ser levada para Petz antes do piloto.
- **Antes de habilitar One-Click:** confirmar as migrations de pagamento aplicadas, obter a
  allowlist Payments API BR da Meta, liberar domínio/configurar webhook no Pagar.me e rodar testes
  sandbox de primeira compra, recompra, recusa e resposta perdida. Guia:
  [docs/whatsapp-one-click-pagarme.md](docs/whatsapp-one-click-pagarme.md).
- **Habilitação na Meta encerrada sem análise (05/08):** o ticket `37565409896407734` foi
  fechado com resposta padronizada e não aceita réplica. Manter a flag desligada; reavaliar na
  rotina mensal (GA da Payments API BR ou Solution Partner que habilite sem migrar o sender).
  A rota Infobip foi encerrada em 03/08.
- **Validar o payload Pagar.me no sandbox:** manter `card_id` sem `recurrence_cycle`, pois o
  campo é de recorrência externa; testar CVV/3DS, antifraude, recusa e reconciliação antes da
  ativação real.

### 🟡 Pra operar de verdade
- **WhatsApp oficial da Meta**: ✅ o número `+55 11 97844-4813` foi aprovado como
  `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e ativado em
  produção (`WHATSAPP_PROVIDER=meta`). O webhook assinado foi validado em produção.
- **Mercado Pago PJ + nota fiscal** (hoje o Pix está no nome pessoal).
- **Confirmar cobertura real de entrega** por CEP em Oba, Petz e Boticário. Unidade
  próxima não prova estoque, frete ou prazo.

### 🟢 Pra escalar (pós-piloto)
- **Mais lojas** (a largura = moat): **Cobasi** (mesma receita, já confirmado raspável),
  **farmácia não-remédio**, **beleza** (Boticário/Sephora).
- **Fortalecer busca/cotação ao vivo:** Browserbase + cache já existem; falta medir p95,
  concorrência por Context, falhas de anti-bot e custo por pedido. O checkout continua sendo
  a fonte final de preço, estoque, frete e prazo.
- **Cesta multi-loja** (juntar Oba + Petz num pedido) — decidimos deixar pra depois
  (= 2 compras, fretes, entregas e pós-vendas).
- **Expandir catálogos** e medir cobertura dos três varejistas periodicamente.
- **Migração de schema (quando fizer sentido):** coluna `paymentMethod` no DeliveryOrder
  (hoje é inferido de `notes`/link — centralizado em `src/lib/order-flags.ts`) e índice
  único em `Message(conversationId, metadata)` pra fechar de vez a janela de corrida do
  dedupe de webhook (hoje é check-then-insert; janela pequena, mas existe).

---

## 5. Riscos honestos a validar no piloto

1. 🧾 **Titularidade/termos:** conta central comprando para vários destinatários, NF, troca
   e devolução precisam de validação jurídica e comercial.
2. 💰 **Cliente pagar o total** (produto+frete) pela conveniência vs. comprar diretamente.
3. 🛡️ **Checkout:** cartão salvo, CVV, 3DS, CAPTCHA, antifraude e duplicidade.
4. 📦 **Preço/estoque desatualizados.** Mitigação: cotação e revalidação no checkout do
   varejista antes de cobrar/aprovar; sem link de handoff ao cliente.
5. 🛵 **Same-day:** não prometer retirada por courier sem parceiro que a autorize.

---

## 6. Como operar / testar

**Cliente (pelo celular):** manda no WhatsApp da Lia → `oi` → CEP → itens → escolhe opções
→ `pagar` → paga o Pix. Recebe "Pagamento confirmado ✅".

**Operador:** abre `liadelivery.com.br/ops?key=<OPS_TOKEN>` → vê o pedido
pago → confere o carrinho/sessão → aprova a compra com entrega direta → registra o número
do pedido e acompanha preparação, rastreio e entrega do varejista. Cancelamento pago entra
em `refund_pending`; a confirmação só é enviada depois de registrar a referência real do
provedor. Runbook: [docs/operacao-piloto-needs-human-estorno.md](docs/operacao-piloto-needs-human-estorno.md).
O card também permite **avisar o cliente** (item faltante/estorno ou atraso, vira mensagem da
Lia). Substituições não fazem parte da operação atual; o pedido pago não oferece cancelamento
ao cliente.

**Motoboy:** não faz parte do fluxo padrão. Varejistas de consumidor podem exigir documentação do titular
para retirada por terceiro; não enviar documentos pessoais a entregadores on-demand.

---

## 7. Credenciais / ambiente (Vercel)

| Configurado ✅ | Pendente / opcional |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` + webhook | `MERCADO_PAGO_WEBHOOK_SECRET` (assinatura é só aviso) |
| `BROWSERBASE_API_KEY` + Contexts dos varejistas | `OBA_BROWSER_CONTEXT_ID`, `LIA_OBA_MIN_ORDER`, `LIA_PETZ_MIN_ORDER`, `LIA_BOTICARIO_MIN_ORDER` |
| `UBER_DIRECT_CUSTOMER_ID/CLIENT_ID/CLIENT_SECRET` (opcional/parceiros) | Política e credenciais de rastreio dos varejistas |
| `OPENAI_API_KEY`, `DATABASE_URL`, `API_TOKEN`, `OPS_TOKEN`, Meta Cloud API | Scraper pago (estoque ao vivo) — futuro |
| `LIA_COVERAGE_PRESET=estado-sp` (SP inteiro) | `LIA_MAX_DELIVERY_KM` (12), `LIA_MAX_DELIVERY_FEE` (35) — ajuste da guarda |

> 🔒 Recomendado: **regenerar** o Access Token do MP e o Client Secret da Uber (passaram no
> chat) e atualizar no Vercel depois dos testes. Em 15/07, credenciais Browserbase/Vercel
> também apareceram em saída de diagnóstico. O token OIDC local da Vercel foi renovado em
> 15/07; a chave Browserbase ainda precisa ser regenerada e atualizada nos ambientes antes
> do piloto. Em 15/07 foi aberta uma sessão persistente do Context Carrefour, sem itens ou
> cobrança, aguardando reautenticação manual por senha/OTP/CAPTCHA. Uma chave de reposição
> foi enviada por chat e, portanto, também deve ser descartada e regenerada antes do uso,
> mesmo com autorização posterior para instalá-la. A variável atual de produção não autenticou
> no Browserbase em 15/07 (`401` por chave ausente); configurar a nova chave na Vercel e
> implantar é pré-requisito para retestar. A URL correta de Environment Variables foi aberta
> no navegador embutido em 15/07, mas a Vercel pediu login manual antes da edição. Após o
> operador tentar salvar apenas em Production, uma leitura nova por `vercel env pull` ainda
> encontrou `BROWSERBASE_API_KEY` sem valor; confirmar o salvamento efetivo no painel antes
> de disparar outro deploy. A tela posterior mostrou valor `sk_live_` no campo, prefixo que
> não pertence ao Browserbase; substituir por uma nova chave `bb_live_` e marcar Sensitive
> antes de implantar. Uma segunda leitura do Production depois da alegada correção ainda não
> recebeu a variável, portanto o deploy e o reteste Carrefour continuam bloqueados. Depois,
> o painel confirmou a variável como Sensitive, em Production e atualizada; o deploy de
> produção subsequente ficou Ready em 15/07. A CLI local não baixa esse segredo Sensitive,
> portanto a autenticação será confirmada pelo fluxo implantado após a reautenticação manual
> do Context Carrefour, que foi reaberto sem itens, checkout ou cobrança.
> O operador informou que a reautenticação foi concluída na tela em 15/07; ainda falta
> escolher endereço salvo e item de teste para executar o preflight de carrinho, frete e
> prazo. Nenhum pagamento ou compra foi iniciado.
> Em 16/07, credenciais Carrefour foram expostas no chat. Os valores não foram persistidos
> nem registrados no projeto; a senha deve ser rotacionada antes do piloto. O inspetor
> remoto não expôs campos seguros para automação, portanto uma sessão nova ficou aberta
> para autenticação humana.

Em 15/07, o hash de aprovação do carrinho passou a incluir frete e promessa de entrega,
além de itens e total. Falhas Browserbase 401/503, sessão Carrefour expirada e página de
varejista indisponível passaram a ser classificadas explicitamente e testadas sem abrir
checkout; `cart_only` também é testado como bloqueio anterior ao acesso ao Browserbase.

O estado de Meta, domínio, e-mail, cobrança, motoboy, painel e checklist do piloto está
centralizado em [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md).

Em 16/07, a autenticação do `/ops` foi recuperada criando `OPS_TOKEN` separado e Sensitive
em Production/Preview, seguido de redeploy que ficou `Ready`. A abertura do painel confirmou
que há pedidos legados pagos e alguns cancelados; eles não são massa segura para este teste.
Foi então criado um pedido interno isolado, em `cart_only`, com SKU Carrefour exato e CEP
público de teste `01310-100` (sem endereço pessoal). O mapeamento no navegador comum confirmou
que a UI atual submete o CEP pelo botão do formulário e só expõe frete/prazo no carrinho
completo: item R$ 1,99, frete a partir de R$ 9,90, prazo a partir de sábado e total R$ 11,89.
O conector, parsers, limpeza segura, diagnóstico e página `/ops/teste-carrefour` foram
implantados. Os retries do workflow removeram bloqueios intermediários e chegaram ao bloqueio
real `LOGIN_REQUIRED` no Context persistente; uma sessão viva foi aberta para login humano.
Esses valores mapeiam a tela, mas ainda não são uma cotação Browserbase validada. Não houve
WhatsApp, cobrança ou compra.

Na continuação de 16/07, o painel Browserbase autenticado foi confirmado e outra sessão
Carrefour foi aberta para login humano. A reautenticação não foi concluída, sem causa confirmada,
e o operador decidiu repetir em outro momento. Não abrir novas sessões ou repetir o preflight
até a próxima tentativa coordenada.

Também em 16/07, foi confirmada e coberta por testes a serialização já aplicada por Context
Browserbase: um lease persistente impede que dois workers usem o mesmo carrinho, conflitos entram
em `preflight_queued` com retry de um minuto, e um lease abandonado só é recuperado após 15
minutos. Falhas de banco/configuração não são classificadas como carrinho ocupado. Essa alteração
foi somente local; não abriu sessão, checkout, cobrança ou compra.

Ainda em 16/07, o ciclo operacional de entrega direta foi implementado localmente sem migration:
pedidos novos passam por `retailer_preparing` e `retailer_out_for_delivery`, enquanto os estados
de retirada/courier ficaram restritos a parceiros formalmente autorizados. O backend bloqueia
despacho externo para `retailer_delivery`; o `/ops` mostra promessa e rastreio do varejista. O
cancelamento de pedido pago não afirma mais que o estorno ocorreu: cria `refund_pending`, exige
referência do provedor e só então muda para `refunded` e avisa o cliente. Foi criado o runbook de
`needs_human` e estorno. Um PIN de registro encontrado em Markdown local foi removido e precisa
ser rotacionado. TypeScript, lint, 210 testes (168 passaram, 42 foram pulados por dependência de
banco) e build passaram. Nada foi implantado ou validado ao vivo nesta alteração.

Em 18/07, a chave Browserbase exposta foi regenerada no painel oficial e atualizada como
`BROWSERBASE_API_KEY` Sensitive em Production. Um valor intermediário que foi exibido durante a
rotação foi considerado exposto, invalidado imediatamente e substituído por uma chave limpa; nenhum
valor foi salvo no repositório ou nesta documentação. O redeploy de produção da versão
`ops-direct-retailer-delivery` / `9a06eab` ficou `Ready`. Isso valida a rotação e a configuração
implantada, mas não a autenticação Browserbase no runtime nem o checkout Carrefour: não houve
preflight, sessão nova, cobrança ou compra. A senha Carrefour, o PIN de registro WhatsApp e os
segredos Mercado Pago/Uber expostos continuam pendentes de rotação.

Em 18/07, a conta Carrefour foi aberta somente para confirmar a sessão; o operador optou por
adiar a troca da senha exposta. Nenhuma credencial foi digitada, alterada ou registrada. A senha
continua tratada como exposta e bloqueia qualquer uso do Context Carrefour ou piloto até a rotação
feita pelo titular.

## 8. Arquitetura (onde está cada coisa)

| Peça | Arquivo |
|---|---|
| Cérebro da conversa (estado, roteamento, opções, mínimo) | `src/lib/delivery-service.ts` |
| Detecção de intenção (pura, sem DB — unit-testável) | `src/lib/lia-intents.ts` |
| Copy — todas as mensagens enviadas ao cliente | `src/lib/lia-copy.ts` |
| Testes/evals de conversa | `tests/` (`npm test`) |
| Lojas (plugável) | `src/lib/stores/` (`carrefour.ts`, `petz.ts`, `*-catalog.ts`, `index.ts`) |
| Cobertura + entregabilidade | `src/lib/coverage.ts` (presets/UF) + `src/lib/freight-guard.ts` (guarda km/fee) + `WaitlistLead` (mapa de demanda no /ops) |
| Geo + loja mais próxima | `src/lib/geo.ts` (haversine + geocode) + `src/lib/stores/nearest.ts` (`pickNearestUnit`) |
| Landing (site público) | `src/app/page.tsx` + `src/components/landing/` (demo de chat em `/chat`) |
| Motoboys (plugável) | `src/lib/couriers/` (Uber Direct) |
| Pix | `src/lib/payments/mercadopago.ts` + `/api/mercadopago/webhook` |
| Cartão One-Click | `src/lib/payments/pagarme.ts`, `src/lib/payments/whatsapp-pay.ts`, `/api/pagarme/webhook` e [guia](docs/whatsapp-one-click-pagarme.md) |
| Busca por IA | `src/lib/adapters/ai.ts` (`extractShoppingList`) |
| Matcher / ranking comum | `src/lib/stores/types.ts` (`scoreCatalogMatch`, `rankCatalog`, `attrMatchesItem`) |
| Painel do operador | `/ops` + `/api/ops/...` |
| Estados e convenções operacionais | `src/lib/order-flags.ts` |
| Pedido (cesta, ciclo de status) | `prisma DeliveryOrder` |

**Somar loja = 1 arquivo** (conector + catálogo) + registrar em `stores/index.ts`.
**Ciclo direto implementado localmente:** `awaiting_payment → paid → retailer_preparing → retailer_out_for_delivery → delivered`.
O ciclo antigo `operator_buying → ready_for_pickup → dispatched` permanece somente para pedidos
legados ou parceiros courier autorizados. Cancelamento pago usa `refund_pending → refunded`.

### Atualização de conversa — 2026-07-07

O review profundo de conversa (115 achados) resultou em uma reconstrução de NLU, matcher,
copy e máquina de estados. A documentação completa, com sequência do trabalho e comandos
de validação, está em [docs/evolucao-conversa-2026-07.md](docs/evolucao-conversa-2026-07.md).

### Validação ao vivo pós-deploy — 2026-08-16

No deploy informado como `8cff5c1`, uma rodada manual de 10 cenários no WhatsApp confirmou
7 sucessos, 2 resultados parciais e 1 falha clara. Quantidades, pluralização, adição relativa
na mesma mensagem e a sequência 4x → 7x → 5x passaram. A troca de endereço cancelou a cotação
antiga sem cobrança e recotou preservando a cesta, mas perdeu os dígitos do CEP no endereço
atualizado. Permanecem dois riscos de NLU: “para uma viagem” ainda pode virar produto e
“sem pimenta” pode atingir item vizinho. Nenhum pagamento foi feito e nenhum código foi
alterado nessa validação; detalhes em [docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md).

### Reteste do 6º ciclo — 2026-08-16

Contra o deploy informado como `95db8bf`, foram feitos 10 cenários novos e 3 retestes exatos:
12 passaram no critério principal e 1 foi parcial. “Para uma viagem” não criou linha de
contexto; “sem pimenta” ficou somente na linguiça; e a cesta sobreviveu à recotação de
Campinas. O artefato “CEP.” desapareceu, mas os dígitos do CEP fornecido não apareceram na
confirmação, então a persistência estruturada ainda precisa ser confirmada. Nenhum pagamento
foi feito; evidências em [docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md).
# Operador automático local (23/08/2026)

- Fundação implantada em produção: fila durável para pedidos pagos do Mercado Livre,
  autenticação própria do worker, claim com lease, retry/revisão, auditoria e
  reconciliação com `/ops`.
- Piloto permanece em `cart_only`; confirmação final automática está bloqueada no backend.
- Cliente local: `npm run purchase-worker:claim`; segredo protegido no Chaves do Mac.
- Automação de hora em hora está ativa. Primeiro check de produção: nenhuma compra pendente.
- Falta para compra sem confirmação: tela/rota de aprovação curta por carrinho, validação
  real no ML e só então liberação controlada de `PURCHASE_AUTOMATION_MODE=purchase`.
