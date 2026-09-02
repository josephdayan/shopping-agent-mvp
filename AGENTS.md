# Lia — contexto obrigatório para agentes

## Atualização 02/09/2026 — revisão completa (código + negócio) com o modelo novo

Pedido do dono: revisão completa do código, sugestões e leitura do modelo de negócio.
Relatório canônico: [docs/revisao-completa-2026-09-01.md](docs/revisao-completa-2026-09-01.md)
(19 correções, achados abertos por severidade, inventário de legado, métricas reais do
banco e três caminhos de produto com recomendação). O que mudou no código, tudo com
regressão (`tests/payment-reconcile.test.ts` 6 E2E, `auth` +2, `pricing` +2):

1. **Dinheiro que chega tem que bater com a cobrança na mesa.** `markDeliveryOrderPaid`
   aceita evidência (provedor, id, valor); o webhook do MP a repassa. Valor diferente,
   Pix que não é o vigente, ou pedido fora de `awaiting_payment` → nota
   `⚠️ PAGAMENTO FORA DO ESPERADO` + alerta ao operador + aviso ao cliente
   (`copy.unexpectedPaymentReceived`), NUNCA aprovação. Replay idempotente. Webhook
   devolve 503 em falha nossa (o MP reenvia) e valida o id antes de ir na URL.
2. **Saída única de `awaiting_payment` sem dinheiro** (`closeUnpaidOrder`): guarda de
   status no UPDATE, bloqueio se há cartão salvo CONFIRMADO (`hasInFlightCardAttempt`,
   sem filtro de TTL) e cancelamento best-effort do Pix antigo no MP
   (`cancelMercadoPagoPayment`, nunca lança). Usada por cancelar, reabrir pra editar,
   juntar/pedido novo; a troca Pix↔cartão cancela o Pix anterior depois de gravar o novo.
3. `chargeConfirmedPaymentAttempt` reconfere status e valor do pedido ANTES do PSP;
   captura em pedido que saiu de `awaiting_payment` vira alerta via evidência.
4. `issueValidatedRetailerQuotePayment`: base recomposta de subtotal+margem+frete (o
   gross-up de um cartão que falhou não contamina o Pix seguinte) e o `catch` restaura
   `total` E `quoteExpiresAt` (sem isso o "pix" seguinte cancelava como "preço vencido").
5. `/ops`: `parseMoneyInput` ("12,90" era NaN → frete R$ 0) no cliente e no servidor;
   `awaiting_payment` entrou na fila; botão **"Cancelar e solicitar estorno"** voltou
   para pedido pago (ação excepcional do operador; o cliente segue sem cancelar pós-pago
   pelo chat); erros de domínio chegam com a mensagem real (409/400).
6. **Auth do /ops unificada** em `requireOpsKey` (auth.ts): fail-closed em deploy, tempo
   constante, cookie = HMAC do token, sem fallback pra `API_TOKEN`. **Depois do deploy,
   abrir `/ops?key=<OPS_TOKEN>` uma vez** (cookie antigo não vale). Callback Apify
   fail-closed + telefone tem que ser o dono da conversa; petz-image só raster + nosniff;
   OAuth do ML exige sessão admin.
7. Conversa: lock de turno 180s (`LIA_TURN_LOCK_TTL_MS`; 60s era menor que a busca
   fria); relógio de abandono considera `order.updatedAt` (cotação manual publicada tarde
   não é cancelada no "pix"); "trocar endereço" com o mesmo CEP não restaura a rua velha;
   "pix"/"cartão" sem cesta acha cotação publicada com a conversa em outro assunto.
8. Infra: migration `20260901120000_waitlist_petz_image_indexes` (IF NOT EXISTS + 3
   índices por cliente — **ainda não aplicada em produção**, decisão do dono),
   `migration_lock.toml`, `.env.example` com as 14 envs operacionais, `.gitignore` não
   engole mais `.env.example`; removidos `/api/mercadolivre/{notifications,callback}`,
   `scripts/preflight-oba-internal.mts`, `serverComponentsExternalPackages` morto.

**Regras que saem desta revisão:** (a) nenhuma aprovação de pagamento sem evidência
(id + valor) — não reintroduzir `markDeliveryOrderPaid(id)` seco em caminho de webhook;
(b) nenhuma saída de `awaiting_payment` fora de `closeUnpaidOrder`; (c) rota nova do
`/ops` usa `requireOpsKey`, nunca cópia local. Gate: `tsc`, lint, 109 unitários,
`payment-reconcile` + `payment-issue-failure` + `saved-card` + `whatsapp-pay.db`
23/23 com banco.

**Leitura de negócio (resumo; detalhe no relatório):** 10 semanas, 295 commits, 5
pedidos reais pagos (≈R$215, todos do dono/testadores), zero concluído de ponta a ponta
pelo varejista. A família de falha presente em 100% das rodadas (frete fragmentado /
mínimo por loja / troca forçada) é desenho, não bug. Markup de 10% em cesta de R$50–80
não paga o turno manual. Recomendação: congelar features por 4 semanas e rodar piloto de
30 pedidos com desconhecidos sob contrato simples (taxa fixa, uma loja por cesta, SLA
humano visível), com a rota de parceria com um varejista testada em paralelo. Decisão do
dono pendente.

## Atualização 01/09/2026 (5ª) — revisão da 4ª: três brechas fechadas

Revisão de código da entrega da 4ª (mesmo dia) achou três furos reais; todos fechados
com teste de regressão:

1. **Toque em "Pagar •••• 1234" ainda disparava "Me perdi aqui 😅" em produção.** O
   botão traz só o `attemptId` (sem last4), `handleSavedCardPay` não respondia nada e, em
   prod, `confirmSavedCardTap` só inicia o workflow durável e retorna — turno mudo → rede
   anti-silêncio. Agora o toque busca a tentativa e responde "Cobrando no cartão final
   *1234*" (replay de tentativa já cobrada só marca o turno). A suíte NÃO exercita o
   caminho do workflow (NODE_ENV≠production); a prova final é um toque real no canal.
2. **"Cobrança fresca" media o campo errado.** `chargeFresh` usava `DeliveryOrder.updatedAt`,
   que qualquer nota renova (reclamação, "quero falar com atendente", troca de método) —
   cliente reclamava e o item seguinte era fundido em silêncio de novo. Relógio novo:
   `ctx.paymentIssuedAt` (epoch ms, gravado nas duas escritas de `step: "awaiting_payment"`);
   fallback pro updatedAt só em contexto antigo sem o campo.
3. **Pix pago com a pergunta "juntar ou pedido novo?" aberta engolia o item novo.** O
   reset pós-pagamento apagava `mergeDecision` sem aviso. `markDeliveryOrderPaid` lê o
   pedido pendurado ANTES do reset e, depois da confirmação, manda `copy.newItemAfterPayment`
   ("como este pedido já está pago, vira pedido novo — me manda de novo"). Resposta
   atrasada "1"/"2" cai fora do passo e não mexe no pedido pago.

Menores: `wantsNew` não aceita mais "outro" sozinho ("quero outro modelo" durante a
pergunta é refinamento e cancelaria um Pix emitido) — só "novo", "separado" ou "outro
pedido"; o golden inverso ("apoio de pé para violão") passou de `/p[eé]/` (casava
"pedal", "especial") para `/apoio de p[eé]|descanso/`.

Gate: tsc, units 87/87, concierge "01/09" 10/10 (3 E2E novos: reclamação não renova a
janela + "outro modelo" re-pergunta; Pix pago com pergunta aberta avisa do item; regressão
do juntar×novo agora envelhece `paymentIssuedAt`, não o pedido), saved-card com asserção
"Cobrando…" + nunca "Me perdi" no toque e no replay.

## Atualização 01/09/2026 (4ª) — conversa real do dono expôs 4 defeitos; todos fechados

Caso real (livro #GAS8P9 esperando Pix há 2h + "preciso de um apoio pra guitarra de chão"):

1. **Fusão silenciosa morreu.** Pedido não-pago PARADO (cobrança > 10 min) + item novo
   do nada → a Lia PERGUNTA "juntar no pedido ou pedido novo?" (botões `juntar_pedido`/
   `pedido_novo`, estado `awaiting_merge_decision`, ctx.mergeDecision guarda pedido+texto).
   "Pedido novo" cancela o antigo (nada cobrado, note própria) e busca o item; "Juntar"
   segue o reopen de sempre. Adicionar explícito ("adiciona/bota/põe/mais um") ou cobrança
   recém-emitida (< 10 min) continuam fundindo direto — é edição, não missão nova.
   Futuro (PENDENCIAS): manter os DOIS pedidos abertos em paralelo.
2. **"Me perdi aqui 😅" espúrio**: os botões do cartão salvo saem direto pelo adapter
   (whatsapp-pay) sem passar pelo reply() — a rede anti-silêncio achava o turno mudo e
   mandava o fallback logo depois dos botões. `createCardAttempt` agora é wrapper local
   que marca o turno respondido.
3. **Botão "Editar itens"** no resumo da cotação (junto de Trocar endereço): responde o
   manual curto (`editItemsHelp`: tira/troca/2x/adicionar) — os comandos já funcionavam,
   faltava o caminho visível.
4. **Busca "apoio pra guitarra de chão"** devolveu apoio de PÉ como top1 → 2 casos novos
   no golden (`search-golden.ts`, deterministic:false) SEM conserto de scorer ainda —
   regra do projeto: caso primeiro, conserto medido pelo `scripts/eval-search.mts` depois.

## Atualização 01/09/2026 (3ª) — nome público reenviado sem CNPJ/nome pessoal

O print real do iPhone confirmou que o cabeçalho público ainda mostrava
`Lia Delivery by 67.742.955 Joseph Carlos Dayan`. No WhatsApp Manager do número
`+55 11 97844-4813`, o nome antigo estava **Approved**. Por ordem do dono, foi
reenviada a alteração para **Lia Delivery**; a Meta aceitou a solicitação e o status
atual é **In Review**. Até a aprovação, o nome antigo continua visível. Isso é
configuração do display name na Meta: não altera código, número, WABA, webhook, Pix
nem cartão.

## Atualização 01/09/2026 (2ª) — quatro pedidos do dono após a 1ª bolha real

O dono viu a bolha real no ar (pedido #GAS8P9, R$51,77) e pediu quatro mudanças, todas
implementadas no mesmo dia:

1. **Botão "Ver total" → "Pagar"** (follow-up pós-escolha). O rótulo tinha virado
   "Ver total" na rodada 1 porque "Pagar" prometia cobrança imediata; com a bolha
   nativa o caminho até o pagamento ficou curto e o dono mandou voltar. Decisão do
   dono, 01/09 — não re-renomear sem ele.
2. **Pix v2 — "veio os dois":** a bolha nativa agora vai PRIMEIRO e, quando a Graph
   aceita, o texto `pixInstructions` NÃO sai — só o copia-e-cola solitário depois dela
   (fallback universal: WhatsApp Web/cliente antigo não renderiza `order_details`, e o
   código precisa ser mensagem sozinha pra colar no banco). Bolha recusada/flag off/
   mock → as duas mensagens de sempre. `maybeSendNativePixBubble` devolve boolean.
3. **"Ver detalhes" no card, para TODAS as lojas** (reviews/fotos/specs a um toque):
   cada card com `productUrl` ganha o botão `optinfo:<sku>` (último card fica com 3
   botões — teto Meta). O toque responde com a PÁGINA REAL do anúncio em texto puro
   (link clicável), sem mexer na escolha. Digitado também: "detalhes", "detalhes 2",
   "ver anúncio" (intent `product_details`; "link" seco fica de fora — colide com
   link de pagamento; "detalhes do pedido" continua status). Cobertura: os wrappers
   de vitrine já propagam `productUrl` do catálogo (Boticário, Cobasi, Divvino…); os
   catálogos SEM url por item (Carrefour, Petz) usam fallback de link de BUSCA da
   loja (`STORE_SEARCH_URL` no cérebro — `mercado.carrefour.com.br/s?q=` e
   `petz.com.br/busca?q=`, ambos validados ao vivo em 01/09). Item sem nada →
   resposta honesta.
4. **A pergunta "Quantas unidades?" morreu — e ajustar virou botão**: escolher sem
   dizer quantidade assume **1 un** e segue, com dica na confirmação
   (`choiceConfirmedAssumedOne`). Nesse caso o follow-up troca "Cancelar" por
   **"Mudar quantidade"** (teto de 3 botões; "cancelar" digitado segue valendo):
   o toque (`qtd_alterar`) reabre os botões 1/2/Outra da pergunta clássica para o
   último item, e `qty:1`/`qty:2`/`qty:other` fora do estado legado ajustam o último
   item da cesta em vez de fechar escolha. Ajuste por texto continua ("bota 3",
   número seco pós-item). `choosing_quantity` + `finishQuantityChoice` ficam vivos SÓ
   para conversas em voo no deploy — `beginQuantityChoice` foi removida; não
   reintroduzir a pergunta sem o dono.

## Atualização 01/09/2026 — bolha nativa de Pix ATIVADA em produção (sonda provou: sem habilitação)

A hipótese de 31/08 se confirmou ao vivo: a Graph **aceita `pix_dynamic_code` no nosso
número sem a habilitação** que barrou o One-Click de cartão. Sequência do teste real:
1ª sonda voltou 200 mas não chegou (erro Meta **131047** — janela de atendimento de 24h
fechada; a sonda livre depende dela, a cobrança real não, porque o cliente acabou de
escrever); dono mandou "oi" pra Lia, repetiu a sonda, 200 de novo e **a bolha chegou**.

Ativação feita pelo dono na Vercel (Production + Preview): `LIA_NATIVE_PIX=1`,
`LIA_PIX_MERCHANT_NAME=Lia Delivery`, `LIA_PIX_KEY=<chave CNPJ, Sensitive>`,
`LIA_PIX_KEY_TYPE=CNPJ`; redeploy `dpl_FNqQtvJzTPHmYCDgFcDBRFNsG7ym` (READY,
alias liadelivery.com.br). **Estado vigente: toda cobrança Pix real envia o fluxo
textual/copia-e-cola de sempre e, em seguida, a bolha nativa "Lia Delivery".** Mock
nunca envia bolha.

Decisões registradas nessa ativação:
- **Identidade do recebedor:** a bolha mostra "Lia Delivery", mas o app do banco é
  obrigado a mostrar o recebedor oficial do Pix — e o CNPJ é MEI, cujo nome
  empresarial contém o nome civil do dono. Limitação **aceita pelo dono**; não é bug.
- **OPS_TOKEN foi trocada** (a antiga era Sensitive e irrecuperável na Vercel). O
  valor NUNCA vai em doc/commit/log. `/ops?key=<token>` troca a chave por cookie
  httpOnly de 90 dias.
- Falta provar no primeiro **pedido real** com Pix: bolha com código MP de verdade
  abrindo o banco (a sonda usou EMV não-pagável). Olhar `[whatsapp:native-pix]` e
  `[whatsapp:meta:status-failed]` no primeiro pedido. V2 na fila: enxugar textos
  redundantes e `order_status` "pago ✅" quando o webhook MP confirmar.

## Atualização 31/08/2026 — bolha nativa de Pix (order_details) atrás de flag

O dono viu um bot concorrente cobrando com a bolha nativa de pagamento do WhatsApp
(total + "Pagar com Pix" + "Copy Pix code" dentro do chat) e pediu o mesmo. Descoberta:
a doc pública da Meta (payments-br, atualizada 05/2026) **não lista allowlist para
`pix_dynamic_code`** — diferente do One-Click de cartão (`offsite_card_pay`), que exigia
habilitação e a Meta negou em 08/2026. Implementado como experimento:

- `buildPixOrderDetailsPayload` + `whatsappAdapter.sendPixOrderDetails` (mesmo
  `order_details`/`review_and_pay` do One-Click, com `payment_settings: pix_dynamic_code`
  = código copia-e-cola do Mercado Pago + chave/nome do recebedor). Item de linha único
  = total (frete/taxa já embutidos; a bolha é apresentação, a cobrança é o código).
- `maybeSendNativePixBubble` no cérebro, chamada nos 3 pontos de emissão de Pix
  (cobrança nova, cotação manual aprovada, troca cartão→pix). **ADITIVA**: sai DEPOIS
  dos textos de sempre — se a Graph rejeitar (ou aceitar e descartar assíncrono, lição
  dos cards Meta) o cliente já tem o copia-e-cola. Falha nunca bloqueia a cobrança;
  `reference_id` = `pix-<pixId MP>` (único por cobrança, não por pedido).
- **Envs (todas necessárias, senão a bolha é pulada com warn):** `LIA_NATIVE_PIX=1`,
  `LIA_PIX_MERCHANT_NAME` (nome do recebedor como aparece no banco),
  `LIA_PIX_KEY` + `LIA_PIX_KEY_TYPE` (CPF|CNPJ|EMAIL|PHONE — a chave da conta Mercado
  Pago que recebe). Mock nunca envia bolha.
- Copies novas: `nativePixBody` / `nativePixItemName`. Teste: payload em unidade
  (whatsapp-pay.test.ts). O que SÓ o teste real prova: se a Graph aceita
  `pix_dynamic_code` no nosso número sem habilitação — ligar a flag, mandar um pedido
  de teste e olhar o log `[whatsapp:native-pix]` + `[whatsapp:meta:status-failed]`.

## Atualização 30/08/2026 (3ª) — auditoria pós-rodadas 1–5: 479/479 e sete lacunas fechadas

Pente-fino independente depois dos dois ciclos estruturais. A suíte COMPLETA rodou
contra o banco (sem skips): **479/479**, além de `tsc`, lint e build de produção. Sete
lacunas encontradas e corrigidas: `quero sim` volta a ser confirmação comum; o teto de
preço sobrevive tanto ao descarte local→resgate ML quanto ao refino por marca
(`fone até 150`→`Philco`); suporte classificado pela IA durante escolha agora recebe
`userId`, grava flag e alerta o operador; o filtro da IA também barra confirmação falsa
de Pix/cartão/pagamento; o compositor calcula frete grátis pelo subtotal real da loja
(não pelo preço com margem), nunca aumenta o número de entregas e usa copy própria
quando apenas redistribui itens entre as mesmas lojas. Regressões novas cobrem todos os
casos, inclusive ML via cache real no banco. Relatório:
[docs/auditoria-pos-rodadas-1-a-5-2026-08-30.md](docs/auditoria-pos-rodadas-1-a-5-2026-08-30.md).

## Atualização 30/08/2026 (2ª) — os dois ciclos estruturais: roteador LLM + cesta-como-conjunto

Decisão do dono ("então faz tudo isso"): sair do loop de conserto-por-regex e atacar
as duas causas estruturais da média estagnada.

**1. Roteador LLM de fallback** (`interpretCustomerMessage` em src/lib/adapters/ai.ts
+ `tryLlmInterpret` em delivery-service):
- Entra SÓ nos becos onde a Lia responderia mal: busca que não achou nada, mensagem
  sem produto/intent, e o "não peguei qual você quer" final da escolha. Uma tentativa
  por turno (flag no `turnMeta`); OpenAI off/timeout/`LIA_LLM_ROUTER=false` → o
  comportamento determinístico de sempre (todos os testes existentes valem intactos).
- Ações: `product_request` reescreve a busca ("uma 51" → "cachaça 51", "negocio de
  passar roupa" → "ferro de passar roupa" — provado ao vivo); `basket_edit` normaliza
  pra comando canônico ("tira aquele negocio de lavar louça" → "tira o detergente") e
  despacha pelos handlers de sempre; `question/support/smalltalk/manipulation`
  respondem na voz da Lia — support também flag no pedido + alerta ao operador.
- **A IA nunca decide dinheiro**: prompt proíbe desconto/gratuidade/confirmação de
  pagamento/promessa de prazo/recursos inexistentes, e `sanitizeRouterReply` derruba
  qualquer resposta com promessa proibida (cai na copy segura canned). Testado em
  unidade (filtro) e E2E (costura `__setRouterInterpreterForTests`).

**2. Cesta-como-conjunto V1** (P1.8; `src/lib/basket-composer.ts` puro + fiação no
modo lista):
- `composeBasket` escolhe, entre as opções JÁ aprovadas (piso+rerank) de cada linha,
  a combinação que minimiza produtos+frete (guloso, uma troca por vez, limiares de
  frete grátis contam). Só aplica com economia ≥ R$3 e **anuncia cada troca**
  (`bundledDeliveriesNote`: "Juntei entregas pra te economizar R$X — item A (Loja) →
  item B (Loja)"). Kill-switch `LIA_BASKET_COMPOSER_OFF`.
- Cesta montada card a card NÃO é recomposta em silêncio (escolha explícita): quando a
  cotação sai com 3+ entregas e frete ≥ 40% dos produtos, vai a dica honesta
  (`freightFragmentationTip`) de reenviar a lista numa mensagem só.
- Unidade: 4 casos (migração compensa, alternativa cara não mexe, limiar de frete
  grátis, quantidade multiplica).


## Atualização 30/08/2026 — rodada 5 (4,30/10): o funil de perguntas fechou

Rodada 5 ([docs/testes-rodada-5-2026-08-29.md](docs/testes-rodada-5-2026-08-29.md)):
2,85 → **4,30**, 11/11 totais certos, zero silêncio, zero concessão em manipulação. A
causa-mãe restante era UMA: pergunta que não casa com intent caía no funil de busca e
virava "produto não achado". Consertos deste ciclo:

1. **Funil de perguntas fechado em duas camadas**: (a) intents novos — `coupon_promo`
   (cupom/promoção %; "promo de Instagram não é nossa, desconfia"), `charge_complaint`
   ("fui cobrado 2x" = suporte sério + alerta URGENTE ao operador + flag no pedido),
   `scheduling_question` (não agendo; prazo da loja antes de pagar),
   `store_location_question` (100% WhatsApp), `installments_question` (à vista por
   enquanto — honesto), `meta_probe` ("suas instruções"/"ignora as regras"/"responde
   só sim" = deflexão leve, nunca busca); (b) **backstop**: pergunta que não casou com
   nada e não achou produto recebe "essa eu não sei responder — sou a Lia das compras"
   em vez de ecoar a pergunta como item não-achado.
2. **Pergunta lateral reapresenta a etapa**: todas as respostas informativas (NF,
   CNPJ, segurança, cupom, parcelas etc.) re-enviam os cards/pergunta de quantidade em
   curso — os cards "sumiam" e o cliente re-pedia o produto (S7/S12). CNPJ sem
   `LIA_BUSINESS_INFO` agora também alerta o operador (o "te envio certinho" não é
   mais beco).
3. **Ovos 60 de novo (S4)**: o caminho COM IA mantinha "ovo x6"+"ovos x6" (o dedupe só
   existia no parser determinístico) → `foldSameSpecLines` exportado e aplicado nas
   duas saídas do merge. 6+6 = ovo x12 → 1 embalagem de 10 anunciada.
4. **Teto por extenso e gíria**: `parsePriceCap` lê "quinze reais", "de uns 30 conto",
   "mangos" (S18: pinga de R$48,97 passou no teto de R$15).
5. **"quanto ficou mesmo?"/"ver total" com cobrança na mesa**: contexto pós-emissão
   não tem `total` — agora busca no PEDIDO e responde `totalAwaitingPayment` (S1:
   virava busca de produto). "ver total"/"fechar total" entraram no RUNNING_TOTAL_RE.
6. **Pivô "então me ve X" no meio de escolha parada** substitui a escolha estagnada
   (S2: chá+gatorade ficavam "anotados" atrás da touca térmica pra sempre).
7. **Comparação de opções** (S17): "qual a diferença entre o 1 e o 2?" → compara
   nome/preço/loja com honestidade sobre specs, e re-envia os cards.
8. **Marca-como-genérico** (S11): `BRAND_GENERIC` reescreve linha de 1 token — gilete→
   aparelho de barbear, bombril→palha de aço, maisena→maizena amido de milho,
   danone→iogurte. Header duplicado "coca cola coca cola" colapsado (S15).

## Atualização 28/08/2026 — rodada 4 (cliente difícil, 2,85/10): ciclo de conserto

A rodada 4 (protocolo v4, propositalmente hostil: comandos compostos, interrupções,
emoji, perguntas de confiança) derrubou a média de 6,80 pra **2,85** — mas os totais
seguiram 12/12 certos e zero cobrança indevida. Relatório:
[docs/testes-rodada-4-2026-08-28.md](docs/testes-rodada-4-2026-08-28.md). Consertos:

1. **Rede anti-silêncio estrutural**: turno que termina com ZERO respostas manda
   fallback ("Me perdi aqui 😅") — `reply()` e todos os envios interativos contam num
   `AsyncLocalStorage` por turno; mensagem SEM texto (áudio/figurinha/imagem) responde
   "só leio texto" (antes era um **400 mudo no webhook**); reação de emoji é ACK sem
   resposta (spam se respondesse). 4 sessões tiveram silêncio absoluto na rodada.
2. **Perguntas de confiança viraram intents com resposta própria** (respondem em
   QUALQUER estado): segurança/golpe (`trust_question`), nota fiscal e CNPJ
   (`fiscal_question`, dados via env `LIA_BUSINESS_INFO`), quem entrega, "no site tá
   mais barato" (`price_dispute` — explica o serviço com honestidade), "meu filho que
   paga" (`third_party_pay` — Pix copia-e-cola pode ser encaminhado), xingamento leve
   (`insult` — resposta digna + oferta de atendente).
3. **Pausa e retomada**: "pera/espera/já volto" = `hold` (nada de busca — "nao pera"
   virava busca de PERA fruta); "voltei, onde a gente tava?" = `resume_where` (resume o
   estado e reapresenta a etapa); "na vdd quero sim, ainda dá?" = `resume_canceled`
   (recupera a compra recém-cancelada pelo `lastCanceledOrderId`).
4. **Comando composto**: "troca o arroz por integral, tira o café e bota 2 leites"
   divide em cláusulas (`splitCommandClauses`) e executa em sequência; lado de troca
   com 1 token compõe com o item ("arroz integral").
5. **Editar DEPOIS do total reabre o pedido** (`reopenOrderForEdit`): add/troca/tira em
   `awaiting_quote_confirmation`/`awaiting_payment`/`choosing_freight` cancela a
   cotação/cobrança não paga, restaura a cesta e aplica a edição — o catch-all do menu
   de pagamento só responde a quem não pediu mudança.
6. **Semântica de cesta**: "1 arroz" depois de "2kg de arroz" é linha própria (dobra na
   anterior só com "mais/outro" — flag `additive`); linhas repetidas do mesmo produto
   somam ("meia dúzia de ovo" + "6 ovos" = 12); **conversão de embalagem** anunciada
   (12 ovos ÷ caixa de 10 = 1 caixa — antes: 12 caixas, R$118); teto GLOBAL "nada acima
   de 20 reais cada" vale pra lista inteira; correção embutida ("aliás esquece o café",
   "deixa só chá") remove/deduplica; "óleo" com 2+ itens de despensa vira "óleo de
   soja"; urgência sai da frase de busca + resposta honesta de prazo; "tira tudo que
   for de limpeza" remove SÓ a categoria (mapa `CATEGORY_KEYWORDS`; desconhecida =
   resposta honesta sem apagar nada).
7. **Escolha**: "👍" com cards na mesa re-pergunta (não "de nada"); "1️⃣ mano" escolhe
   (keycap normalizado + gíria de preenchimento removida); "o de melhor custo
   benefício" pega a mais barata; "um shampoo qualquer, escolhe vc" auto-escolhe o topo
   (flag `autoPick`); monossílabos na quantidade ("ta"→1; "n"→1 + dica de tirar).
8. **Miudezas de honestidade**: sintoma sem remédio ("algo pra dor de cabeça") explica
   o limite ANTES das opções de conforto; cigarro/tabaco recusado com explicação
   (`looksLikeTobacco` — nunca sumir em silêncio); troca pix↔cartão avisa que o código
   anterior não vale; "quando chega o DE HOJE?" sem pedido de hoje diz isso antes de
   citar o antigo; esperando CEP, referência vaga re-pede o CEP (nunca busca).

## Atualização 27/08/2026 (2ª) — rodada 3 (média 6,80): dinheiro fechou 12/12, ciclo de conserto do mesmo dia

Rodada 3 do protocolo (v3, [docs/protocolo-teste-persona-v3.md](docs/protocolo-teste-persona-v3.md))
validou os consertos da rodada 2: **média 4,15 → 6,80**, cesta contaminada 0/20,
**12/12 totais batendo linha a linha**, minswap anunciado, botão velho nomeado,
furadeira segurada, "de sempre" com conferência, S3 narrativa longa = 9/10. Relatório:
[docs/testes-rodada-3-2026-08-27.md](docs/testes-rodada-3-2026-08-27.md).

Achados novos, TODOS consertados no mesmo dia (com teste):

1. **Auto-apresentação virava produto** ("seu Jorge aqui" → imagem de São Jorge, 3
   sessões): padrões de auto-apresentação no `NARRATIVE_SEGMENT_RE` (honorífico+nome+
   "aqui", "aqui é a X", "sou o X", "me chamo X").
2. **Sujeito-parente engolia a query** ("meu neto quer um violão" era a busca inteira):
   strip do sujeito ANTES do vocativo — o parente sai, o produto fica ("violão").
3. **Narrativa na escolha ESCOLHIA produto** (S15: "meu neto que pediu isso ai" casou
   "Meu Primeiro Violão" e foi pra quantidade): a guarda de narrativa subiu pra ANTES
   de qualquer parser de escolha.
4. **Cotação vencida engolia a mensagem** (S18: o CEP de Campinas morreu atrás de
   "Esse preço venceu"): o ramo de expiração agora restaura a cesta e deixa a mensagem
   seguir o roteamento normal (else-if — não cai mais no menu de pagamento).
5. **"aa esquece o carregador" virava "pula" do item errado** (S14): "esquece" entrou
   no REMOVE_START_RE com tolerância a interjeição; e remoção na pergunta de
   quantidade cancela o próprio item ("só a pilha, sem carregador" idem).
6. **"não gostei" seco descartava o item** (S17): agora pagina outras opções;
   "outra opção" no singular também.
7. **"Philco" (marca sem match local)**: a re-busca combinada agora FORÇA a cauda
   longa (ML); se ainda falhar e o token for só-marca (campo brand), responde "não
   achei fone bluetooth philco" e re-mostra — nunca mais enfileira a marca seca (que
   virava air fryer).
8. Copy: recusa de item vira "eu não achei em nenhuma loja agora" (era "não consigo
   trazer hoje", que soava como recusa de serviço).

Pendências que a rodada 3 reforçou (ver PENDENCIAS): frete fragmentado é o problema
nº 2 por frequência (6/20) — P1.8 cesta-como-conjunto é o próximo ciclo grande;
"óleo" sozinho não achou nada (golden registrado); resíduo #YAQHF8 apareceu nos 20
encerramentos (rotulado certo, mas o dono precisa resolver o pedido); S10 repete a
mesma copy de esgotamento na 3ª tentativa; forense pendente do "e arroz" da S18
(cotação na mesa + item novo → troca disparou sem adicionar o arroz).

## Atualização 27/08/2026 — rodada 2 (20 sessões): forense + conserto dos achados

Rodada 2 do protocolo v2 deu **4,15/10** (relatório em
[docs/testes-rodada-2-2026-08-27.md](docs/testes-rodada-2-2026-08-27.md)): perda de
estado caiu de 12/20 pra 3/20, mas surgiram "P0s" novos. A forense no banco mudou o
diagnóstico dos dois piores:

- **#YAQHF8 "cancelado que virou pago" NÃO é corrupção**: é um pedido REAL pago no
  cartão em 25/08 (Pagar.me charge `ch_VAolM1vcKiwjnK8m`, R$20,62, escova de dente),
  parado em `paid` desde então — nunca comprado nem estornado. Idem **#QTNL2T** (mochila
  R$80,93, pago 23/08, `retailer_preparing`). O telefone de teste acumula pedidos vivos
  e as 20 sessões compartilham a MESMA conversa — "cadê meu pedido?" achava esses
  legitimamente. **Decisão pendente do dono: comprar/entregar ou estornar os dois.**
- **A cesta "PlayStation fantasma" (S19)** foi pedida pelo próprio telefone às 9h38 e
  largada em `awaiting_payment`; a retomada mostrou o pedido pendente correto. Sem
  fronteira de sessão, persona nova herda pedido da anterior — artefato de teste, mas a
  APRESENTAÇÃO era o bug real.

Consertos implementados (todos com teste):

1. **Status/cancelamento ancorados**: `orderStatusLine` agora imprime data ("de ontem",
   "de sábado", "de 23/08") + prévia de itens em todo pedido citado; `handleCancel` grava
   `lastCanceledOrderId` e "cadê meu pedido?" pós-cancelamento fala PRIMEIRO do
   cancelado (pago antigo vira segunda linha rotulada); "pedido de ONTEM/anterior" pula a
   cesta e busca o passado; `nothingToCancel` nomeia o pago com data+itens.
2. **Anti-turno-velho**: `rememberCtxSnapshot` após a releitura pós-lock (mensagem que
   esperava o lock morria em falso conflito de CAS, sem resposta NENHUMA);
   `TurnSupersededError` propaga em `tryPublishInstantQuote` (turno superado não cai
   mais no caminho manual falando); `opsPublishManualQuote` checa `movedOn` antes de
   sobrescrever o contexto e rotula a cotação com `#pedido (data)` quando a conversa já
   está em outro assunto.
3. **Troca de loja NUNCA silenciosa**: oferta e aceite do minswap listam
   "antigo (R$a) → novo (R$b)" item a item; resumo pagável (`manualQuoteSummary`) imprime
   preço por linha quando a margem exata existe — soma das linhas = "Produtos" sempre.
4. **Pós-total com controle**: em `awaiting_quote_confirmation`, "entrega mais rápida"
   republica com a opção rápida guardada (`freightChoice` agora sobrevive à publicação)
   ou responde honesto ("só tem uma modalidade"); "mais barato" cancela a cotação e
   reabre a última escolha ordenada por preço (`lastChoice` também sobrevive) — cumprindo
   a promessa do haggle; nada disso cai mais no menu "Como prefere pagar?".
5. **Narrativa não vira produto**: `NARRATIVE_SEGMENT_RE` filtra orações de contexto
   ("meu neto vem sábado", "que não seja muito caro") no parser E no resgate do merge
   (que re-promovia o que a IA descartara); "coisa simples de farmácia"/"compra da
   semana" viraram modificadores; prompt da IA ganhou a regra 7a (não inferir produto de
   desejo narrativo); eco de não-achados trunca frase longa (~6 palavras).
6. **Escolha destravada**: resposta curta de 1 token ("Philco") tenta a busca COMBINADA
   ("fone bluetooth philco") antes de virar item novo — refina se cobrir a query E o
   token; narrativa no meio da escolha re-pergunta em vez de "anotar"; botão de conversa
   antiga tem intent (`stale_option_tap`) e copy próprios; "outras" esgotado faz UMA
   re-busca relaxada (forceLongTail) e depois pede reformulação em vez de repetir;
   "tira X, quero Y" com vírgula agora separa remove+busca.
7. **"O de sempre" confere antes de fechar** (resumo + "É isso? responde *sim*");
   `LIA_BULK_AUTOPICK_MAX` caiu de 300 pra **100** (furadeira de R$142 entrou sozinha);
   copy do caminho manual ficou honesta ("assim que conferir", não "em instantes") e
   nomeia QUAL item travou a cotação (nota do /ops inclui os itens da loja abortada).

Adiados com registro (PENDENCIAS): SLA/watchdog para `awaiting_operator_quote`, opção
rápida para anúncios ML com frete grátis, item indisponível numa loja abortar SÓ a loja,
name≠productUrl no sku dsp-548880 + mídia 500 (Meta 131053) na S20.

## Validação ao vivo — 20 clientes simulados (2026-08-26)

Foram executadas 20 sessões sequenciais no WhatsApp, sem pagamento e sem confirmar Pix
ou cartão. A média atribuída durante a rodada foi **4,55/10**; a auditoria posterior
reclassificou a sessão 19 de 7 para 2 porque ela chegou ao Pix com seis itens da sessão
18 já cancelada, levando a média auditada a **4,30/10**. A lista direta e a
troca de loja funcionaram em vários casos, e a guarda de dipirona funcionou quando a
mensagem chegou em uma etapa estável. Permanecem graves a perda de estado com mensagens
rápidas, perguntas de entrega sem resposta, códigos de cancelamento/estorno para pedidos
que o cliente não reconhece, limites de preço ignorados e promessas de prazo nos cards.
O diagnóstico completo está em
[docs/relatorio-completo-problemas-lia-2026-08-26.md](docs/relatorio-completo-problemas-lia-2026-08-26.md);
scorecards e transcrições em
[docs/testes-20-clientes-2026-08-26.md](docs/testes-20-clientes-2026-08-26.md).

_Última atualização: 2026-08-26._

## Atualização 26/08/2026 (2ª) — página /cartao com o branding + seleção de múltiplos cartões

Dois pedidos do dono no mesmo dia, com o Pagar.me em ativação:

1. **/cartao rebrandeada** (Berinjela & lima): fundo papel, cartão branco, logo LiaBrand
   + selo "🔒 pagamento seguro" em roxo, total em faixa roxa com valor em lima, campos
   com foco lima e CTA "Salvar e pagar R$X" em lima/roxo; rodapé "os dados vão direto
   pro Pagar.me — a Lia não vê o número". Só classes/copy — NENHUM atributo
   `data-pagarmecheckout-*` foi tocado (contrato do tokenizecard.js). Verificada ao
   vivo em dev com sessão real de cadastro.
2. **Vários cartões salvos**: `listOneClickCredentials` (até 5, ativos, desc); a oferta
   de cobrança lista os demais numerados ("Também tenho salvo: 2) Visa •••• 5678") e
   responder o número expira a tentativa pendente e cria outra no cartão escolhido
   (idempotência preservada). "Usar outro cartão" segue cadastrando mais um — o enroll
   acumula credenciais (dedupe só do MESMO cartão físico). Teste novo: 2 cartões →
   listagem → "2" → tentativa antiga `expired`, nova `pending` no cartão certo
   (saved-card 7/7).

Colaterais: `.env.local` do `vercel env pull` (todos os valores VAZIOS — Sensitive não
baixa) sobrescrevia o `.env` e quebrava QUALQUER dev local com banco; movido para
`.env.local.bak` — não regenerar sem saber disso. `.claude/launch.json` criado
(lia-dev, PAGARME_MOCK=true) pro preview.

## Atualização 26/08/2026 — teste em massa (20 personas): Blocos 1-3 do relatório implementados

O protocolo de persona rodou 20 sessões reais e o relatório
([docs/relatorio-completo-problemas-lia-2026-08-26.md](docs/relatorio-completo-problemas-lia-2026-08-26.md))
derrubou a média pra 4,30/10 com 2 P0 de estado. Implementado no mesmo dia, na ordem que
o próprio relatório recomendou:

**Bloco 1 — segurança de estado (P0.1/P0.2, a raiz de tudo):**
- **Escrita CONDICIONAL de contexto (CAS)**: cada turno guarda o snapshot do contexto
  que leu (AsyncLocalStorage — `runTurnScoped` no webhook, zero mudança nos 88 call
  sites) e toda `writeCtx` vira compare-and-swap contra ele. Outra escrita no meio
  (cancelar, turno mais novo) → `TurnSupersededError` → o turno velho PARA sem gravar e
  sem responder (o webhook o engole com log `[turn-superseded]`). É a cura estrutural da
  cesta da sessão 18 ressuscitando no Pix da 19.
- **Barge vira último recurso**: `TURN_LOCK_MAX_WAIT_MS` 15s → 120s (env). Quem fura
  depois disso é inofensivo — o CAS mata a escrita perdedora.
- **Status mira a compra ATUAL**: cesta/escolha na mesa → responde o total parcial;
  senão pedido da conversa → ativo mais novo → só então o último de qualquer estado.
  Cancelado sem pagamento agora diz "*nada foi cobrado*"; "estorno" só com `paidAt`.
- **Cancelar por fallback nunca mira pedido com dinheiro** (`CANCELABLE_FALLBACK_
  STATUSES`); havendo pago ativo, a recusa o NOMEIA (`nothingToCancel(shortId)`).

**Bloco 2 — integridade da compra (P0.3/P1.3/P1.4):**
- **Teto de preço viaja** (`ParsedLine.cap` → `PendingChoice.cap`): paginação, refino,
  mais-baratas e o RESGATE do ML (que reconstrói a frase com "até R$X") re-filtram.
- **Lista direta não auto-escolhe item caro**: acima de `LIA_BULK_AUTOPICK_MAX` (300),
  a linha vira cards (a peça de trator de R$2.556 nunca mais entra sozinha).
- **Prazo NUNCA em card de busca**: o slot de entrega do card do ML foi removido de vez
  (regra dura de 17/08; o prazo aparece no resumo, com o dado da consulta de frete).

**Bloco 3 — conversa e operação (P1.2/P1.5/P1.6/P1.7/P1.9/P2.3/P2.4):**
- "quanto custa a entrega?" → tópico `fee` (era "área"); identidade/golpe em frase
  composta ("oi... quem é vc? isso é golpe?") → apresentação; "pensando bem melhor não"
  → reject; "kkkk beleza" → obrigado; regateio ("faz por 10?") → intent `haggle` com
  resposta própria (+ "mais barato" como saída).
- **Remédio é guarda GLOBAL** (antes de qualquer etapa — na pergunta de quantidade a
  dipirona virava "responde o número"); a etapa em curso é reapresentada após a recusa.
- **A pergunta de quantidade deixou de ser prisão**: 2ª resposta sem número fecha 1
  unidade e roteia a mensagem como pedido normal (`quantityChoice.misses`).
- **Troca é atômica**: sem substituto forte, o item original FICA na cesta
  (`swapKeptOriginal`) — "tira o frango, quero peixe" não mutila mais a lista.
- **Alerta de operador nunca vai pro chat do próprio cliente**
  (`[operator-alert:suppressed-self]` quando `LIA_OPERATOR_PHONE` == cliente).

**Adiado com registro (produto, não bug):** otimização da cesta como conjunto (P1.8 —
menos entregas/frete), expectativa do fallback manual pós-preço (P1.10), latência da
busca fria (P2.1 — teto é o actor; API oficial segue bloqueada), pergunta de
esclarecimento pra item vago/caro (P2.5) e golden cases de semântica (toalha≠lenço,
frutas≠congelada) — próximos ciclos em PENDENCIAS.

Gate: tsc; intents 47/47; copy 12/12; bateria nova 26/08 6/6 (CAS, status×2, dipirona
na quantidade, fuga da quantidade, teto na paginação); regressão completa das 3 suítes
E2E rodada antes do deploy.

## Atualização 23/08/2026 — piloto do operador automático local

Por decisão do dono, a automação de compra volta como piloto local e gradual. Isso não
reativa o Browserbase legado nem muda o concierge manual como caminho geral. A primeira
fila aceita somente pedidos pagos do Mercado Livre com URL exata para todos os itens;
linhas livres, cestas mistas e divergências continuam no `/ops`. A fila tem claim com
lease, retry, auditoria e reconciliação com `opsMarkBought`. O modo inicial obrigatório é
`PURCHASE_AUTOMATION_MODE=cart_only`: o Luna consulta a fila a cada hora, prepara e
confere o carrinho, mas a confirmação financeira final continua humana. Ativar `purchase`
exige antes aprovação expirada por tempo, hash imutável do carrinho, teto de valor e teste
real de não duplicação. Manual: `docs/operador-automatico-local.md`.

Leia este arquivo antes de planejar, responder sobre o estado do produto ou alterar o
projeto. Ele é a memória canônica curta da Lia. Para detalhes, leia também:

1. [STATUS.md](STATUS.md) — estado técnico e operacional;
2. [PENDENCIAS.md](PENDENCIAS.md) — checklist canônico de progresso e lançamento;
3. [docs/decisoes-operacionais-2026-07-14.md](docs/decisoes-operacionais-2026-07-14.md) —
   evidências e decisão operacional vigente;
4. [docs/operacao-canais-2026-07.md](docs/operacao-canais-2026-07.md) — canais e operação;
5. [docs/automacao-compra-varejistas.md](docs/automacao-compra-varejistas.md) — automação
   segura de cotação e compra por varejista;
6. [CLAUDE.md](CLAUDE.md) — histórico de arquitetura e decisões.

Em caso de conflito, prevalece a decisão mais recente documentada neste arquivo e no
registro de 14/07/2026. Não ressuscite uma premissa histórica sem nova evidência.

## Régua de copy vigente (2026-08-17) — leia antes de escrever qualquer mensagem

Revisão do dono sobre as ~110 mensagens automáticas. O levantamento com antes/depois de
cada uma está em [docs/todas-as-mensagens-da-lia.md](docs/todas-as-mensagens-da-lia.md);
o texto vive em `src/lib/lia-copy.ts` (cabeçalho do arquivo repete estas regras).

1. Verbo na frente, resultado primeiro.
2. Sem preâmbulo de simpatia: "Prontinho", "Opa", "Deixa comigo", "Poxa", "Claro!",
   "Fechado!", "Sem problema" — todos fora.
3. Sem explicar a mecânica interna (quantas lojas parceiras, como o frete é calculado,
   que a Pagar.me tokeniza o cartão, por que a cotação venceu).
4. No máximo 1 emoji, e só onde carrega informação (📍 endereço, 🛵 entrega, ✅ ok). O 💚
   está limitado a 2 mensagens no produto inteiro (`greeting` e `thanks`) — não somar mais.
5. Uma saída por mensagem: nunca oferecer 3 caminhos quando 1 resolve.
6. Sem lista de exemplos de produto. A constante `EXAMPLES` foi removida; não recriar.
7. Sem endereço ou CEP fictício de exemplo — descrever os campos ("rua, número,
   complemento, bairro, cidade e CEP"), nunca inventar um endereço.

**Prazo — regra dura, não é questão de tom.** Quem manda no prazo é o checkout da loja e
ele varia: às vezes é no mesmo dia, às vezes leva dias. Nenhuma mensagem genérica pode
dizer "chega hoje", "no mesmo dia", "em ~1h" ou "1 a 2 horas". O prazo aparece **uma vez
só**, na linha de entrega do resumo (`deliveryLine`), e **somente com dado real da loja** —
os fallbacks `etaMinutes ?? 40` e `?? 90` foram removidos de propósito; sem prazo, a linha
sai só com o valor. Antes de cotar, a Lia diz que *mostra* o prazo, nunca qual é.
Ao somar mensagem nova, não reintroduza promessa de same-day em lugar nenhum.

✅ A landing (`src/app/page.tsx`, `layout.tsx`, `opengraph-image.tsx`, mock do celular)
passou pela mesma revisão em 2026-08-18: sem promessa de prazo, "Pix ou cartão" em vez de
"paga no Pix", letreiro sem preço inventado, sem "sem taxa escondida" (dono vetou) e mock
com as mensagens reais de `lia-copy.ts`. Paleta escolhida pelo dono no seletor ao vivo
(seletor temporário, removido após a escolha): **Berinjela & lima** — roxo `#3A225E` + papel lilás
`#F7F4FB` + lima `#D9FF5B`, CTAs em lima. O logo/avatar/favicon e a arte da foto de perfil do
WhatsApp foram refeitos na mesma paleta (lima `#D9FF5B` + roxo `#3A225E`).

## Atualização 25/08/2026 — troca de mínimo agora cai no Mercado Livre quando a vitrine local não cobre

Pergunta do dono ("se o item de R$15 tá preso no mínimo de R$30 do Carrefour, ele pode ir
pro Meli comprar direto, não?") — sim, e agora o fluxo faz: `offerMinimumSwap` ganhou o
FALLBACK do ML. Ordem da busca por substituto, por item preso: (1) vitrine local sem
mínimo com frete CONHECIDO (fecha rápido, frete barato); (2) vitrine local sem mínimo em
tarifa padrão; (3) **Mercado Livre** — sem mínimo por definição (cada anúncio é um
checkout próprio). Só entra anúncio que fecha sozinho: com id de anúncio (frete ao vivo)
ou frete grátis declarado — senão a troca viraria espera de operador. Piso de match e
guarda ANVISA valem igual (searchMercadoLivre já filtra). Busca fria do ML pode atrasar a
OFERTA em ~20-40s (a mensagem do mínimo já saiu; cache de 6h torna a segunda instantânea).

Teste novo `tests/minimum-swap-ml.test.ts` (farmácias OFF pra forçar o fallback; ML
responde do CACHE semeado no banco — zero rede; anúncio de frete grátis fecha com fee 0).
Detalhe de harness: `mercadoLivreEnabled()` exige `APIFY_API_TOKEN` mesmo com cache — o
teste seta um token fake que nunca é usado. Gate: swap local 2/2 + ML store 13/13 verdes.

## Atualização 24/08/2026 (2ª) — 2º testador: pedido mínimo ganhou saída (troca de loja) + reversão de árvore reparada

Segundo teste externo (+5511973741800): a pasta Colgate de R$6 ficou presa no pedido
mínimo de R$30 do Carrefour a sessão INTEIRA — dois "pagar" bateram na parede, "quanto
falta?" e "o que posso pedir pra completar o valor" viraram busca/beco, "outro"
(singular) não paginava, e os desodorantes que ele somou eram de OUTRA loja (nunca
ajudaram no mínimo). Nenhum pedido saiu. Consertos:

1. **Oferta de troca de loja** (`offerMinimumSwap`): quando só o mínimo de uma loja
   trava o fechamento e TODOS os itens dela têm equivalente forte em loja sem mínimo,
   a Lia oferece com botões — *Trocar de loja* / *Deixar como está* (`minswap:yes/no`;
   "trocar de loja" por texto vale). Aceite substitui os itens e fecha com total NA
   HORA; recusa mantém a cesta. Entre as lojas candidatas, frete CONHECIDO ganha de
   tarifa padrão e o fee menor desempata (senão a pasta de R$6 fechava com R$18 de
   frete da Droga Raia em vez de R$4,90 da Pague Menos). A oferta sai nos dois pontos
   que reclamam do mínimo (fechamento e "pagar") e no "quanto falta?".
2. **Intent `missing_question`**: "quanto falta?", "o que posso pedir pra completar o
   valor/pedido/mínimo" respondem o que falta (ou o total parcial) — nunca viram busca.
3. **"outro"/"outra" no singular** paginam igual a "outras" (`wantsMoreOptions`).
4. **Reversão de árvore reparada**: uma sessão paralela reverteu `delivery-service.ts`
   pra antes do markup progressivo e o commit `a1c7f0f` selou a reversão — produção
   voltou ao flat 10% sem ninguém notar. A fiação inteira foi reaplicada (displayPrice/
   serviceFee em todos os caminhos). Regra antiga da memória confirmada: **commitar
   batch verde na hora e conferir `git status` antes de `add -A`**.

Testes: `tests/minimum-swap.test.ts` novo (2 E2E; arquivo próprio porque o roster de
teste desliga as farmácias e o registry nasce no import — bootstrap dinâmico religa a
Pague Menos antes de importar o cérebro), intents 46/46, pricing/copy/instant-quote
69/69, mínimo legado + 1º testador verdes.

## Atualização 24/08/2026 — feedback do 1º testador externo: 4 defeitos do onboarding fechados

Primeiro teste de gente de fora (conversa real no banco, +5511992475750). Relato dele:
"pede endereço sem parar", "pedi colírio e disse que não consegue hoje", "falei nada a
ver e ele achou que era produto", "perguntei quem é você e pediu endereço". Reprodução
determinística confirmou tudo e ainda achou o pior: "Quem é vc" virou pendingRequest e
depois BUSCA — casando com o blush "Quem Disse, Berenice?". Consertos:

1. **Pergunta de identidade vira apresentação** (`detectIntent`): "quem é vc/você",
   "com quem eu falo", "vc é um robô?" → `help` (a apresentação da Lia), em qualquer
   estado — nunca busca, nunca pendingRequest.
2. **Pergunta sobre o endereço responde o endereço** (intent nova `address_question`):
   "vc salvou o endereço já?", "pegou meu cep?" → confirma o endereço em arquivo (ou
   pede, se não houver). Antes virava busca e o cliente lia "*Vc salvou o endereço já*
   eu não consigo trazer hoje".
3. **Quebra do loop de endereço** (`handleDeliveryAddress`): com endereço JÁ verificado
   no contexto, o passo `need_address` órfão não retém mais ninguém — pergunta sobre
   endereço confirma; produto destrava pra coleta e busca; resto confirma e pede itens.
   E o ESTOQUE de pedido (pendingRequest) só aceita `free_text` que não é pergunta —
   "pode ser amanhã" (affirm) e afins ficam de fora. A conversa travada do testador se
   destrava sozinha na próxima mensagem dele.
4. **Colírio entrou na lista de farmácia** (`MEDICINE_WORDS`): a recusa agora explica
   ("remédio eu não posso vender — por lei, só farmácia") em vez do "não consigo trazer
   hoje" que soou como falha de estoque. Se o dono quiser liberar lubrificante ocular
   (Systane é OTC), é decisão de produto a registrar — a régua atual é conservadora.

Gate: tsc, intents 45/45, E2E novos 2/2 (fluxo completo do testador + destravamento do
step órfão) + onboarding/endereço 10/10 (1 assert atualizado pro vocabulário novo:
"Seu pedido continua valendo").

## Atualização 23/08/2026 (2ª) — markup progressivo por faixa + fim do "cotar" na fala com o cliente

Duas decisões do dono no mesmo turno:

1. **Markup progressivo** (10% flat era demais em compra cara): faixas MARGINAIS por
   preço unitário — 10% até R$200, 6% de 200–500, 4% de 500–1000, 3% acima. Marginal =
   contínuo (R$201 nunca custa menos de margem que R$199). Exemplos: item de R$80,93 →
   R$8,09 (10%); violão de R$1.389 → R$69,67 (5% efetivo). Módulo novo
   `src/lib/pricing.ts` (displayPrice/serviceFeeForItems/serviceFeeForSubtotal) é o ponto
   ÚNICO — `display()` delega, e todos os caminhos que multiplicavam `MARKUP` direto
   (linha exibida, mínimo de loja, botões de frete, publicação instantânea,
   `order_details` do One-Click, fulfillments legados) agora passam por ele. A cotação
   instantânea propaga o serviceFee EXATO por item (bate com os cards); cotação manual do
   /ops (só subtotal) aplica as faixas sobre o subtotal. Calibrável sem deploy:
   `LIA_PRICE_MARKUP` segue mandando na 1ª faixa; `LIA_MARKUP_TIERS`
   ("200:0.06,500:0.04,1000:0.03") nas de cima. A margem fina em item caro reduz o
   colchão de preço defasado — risco registrado; item caro é quase sempre ML com preço
   ao vivo na cotação.
2. **"Cotar/cotação" saiu da fala com o CLIENTE** (dono: "ele tem que comprar, não
   cotar"): "Cotação válida por X min" → "Preço garantido por X min"; "Essa cotação
   venceu" → "Esse preço venceu"; "em cotação" → "com o total sendo fechado"; "Ainda
   estou cotando" → "Fechando seu total"; "Incluí na cotação" → "Incluí no pedido";
   trocas de endereço idem. O `/ops` e os alertas de operador MANTÊM "cotação" (jargão
   interno de quem opera; nomes de status/funções idem — churn sem valor).

Gate: tsc, pricing 5/5 (novo), copy/intents/frete/pay 87 units, E2E dinheiro+lista+frete
15/15.

## Atualização 23/08/2026 — frete grátis-lento × expresso pago: a escolha não escapava mais (caso QTNL2T)

Compra real do pedido pago #QTNL2T (mochila MLB4125746307, "frete grátis"): na hora de
comprar, o operador viu grátis chegando ~1 semana × ~R$17 chegando amanhã — e o CLIENTE
nunca recebeu essa escolha. Diagnóstico com a resposta real do endpoint: a consulta
ANÔNIMA achata as datas (grátis-slow e expresso-standard "chegam" ambos 26/08), e a
regra do `fasterThan` exigia data ESTRITAMENTE anterior → sem gap, sem botões. Os
R$15,99 que apareciam eram `shipping_option_type: agency` (ponto de retirada — filtrado
certo; o expresso de ENDEREÇO é o de R$17,99, os "dezessete" do relato).

Conserto em duas camadas, sem quebrar a regra dura de prazo:
1. `fasterThan` ganhou a REGRA 2 (por classe): base grátis/lenta (`slow` ou custo 0) com
   opção de classe expressa (`standard`/`next_day`/`same_day`/`express`) mais cara e
   data NÃO-posterior vira escolha — com a data do lado rápido REMOVIDA (sem gap
   comprovado, não se promete data; botão sai "Mais rápido" e a copy "sem data
   publicada"). Expresso × expresso sem gap continua NÃO sendo escolha.
2. `mlBasketFreight` não recai mais na data do barato quando o rápido vem sem data
   (`?? outcome.isoDate` era o vazamento): qualquer item de data desconhecida deixa a
   cesta rápida inteira sem data.

Verificado contra os DOIS anúncios reais: mochila → grátis 26/08 × R$17,99 sem data;
sacola (MLB5574835066) → grátis 25/08 × R$9,99 24/08 (regra 1 intacta). Gate: tsc,
ml-freight 14/14 (2 casos novos), instant-quote/copy/adapter 39/39, E2E choosing_freight
4/4.

## Atualização 20/08/2026 (5ª) — decisão do dono: agente GPT executa as compras manuais

O dono validou que um agente de IA (GPT) consegue fazer as compras manuais nos sites —
a pendência "achar um operador" (19/08) fica SUPERADA: sem contratação humana por ora;
o dono supervisiona. O fluxo não muda: a Lia cota/cobra, o `/ops` continua sendo o
painel (comprado/despachado/entregue, estornos), muda só quem digita no checkout.

Riscos aceitos/vigiados, registrados na decisão:
1. **Anti-bot dos varejistas.** Agente de IA num checkout é automação aos olhos da loja
   — a MESMA classe que fez o Carrefour banir a sessão remota em 19/07. Em volume de
   piloto tende a passar; se uma loja bloquear, a compra volta pra mão humana NAQUELA
   loja. Não insistir contra bloqueio (regra antiga do projeto, continua valendo).
2. **Conta do Mercado Livre.** "Robô = banimento" foi o motivo de nunca automatizar
   compra no ML. Um agente comprando pela conta do dono reabre esse risco exatamente
   onde a cauda longa mora. Mitigação: volume baixo, sessão logada do próprio dono,
   e o passo de PAGAMENTO confirmado por humano enquanto o piloto durar.
3. **Quem olha o /ops?** O alerta de pedido PAGO foi desligado hoje a pedido do dono
   (ele era o operador). Com a compra delegada ao agente, pedido pago sem ninguém
   olhando volta a ser o cenário do zumbi de 11/08 — religar com
   `LIA_OPERATOR_PAID_ALERT=true` na Vercel quando entrar gente de fora.

## Atualização 20/08/2026 (4ª) — correção fina em cima da lista: "coca zero em vez da normal"

Sequência do modo lista (pedido do dono): a cesta montada precisa aceitar ajuste
NATURAL, sem sintaxe de comando. Três peças novas, todas com guarda:

1. **"X em vez de/da/do Y" e "X no lugar de Y"** (`SWAP_INSTEAD_RE`, ordem invertida —
   o novo vem primeiro) viram `swap_item`. "bota coca zero em vez da normal" funciona.
2. **"não quero de X, quero de Y"** (`SWAP_NEG_RE`) vira troca; com "de" nos DOIS lados
   é troca de ATRIBUTO (`attr: true`) e o cérebro compõe a busca com o substantivo do
   item trocado — "de laranja" busca "suco laranja", nunca a fruta. Guarda: comando
   nunca é lado de troca ("não quero mais nada, quero PAGAR" segue sendo fechamento).
3. **Referência à cesta ≠ busca** (handleSwap): "de uva" apontando pro "Suco de Uva" da
   cesta agora resolve por presença de token quando aponta pra UM item só — a regra de
   aposição da busca (1 palavra não casa qualificador) zerava a remoção. E quando o
   `from` não nomeia nada ("da normal"), o alvo cai pro item que compartilha token com
   o TO ("coca zero" → a coca da cesta), também exigindo unicidade.

Gate: tsc, intents 44/44, copy 12/12, E2E 12/12 (2 novos de correção fina + lista 3 +
trocas/endereço 7 de regressão).

## Atualização 20/08/2026 (3ª) — lista encaminhada vira cesta direta + alerta de PAGO opcional

Pedido do dono: encaminhar uma lista do WhatsApp ("1 coca ¶ 2 vodka ¶ 2 sucos") tem que
montar a cesta inteira de uma vez, sem interrogatório de cards por item.

- **Modo lista** (`handleConciergeRequest`): mensagem com **3+ linhas** que resolvem
  **2+ itens** → a Lia escolhe o topo do ranking de cada linha (o MESMO ranking de
  "escolhe você": rerank por IA ou determinístico) e monta a cesta com as quantidades da
  lista; resposta = resumo "Montei a cesta da sua lista" (item a item com preço) + os
  botões de sempre (Ver total/Adicionar mais/Cancelar). Sem cards/foto por item de
  propósito (10 cards é spam); ajuste fino continua por "troca X por Y" e "tira X".
  Linha sem preço é recusada na mesma resposta; a cesta monta com o resto. Lista por
  VÍRGULA continua no fluxo de cards (o gatilho é ter 3+ LINHAS — formato de lista
  encaminhada). Quantidade some da pergunta: a da linha vale, sem qty explícita = 1.
- **Numeração ≠ quantidade** (`stripListNumbering`, lia-intents): "1. coca ¶ 2. vodka ¶
  3. suco" com separador (./)/-) é índice → tudo qty 1; número NU ("2 vodka") segue
  sendo quantidade. Exige 3+ linhas todas numeradas.
- **Alerta de pedido PAGO ao operador desligado por padrão** (pedido do dono — ele é o
  operador e o /ops mostra). Religar com `LIA_OPERATOR_PAID_ALERT=true` quando entrar
  gente de fora: foi esse alerta que matou o pedido-zumbi de 11/08. Os alertas de
  cotação manual/item adicionado continuam.

Gate: tsc, intents 43/43 (5 casos novos de numeração), E2E 3/3 novos (lista direta,
numerada, com item impossível) + 6/6 de regressão dos fluxos de card/instantânea.

## Atualização 20/08/2026 (2ª) — recusa da "mochila saco pequena": o actor chegava 5s atrasado

Reteste pós-watchdog: a Lia avisou aos 45s (camada 1 funcionou) mas terminou em recusa
honesta — errada, porque o ML TEM o produto. Diagnóstico com prova: reproduzi o run do
actor com a query exata (`UqcgaIfRnXkHV9IqU`): **SUCCEEDED com 24 mochilas em 44,8s** —
contra teto de espera de 40s em produção. A Lia desistiu 5s antes do resultado, nos dois
turnos (zero entradas no cache). Agravante: prefetch (frase crua) + busca (frase extraída)
+ resgate = até 3 runs de 4GB simultâneos = 12GB > 8GB da conta Apify → runs enfileiram e
o teto estoura em cascata. Consertos: `LIA_ML_MAX_WAIT_MS` 40s→**75s** (o watchdog já
avisou o cliente aos 45s; esperar é honesto), `LIA_RESCUE_BUDGET_MS` 90s→**120s** (com o
run completando e gravando no cache, o resgate da mesma query vira acerto de cache em vez
de 3º run), e log `[ml:apify:wait-timeout]` quando um run vivo é abandonado (era
invisível — o diagnóstico de hoje só saiu reproduzindo o run à mão). Copy do watchdog
ajustada a pedido do dono: "Ainda procurando — já te respondo."

## Atualização 20/08/2026 — silêncio absoluto no teste da mochila: garantias anti-silêncio

Reteste do dono ("Oi quero uma mochila saco pequena barata", 11:16): a Lia mandou
"Procurando…" e depois NADA — nem opções, nem erro. Evidência dos logs: a mensagem
chegou, `[mercado-livre:official-search] 401` (token legado de 55 dias na Vercel; token
do ML dura 6h) e o turno morreu sem log de erro — morte pelo teto de duração da função
dentro do `waitUntil`, onde o catch do webhook não alcança. O caminho sem limite eram os
fetches da OpenAI (extração roda 2x quando há resgate de última chance) sem timeout.

Cinco garantias, em camadas:
1. **Watchdog do turno** (webhook): processamento passou de `LIA_TURN_DEADLINE_MS` (45s)
   → o cliente recebe `copy.turnStillWorking()` ("Tá demorando mais que o normal aqui.
   Já te respondo — não precisa mandar de novo."). Se a resposta real chegar depois, a
   sequência continua coerente; se a função morrer, o silêncio absoluto não existe mais.
2. **Timeout em TODAS as chamadas OpenAI** (`LIA_AI_TIMEOUT_MS`, 10s) — pendurada vira o
   fallback determinístico que já existia. O rerank mantém os 6s próprios.
3. **Timeout nas chamadas do Mercado Pago** (`LIA_MP_TIMEOUT_MS`, 10s) — mesma classe.
4. **Orçamento do resgate** (`LIA_RESCUE_BUDGET_MS`, 90s): turno que já queimou o
   orçamento NÃO roda a 2ª rodada de ML (extração+actor+rerank ~40-70s) — recusa honesta
   agora vence morrer no teto em silêncio.
5. **Rota oficial do ML de castigo 10 min após 401/403** — o token morto custava 4s de
   timeout em toda busca fria. O env `MERCADO_LIVRE_ACCESS_TOKEN` (55 dias, inválido por
   definição) foi REMOVIDO de Production; a busca vai direto ao actor até o dono criar o
   app no DevCenter.

Conferir no dashboard da Vercel (1 min, dono): **Fluid Compute ativo** no projeto — sem
ele, `maxDuration=300` vira 60s no plano Hobby e o teto mata turno de ML frio.

## Atualização 19/08/2026 (2ª) — teste real da mochila: 5 defeitos de conversa fechados

Teste real do dono ("Oi quero uma mochila de academia sacola", screenshots) expôs cinco
defeitos num fluxo só; todos fechados no mesmo dia:

1. **"Procurando as melhores opções…" saía DUAS vezes** (busca inicial + resgate de
   última chance criam timers separados). `searchNoticeTimer` agora deduplica por
   telefone (90s): um aviso por rajada.
2. **"sacola eu não consigo trazer hoje" seguido dos cards de mochila lia como
   contradição.** Quando outras linhas da MESMA mensagem acharam opções, a recusa usa
   copy com escopo (`itemsNotAvailableWithOptions`): "*sacola* eu não achei — o resto
   achei e tá logo abaixo."
3. **"Mais barata" seco ESCOLHIA a mais barata da mesa e punha no carrinho** — o cliente
   estava rejeitando as 3. Regra nova: preferência de preço só escolhe com verbo de pegar
   ("quero o mais barato") ou artigo definido ("o mais barato"); seca, ela NAVEGA —
   `parseChoiceReply` devolve `cheaper`/`pricier` e `showPriceSortedOptions` mostra o
   pool ordenado por preço (distintos primeiro, variantes preenchem). Nunca compra.
4. **"Outras opções" tocado com a escolha já fechada caía no "Me diz de outro jeito"**
   (`opt:outras` fora da escolha era `reject`). Agora é intent `more_options`: o contexto
   guarda a última escolha concluída (`ctx.lastChoice`, com o sku escolhido) e o toque
   REABRE ela (`reopenLastChoice`) — pageMoreOptions segue dali; o novo pick SUBSTITUI o
   item na cesta (`PendingChoice.replaceSku`), nunca soma um segundo. Só vale no passo
   `collecting`; com cotação/pagamento na mesa não mexe.
5. **"Mais barato" digitado depois disso caía no "não entendi"** (virava modificador
   vazio). Seco e sozinho, vira `more_options{cheaper}` → reabre a última escolha
   ordenada por preço.

Latência (~2 min até os cards) é limitação conhecida do actor do ML (busca fria 20-25s
×2 quando há resgate); o caminho pra ~1s é a API oficial (pendência do dono no
DevCenter). Testes: units de intents (54) + 2 E2E novos (navegar por preço sem comprar;
reabrir e substituir). Golden intacto (scorer não mudou).

## Atualização 19/08/2026 — /admin fechado com login (revisão pré-lançamento)

A revisão completa pré-amigos-e-família achou o painel `/admin` e as rotas `/api/admin/*`
e legadas `/api/conversations/*` **abertas em produção** (PII de clientes + estorno/aprovação
sem token; confirmado ao vivo com 200 sem auth). Decisão do dono: login por **usuário e
senha** (token na URL incomoda). Implementado em `src/lib/admin-auth.ts`: cookie httpOnly
`admin_session` (HMAC derivado da senha — trocar `ADMIN_PASSWORD` derruba todas as sessões),
form em `/admin`, guarda `requireAdminSession` nas 12 rotas e o `/chat` de demonstração
atrás do mesmo login. **Falha fechado**: sem `ADMIN_USER`/`ADMIN_PASSWORD` no ambiente,
ninguém entra (o `dev:demo` exporta demo/demo). Credenciais Sensitive criadas em
Production/Preview na Vercel. Na sequência, os guards de `src/lib/auth.ts`
(API_TOKEN, webhook, assinaturas Twilio/Meta) passaram a **falhar fechado em deploy
Vercel** quando o segredo estiver ausente (localmente seguem liberando, pro dev:demo e
testes); os quatro segredos foram conferidos presentes em Production antes do deploy.
Os demais achados da revisão (Pix mock em falha do MP;
conversa presa após cancelamento no /ops + `choosing_freight` sem TTL) estão em sessões
paralelas próprias; landing revisada publicada junto deste deploy.

## Decisão vigente — remodelagem concierge (2026-07-20)

O produto foi remodelado para um **concierge de WhatsApp com largura**, comprado e
cotado **à mão pelo operador**, com **entrega na hora por motoboy que sai da base do
operador**. Isso resolve a fragilidade estrutural da automação de checkout (o Carrefour
bloqueou o Browserbase em 19/07; Petz/Boticário não expõem frete no Context há semanas).

- **Largura é o diferencial**: o cliente pede **qualquer coisa, de qualquer lugar**, numa
  mensagem só. Item fora de catálogo **não é recusado** — vira uma linha livre que o
  operador cota e compra. O moat é a largura + estar no WhatsApp (onde o Rappi não está) +
  memória do cliente. Velocidade pura contra Rappi/iFood é armadilha e não é o jogo.
- **Escopo geográfico**: a Lia opera **somente no estado de São Paulo**. No concierge, a
  fronteira de UF é rígida: CEP/UF fora de SP vira lista de espera e nunca chega a cotação,
  cobrança ou compra. Dentro de SP, o CEP exato, a disponibilidade do varejista e o frete
  ainda precisam ser confirmados pedido a pedido.
- **Cotação manual**: ao fechar a lista (`"só isso"`/`"pagar"`), a Lia cria um pedido em
  `awaiting_operator_quote`. O operador cota no `/ops` (custo dos produtos + frete +
  modalidade + prazo) e envia; o pedido reaproveita `awaiting_quote_confirmation` e toda a
  máquina de pagamento (Pix/cartão) já existente. Nada é cobrado antes da aprovação.
- **Motoboy na hora sai do OPERADOR, não da loja**: o operador compra e entrega o pacote ao
  courier (Uber Direct/Lalamove) na própria base → sem o problema de documento do titular
  na retirada em rede grande (que matou o motoboy-de-balcão em 14/07). Modalidade alternativa
  no `/ops`: entrega do próprio varejista.
- **Browserbase sai do caminho crítico**: com `LIA_MANUAL_CONCIERGE=true` (default), a
  cotação por checkout automatizado e as guardas de distância de loja não rodam. O fluxo
  legado de catálogo/auto-cotação permanece atrás de `LIA_MANUAL_CONCIERGE=false` (é o que os
  evals de conversa continuam exercitando).
- **Envs novos**: `LIA_MANUAL_CONCIERGE` (default on), `LIA_COVERAGE_PRESET=estado-sp`,
  `LIA_OPERATOR_PICKUP_ADDRESS` e `LIA_OPERATOR_PICKUP_CEP` (base de onde o motoboy retira).
- **Prontidão**: o código e a publicação estão configurados para operar em SP; a primeira
  validação com pedidos reais é uma decisão do operador, não uma pendência de desenvolvimento.
  A empresa é MEI, a operação financeira será pela PJ e a PJ é a titularidade operacional da
  compra. MEI não exige contador fixo nem contabilidade formal: mantém relatório mensal de
  receitas e DASN anual. Para NF, venda a PF é dispensada salvo solicitação; venda a PJ exige
  documento fiscal. O formato exato para mercadoria/serviço deve ser documentado, mas não exige
  contratar contador mensalmente. TypeScript, lint, testes focados (fluxo manual + evals legados)
  e build estão verdes.
- **Pós-venda decidido em 02/08**: antes do pagamento, o cliente pode limpar a lista; depois do
  pagamento não há cancelamento iniciado pelo cliente nem substituição. Se faltar item, a Lia
  estorna o valor daquele item; se houver atraso, avisa o cliente. O procedimento de estorno
  parcial ainda é manual e precisa de referência do provedor para auditoria.
- **Estado em 21/07**: os commits `bb48c2e` (fluxo), `ededf6a` (documentação) e `7ab8453`
  (kit do operador) estão verdes localmente. Um pedido concierge percorreu, em ambiente local
  mockado e sem cobrança, cotação → Pix confirmado → compra → despacho pela base do operador →
  entrega; as mensagens ao cliente também foram conferidas. O concierge **não está implantado**:
  publicar agora misturaria uma migration Oba inacabada de outro trabalho. Fazer deploy somente
  quando houver publicação limpa. Há 19 pedidos técnicos na fila de produção; removê-los requer
  autorização explícita. A decisão operacional é **contratar um operador** para o piloto.

### Atualização 23/07/2026 — vitrines de referência (10 lojas)

Por decisão do operador, a vitrine integrada foi ampliada para **10 lojas**: Carrefour
(de volta como vitrine seed — a automação de checkout segue proibida; o bloqueio de
19/07 era contra o robô, não contra o operador comprando como cliente comum), Oba, Petz,
Boticário, Decathlon (restaurada + ampliada) e as novas **Swift, Kalunga, Ri Happy,
Cacau Show e Kopenhagen**. As novas vitrines são seeds de dados REAIS colhidos dos sites
públicos em 23/07 (nome/preço/URL verificados; sem invenção). No concierge, o preço da
vitrine é referência — a autoridade é a cotação manual do operador. A seção de 19/07
abaixo ("exatamente três fontes") fica **superada** por esta decisão. `quoteBasket`
passou a tolerar loja sem unidade física (sem balcão → sem guarda de distância; frete
cotado pelo CEP do cliente). Supersede também o item "não adicionar lojas agora": o
operador decidiu ampliar a vitrine antes do piloto.

**Totais da vitrine (seed/histórico, sob `LIA_RETAILER_TEST_SEED` ou como referência):**
Carrefour 1.045 · Petz 2.812 · Boticário 1.380 · Ri Happy 1.196 · Swift 925 · Kopenhagen
248 · Decathlon 17 · Kalunga 15 · Cacau Show 12 · Droga Raia 13 · Oba 2 (Oba usa busca ao
vivo em prod). ~7,7 mil itens. Ri Happy/Swift/Kopenhagen colhidos pela API pública VTEX via
`scripts/harvest-vtex-catalog.mts` (sem Chrome). Decathlon/Kalunga/Cacau/Raia têm API
bloqueada (Akamai/não-VTEX) e ficaram em seed real menor — aprofundar exige DOM/Apify.

**Bug de roteamento corrigido (23/07):** as dicas de vocação (pet/beleza) testavam a query
COM acento contra regex SEM acento, então "ração" perdia o empate para o Carrefour. Agora
normaliza (NFD) e pesa +2 → item de pet vai pra Petz, beleza pra Boticário.

**Deploy 24/07:** remodelagem concierge + kit do operador + 11 vitrines + fix de roteamento
foram para produção (`dpl_9upchNgpPZ15…`, READY). **Suíte completa 209/209 verde** (com banco),
TypeScript, lint e build limpos. `liadelivery.com.br` responde (landing 200, `/ops` 401,
webhook 403). A vitrine profunda ainda NÃO aparece pro cliente no concierge (fluxo é livre →
operador); mostrar opções com foto seria a "vitrine híbrida" — decisão de produto em aberto.
Pendências humanas: conciliar os 7 pedidos pagos antigos, documentar a rotina fiscal do MEI,
rotacionar a senha Carrefour/PIN do WhatsApp e as demais credenciais expostas. A validação com
pedidos reais é opcional e não é requisito de desenvolvimento.

O restante deste arquivo descreve o fluxo legado de automação por varejista; ele continua
válido como referência, mas **o produto ativo é o concierge manual acima**.

### Atualização 02/08/2026 — reconciliação de produção, escopo SP e segurança operacional

- O deploy limpo de 24/07 continua sendo a versão pública: concierge manual, kit do operador,
  11 vitrines e correção de roteamento. A landing responde 200; `/ops` abre a interface, mas as
  APIs internas continuam protegidas e o webhook rejeita chamadas sem assinatura.
- O snapshot publicado foi consolidado no Git sem descartar alterações do usuário. `main` foi
  avançada localmente até o commit `a700290`, que contém o limite estadual de SP, a titularidade
  na PJ e a política de pós-venda;
  o worktree está limpo. O push remoto de `main` ainda é uma ação separada.
- O item de segurança operacional foi reforçado no código: em produção Meta, despacho mockado do
  courier agora falha fechado; o despacho por motoboy também exige `LIA_OPERATOR_PICKUP_ADDRESS`
  e um `LIA_OPERATOR_PICKUP_CEP` válido. Demos locais continuam usando o provider `mock`.
- A auditoria de nomes de variáveis da Vercel encontrou Contexts/credenciais históricas. A base
  do operador foi configurada como Sensitive em Production (endereço e CEP informados pelo
  operador). `LIA_MANUAL_CONCIERGE=true`, `LIA_REQUIRE_REAL_COURIER_DISPATCH=true`,
  `PURCHASE_AUTOMATION_MODE=cart_only` e compra automática desligada estão ativas; o redeploy
  `dpl_5kTpBbsitN6BgP5vcQrDh22AfqP4` ficou `Ready`. O código impõe `estado-sp` no concierge.
- A fila tinha 19 entradas: 12 preflights internos sem pagamento foram removidos; 7 pedidos
  pagos ficaram intactos para conciliação/estorno. A decisão é receber na PJ, manter a PJ como
  titularidade operacional e, no pós-venda, não aceitar cancelamento/substituição depois do
  pagamento, estornar item faltante e avisar atraso. Restam a confirmação contábil do documento
  fiscal exato e a rotação de segredos. A conta Mercado Pago PJ foi confirmada pelo dono no
  painel; as variáveis de produção já estão presentes. A
  validação real fica para quando o operador decidir; não é um gate técnico.
- **2ª rodada de 02/08 — decisões do dono:** (1) o piloto será operado **pelo próprio dono**,
  sem contratar operador agora; (2) a rotina fiscal foi decidida e documentada em
  [docs/rotina-fiscal-mei.md](docs/rotina-fiscal-mei.md) (intermediação de compras; NF do
  produto é a do varejista; NFS-e só para PF que pedir ou cliente PJ; resta confirmação
  contábil pontual do teto de receita antes do lançamento público); (3) a rotação das
  credenciais expostas foi **abandonada como gate de piloto** — risco aceito e registrado,
  reabrir só por pedido explícito ou incidente; (4) a conta Mercado Pago foi confirmada no
  painel pelo dono como PJ, com a aplicação `LIA - APP` em Produção; as variáveis de acesso e
  webhook já estão na Vercel Production. As credenciais mostradas em captura permanecem
  tratadas como expostas, sem marcar a rotação como concluída.
  Verificação do dia: suíte **213/213 verde com banco**, `tsc` limpo, produção `READY` em
  `a700290`; vitrine runtime com **7.652 produtos em 11 lojas**.

### Atualização 03/08/2026 — One-Click reativado (decisão do dono)

O cartão nativo no WhatsApp saiu de "adiado" para "em ativação" ("vamos fazer isso"). Nada
mudou no desenho canônico (Meta Cloud API direta + Pagar.me V5, sem 360dialog) nem no código —
os gates são externos. Em 03/08, dois desdobramentos: (1) a **Infobip
respondeu NÃO** — a rota de allowlist via eles morreu; a rota restante é ticket no Suporte
Direto da Meta (rascunho entregue ao dono) — mas a verificação de 03/08 mostrou que a
Payments API BR segue em **beta fechado** ("select customers"); habilitações documentadas
passam por BSPs, então o ticket direto tem chance baixa/prazo indefinido para um MEI. Vale
abrir mesmo assim; plano B = Checkout Pro até a GA. A WABA também precisará de Meta Product
Catalog vinculado; (2) a pergunta técnica ao Pagar.me foi **resolvida por documentação, sem e-mail**:
`recurrence_cycle` marca recorrência externa, é opcional e "não cria cobrança recorrente" —
a recompra da Lia é avulsa iniciada pelo cliente, então **o adaptador atual (`card_id` sem
`recurrence_cycle`) está correto**; CVV para card_id avulso não é exigido pela doc (antifraude
é o que o sandbox valida); domínio do tokenizecard.js se libera pelo dashboard. Contatos:
relacionamento@pagar.me / homologacao@pagar.me. O piloto não espera o One-Click: Pix + Checkout Pro cobrem cartão. Sequência
pós-chaves (agente): envs Sensitive → webhook com 6 eventos → ajuste do adaptador conforme o
PSP → sandbox completo → só então `LIA_ENABLE_WA_PAYMENTS=true`.

### Atualização 04/08/2026 — ticket da Payments API aberto na Meta

O pedido de habilitação da **Payments API Brasil** foi aberto no Suporte Direto da Meta em
04/08, no portfólio **Lia** (`Business ID 1802515380110705`). Protocolo
**`37565409896407734`**, status inicial **Open**, assunto **Dev: Cloud API** e tipo
**Messages API and Webhook**. O chamado pede a habilitação de `order_details` / one-click
offsite card payment para a WABA **Lia Delivery** (+55 11 97844-4813), preservando número,
webhook e Graph API na Cloud API direta, sem migração de sender, com Pagar.me no backend.
O formulário recusou português para esse tipo de pergunta; a mesma solicitação foi enviada em
inglês. Abertura do ticket **não é habilitação nem prazo**: a flag continua desligada e o gate
agora é aguardar resposta da Meta. Acompanhar em
<https://business.facebook.com/direct-support/case-detail/37565409896407734/?business_id=1802515380110705>.

### Atualização 06/08/2026 — busca da vitrine: a IA passa a escolher o produto (rerank + golden set)

Caso real do dono: "carregador usb c" devolvia **3 carregadores veiculares** (o mesmo item em
3 cores). Quatro falhas léxicas empilhadas: o token "c" era descartado (1 letra); o item certo
("Carregador de Parede … Usb-C", Pague Menos) EMPATAVA no score com o veicular; o roteador de
loja única resolvia o empate pela ORDEM do registry (Petz vem antes); e o desempate final era
preço. Diagnóstico geral: o matcher conta palavras em comum, não entende o pedido — e a IA,
que já rodava na extração, **nunca participava da escolha do produto**.

Desenho novo (implementado e testado):

1. **Candidatos largos** — `gatherCrossStoreCandidates` (stores/index.ts) junta o top-4 de
   TODAS as vitrines e rankeia globalmente (score → variantes não pedidas → preço). No
   concierge, o roteador de loja única (`pickStoreForQueries`) sai do caminho: a cesta já era
   mista mesmo (quem compra é o operador). O fluxo legado travado em uma loja não muda.
2. **Rerank por IA** — `rerankShoppingOptions` (adapters/ai.ts): UMA chamada batched por
   mensagem decide, por item, quais candidatos são REALMENTE o produto pedido e em que ordem,
   diversificando cor/embalagem. Lista vazia = nada serve → linha livre do operador (o
   resultado honesto). Skus são validados contra os candidatos enviados (IA não inventa
   produto); timeout de 6s (`LIA_SEARCH_RERANK_TIMEOUT_MS`) e kill-switch
   `LIA_SEARCH_RERANK_OFF`; qualquer falha cai no determinístico de sempre. Quando o rerank
   roda, ELE substitui o piso `conciergeMatchIsStrong` — a IA entende "escova de dente" ≈
   "Escova Dental", que o piso léxico mata.
   *Custo/latência:* é a 2ª chamada de LLM por mensagem (a 1ª é a extração, que já existia),
   uma só por mensagem independente do nº de itens, com payload pequeno (≤12 candidatos por
   linha). Some ~1–3s ao turno; o teto de 6s garante que a Lia nunca fique presa esperando.
3. **Determinístico melhor mesmo sem IA** (regras principiais, nunca por produto): compostos
   ("usb c"/"tipo c" viram token único; o genérico "usb" ainda serve o específico "Usb-C");
   typo-fuzzy passa a exigir palavra de catálogo com 6+ letras ("miojo" casava com a vinícola
   **Miolo** e com "Miolo de Alcatra" — em 5 letras, palavras reais colidem a distância 1);
   marca nunca typo-casa (nome próprio); substantivo de categoria ganha o bônus de head
   ("Pack Macarrão … Nissin **Miojo** 510g" vale como miojo); "sem X" bonifica quem diz
   "Sem/Zero X" no nome ("leite sem lactose" acha o Italac sem lactose, não o desnatado mais
   barato); e as 3 opções são **diversificadas** — cores do mesmo produto ocupam 1 vaga
   (pedir uma cor desliga a regra).

**O método já se pagou no mesmo dia.** Rodar 60 pedidos realistas pelo pipeline (varredura
exploratória, o passo "procurar busca ruim" do método) achou quatro bugs que ninguém tinha
reportado, todos consertados por regra principial — nunca por regra de produto:

- **"cotonete" não achava cotonete**, que ESTÁ no catálogo ("Hastes Flexíveis **Cotonetes**
  Johnson & Johnson"). A regra de pedido-de-uma-palavra zerava tudo que não fosse head. O que
  separa o caso legítimo do falso positivo é a **preposição**: em "Macarrão COM Ovos" a palavra
  é ingrediente; em "Hastes Flexíveis Cotonetes" ela nomeia o produto. Agora vale quando está
  justaposta e na frase inicial do nome (até a 3ª palavra) — no fim do nome é sabor
  ("Petisco para Cachorro Purina FRANGO" não responde por "frango").
- **"leite" devolvia loção de pele** ("Leite de Rosas"), leite de coco e leite pet. Três causas:
  a lista de variantes processadas tinha soja/amêndoas mas não coco; a marca "Leiteria" casava
  com "leite" por prefixo; e a versão pet não era penalizada. Agora: qualificador "de X" não
  pedido penaliza em consulta de uma palavra (regra geral no lugar da lista), marca só casa
  exato/plural (nome próprio não admite aproximação — foi o mesmo defeito do "Miolo") e item de
  espécie pet perde pontos quando o cliente não falou de bicho.
- **"água" vinha com gás** — "gas" entrou nas variantes de desempate, junto de integral/zero.
- **Armadilha achada no próprio conserto:** em catálogo brasileiro **"PET" é a garrafa
  plástica** ("Coca-Cola Pet 2L"). A penalidade de item-pet usava o mesmo regex do guarda
  duro, que inclui "pet" solto, e passou a punir refrigerante como se fosse ração. A
  penalidade agora usa só palavras de espécie.

**Invariante que saiu daí — penalidade REORDENA, guarda EXCLUI.** Fora do scorer,
`score > 0` é lido como "casa ou não casa" (`itemMatchesPhrase`, do "tira o X", é um
desses). Duas penalidades novas somadas derrubaram um match legítimo de head para -1
("Acessório de Comedouro … para Cães" com a consulta "Acessório") e o cliente perdeu a
capacidade de REMOVER o item da cesta — a busca continuava certa, o comando é que quebrou.
Agora, item que passou pelas guardas nunca cai abaixo de 1: quem exclui é `return 0`
explícito (espécie, negação, piso de relevância, pedido de uma palavra), penalidade só
empurra pra baixo no ranking. Pego pelo eval de conversa legado, não pelo golden — os dois
harnesses cobrem coisas diferentes e vale rodar ambos.

**Método novo — fim da tentativa-e-erro infinita.** A qualidade da busca agora é MEDIDA:
`tests/helpers/search-golden.ts` guarda os casos rotulados (28 hoje);
`tests/search-golden.test.ts` trava os determinísticos no `npm test` (regressão dura, roster
completo de 18 lojas); `npx tsx scripts/eval-search.mts` roda o pipeline completo (extração +
rerank com a chave real) e imprime o placar DET/IA. Fluxo de melhoria: busca ruim reportada →
vira caso no golden → mede → conserta → placar sobe → commit. Placar da época: **31/32
determinístico · 32/32 com IA** (placar vigente: ver a entrada mais recente datada). Regra:
mudança de scorer/prompt só entra acompanhada do caso que a justifica.

Bônus: consertado o bug que escondia a IA dos scripts — `scripts/talk-env.mts` usava
`__dirname` (inexistente em ESM), o `catch` engolia o erro e o `.env` nunca era carregado; o
`talk-lia` sempre rodou determinístico mesmo com `OPENAI_API_KEY` presente no `.env` (origem
da crença "não tem chave local"). Em produção o rerank vale automaticamente onde
`OPENAI_API_KEY` já está configurada (a mesma chave da extração).

**07/08 — pedido durante a cotação do operador (screenshot de produção).** Com um pedido em
`awaiting_operator_quote`, QUALQUER mensagem de produto respondia "Ainda estou cotando…
segura aí!" e o item era descartado — o cliente teve que CANCELAR o pedido pra conseguir
pedir um cotonete. Agora o item novo entra no MESMO pedido como linha livre (a cotação ainda
não saiu; o operador cota tudo junto), com nota "➕ Cliente adicionou durante a cotação" no
/ops e confirmação ao cliente (`copy.addedToPendingQuote`). Pergunta ("já saiu o total?")
continua com a resposta de andamento; só remédio continua recusado. Regressão em
`tests/manual-concierge.test.ts`. No mesmo screenshot: o "1x cotonete" como linha livre e o
emoji literal `🙂` são o código ANTIGO em produção — o cotonete já resolve com o
deploy (match por apposição + rerank), e o emoji não existe em NENHUMA versão do fonte
(artefato do build implantado; conferir na primeira conversa pós-deploy).

**10/08 — frete AO VIVO por CEP (`src/lib/live-freight.ts`).** A cotação instantânea agora
consulta o checkout real da loja (VTEX `orderForms/simulation`, allowlist de 8 lojas
abertas) com a cesta exata e o CEP do cliente, em paralelo com timeout 4,5s; o frete vem
exato por endereço e o frete grátis é o do próprio site. Hierarquia: **ao vivo → tabela
semeada (`SEED_STORE_FREIGHT`) → tarifa padrão**; resposta válida sem SLA de entrega =
site não atende o CEP → pedido cai pra cotação manual. Cesta simulada tem que ser 100%
parseável (sku `<loja>-<id>`) senão desiste — cesta parcial daria frete grátis errado.
Fonte por loja na nota do /ops e log `[instant-quote:live]`; kill-switch
`LIA_LIVE_FREIGHT_OFF` (pinado nos testes), teto `LIA_LIVE_FREIGHT_MAX` (150). Carrefour e
Petz bloqueiam consulta externa → sempre tabela. Validação real 10/08: PM R$4,90, Oba
R$9,90 same-day, Swift R$0 (grátis auto), Campinas R$4,90 — e a incógnita restante é só
se os sites tratam o IP da Vercel diferente (o log responde no 1º pedido; se bloquear,
degrada pra tabela sozinho).

**10/08 — diversidade nas opções (caso do dono: "quase o mesmo carregador 3x").** Pedir
"carregador" ou "ração" mostrava 3 variantes quase iguais do mesmo produto. Três causas e
três consertos: (1) `gatherCrossStoreCandidates` agora ordena produtos DISTINTOS primeiro —
cada loja manda seu top-4, que costuma ser a mesma ração em 4 tamanhos, e as variantes
esgotavam as 12 vagas antes de o rerank sequer ver um produto diferente; (2)
`sameProductVariant` (stores/types.ts): identidade = tokens do nome sem cor/medida
(Jaccard ≥ 0.75 = variante; marcas declaradas diferentes nunca são variantes; pedir
cor/tamanho mantém o atributo na identidade) — `diversifyOptions` passou a usar isso no
lugar do dedupe só-por-cor; (3) regra 3 do prompt do rerank endurecida: produto realmente
diferente (marca/modelo/tipo/faixa de preço), variante só como preenchimento quando não há
3 distintos. Golden ganhou o campo `distinctOptions` (checado no unit E no eval); casos
novos/marcados: "carregador usb", "racao para cachorro", "carregador de celular". Placar
pós-mudança: **32/33 determinístico · 33/33 com IA** (o × é o caso que só a IA resolve por
desenho). A regra "3 opções ainda que repetidas > lista curta" continua: variantes
preenchem quando o catálogo não tem 3 produtos distintos.

**17/08 (8ª) — quem escolhe a entrega é o CLIENTE, com botão.** Dono, na sequência do frete
real: "tem q perguntar se ele quer o mais rápido e caro ou mais demorado e barato e tem q ter
botão". Quando o anúncio oferece uma opção que chega ANTES pagando MAIS, a cotação
instantânea **para** (nada cobrado) e a Lia pergunta com dois botões — `frete:barato` /
`frete:rapido`, título com a DATA (`Mais barato · 25/08`, 19 dos 20 chars que a Meta
permite) e `Cancelar` sempre visível. Os dois totais já vêm calculados, então o toque
publica a cotação na hora: é escolha, não espera. `1`/`2`, "mais rápido", "mais em conta"
etc. funcionam por texto (fallback é a lista numerada). Detalhes que são regra, não acaso:
(a) só é escolha quando a opção realmente chega antes E custa mais — mais cara no mesmo dia
não é oferecida; (b) o novo passo `choosing_freight` fica ANTES do onboarding de endereço no
roteador, senão o toque `frete:barato` viraria item de cesta na varredura de lista;
(c) trocar endereço nesse passo preserva o pedido (é pedido sem preço na fila), como no
`awaiting_operator_quote`; (d) a escolha vai pra nota do /ops ("comprar ESSA opção de envio
no anúncio") — comprar a errada quebraria a data prometida. Testes: ml-freight 12/12,
adapter 7/7 (o teto de 20 chars do botão é teste, porque passar dele derruba a mensagem
inteira e o cliente fica esperando), copy 12/12, instant-quote 6/6, intents 41/41, tsc.

**17/08 (7ª) — FRETE REAL POR ANÚNCIO do ML (fim do R$18 chute), via API pública que não
pede token.** Dono: "os 18 automático tá péssimo (...) pensa que eu tô comprando uma
mochila, no app aparece 10,99 entrega até amanhã, grátis a partir de depois de amanhã — ele
tem que saber isso direto". No ML o frete é do ANÚNCIO + CEP, não política de loja, então
`LIA_FREIGHT_DEFAULT` ali sempre foi chute (fantasma pra cima, margem comida pra baixo).
**Descoberta que resolve** (testada ao vivo em 17/08, sem credencial nenhuma):
`GET api.mercadolibre.com/items/<MLB...>/shipping_options?zip_code=<CEP>` responde **HTTP
200 em ~0,35s** com exatamente o que o app do ML mostra — cada opção com `cost` e
`estimated_delivery_time.date` (Av. Paulista: padrão R$14,99 chegando 25/08, Sedex R$25,99
chegando 20/08; mesmo anúncio em Campinas R$14,99). É a única rota aberta: `/items/<id>`,
`/products/<id>` e `/sites/MLB/search` dão 403 PolicyAgent, e a página do anúncio cai no
"suspicious traffic" — ou seja, **isto NÃO depende do app do DevCenter** que está em
PENDENCIAS (esse segue valendo só pra busca rápida).
Implementação em `src/lib/ml-freight.ts` (novo): `mlItemIdFrom` tira o id do ANÚNCIO do
link (`produto.mercadolivre.com.br/MLB-123...`, ou `wid=`/`item_id=` em link de catálogo);
`mlItemFreight` consulta e escolhe a opção **mais barata de entrega no endereço** (ponto de
retirada não serve ao concierge; opção mais rápida é decisão do operador, não conta do
cliente), com teto de sanidade (`LIA_ML_FREIGHT_MAX` 150), timeout 3s e kill-switch
`LIA_ML_LIVE_FREIGHT_OFF`; `mlBasketFreight` soma por anúncio (cada anúncio é um checkout;
qty NÃO multiplica frete) e devolve a data do último item a chegar, que vira o
`deliveryPromise` do cliente ("chega até 25/08"). Invariante preservada: **nada é cobrado
sem número real** — anúncio sem estoque/sem entrega pro CEP, link só de catálogo (a rota
produto→anúncio é 403) ou consulta falhando derrubam a cotação instantânea e o pedido vai
pro operador com o motivo na nota do /ops. Anúncio que declara frete grátis segue fechando
na hora mesmo sem consulta (grátis nunca cobra a menos).
Auditoria de markup do mesmo turno: 10% confirmado em TODOS os caminhos vivos (cards, teto
"até X reais", cotação instantânea/manual, mínimo de loja, order_details) — único furo é o
pipeline LEGADO do ML (`/api/apify/mercadolivre/callback` → chat-service), que manda preço
cru; é inalcançável em produção (o webhook só chama `handleDeliveryMessage`), mas se voltar
precisa passar pelo `display()`. Testes: ml-freight 8/8, instant-quote 6/6, tsc limpo (o
eval E2E não rodou: o Postgres remoto está em ~2,6s por query e a suíte não termina).

**17/08 (6ª) — RAPPI DESCARTADO como vitrine (decisão do dono, com evidência) + frete do
anúncio do ML.** O dono quis o Rappi "tipo o ML no fluxo". Investigação (17/08, tudo
testado): o site do Rappi é SSR e a busca DENTRO de uma loja funciona com fetch puro —
`rappi.com.br/lojas/<slug>/s?term=<q>` devolve produtos no `__NEXT_DATA__`
(`fallback["storefront/<slug>/search/<termo>"].products`): 40 itens em 1,2s, com preço,
foto, estoque, e a página da loja ainda traz `delivery_price`/`eta_value`. Seria a
integração mais barata do projeto — **mas só vale para lojas do Rappi Mall** (e-commerce
nacional: Nespresso, Kalunga, Granado). Os SUPERMERCADOS (Carrefour/PdA/Extra, o turbo de
1h — o único motivo de querer Rappi) exigem localização definida no CLIENTE: slug de
mercado cai em landing genérica, `lat/lng` em URL e cookie não mudam nada, a API interna
responde 401 e o edge bloqueia sondagem (403 PATH_NOT_ALLOWED). Só com navegador — que
foi removido do produto de propósito (03/08). E o que é raspável (Mall) é entrega em
dias, ou seja, o trabalho que o ML já faz melhor. Actors de Rappi no Apify são de
RESTAURANTE (~US$0,5 só o start) e não fazem busca de produto em mercado.
**Conclusão do dono: "não precisa do Rappi se não ajuda em nada".** Rappi segue como
CANAL DE COMPRA manual do operador (tag ⚡), nunca como vitrine — não reabrir sem fato
novo (ex.: API de parceiro). No mesmo turno, o achado colateral virou conserto: item do
ML caía na tarifa padrão R$18 porque o ML não tem política de loja — taxa fantasma sobre
anúncio que estampa "Chegará grátis". Agora `CatalogItem.freeShipping` (do `freteGratis`/
texto do anúncio) viaja até `computeStoreFreights`: loja cujos itens são TODOS de frete
grátis sai com fee 0; um item pago no meio traz a política de volta (nunca cobrar a
menos). Testes: instant-quote 5/5, ML 11/11, live-freight, tsc.

**17/08 (5ª) — card do ML: slot de entrega é PRAZO, não benefício de frete.** Reclamação
do dono: "tá vindo frete grátis mas é pra vir prazo de entrega". Investigação no dataset
real: quando o anúncio não publica data, o actor devolve `envio: "Frete grátis"` ou vazio
(`Tiempo` é timestamp da raspagem, `disponivelEm` é variação de cor — não há prazo
escondido em outro campo), e os sem-data são com frequência anúncios INTERNACIONAIS
("enviado da China"). Três consertos em `mercadolivre.ts`: (1) `deliveryLabelFrom` não
devolve mais "frete grátis" — sem data publicada, sem rótulo (inventar prazo segue
proibido; o contrato é a cotação do operador); (2) `toCatalogItem` descarta
`eCompraInternacional`/`enviadoDe: China` na entrada; (3) `rankMercadoLivre` desempata
por TEM-PRAZO antes de vendas/avaliações — anúncio FULL publica prazo e agora domina os
3 cards. Cache versionado (`ml:v2:`) para valer sem esperar o TTL de 6h. Conector 11/11.

**17/08 (4ª) — vitrine fit/congelados: o gargalo do "sorvete que não engorda" era prateleira.**
Pergunta do dono: "quero um sorvete bom e que não engorda pra agora — ele resolve?".
Diagnóstico com dado: entender ele vai (rerank já julga contra a mensagem original), mas
as vitrines só tinham sorvete comum — e a FONTE tinha o produto: a API da Natural da
Terra vende Sorvete Napolitano Zero Açúcar Nestlé, Açaí Zero Frooty, Yamo Zero; YoPRO
existe em 3 mercados. O top-vendas da colheita nunca traz esse nicho. Conserto
estrutural: `--ft=<termo;termo>` no `harvest-vtex-catalog.mts` (varreduras complementares
por texto, mesmo dedupe/deny) + lista `GROCER_FT` (sorvete; açaí; zero açúcar; proteico;
yopro; whey; diet; light; sem lactose; sem glúten) nos 3 mercados do refresh. Resultado:
NdT 904→1.543 itens, Swift 920→968; **Oba caiu 1.494→1.000** (a API passou a parar em
`_from=1000` — não é regressão nossa; água mineral e essenciais continuam). Efeito
colateral pego pelo golden: "água" seca passou a devolver saborizada → "saborizada"
entrou em `PROCESSED_VARIANTS` (só vale se pedida). Verificado no roster de produção:
"sorvete zero açúcar" → Nestlé Zero R$32,99 em 1º; "açaí zero" → 3 opções de 3 lojas.
Gate: catalog-gaps + golden 40/40, tsc. A "vitrine Rappi ao vivo" segue registrada como
projeto só-se-o-piloto-provar-demanda (actors atuais são de restaurante, ~R$3/busca).

**17/08 (3ª) — tag "⚡ quer HOJE" no /ops (pedido do dono) + direções registradas.**
Contexto: o dono quer usar o **Rappi como canal de entrega urgente** (compra manual do
operador com o endereço do cliente — zero código, igual ao ML) e perguntou "como separar"
urgente de não-urgente. O NLU já detectava urgência ("urgente", "pra hoje", "queria
receber hoje") mas JOGAVA FORA a informação. Agora: `hasUrgencySignal` (lia-intents, puro,
unit-testado — "carregador rápido"/"carga rápida" NÃO contam, é atributo de produto),
`ctx.urgent` marcado em qualquer mensagem do turno (depois dos dois resets de TTL, senão a
marca morre na mesma mensagem), nota `⚡ URGENTE: cliente quer receber hoje.` no pedido
(criação e update), alerta do operador com prefixo ⚡ e **badge laranja "⚡ quer HOJE"**
no card do /ops. Nada muda para o cliente. A escolha do canal continua DO OPERADOR na
cotação (atenção à margem: preço dentro do Rappi é ~10-20% acima da gôndola + taxas —
conferir o total no Rappi antes de cotar urgência). Direção registrada (passo maior,
sem código ainda): **busca consultiva** — "quero algo pra X" (ex.: dor nas costas) deve
virar recomendação assessorada, não match literal; o dono sabe que remédio continua
proibido, o exemplo era ilustrativo.

**17/08 (2ª) — busca fria do ML: ~30s → ~20-22s (pedido do dono: "mais rápido").** O teto
é o próprio actor; medições reais de 17/08: karamelo em 1GB = 28,5s, **4GB = 21,1s**, 8GB =
19,7s (marginal) — na Apify CPU escala com memória, e em actor pay-per-event o compute é
conta do desenvolvedor, então 4GB é de graça pra nós. Alternativas testadas e DESCARTADAS:
gio21/mercado-livre-scraper (35s, voltou bloqueado com 1 warning), riseandcode (35,6s, 5
itens), fetch direto de lista.mercadolivre.com.br (200 mas "suspicious-traffic-frontend"),
API oficial `api.mercadolibre.com/sites/MLB/search` (403 sem token de app). Três cortes:
(1) `memory=4096` no run (`LIA_ML_MEMORY_MB`); (2) `waitForFinish` no POST do run — o
polling de 2,5s virou fallback; (3) **prefetch em paralelo**: `buildChoices` dispara o run
frio ANTES da extração de IA quando o parser determinístico já vê linha sem match local
forte (`prefetchLongTailIfNeeded`), e o retry de última chance pré-dispara com a frase
determinística — buscas idênticas em voo compartilham UM run (`inflight` no conector).
Para chegar em 10-15s ou menos só com a **API oficial do ML** (token de app via
client_credentials, ~1s/busca, grátis): exige o dono criar um aplicativo em
developers.mercadolivre.com.br — registrado em PENDENCIAS.

**17/08 — match local ERRADO bloqueava a cauda longa (caso "violão").** O dono pediu um
violão e ouviu "não tenho como trazer" — com o ML ligado, que tem violões aos milhares
(verificado no actor: Tagima R$1.389, Giannini, Vogga R$290). Causa: o gate
`needsLongTailSearch` só perguntava "existe match local forte?" e **"violão" casa com
"Brinquedo Musical - Violão - Patrulha Canina" (Ri Happy)** — o ML nem era consultado; o
rerank depois descartava o brinquedo (com razão) e a linha ficava órfã. Conserto: o ML
deixa de ser decidido por HEURÍSTICA PRÉVIA e passa a ser a ÚLTIMA CHANCE — quando o
pipeline inteiro (piso + rerank) esvazia a linha e o cliente ia ouvir "não tenho", roda
`buildChoices` de novo só para essas linhas com `forceLongTail`. O custo do ML é pago
exatamente quando a alternativa era recusar. Vale para a família toda do problema
(violão/brinquedo, microfone/karaokê infantil, panela/brinquedo de cozinha), não só o
caso relatado. A quantidade pedida na mensagem original é preservada no resgate.
Também: `searchingWider` virou "🔎 Procurando as melhores opções pra você…" — a versão
anterior expunha a mecânica ("procurei nas lojas parceiras e não achei, vou procurar em
outro lugar"), que o dono classificou como péssima. Suíte 344/344.

**16/08 (7ª) — ML entregou; 2 ajustes do 1º teste bem-sucedido.** O dono comprou o fluxo
até o resumo (camiseta R$120,89 com foto e prazo). Duas críticas dele, ambas certas:
1. **"Trouxe umas coisas estranhas"** — o actor publica `quantidadeVendida`,
   `numeroAvaliacoes`, `produtoReviews`, `lojaOficial` e `posicaoItem`, e a vitrine
   ordenava só por semelhança de texto: no resultado real dele, o 3º card era um
   anúncio com ZERO venda e ZERO avaliação. `rankMercadoLivre`: relevância manda
   primeiro (pedido específico continua vencendo), depois `trustScore` (vendas e
   avaliações em log10, nota >4 como bônus, loja oficial no desempate), depois a ordem
   do próprio ML. Anúncio não-validado vai pro fim. Sinais viajam no item (`mlTrust`,
   `mlPosition`), então sobrevivem ao cache.
2. **"Por que pede CEP e depois endereço?"** — os DOIS são necessários (CEP decide
   cobertura/frete; número+complemento é o que o entregador usa), mas cabiam numa
   pergunta só: `askNewCep`/`askCepAgain` agora pedem "endereço completo com o CEP" com
   exemplo, e o parser já lia os dois juntos desde 06/08. Quando só o CEP chega, a
   pergunta seguinte explica o PORQUÊ ("pro entregador achar você") em vez de parecer
   burocracia.

**16/08 (6ª) — 1º teste real do ML: busca OK, cards descartados por WebP.** O dono ligou
a flag e pediu camiseta: a busca levou ~28s e achou 3 camisetas reais do Corinthians com
preço, link e "chega amanhã" — e NENHUM card chegou. Causa (diagnóstico do dono):
`131053 — WebP image uploads are not currently supported`. O CDN do ML serve `.webp` e a
Meta recusa; como a falha é ASSÍNCRONA (a Graph aceita e descarta depois), o try/catch
não caía no fallback de texto e a conversa ficava presa em `choosing` esperando escolha
de opções invisíveis. Dois consertos, um específico e um genérico:
1. `mlImageAsJpg`: o mesmo arquivo existe em JPG trocando a extensão — verificado ao
   vivo nas 3 URLs que falharam (206 `image/jpeg`). Mesmo padrão do Boticário, que força
   `f_jpg` no Cloudinary por causa do AVIF.
2. **Pré-flight passa a validar o CONTENT-TYPE**, não só se a URL responde
   (`META_IMAGE_TYPES` = jpeg/png). Formato recusado → card SEM foto em vez de card
   descartado. Isso protege qualquer vitrine futura, não só o ML.
**Lição de método (a mais importante):** o teste do ML usava WebP e o teste dos cards da
Meta usava JPG — cada um passava sozinho e o defeito vivia no VÃO entre eles. Agora há
teste CRUZADO ML→Meta (foto WebP derruba só a foto; os dois cards saem) e o mock do
teste antigo, que devolvia `text/plain` como se fosse imagem boa, foi corrigido.

**16/08 (5ª) — MERCADO LIVRE volta como vitrine de cauda longa (atrás de flag).**
Pergunta do dono: "o fluxo é manual, por que não uso o ML que tem tudo?". Procede — o
motivo histórico de abandonar o ML era AUTOMATIZAR o checkout (sem API de comprador,
robô = banimento); com compra manual pelo operador esse bloqueio não existe. E os 7
ciclos de teste real mostraram que as recusas recorrentes eram justamente cauda longa
(cabo USB-C, camiseta, lancheira). O dono também apontou que a entrega das lojas locais
é D+1 na maioria dos casos (só Oba é same-day de verdade), então "hoje" não era o
diferencial que eu supunha — o diferencial é a CONVERSA.
**Validação antes de codar (16/08, actor real karamelo/mercadolivre-scraper):** 22,7s
("cabo usb-c 2 metros") e 25,1s ("camiseta futebol"), 48 itens cada, ~R$0,03/busca, com
título, preço, link, foto, estoque, flag de patrocinado E o campo `envio` — que traz o
PRAZO DO ANÚNCIO ("Chegará grátis hoje Enviado pelo FULL").
Desenho (`src/lib/stores/mercadolivre.ts`): 19ª vitrine, **desligada por padrão**
(`LIA_ENABLE_MERCADOLIVRE=true` liga; `false` volta atrás sem deploy); fallback estrito
— as 18 lojas locais são consultadas primeiro e o actor só roda quando nenhuma delas
tem match forte; cache de 6h no `SearchCache` que já existia;
aviso ao cliente se a busca passar de 2,5s (`copy.searchingWider`) porque 25s de
silêncio parece travamento; prazo do anúncio no card (`choiceLine` ganhou `delivery`) —
nunca estimativa nossa; descarta patrocinado/sem preço/sem estoque; e **guarda ANVISA
aplicada** (o ML vende dipirona — sem `withoutMedicine` a Lia venderia remédio).
O review antes da ativação pegou dois desvios do primeiro commit: `Promise.all` esperava
o ML até para item local e o prazo se perdia antes dos cards interativos da Meta. Ambos
foram corrigidos e travados: aviso só começa quando o fallback realmente dispara, e o
prazo atravessa `PendingChoice` + `sendDeliveryChoices`. Testes: 6 do conector, incluindo
pipeline completo com o payload REAL do actor mockado na rede. Pinado `false` no load-env
(suíte nunca vai à rede). Suíte completa 340/340, tsc, lint e build verdes.
**Ativação em Production (16/08):** `LIA_ENABLE_MERCADOLIVRE=true` foi criada como
Sensitive somente em Production e o commit corretivo `5040813` foi publicado no deploy
`dpl_9j9Yyn2fFWoCCWEUGDb8Bax7DMxZ` (`READY`, domínio reassumido). Smoke: landing 200,
`/ops` 200, webhook 403/401 sem assinatura e zero erro novo no scan de logs. O primeiro
pedido frio no WhatsApp ainda é a prova da integração runtime com o token Sensitive.
**Pendente (gate 2, não bloqueia piloto):** política do ML sobre muitas compras da mesma
conta para endereços diferentes — irrelevante em 5–10 pedidos, a verificar antes de
escalar.

**16/08 (4ª) — 6º ciclo (10 rodadas): 7 sucessos, 3 consertos.** A régua: 15→7→6→6→4→3.
1. "Para uma viagem" vazava pelo lado da IA (o determinístico já filtrava):
   `isRequestModifier` exportado e aplicado aos itens da extração em extractLines.
2. "sem pimenta" contaminando o pão de alho: o EXEMPLO da regra 7d do prompt ensinava o
   erro ('pão de alho sem pimenta' como par). Exemplo reescrito com o escopo certo —
   negação vale só pro vizinho imediato; os demais itens ficam intactos.
3. CEP órfão: endereço com "CEP 13010-050" no fim salvava "… - SP, CEP." depois de
   remover os dígitos — a palavra "cep" solta agora sai junto na captura.
Gate focado: tsc + 40 units + E2E da sequência da rodada 8 (endereço com CEP repetido).

**16/08 (3ª) — 5º ciclo de testes (10 rodadas): 4 consertos + gate focado.** Granola→aveia,
"sem remédio"+shampoo, presente≤R$100 e 4x→7x→5x passaram; fechados:
1. "Para domingo"/"Para uma viagem" (ocasião/dia) e "barato" seco = modificadores.
2. PLURAL no merge: "cafés moídos" não casava "café moído" e o gêmeo determinístico era
   resgatado como linha duplicada — `meaningfulProductTokens` singulariza; "cada" ignorado.
3. Adição relativa na MESMA mensagem ("…30 litros; mais um desses", "leite sem lactose;
   mais dois leites"): soma na linha anterior no parser; a linha nua da IA se dobra na
   rica ANTES da herança do gêmeo (depois contaria 2x); MORE_SAME ancorado no começo da
   mensagem (não sequestra mensagem que contém lista).
4. Trocar endereço com cotação na mesa PRESERVA a cesta (restaurada de `order.items` ao
   cancelar) e re-cota sozinho após o endereço novo.
Processo: a partir daqui o gate de publicação é FOCADO (tsc + units + golden + E2E dos
fluxos tocados); `npm test` completo só em mudança de core, antes de ciclo de teste do
dono, ou a pedido — decisão do dono em 16/08 (memória persistida).

**16/08 (2ª) — 4º ciclo de testes (10 rodadas): 6 consertos.** Perfume floral, leite sem
lactose relativo, sacos 30l e a guarda de remédio passaram; fechados:
1. **"cabo usb-c de 2 metros" devolvia carregador de parede**: o catálogo NÃO tem cabo
   USB-C — a resposta certa é "não tenho". Caso golden `none` (cabo ≠ carregador) +
   regra explícita no prompt do rerank: a recíproca de "carregador aceita cabo" NÃO
   vale; sem cabo de verdade, lista vazia. Lacuna de vitrine registrada (cabos/eletro).
2. **Teto de preço sobrevivia só no caminho determinístico**: a IA remove o preço da
   query (por instrução), e o merge descartava o gêmeo determinístico que carregava o
   "até R$25" — as opções passavam do limite (card de R$29,69). O merge agora re-anexa
   o cap do gêmeo. É o conserto REAL do "teto excedido"; o filtro em si sempre existiu.
3. **Tamanho vale para TODOS os cards**: "30 litros" filtra as 3 opções (antes 1 delas
   vinha sem o atributo); mesmo `attrMatchesItem` do refinamento.
4. **"Sem remédio" no COMEÇO da frase virava remoção** (REMOVE_START começa com "sem"):
   exceção pra negação de categoria — a frase segue como pedido e o shampoo é buscado.
5. **"pensando bem" e "chega amanhã/hoje" secos** viram filler/urgência (NOISE e
   MODIFIER); o swap sintetizado não emite mais "não tenho: pensando bem".
6. **Destino com CEP embutido** ("vou entregar em São Paulo, CEP 01310-100") consome o
   CEP direto (intent cep bare) — nada de "me manda o CEP" redundante.

**16/08 — botões de quantidade: "Outra quantidade" no lugar do 3 (pedido do dono).** Os
botões da pergunta de quantidade viraram *1 unidade · 2 unidades · Outra quantidade*
(id `qty:other`); o toque abre a pergunta livre (`copy.quantityAskFree`, "de 1 a 50") e
o número digitado no chat continua valendo em qualquer momento. O perfil do WhatsApp
(nome + CNPJ visíveis no contato) NÃO é código: edita-se no WhatsApp Manager da Meta —
o dono foi orientado; o nome legal verificado pela Meta não é removível, mas
descrição/sobre são.

**15/08 (2ª) — 3º ciclo de testes (10 rodadas): 6 consertos.** Quantidades, referência
por substantivo, cartão antigo por sku e guarda de remédio passaram; sobraram:
1. **Preferência negativa vira atributo, nunca linha**: "sem pimenta", "não veicular",
   "não quero brinquedo barulhento" → o segmento vira `sem <alvo>` grudado no item
   anterior (o matcher já exclui por `negatedWords`). Prompt da extração ganhou a 7d.
2. **"até R$30 cada"**: o "cada/por unidade" não quebra mais o padrão de orçamento;
   "queria algo barato" e "sem precisar de …" viraram modificadores descartáveis.
3. **"Antes de pagar, VOU entregar em Campinas, CEP 13010-100"** (crítica recorrente):
   "vou" entrou no deliver-to; e CEP chegando com o menu de pagamento aberto agora
   DERRUBA a cotação do endereço velho e segue pro fluxo de endereço — antes qualquer
   texto que não fosse pix/cartão devolvia o menu antigo.
4. **Adição relativa herda o item**: "Pode colocar mais um leite" com leite sem lactose
   na cesta incrementa O MESMO sku (a busca genérica adicionava leite integral novo);
   "mais um saco de lixo desses" captura o substantivo composto antes do marcador.
5. **"troca X por Y" numa lista NOVA** (mesma mensagem: "quero A e B; pensando bem,
   troca B por C"): com cesta vazia, a autocorreção vale pra própria mensagem — busca
   A + C, descarta B (antes: "não achei pra tirar").
6. Lancheira fora de catálogo agora recusa LIMPO (o "sem precisar de…" era o ruído);
   lacuna de vitrine registrada. Golden inalterado; unit + E2E dos três fluxos.

**15/08 — re-teste do dono (10 rodadas): 5, 6 e 15 PASSARAM; 5 ruídos restantes fechados.**
Transcrições reais de novo como fonte. (1) "três pacotes" virava "3x pacotes indisponível":
o branch de quantidade por extenso usava `\w` (ASCII) e "três" tem acento — corrigido; e
segmento só-de-embalagem ("três pacotes", "2x pacotes") agora TRANSFERE a quantidade pra
linha anterior em vez de virar linha. (2) "qualquer time" virou genérico: `qualquer <x>`
como segmento é sempre preferência. (3) "mas entrega hoje se der": adversativas
(mas/porém/só que/com) são limpas do começo do segmento antes do filtro de modificador.
(4) Confirmação de escolha mostra a quantidade ("✅ 4x …") quando ela já é conhecida —
o estado estava certo e o texto escondia (rodadas 3, 7, 9). (5) "mais um desse CAFÉ"
mira o item da cesta pelo substantivo (não cegamente o último). Bônus de relevância com
golden primeiro: "hidratante" não perde mais para "Sabonete Líquido Hidratante" — regra
principial no scorer: substantivo de categoria DIFERENTE antes da palavra pedida no nome
= penalidade (reordena; o sabonete segue como fallback). Golden 34 casos. Registrado sem
conserto: "o mais barato possível" ordena mas não restringe (decisão de produto).

**14/08 — 15 rodadas de teste real do dono → 7 consertos de NLU/fluxo.** Relatório em
[docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md); diagnóstico
refinado com as transcrições reais do banco (só o lado do cliente é persistido). A causa
nº 1 não era a busca: era o RESGATE do merge IA×determinístico devolvendo fragmentos
("até uns 100 reais", "qualquer marca", "se tiver", "queria receber hoje") como itens —
daí a cesta de R$167 (rodada 6: o cliente escolheu opção para a linha fantasma sem
perceber) e os "não tenho como trazer" contraditórios (3, 7, 10, 12).
1. `MODIFIER_SEGMENT_RE` no parser determinístico: restrição nunca vira linha; ORÇAMENTO
   gruda como teto na linha anterior ("presente… até uns 100 reais" → 1 item com cap,
   filtrado pelo splitPriceCap de sempre). Prompt da extração ganhou a regra 7b.
2. "Antes de pagar, quero entregar em Belo Horizonte" (rodada 15, a mais perigosa):
   "pagar" em oração subordinada não dispara pay; "quero entregar/receber em <lugar>"
   vira change_address (que já cancela cotação aberta); "receber em casa" fica de fora.
3. "quatro caixas" por extenso já era qty no parser; o E2E agora trava o ciclo inteiro:
   qty explícita não re-pergunta, número solto em collecting AJUSTA o último item
   (copy.qtyAdjusted), e "mais três do mesmo" vira intent `add_more_same` que soma no
   SKU do último item (nunca nova busca — que podia trazer outra marca). Em estado
   cotado (fluxo legado), o ajuste RE-COTA em vez de deixar total velho no menu.
4. Esclarecimento durante a escolha ("só shampoo normal, sem preferência" enquanto
   escolhe shampoo): mesmo substantivo (`sharesProductNoun`) = REFINA a escolha atual,
   nunca abre segunda linha (rodada 5: cliente levou 2 shampoos sem perceber).
5. "sem remédio"/"não quero remédio" é negação (`stripMedicineNegation` antes de
   qualquer detecção; prompt regra 7c) — some o falso "removi o medicamento" (4, 14).
6. Mensagem de pedido mínimo mostra o RESTO da cesta ("o resto continua guardado") —
   parecia resumo completo e o cliente achava que itens tinham sumido (3, 10).
7. Fallback manual explica o porquê ao cliente (conferência de estoque/entrega) e anota
   no /ops qual loja/motivo abortou a cotação instantânea (2, 11 — o runtime log de 1h
   não sobrevivia pro diagnóstico). P3: "Pagar" → "Fechar e ver total"; endereço com
   ponto final não gera mais "SP..".
Latência de ~15s no 1º turno (rodada 1) ficou registrada sem conserto: é cold start +
2 chamadas de LLM; otimizar só se o piloto mostrar recorrência.

**11/08 (7ª) — 2ª revisão: 4 lacunas de concorrência/consistência fechadas.**
1. **Lock de turno por conversa** (colunas `turnLock`/`turnLockAt`, migration
   20260811150000, **já aplicada no banco**): duas mensagens simultâneas do mesmo
   cliente liam a mesma cesta e a última gravação de contexto apagava o item da
   primeira. Agora `handleDeliveryMessage` reivindica o lock (claim atômico via
   updateMany; TTL 60s; espera máx. 15s e entra assim mesmo — webhook nunca pendura),
   recarrega a conversa DEPOIS do lock e processa em `handleDeliveryTurn`; release só
   se o token ainda é o nosso. Dedupe fica ANTES do lock (retry sai na hora). Efeito
   colateral: `lastActivityAt` deixou de olhar `Conversation.updatedAt` (o claim do
   lock o bumparia a cada turno) — só a mensagem anterior conta como atividade.
2. **Trocar endereço por estado**: com Pix/cartão emitidos (`awaiting_payment`/
   `payment_issuing`) a troca é bloqueada com orientação de cancelar primeiro (cobrança
   não fica órfã de conversa); com pedido AINDA na fila do operador, o pedido sobrevive
   — `deliveryOrderId` atravessa o fluxo de endereço e, confirmado o novo,
   `syncAwaitingQuoteOrderAddress` atualiza cep/endereço NO pedido, anota no /ops,
   alerta o operador e devolve a conversa pra espera da cotação.
3. **Falha parcial no envio da cotação**: rollback só quando o RESUMO falha (peça
   essencial), e a reescrita do contexto só quando o rollback de fato flipou o status
   (`rolled.count`) — menu/validade falhando depois do resumo apenas loga ("pix" por
   texto funciona); reverter aí desalinharia pedido (avançado por um toque) e conversa.
4. **Eco da simulação VTEX validado de verdade**: multiconjunto id→quantidade do eco
   tem que ser idêntico ao pedido (id trocado, qty errada ou item repetido → tabela) e
   `logisticsInfo` é alinhado por `itemIndex` (repetido/fora da faixa = malformado).
Testes: corrida de mensagens diferentes (Promise.all), troca de endereço nos dois
estados, falha parcial, eco malformado (live-freight 10/10).

**11/08 (5ª) — revisão de código do lote: 6 P1 + 4 P2/P3 corrigidos.** Uma revisão
independente dos 19 commits achou defeitos que a suíte verde não pegava (cada um virou
teste):
1. **Frete VTEX cobrava por 1 item.** `logisticsInfo` é POR ITEM; o código achatava todos
   os SLAs e pegava o mais barato — cesta de N itens saía com o frete de um. Agora soma o
   SLA de entrega mais barato de CADA item, exige que a resposta cubra a cesta inteira,
   trata item indisponível como `item-unavailable` (→ operador, nunca tabela) e **preço
   ausente não é frete grátis** (só `price: 0` explícito é). Prazo exibido = o do item
   mais lento.
2. **Falha de envio deixava pedido zumbi.** `opsPublishManualQuote` movia o status ANTES
   de mandar as mensagens: erro no WhatsApp deixava o cliente sem total e o operador sem
   poder recotar (o /ops só cota `awaiting_operator_quote`). Agora falha de envio faz
   ROLLBACK do status, anota o erro no /ops e propaga o erro.
3. **Pedido mínimo da loja não valia no concierge** (a checagem vivia só no ramo legado,
   depois do return): cesta abaixo do mínimo era cotada, cobrada e recusada no checkout
   da loja. `conciergeStoresBelowMinimum` roda antes de criar o pedido (linha concierge
   não tem loja real → sem mínimo, senão herdaria o do default).
4. **Botão "Trocar endereço" não trocava**: em `awaiting_quote_confirmation` o bloco de
   pagamento capturava tudo e devolvia o menu — dava pra pagar cotação amarrada ao
   endereço velho. O `change_address` subiu para antes dos estados de espera e derruba a
   cotação aberta (o frete era do outro endereço).
5. **Escritas ler-depois-escrever por id**: cancelamento automático e publicação podiam
   se sobrescrever. Ambos agora são `updateMany` com o status no WHERE; quem perde a
   corrida não mexe no contexto da conversa.
6. **Dedupe de webhook não era atômico** (findFirst→create): duas entregas simultâneas do
   mesmo sid passavam juntas. Agora há índice ÚNICO PARCIAL
   (`Message_inbound_provider_id_key`, migration 20260811120000) sobre
   (conversationId, metadata) **WHERE sender = 'user'** e o P2002 decide. Parcial porque
   `metadata` de mensagens do ASSISTENTE guarda JSON de opções do fluxo legado, que se
   repete legitimamente (2 grupos assim existem em produção) — índice global exigiria
   apagar mensagens reais. **Índice já aplicado no banco.**
7. **TTL media o relógio errado**: `Conversation.updatedAt` só muda quando o contexto é
   gravado, então quem só perguntava ("já saiu o total?") era expirado no meio de uma
   conversa viva. `lastActivityAt` usa a última MENSAGEM (ou o updatedAt, o que for mais
   recente); vale para o TTL de cesta e o de cotação.
8. **"troca X por Y" só olhava o Carrefour** no concierge (`orderStore` cai no default
   quando a chave é "concierge"): agora usa `gatherCrossStoreCandidates` + diversidade +
   piso, como o pedido normal, e a opção carrega a loja dela.
9. **Refino apagava o histórico de paginação** (`shownSkus` era substituído) e "outras"
   repetia cards; agora acumula.
10. `tail-messages` ordenava ASC com `take: 60` — mostrava as 60 mais ANTIGAS, escondendo
    justo o erro recente. Agora é DESC + reverse (tail de verdade).
Efeito colateral saudável nos testes: com o mínimo valendo, fechar 1 refrigerante do
Carrefour (mínimo R$30, loja pinada no registro de teste) passou a ser barrado — os evals
que fechavam cesta agora usam quantidade que passa do mínimo, e há caso novo cobrindo os
dois lados.

**Bug MAIOR achado ao consertar o nº 6 — conversa duplicada divide a cesta.** O teste de
dedupe passava sozinho e falhava na suíte cheia (sob carga). Causa: `getOrCreateConvo`
fazia ler-depois-criar, então duas mensagens simultâneas do MESMO número abriam DUAS
conversas ativas — cada uma com seu contexto (cesta dividida, item sumindo) e com o
dedupe, que é por conversa, sem colidir. O banco confirmou o estrago: um número com **86
conversas ativas**. Conserto na raiz e sem tocar em dados: a criação virou `upsert` com id
DETERMINÍSTICO (`conv_<userId>`) — upsert por PK é atômico, então as duas chamadas
convergem para a mesma conversa. Conversa nunca é desativada no produto (o único
`status: "inactive"` é de cartão salvo), então reaproveitar o id é seguro. O teste trava a
raiz (1 conversa ativa), não só o sintoma. **Descartada** a alternativa de índice único
global por `metadata`: os ids de teste (`dup_1`) se repetem entre usuários diferentes nos
evals, e um índice global quebraria a suíte além de exigir apagar linhas reais.

**11/08 (4ª) — teste real do dono pegou 2 bugs + 1 pedido de UX.** (1) **"Escolher esse"
confirmava OUTRO produto**: o id do botão era a POSIÇÃO ("1"/"2"/"3"); depois de "Outras
opções" a lista trocava por baixo e o toque num card antigo escolhia a posição equivalente
da lista nova. Agora o id carrega o SKU (`optsku:<sku>`), `PendingChoice.shownOptions`
guarda tudo que já foi mostrado, e o toque em QUALQUER card do histórico escolhe
exatamente o produto daquele card (`confirmChosenOption` unifica número digitado, "mais
barata", nome e toque; a loja é a do produto escolhido, não a da opção 1). Sku fora do
histórico (card de outro item) → reapresenta a escolha, nunca chuta. (2) **"Outras" veio
com 1 opção só**: o preenchimento até 3 se perdia quando o filtro de variantes esvaziava —
agora completa do pool (pool mais fundo: 12/loja) e o eval trava 3. (3) Resumo da cotação
ganhou o botão **"Trocar endereço"** (`trocar_endereco`; corpo ≤1024 chars, senão texto com
a dica escrita de sempre). Testes: E2E do card antigo por sku, eval de 3-de-verdade,
botões no adapter, intents dos ids de máquina.

**11/08 (3ª) — FIM DA LINHA LIVRE no fluxo do cliente (decisão do dono: "pede → preço →
acabou; se não tem, fala que não tem").** O "Recebi seu pedido, vou cotar" deixou de
existir no caminho normal. Regra nova: item sem preço nas 18 lojas é RECUSADO com
honestidade na mesma resposta (`copy.itemsNotAvailable`, com convite a tentar outra
marca/versão) e NUNCA entra na cesta; fechar a lista com escolha aberta pede pra
confirmar o item (`finishChoiceFirst`) em vez de dobrar em linha livre. Consequência:
toda cesta é 100% precificada e TODO fechamento sai com total na hora. O caminho manual
(`awaiting_operator_quote`) vira fallback técnico (falha de frete/kill-switch
`LIA_INSTANT_QUOTE=false`), cercado pelo alerta ao operador e pela expiração de 1h.
`foldPendingIntoBasket`, `conciergeItemsNoted` e `conciergeSourcingNote` foram removidos;
adicionar item DURANTE uma cotação manual (só no fallback) continua dobrando no pedido.
Testes flipados para a regra nova em manual-concierge (helper `manualQuoteOrder` exercita
o fallback com `LIA_INSTANT_QUOTE=false`). A largura agora É a vitrine (17 mil itens):
lacuna de catálogo virou "não tenho" — ampliar catálogo é a resposta, não promessa de
cotação. Bônus da rodagem viva: o seed do Imigrantes tinha 151 palavras com encoding
corrompido ("�gua", "A��car") — corrigidas por dicionário; isso destravou 30 águas
invisíveis e expôs que "Sem A��car" ESCAPAVA da penalidade de variante (a Coca sem
açúcar vencia a original). "tonica"/"micelar"/"termal" entraram em PROCESSED_VARIANTS
(água tônica/micelar/termal não é água de beber — caso golden da água cobrou). Placar
golden mantido: 32/33 DET · 33/33 IA.

**11/08 (2ª) — botão Cancelar sempre visível + cotação abandonada expira sozinha.** Duas
regras do dono na sequência do zumbi: (1) "sempre tem que vir um botão cancelar" — o menu
de pagamento ganhou o 3º botão *Cancelar* e TODA mensagem de espera de cotação
(`operatorQuoteRequested`/`StillWorking`/`addedToPendingQuote`) sai como interativo com
botão *Cancelar pedido* (`sendCancelableNotice`; o toque volta como o texto "cancelar" e
cai no cancel contextual que já existia; fora do Meta, texto puro). (2) "sumiu por 1h =
não quer mais" — `LIA_QUOTE_ABANDON_TTL_MS` (60 min): cliente que volta depois de 1h+ com
pedido parado em `awaiting_operator_quote`/`awaiting_supplier_validation`/
`awaiting_quote_confirmation` tem o pedido não-pago cancelado sozinho (nota "⏰ Cancelado
automático" no /ops), a conversa recomeça do zero (endereço preservado,
`copy.staleQuoteRestart` avisa que nada foi cobrado) e a mensagem nova é processada
normalmente — a camiseta nunca mais cai dentro do pedido de sábado. Pedido PAGO nunca é
tocado; `awaiting_payment` fica de fora de propósito (o cliente pode estar pagando o Pix
naquele momento; cotação vencida já bloqueia pagamento velho). Complementa o TTL de
carrinho de 30 min que já existia (aquele só cobria cesta em montagem, não pedido criado).
Testes: E2E de abandono (viagem no tempo via SQL no `updatedAt`) + botões no adapter.

**11/08 — pedido zumbi + alerta ao operador + card sem foto (bug real de produção).**
"Quero uma camiseta de futebol" respondeu "anotei e já incluí na cotação" — o dono achou
que era a busca; era um pedido REAL de sábado preso 2 dias em `awaiting_operator_quote`
(nasceu 26 min ANTES do deploy da cotação instantânea, e a camiseta caiu dentro dele como
linha livre, por desenho de 07/08). Diagnóstico via `tail-messages` + banco. Causa raiz
sistêmica: NADA avisava o operador de que havia trabalho no /ops — cotação manual era "em
instantes" que nunca chega. Fechado: `notifyOperator` (env `LIA_OPERATOR_PHONE`; sem env =
silêncio; best-effort, nunca afeta o cliente) dispara no WhatsApp do operador em 3
momentos: pedido caiu pra cotação manual, cliente adicionou item durante a cotação, e
pedido PAGO (o mais urgente). Setar a env na Vercel + redeploy pra valer. No mesmo
mergulho: o card da ração de sábado foi descartado pela Meta por **foto 404 no CDN**
(erro assíncrono 131053 — classe nova, não é o encoding de 07/08); `sendMetaDeliveryChoices`
agora faz pré-flight da imagem (Range 1 byte, timeout `LIA_MEDIA_PREFLIGHT_TIMEOUT_MS`
1500ms; só 4xx definitivo derruba) e manda o card SEM foto em vez de perdê-lo — produto,
preço e botões sobrevivem. Desbloqueio do pedido preso: o próprio cliente manda "cancelar"
(cancela `awaiting_operator_quote` sem cobrança). Testes: alerta E2E em
manual-concierge, card sem header em whatsapp-adapter.

**10/08 (2ª rodada) — botão "Outras opções" + paginação cross-store.** Pedido do dono: quem
não gosta de NENHUMA das 3 opções precisa de uma saída visível. O último card de produto no
canal Meta ganhou um segundo botão **"Outras opções"** (id de máquina `opt:outras`, que volta
como texto e cai no MESMO ramo do "mostra outras" digitado); o fallback numerado anuncia o
atalho no `choicesAsk` ("*outras* que eu mostro mais") e `wantsMoreOptions` aceita "outras"
seco, "mostrar mais" e o id do botão. Toque atrasado fora da escolha vira `reject` educado
(nunca busca de produto). Por baixo, dois consertos na paginação: `choiceCandidates` agora
busca em TODAS as vitrines no concierge (paginava só a loja da opção 1, escondendo as
outras; cada opção carrega a própria loja) com pool mais fundo (40, 8/loja), e tanto a
paginação quanto o refinamento passam pelo `diversifyOptions` — "outras" nunca devolve
variante do que o cliente acabou de dispensar (só se não sobrar nada distinto). Pool
esgotado continua honesto (`noMoreOptions`). Testes: intents (botão/atalhos), adapter
(2 botões no último card), E2E de paginação por botão.
A vistoria de rodagem completa (talk-lia) no mesmo dia pegou o buraco que a suíte não via:
a paginação nunca teve piso de relevância — "outras" de "carregador de celular" devolvia
Sérum Nivea "Cellular" e chip de operadora (score>0 por token solto; o pool cross-store
escancarou). `choiceCandidates` agora aplica `conciergeMatchIsStrong` na paginação e no
refino. Limitação assumida: o rerank de IA não roda na paginação (resposta na hora), então
o piso léxico é estrito — "outras" de "carregador de celular" pode dizer "essas são todas"
mesmo havendo veicular/cabo no catálogo (o refinamento cobre); regressão E2E do sérum em
tests/conversation.eval.test.ts.

**09/08 — cotação instantânea (decisão do dono: cliente não espera no chat).** Cesta 100%
de vitrine fecha com o total NA HORA: `tryPublishInstantQuote` calcula o subtotal da vitrine
(custo real; o markup entra no publish, como na cotação manual) + **frete por loja** e
auto-chama `opsPublishManualQuote` em modo `retailer_delivery`, reutilizando por inteiro a
máquina de cotação/pagamento existente. **A entrega é pelo SITE do varejista** (correção do
dono: "não é via Uber, é via site" — o operador compra no site e a loja entrega; "2 lojas =
2 fretes" = dois checkouts), então o frete certo é a POLÍTICA DO SITE de cada loja:
`LIA_STORE_FREIGHT_<LOJA>` + limiar de frete grátis `LIA_STORE_FREE_ABOVE_<LOJA>` (comparado
ao subtotal de CUSTO daquela loja, como o carrinho do site vê); sem política, tarifa padrão
`LIA_FREIGHT_DEFAULT` (18) com marca "(tarifa padrão)" na nota do /ops. Sem km, sem courier
nessa conta — o desenho base+km/Uber foi descartado no mesmo dia, antes de ir ao ar como
preço. Linha livre mantém o fluxo manual (não se cobra o que não tem preço); kill-switch
`LIA_INSTANT_QUOTE=false`. A autoridade de preço do operador passa a valer só para linha
livre; para vitrine, o preço raspado (com markup como colchão) é o cobrado — defasagem acima
da margem segue a política de pós-venda (avisar + estornar diferença). Módulo
`src/lib/instant-quote.ts` (puro/testável). Testes em `tests/instant-quote.test.ts` (4) +
3 E2E no `tests/manual-concierge.test.ts`. Calibração dos valores por loja = ação do dono.

**07/08 (3ª rodada) — cards de opção descartados pela Meta sem erro visível.** Teste real:
header "Achei essas opções de cotonete:" saiu e nenhum card chegou. Runtime logs: webhook
200, zero exceção → a Graph API aceitou os cards e o WhatsApp os descartou DEPOIS (falha
assíncrona). Dois buracos fechados: (1) `safeMediaLink` (adapters/whatsapp.ts) percent-encoda
URLs de imagem com byte não-ASCII — caso real: `…cotonetes®-150…` da Pague Menos; o fetcher
da Meta rejeita o que o curl aceita — aplicado nos 3 envios de mídia Meta (card interativo,
mensagem de imagem, sendMedia); (2) o webhook LOGA todo `status: failed` da Meta
(`[whatsapp:meta:status-failed]`, com code/title/details) antes do ACK — era ACKado e
descartado em silêncio, o que tornava esse tipo de falha indiagnosticável. Lição de método:
teste com adapter mockado NÃO cobre a entrega real da Meta; validação de card exige teste
real + leitura do runtime log. Unit de `safeMediaLink` em tests/whatsapp-adapter.test.ts.

**07/08 (2ª rodada) — emoji literal RESOLVIDO na raiz + linha livre passou a contar que buscou.**
O `🙂` que aparecia no WhatsApp era **bug do minificador SWC do Next 14**: ao fundir
`[template, "", 'string'].join("\n")` num template literal único, ele emitia o emoji com barra
dupla (`\\uD83D\\uDE42`) — texto literal pro cliente. Por isso o 📝 da MESMA mensagem
renderizava e o 🙂 final não, e nenhuma versão do fonte tinha o problema. 5 emojis de copy
estavam corrompidos no bundle (💚×4, 💳, 📍×2, 🙂×2, 🛵). Conserto na raiz:
`experimental.serverMinification: false` no `next.config.mjs` (minificar servidor não paga
nada aqui) + guarda `scripts/check-bundle-emoji.mjs` no `npm run build` que FALHA o build se
um surrogate com barra dupla voltar ao bundle. Junto: o caso real "adaptador hdmi pra usb"
(nenhuma das 18 lojas tem) mostrou que a linha livre parecia "anotou sem procurar" — a copy
`conciergeItemsNoted` agora diz que PROCUROU nas lojas parceiras e que o operador cota por
fora. Guarda do teste breadth mantida (a frase de recusa legada continua proibida).

**Três bugs de onboarding achados ao validar a busca numa conversa real (mesmos consertados).**
Eles produziam exatamente o sintoma que motivou o trabalho — busca devolvendo lixo — só que a
origem era o endereço, não o matcher:

1. **Endereço + CEP na mesma mensagem** ("Av. Paulista 1000, apto 5, Bela Vista, São Paulo,
   01310-100" — o jeito mais natural de responder) era interceptado pelo ramo de CEP, que
   tratava o resto como ITENS: a Lia respondia "Já anotei: 1x apto 5" e pedia o endereço de
   novo. Agora `looksLikeDeliveryAddress` decide, e o endereço salvo vem do texto **cru** (com
   acento, maiúscula e vírgula) — o normalizado ia pro motoboy como "av paulista 1000 apto 5".
2. **Endereço como primeira mensagem** (cliente que não diz "oi") virava lista de compras pelo
   mesmo motivo; agora é salvo.
3. **Pedido feito enquanto a Lia espera o endereço** era descartado em silêncio; agora fica
   guardado em `pendingRequest` e roda assim que o endereço chega.

Regressões em `tests/manual-concierge.test.ts` (3 testes novos).

### Atualização 03/08/2026 — vitrine híbrida (o cliente passa a ver produto)

Até aqui o concierge só ANOTAVA o pedido: os 17,4 mil itens existiam mas nunca chegavam ao
cliente (a "vitrine híbrida" era proposta desde 24/07). Agora `handleConciergeRequest` busca
nas 18 lojas via `buildChoices` (sem travar loja — o operador compra onde precisar, então a
cesta pode ser mista) e mostra até 3 opções com foto e botão. Item sem match continua virando
linha livre: a largura é o moat e nada é recusado.

Três regras sustentam a qualidade — todas viraram teste:

1. **Piso de relevância do concierge** (`conciergeMatchIsStrong`, em `stores/types.ts`). O piso
   legado (`scoreCatalogMatch > 0`) é permissivo porque lá não havia alternativa ao catálogo.
   No concierge há: a linha livre. Então sugerir errado é PIOR que não sugerir. Caso real que
   motivou: "conserto de torneira" casava com **"Espumante Argentino Concerto Brut"** (o fuzzy
   trata conserto≈concerto) e o cliente recebia vinho. A regra é COBERTURA da consulta, não
   score: consulta de 1–2 palavras exige cobertura total; consulta longa tolera 1 palavra sem
   correspondência; token de tamanho ("2kg") nunca conta. Opção reprovada faz a linha voltar a
   ser livre. Coberto por `tests/concierge-match-floor.test.ts`.
2. **Escolher NÃO fecha a lista.** No legado, acabar as escolhas ia direto pra cotação porque
   escolher era o último passo. No concierge o cliente ainda soma itens e só fecha com
   "só isso" — `advancePending` ganhou o ramo concierge.
3. **Fechar com escolha pendente não descarta o item** (`foldPendingIntoBasket`). Antes, dizer
   "só isso" no meio das opções perdia o item silenciosamente; agora ele vira linha livre.

Regressões 2 e 3 cobertas em `tests/manual-concierge.test.ts`. Suíte: 220 testes, 219 verdes
(1 flake de conexão do Postgres sob carga, que passa isolado em 45s), `tsc`, lint e build limpos.

### Atualização 03/08/2026 — Browserbase removido; catálogo com rotina mensal

Por decisão do dono, **o Browserbase saiu do produto inteiro** ("não precisa disso, não estamos
fazendo assim"). Todo o navegador remoto era suporte ao caminho automatizado, que já estava
atrás de `manualConciergeEnabled()` e desligado por `PURCHASE_AUTOMATION_ENABLED=false` — ou
seja, código morto em todos os ambientes. Não reintroduzir sem mudança explícita de produto.

**Removido:** busca ao vivo (`browserbase-live-search.ts`), os 3 compradores automatizados
(`purchasing/stores/`), o lease de Context, `purchasing/` inteiro, `workflows/purchase-order.ts`,
as rotas `/api/ops/internal-preflight` e `/api/ops/live-retailer-session`, o cron
`/api/cron/prewarm-search` (só existia para aquecer o cache do robô) e o `vercel.json` que o
agendava. No `/ops` saíram os botões de preflight/sessão viva e os cards de PurchaseJob. No
cérebro saíram `beginRetailerQuote`, `publishValidatedRetailerQuote`, `issueDeferredOrderPayment`
e a guarda `usesRetailerCheckoutQuote`. As dependências `@browserbasehq/sdk` e `playwright-core`
saíram do `package.json` (`workflow` fica: é do One-Click de cartão).

**Preservado de propósito:** `issueValidatedRetailerQuotePayment` e
`setQuoteConversationAwaitingPayment` — o concierge manual reusa os dois para cobrar depois que
o operador publica a cotação. O modelo `PurchaseJob` continua no schema (nenhuma migration), só
não é mais alimentado.

**Oba deixou de ser exceção.** Ela dependia de busca ao vivo e tinha só 2 itens de seed. A API
pública VTEX dela responde direto (206 + JSON) — o navegador nunca foi necessário ali. Colhida:
**1.494 itens reais**. Petz e Boticário passam a servir o catálogo colhido (anti-bot impede
recolheita automática; seguem em colheita manual).

**Rotina mensal de preço** (`npm run catalog:refresh`, `scripts/refresh-catalogs.mts`): recolhe
as 10 lojas com API/SSR aberta, compara preço a preço com o catálogo atual e resume quantos
mudaram, a variação média e as maiores mexidas. `--dry` simula sem tocar em arquivo. Colheita
vazia **preserva** o catálogo anterior (vazio quase sempre é bloqueio, não loja sem produto).
As farmácias carregam allowlist + deny-regex dentro do script. Primeira execução já mostrou o
valor: o Divvino teve **320 preços diferentes em um dia** (+31,8% médio — a colheita de 02/08
pegou uma promoção que acabou).

Verificação: suíte **210/210 verde** (os 14 a menos são os testes do Browserbase removidos),
`tsc`, lint e build limpos.

**Publicado em 03/08:** push da `main` (27 commits) → deploy `dpl_BKzUbC4brKprMqrdMYJQ7QDnt5Kr`
(commit `cf131f5`) `READY` em Production. Smoke: landing 200, `/ops` 200, webhook 403 e as
rotas removidas do Browserbase respondendo 404. Produção e código local estão idênticos;
não há mais gate técnico para o piloto.

### Atualização 02/08/2026 — 7 vitrines novas (18 lojas, 17.264 itens)

Por decisão do dono ("adiciona todos esses"), as lacunas de demanda mapeadas contra os dados
de e-commerce/delivery BR foram fechadas. A vitrine saiu de **7.652 itens em 11 lojas** para
**17.264 itens em 18 lojas**. Todos os dados são reais (nome/preço/URL/imagem verbatim) e cada
CDN foi testado como hotlinkável antes de registrar a loja.

| Loja | Lacuna | Itens | Método |
|---|---|---|---|
| Drogaria São Paulo | farmácia s/ remédio | 4.682 | API VTEX + allowlist + deny-regex |
| Pague Menos | farmácia s/ remédio | 1.551 | API VTEX + allowlist + deny-regex |
| Natural da Terra | hortifruti/empório | 1.000 | API VTEX |
| Cobasi | pet (redundância da Petz) | 998 | API VTEX |
| Divvino | adega/vinho | 998 | API VTEX |
| Imigrantes Bebidas | cerveja/destilado | 406 | SSR (coletor próprio, sem Chrome) |
| Giuliana Flores | flores/presente | 204 | DOM renderizado (loja client-rendered) |

- **Regra ANVISA nas farmácias virou TRIPLA guarda — e a terceira foi necessária.** A colheita
  usa allowlist de categorias seguras **e** um deny-regex. Mas a auditoria profunda encontrou
  medicamento registrado que passou pelas duas, porque **a própria loja classifica medicamento
  dentro de categorias cosméticas**: esmalte antifúngico com ciclopirox, shampoo com cetoconazol,
  gel Rozex com metronidazol, "Dermodex Tratamento 100.000 U.I./g" e gel Zella. Por isso a
  terceira guarda mora em `src/lib/stores/anvisa.ts` e roda **em runtime no conector**
  (`withoutMedicine`), não no script: assim uma recolheita futura não reintroduz remédio por
  esquecimento de flag. Ela filtra princípio ativo, marca de medicamento, notação de dosagem
  (`mg/g`, `U.I./g`) e alegação terapêutica; removeu 18 itens (7 Drogaria SP, 11 Pague Menos).
  `tests/anvisa-pharmacy.test.ts` trava a regra nos dois sentidos: nenhum medicamento passa e a
  vitrine não pode ser esvaziada por um regex ganancioso. **Não afrouxar sem evidência de que o
  item não é medicamento registrado.** Sem a allowlist, a varredura por mais-vendidos de uma
  farmácia volta ~80% medicamento (o teste inicial trouxe Mounjaro e dipirona no topo).
- **A mesma auditoria pegou o lado pet, que ninguém tinha revisado.** A Cobasi veio com 65
  medicamentos veterinários e antipulgas (Simparic, Bravecto, NexGard, Apoquel, Drontal,
  Seresto) e 56 dietas de prescrição; a **Petz**, cujo seed era tido como "sem remédio/antipulga"
  desde 2026-06, tinha 58 itens da linha "Nutrição Clínica" (dieta terapêutica com receita).
  `withoutVeterinaryMedicine` (mesmo módulo) agora filtra as duas vitrines — e também os
  resultados da **busca ao vivo** da Petz, que não passa por curadoria humana. Removidos: 122
  na Cobasi e 87 na Petz. Antiparasitário e medicamento veterinário são regulados (MAPA) e
  dieta terapêutica exige receita; se um cliente pedir, o operador cota à mão com a receita.
- **Total após as guardas: 17.264 itens** (227 removidos por segurança do bruto colhido).
- **Roteamento:** `DRINK_HINT_RE` e `FLOWER_HINT_RE` foram somados às dicas de vocação. Sem
  elas, "vinho" e "buquê" empatavam com o Carrefour — o mesmo bug que "ração" tinha em 23/07.
  Conferido: vinho/cerveja → Divvino, buquê → Giuliana, ração → Petz, perfume → Boticário.
- **Leroy Merlin ficou de fora**, apesar de constar da lista: bloqueia fetch server-side (403)
  e, no navegador, a listagem não expõe imagem — a URL do CDN só aparece no `og:image` de cada
  página de produto, exigindo uma visita por item. Os 40 produtos reais colhidos na validação
  não foram persistidos. Reabrir só se alguém aceitar o custo de uma visita por produto; a
  restrição documentada de aceitar apenas itens "vendido e entregue por Leroy Merlin" continua
  valendo.
- **Decathlon segue servindo 4 de 17 itens**: o filtro `catalogWithImages` corta os 13 sem foto.
  É um bug conhecido de vitrine, não de dados.
- `scripts/harvest-vtex-catalog.mts` ganhou `--categories` e `--deny`; o novo
  `scripts/harvest-imigrantes-catalog.mts` cobre lojas SSR não-VTEX. O
  [README das vitrines](src/lib/stores/README.md) documenta os quatro métodos de colheita
  (VTEX / SSR / navegador / seed) e o requisito de imagem.

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

## Fluxo do cliente vigente (05/08) — resumo canônico

Primeira compra: onboarding endereço+CEP (1x) → pedido em linguagem natural → vitrine
híbrida (card com foto para match; linha livre para o resto; escolher NÃO fecha a lista) →
"só isso" → cotação manual no /ops → resumo com Pix (copia-e-cola) ou cartão (1ª vez: link
/cartao, digita UMA vez e salva tokenizado). Recompra no cartão: botão "Pagar •••• 1234",
um toque, sem CVV. Desvios: recusa → Checkout Pro; "outro cartão" → re-cadastro; toque
duplo → cobra 1x; fechar com escolha pendente → vira linha livre. Pós-pago: sem
cancelamento/substituição; item faltante = estorno do item; atraso = aviso. Cartão salvo
validado no sandbox real em 05/08; produção atrás de LIA_ENABLE_SAVED_CARD até habilitação
comercial + smoke de R$ 1. A seção "Fluxo-alvo" abaixo é o desenho legado da automação.

## Fluxo-alvo vigente

1. Cliente informa itens e endereço no WhatsApp.
2. Lia busca opções reais e resolve ambiguidades.
3. Lia monta uma sacola temporária antes de cobrar.
4. O checkout do varejista determina estoque, preço, frete, modalidade e prazo para o CEP.
5. Lia mostra a cotação com validade curta.
6. Cliente paga a Lia por Pix, Checkout Pro ou, quando habilitado, One-Click nativo no
   WhatsApp com Pagar.me.
7. Lia revalida itens, total, endereço e prazo.
8. Compra segue em `cart_only`/aprovação explícita durante a operação.
9. Varejista entrega; Lia acompanha e comunica o cliente.

O comportamento legado que cobra primeiro e só monta a sacola depois deve ser invertido.

## Canais ativos a partir de 19/07/2026

O produto ativo tem exatamente três fontes: **Oba Hortifruti** para mercado e essenciais,
**Petz** para pet e **O Boticário** para beleza. Carrefour foi removido do registro, roteamento,
cron de busca, comprador e telas operacionais; permanece apenas como histórico de uma decisão e
não deve ser reativado por fallback. Mambo foi avaliado tecnicamente, mas não integra o produto.

- **Oba:** conector Browserbase implementado em `cart_only`, implantado em Production e validado
  ao vivo em 19/07. Usa SKU/vendedor reais, limpa a sacola isolada, simula entrega pelo CEP e
  exige estoque, frete e prazo antes de cotar. O job técnico obteve arroz Camil 1 kg por R$ 5,99,
  frete R$ 9,90 e janela do varejista, totalizando R$ 15,89, no CEP público `01310-100`, e chegou
  a `cart_ready`. A chave Browserbase renovada e o `OBA_BROWSER_CONTEXT_ID` estão Sensitive em
  Production, sem segredo em arquivos. O primeiro retry revelou o fechamento prematuro da página
  (`PURCHASE_WORKER_ERROR`); a correção para aguardar o snapshot foi publicada no deploy
  `dpl_CpcjWKyHrteDuiQQ2DU9NZbj5Pwz`, que ficou `Ready`. A migration de defaults Oba também foi
  aplicada e conferida no banco. Não houve WhatsApp, cobrança ou pedido.
- **Petz:** o comprador agora exige subtotal, frete e promessa de entrega, falhando fechado se
  algum campo não aparecer. A navegação de carrinho/checkout havia sido validada ao vivo, mas a
  orquestração pré-cobrança atual precisa de preflight técnico. Em 19/07, o job técnico encontrou
  SKU, preço e subtotal reais, mas o Context não expôs frete/prazo mesmo após abrir a sacola
  completa; terminou corretamente em `needs_human`, sem cobrança ou compra. No retry posterior,
  a limpeza do carrinho revelou um redesenho transitório da sacola que invalida o seletor de
  remoção; o conector foi endurecido para reler o controle. O retry alcançou a rota real de
  sacola completa `/checkout/cart/<id>` e confirmou novamente SKU/preço, mas não expôs os campos
  de frete/prazo no Context. Continua em `needs_human` e requer diagnóstico da etapa de entrega.
- **Boticário:** o comprador agora também lê frete e prazo, além de SKU/quantidade e subtotal.
  Em 19/07, o job técnico confirmou SKU/quantidade/subtotal reais, mas a loja exibiu somente o
  convite para consultar frete. O conector passou a priorizar esse painel e falhou fechado quando
  o varejista não expôs a confirmação de CEP. Um link “Entrega Rápida” foi testado e leva apenas
  a uma página informativa, não ao cálculo; não deve ser usado como etapa da cotação. Falta
  resolver o gate real de CEP e validar ao vivo. No diagnóstico final, a própria sacola expôs o
  campo `postalCode`, mas com `data-disabled=true`; não forçar esse controle. A cotação fica
  bloqueada até o varejista/Context habilitar o cálculo de entrega.
- Em 20/07, novos pedidos técnicos isolados (não reaproveitados) confirmaram novamente: Petz
  resolve SKU/preço/subtotal, mas a rota `/checkout/cart/<id>` não expõe entrega; Boticário
  resolve SKU/preço/subtotal, mas não fornece prazo domiciliar. Um falso positivo anterior de
  promoção “frete grátis”/retirada foi removido do parser e coberto por teste. Nenhuma cobrança,
  mensagem ao cliente ou compra foi feita.
- Ainda em 20/07, o `/ops` passou a abrir uma sessão Browserbase viva e isolada para Petz ou
  Boticário, usando somente o Context persistente de cada loja. A sessão Petz foi aberta para o
  operador selecionar **entrega no endereço** diretamente na UI do varejista; ela não cria
  sacola, não envia mensagem, não coleta pagamento e não compra. A validação do frete/prazo só
  deve ser repetida depois dessa seleção manual do varejista. O acionamento abre antes a página
  inicial da loja (o debugger remoto nasce em aba vazia), sem preencher ou clicar em nada, e fica
  ativo por até uma hora para o operador concluir a etapa. Em 20/07, o visualizador embutido do
  Codex não apresentou essa sessão de modo interativo de forma estável; a mesma sessão foi aberta
  no Safari do operador. Não interpretar o problema do visualizador como falha de Context ou da
  cotação.
- Depois da ação direta do operador, foi implementado no `/ops` o encerramento autenticado das
  sessões vivas do mesmo Context, para tornar login/endereço persistentes antes do novo preflight.
  O retry fresco continuou em `needs_human`: resolveu o SKU e R$ 15,99, alcançou
  `/checkout/cart/<id>`, mas não expôs controles, frete ou prazo de entrega. O conector também
  tenta apenas o CTA explicitamente chamado “ir/continuar para checkout” a partir dessa rota; a
  Petz não o expôs. Isto não comprova que o login foi salvo e não autoriza insistir em UI remota;
  nenhuma cobrança, WhatsApp ou compra ocorreu.
- Novo preflight Boticário em 20/07 confirmou novamente SKU B88468, quantidade e subtotal de
  R$ 16,90 na sacola. O campo `postalCode` permaneceu bloqueado, com convite para consultar
  frete mas sem prazo; frete grátis promocional e retirada foram corretamente descartados.
  Permanece `needs_human`, sem cobrança, WhatsApp ou compra.
- Na triagem oficial de 20/07, os próximos candidatos foram priorizados: **Pão de Açúcar** para
  mercado em São Paulo (cálculo de frete/prazo por CEP e escolha de modalidade de entrega) e
  **Cobasi** para pet (frete/prazo por CEP no carrinho e entrega própria). Savegnago fica como
  alternativa para cidades do interior paulista, não São Paulo capital. Isso é pesquisa, não
  validação Browserbase nem autorização de compra; os dois ainda precisam de Context, carrinho e
  preflight `cart_only` ao vivo.
- A validação de navegação de 20/07 eliminou Pão de Açúcar para automação neste momento: a rota
  pública de produto foi desviada para `az-request-verify` antes de produto/CEP. A **Cobasi**
  passou no smoke ao vivo anônimo com o CEP público `01310-100`: produto real entrou na sacola e
  o checkout exibiu Cobasi Já, Econômica, frete, prazo e total antes de qualquer pagamento. O
  carrinho técnico foi limpo. Isto valida a interface do varejista, não o conector, o Context
  Browserbase, termos comerciais ou uma compra.
- Na validação completa de navegação ainda em 20/07, a Cobasi avançou da sacola até o gate de
  login (sem inserir credencial, endereço pessoal, cartão ou criar pedido). A **Leroy Merlin**
  também passou no mesmo critério com SKU vendido e entregue pela própria Leroy: CEP público,
  entrega domiciliar, frete, prazo, total e, ao continuar, login antes de qualquer pagamento.
  As duas sacolas técnicas foram esvaziadas. Leroy só pode ser candidata se o conector restringir
  itens a “Vendido e entregue por Leroy Merlin”; itens de marketplace exigem validação separada.
  **Sephora** não passou: a navegação chegou a produto/CEP, mas ficou instável antes da sacola;
  não a tratar como fonte candidata. Cobasi e Leroy seguem sem conector, Context/preflight da Lia,
  validação comercial ou autorização de compra.
- A cotação dos três reserva um Context por loja, cria a sacola antes de cobrar, expira em curto
  prazo e não reconstrói a sacola depois do pagamento. A compra continua `cart_only`, com
  revalidação e aprovação do operador.

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
- Em 19/07, depois de a configuração Browserbase de produção ser comprovada pelo avanço até
  `LOGIN_REQUIRED`, uma nova sessão viva chegou à rota de autenticação Carrefour e foi bloqueada
  pelo próprio varejista com a mensagem de que o acesso não estava em conformidade com suas
  políticas de segurança. A mesma conta funciona no navegador comum do operador. A evidência
  torna o ambiente remoto Browserbase não confiável para autenticação/checkout Carrefour no
  piloto; não tentar contornar o bloqueio com proxy, fingerprint, CAPTCHA ou repetição de sessões.
- **Decisão de 19/07:** pausar a cotação/compra Carrefour via Browserbase e removê-la do caminho
  crítico do lançamento. A busca pública pode continuar falhando fechada, mas o checkout
  automatizado Carrefour só deve voltar com API/parceria oficial ou ambiente formalmente
  autorizado pelo varejista. O primeiro piloto deve ser reposicionado para Petz, cujo carrinho,
  frete, prazo e checkout já foram validados ao vivo, depois de levar para esse conector a mesma
  orquestração de cotar antes de cobrar. Não houve WhatsApp, cobrança ou compra nessa tentativa.
- A opção de entregar links para o cliente concluir no Carrefour foi explicitamente rejeitada pelo
  operador em 19/07 e não faz parte do produto: a Lia deve concluir o pedido nos bastidores. No
  curto prazo, as alternativas restantes são operação humana invisível em navegador comum para
  testes internos/controlados ou um modelo próprio de shopper que compre na loja física; nenhum dos
  dois é automação escalável e ambos exigem desenho operacional antes de dinheiro real. No longo
  prazo, buscar parceria homologada com Carrefour ou plataforma de delivery para receber catálogo,
  cotação e criação de pedido por canal autorizado. A API pública do Marketplace Carrefour é para
  sellers gerirem ofertas/pedidos, não para a Lia comprar como consumidora. As APIs iFood públicas
  encontradas também são do lado merchant. A API VTEX permite carrinho/simulação em tese, mas o
  endpoint padrão no domínio headless Carrefour respondeu 500 e os termos atuais vedam ferramentas
  automatizadas; não prototipar contra endpoints internos sem autorização escrita. Automação em
  navegador local, extensão, proxy residencial ou troca de fingerprint não é caminho aprovado.
- **Estratégia de varejistas de 19/07:** a Lia deixa de tratar qualquer loja como garantida e passa
  a homologar conectores por gates: acesso público, catálogo/SKU real, carrinho isolado, cotação de
  estoque/frete/prazo antes do login/pagamento, persistência de sessão, entrega do varejista,
  bloqueio financeiro e autorização comercial/termos. Petz é referência técnica já validada ao
  vivo, mas ainda não equivale a autorização comercial. No teste técnico público de 19/07, Oba e
  Mambo criaram orderForms anônimos e receberam dois SKUs regionalmente disponíveis no CEP público
  `01310-100`. Ambos devolveram estoque, preços, frete e estimativa/janelas de entrega sem login:
  Oba montou uma sacola de R$ 18,98 e expôs Convencional por R$ 9,90 (`0bd`, com seis janelas) e
  Express por R$ 14,90 (`2h`, sem janela disponível no horário); Mambo montou R$ 22,78 e expôs
  Entrega Agendada por R$ 12,90 (`2h`, 19 janelas). Os dois carrinhos foram esvaziados ao fim.
  Isto valida catálogo, disponibilidade regional, carrinho e simulação pública de logística — não
  valida login, persistência, checkout financeiro, pedido, escala ou autorização comercial. Oba é
  o primeiro candidato para mercado/essenciais; Mambo é fallback regional em São Paulo e seus
  termos vinculam uma conta individual ao CPF. Savegnago permanece candidato regional. Pão de
  Açúcar respondeu `200`, porém apresentou gestão de bots. St. Marche segue depriorizado após a
  recuperação judicial informada pelo Grupo Hortus.
- **Boticário em 19/07:** a busca ao vivo e o comprador Browserbase continuam implementados. O
  comprador limpa, monta e revalida SKU/quantidade, subtotal, frete e promessa; sem estes campos,
  falha fechada. Ainda não houve preflight Browserbase ao vivo nesta rodada, portanto não está
  homologado para cotação antes da cobrança.

### Pagamentos e canal

- Mercado Pago Pix e Checkout Pro estão integrados;
- WhatsApp Meta Cloud API está ativo em produção;
- domínio de produção: `https://liadelivery.com.br`;
- confirmar situação PJ/NF do Mercado Pago antes do lançamento público;
- Pix e Checkout Pro do Mercado Pago permanecem o caminho ativo.
- O One-Click BR (Meta Cloud API direta + Pagar.me) está implementado, mas permanece
  desligado até a habilitação da Meta, chaves/domínio/webhook Pagar.me e sandbox. As
  migrations já estão aplicadas; o ticket Meta `37565409896407734` está **Open** desde
  04/08. Não depende de 360dialog. Ver
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
- Em 18/07, Samuel classificou a Lia como **Self-Service** pelo volume inicial (2.000–10.000
  mensagens/mês) e encaminhou as dúvidas técnicas ao Customer Success
  (`success@infobip.com`); também ofereceu criar uma conta de teste. Isso não é aprovação
  técnica, habilitação de Payments, confirmação de compatibilidade com Mercado Pago PJ nem
  garantia de `credential_id`. Só solicitar/usar teste se ficar documentado que ele não
  migra nem compartilha WABA/número, preserva a Cloud API/Graph API e o webhook atuais, e
  se o escopo de `order_details`/`offsite_card_pay`, sandbox, webhook e custos for confirmado.
  O contato ao Customer Success foi enviado em 18/07, com Samuel em cópia; em 03/08 a Infobip
  respondeu negativamente e essa rota foi encerrada. Não criar conta de teste nem migrar sender.
- A revisão da documentação Pagar.me V5 confirmou `tokenizecard.js`, domínio liberado e
  cobrança por `card_id`. `recurrence_cycle=first|subsequent` descreve recorrência externa e
  não se aplica à recompra avulsa da Lia; o adaptador atual (`card_id` sem o campo) está
  correto. CVV/3DS, recusa e antifraude ainda precisam passar no sandbox antes de ligar a flag.

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
- Em 18/07, o operador optou por não trocar a senha Carrefour neste momento. Nenhuma alteração
  de senha foi iniciada; a credencial continua tratada como exposta e bloqueia o uso do Context
  Carrefour e qualquer piloto até que seja rotacionada pelo titular.
- **Cobrança mock só existe SEM credencial (18/08).** Com `MERCADO_PAGO_ACCESS_TOKEN`
  setado, uma falha do Mercado Pago (timeout/5xx) NUNCA pode virar Pix/link de mentira. O
  bug corrigido em 18/08: `createPix`/`createLink` engoliam o erro, logavam
  `[pix:create:fallback-mock]` e devolviam `mockpix_...` para um pedido real — o cliente
  recebia um código incolável com a dica de sandbox e, como o cérebro trata pixId iniciado
  em "mock" como sandbox, um "paguei" marcava o pedido como PAGO sem dinheiro nenhum. Hoje
  o adapter lança `PaymentProviderError`; o cérebro avisa o cliente
  (`copy.paymentIssueFailed`, "nada foi cobrado — responde *pix* ou *cartão*"), mantém o
  pedido aguardando, anota a falha no `/ops` e alerta o operador
  (`copy.operatorPaymentFailedAlert`). Repetir *pix*/*cartão* reemite a cobrança. Além
  disso, `handlePaidClaim` só aceita o atalho de sandbox quando `paymentsAreMocked()` — um
  pixId "mock" residual em produção não aprova nada. Travado por
  `tests/payment-issue-failure.test.ts`. **Não reintroduzir fallback mock em caminho de
  dinheiro real.**
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

- Em 18/07, a chave Browserbase exposta foi regenerada no painel oficial e atualizada como
  `BROWSERBASE_API_KEY` Sensitive em Production. Um valor intermediário que apareceu no
  controle de rotação foi invalidado imediatamente e substituído por uma chave limpa, sem
  registrá-la no projeto ou na documentação. O redeploy de produção da versão
  `ops-direct-retailer-delivery` / `9a06eab` ficou `Ready`. Isso comprova a rotação e a
  configuração implantada, não a autenticação da API Browserbase nem o checkout Carrefour:
  não houve preflight, sessão nova, cobrança ou compra. Continuam pendentes a senha Carrefour,
  o PIN de registro WhatsApp e as demais credenciais expostas (Mercado Pago/Uber).
- Em 18/07, o operador pediu para suspender novas rotações de credenciais e priorizar o
  funcionamento do produto. Nenhuma rotação adicional deve ser iniciada sem novo pedido
  explícito. O trabalho funcional imediato é validar, em `cart_only` e sem cobrança/compra,
  a cotação Carrefour e os estados recém-implantados no `/ops`; os riscos de credenciais já
  documentados continuam bloqueios para piloto, não autorização para alterar segredos.
- Na primeira validação funcional coordenada de 18/07, o endpoint técnico de produção
  `/ops/teste-carrefour` iniciou um preflight sintético em `cart_only` (sem WhatsApp,
  cobrança ou compra) e terminou em `needs_human` / `CONFIGURATION_REQUIRED`: a credencial
  Browserbase configurada para Carrefour não foi aceita pelo runtime. Isto confirma que o
  deploy `Ready` não validou a variável em execução; não iniciar novo preflight até corrigir
  a configuração existente e confirmar a autenticação Browserbase. Não é autorização para
  nova rotação de credenciais.
- Ainda em 18/07, a causa foi confirmada: `BROWSERBASE_API_KEY` em Production continha um
  valor com prefixo `sk_live_`, que não era uma chave Browserbase. A variável foi substituída
  diretamente pela chave mascarada do painel Browserbase (sem registrá-la), e o redeploy
  `EEaegLWbmNtiwG6opHEbWirJBX57` ficou `Ready`. O retry do mesmo preflight técnico avançou até
  `LOGIN_REQUIRED`, confirmando que a autenticação Browserbase e o Context Carrefour voltaram
  a ser acessíveis pelo runtime. A cotação completa continua pendente de login humano no
  Context; não houve WhatsApp, cobrança ou compra.

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
3. Validar ao vivo a cotação real antes da cobrança. A rota Carrefour/Browserbase foi pausada
   após bloqueio de segurança do varejista em 19/07; priorizar a orquestração de cotação
   pré-cobrança e o piloto controlado na Petz, já validada até o checkout.
4. Validar ao vivo no `/ops` os estados de entrega/rastreio do varejista e o fluxo
   auditável de estorno. O código da revisão está implantado em produção desde 18/07,
   mas ainda não foi validado com massa técnica nova.
5. Testar cartão salvo, CVV, 3DS, CAPTCHA e antifraude sem habilitar compra automática.
6. Pilotar 5–10 pedidos controlados com entrega direta.
7. Para same-day, obter parceiro local ou contrato merchant/courier antes de desenvolver
   nova automação de retirada.
8. Antes de ativar One-Click: confirmar as migrations de pagamento já aplicadas, liberar
   Payments API BR na WABA, liberar o domínio no Pagar.me e configurar as chaves/webhooks
   em produção.

## Estado dos conectores

- **Petz:** busca/carrinho/checkout validados; é o conector recomendado para o primeiro piloto,
  após receber a orquestração de cotação antes da cobrança. Finalização financeira ainda bloqueada.
- **Carrefour:** busca pública disponível; automação de carrinho implementada, mas autenticação e
  checkout via Browserbase pausados após bloqueio de segurança do varejista em 19/07. Só retomar
  com API/parceria oficial ou ambiente autorizado. Handoff para o cliente foi rejeitado; qualquer
  alternativa deve preservar a compra concluída pela Lia nos bastidores.
- **Boticário:** busca e carrinho preparados; política de entrega/titularidade ainda precisa
  da mesma validação operacional.
- **Candidatos supermercado:** Oba primeiro e Mambo como fallback regional; ambos passaram em
  19/07 por catálogo, disponibilidade regional, carrinho anônimo e simulação pública de frete/prazo
  no CEP `01310-100`, com limpeza posterior. Savegnago vem depois; Pão de Açúcar exige cautela por
  gestão de bots. Nenhum deles tem login, checkout financeiro ou autorização comercial homologados.
- **Mercado Pago:** cobrança do cliente.
- **Pagar.me + Meta One-Click:** código pronto, flag desligada; depende da habilitação
  externa e de validação sandbox.
- **Browserbase:** navegação persistente e auditável, mas a viabilidade é específica por varejista;
  foi validado na Petz e bloqueado pelo Carrefour na autenticação em 19/07.
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

## Validação ao vivo — 15/08/2026

Uma nova rodada de 10 cenários foi executada no WhatsApp contra a versão já publicada,
sem alteração de código e sem cobrança. Passaram de forma clara a adição relativa pelo
SKU, a preservação da cesta e o cancelamento antes do pagamento. Permaneceram observados
em produção: cabo de 2 m retornando carregador de parede; fillers como “pensando bem” e
“chega amanhã” virando linhas indisponíveis; “sem remédio” sendo confundido com remoção;
cards acima de teto explícito; e CEP embutido na frase de troca de endereço sendo pedido
novamente. O relatório detalhado está em
[docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md). Isso é evidência
de comportamento ao vivo, não registro de conserto ou de novo deploy.

### Perfil público do WhatsApp — 15/08/2026

No WhatsApp Manager da conta conectada `+55 11 97844-4813`, foi solicitada a troca do nome
visível de `Lia Delivery by 67.742.955 Joseph Carlos Dayan` para **Lia Delivery**. O painel
marcou o número como **In Review**. Até a aprovação da Meta, o CNPJ e o nome anterior ainda
podem aparecer no WhatsApp; não há nova ação de código ou de pagamento associada.

### Atualização do perfil público — 19/08/2026

A foto de perfil com o monograma lima “L” em fundo berinjela foi enviada e salva no
WhatsApp Manager para o número conectado `+55 11 97844-4813`. Na conferência feita logo
depois, o nome visível continuava `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, com
status **Approved**. O histórico registra `Name verification requested` em 17/08, mas não
registra aprovação nem rejeição. Portanto, a troca para **Lia Delivery** ainda não se
refletiu no perfil; não reenviar nem alterar outros campos sem orientação do dono. Uma
versão nova da foto foi preparada em `public/brand/lia-whatsapp-profile-hd.svg` e PNG
2048×2048, renderizada diretamente do vetor com o símbolo 30% maior. Após comparar as duas
composições, o dono escolheu manter a estrela na posição original, um pouco além da ponta do
“L”. Essa versão foi enviada e salva no WhatsApp Manager em 19/08; a Meta avisou que pode
levar alguns minutos para aparecer no WhatsApp.

### Validação independente — 15/08/2026

Outra rodada de 10 cenários foi executada sem alteração de código. Passaram a troca
“granola → aveia”, “sem remédio” com shampoo, presente dentro de R$100 e 4x → 7x → 5x
do mesmo bombom. Ainda foram observados fillers/contexto (“Para domingo”, “Para uma
viagem”), preço (“barato”), combinação de itens na mesma mensagem, e perda da cesta
depois de salvar um novo endereço. O detalhe está no relatório de testes; isto é validação
ao vivo, não conserto nem novo deploy.

### Atualização 17/08/2026 — API oficial do Mercado Livre (em preparo, não ativada)

O DevCenter foi acessado com a conta operacional, mas a rota oficial de criação da primeira
aplicação retornou `OPT02-EN1XAJYDKPNW` e voltou à página inicial mesmo após o retry sugerido
pelo próprio site. Portanto **nenhuma aplicação, chave, token, notificação, compra ou mudança
de conta foi criada**. O ML informa que contas brasileiras precisam ter os dados do titular
validados antes de criar aplicação e podem ter limite de uma app; o próximo passo externo é
regularizar isso no suporte/DevCenter e só então criar uma app exclusiva da Lia.

O código local foi preparado, mas não implantado: `ML_CLIENT_ID`/`ML_CLIENT_SECRET` Sensitive,
callback fixo `https://liadelivery.com.br/api/mercadolivre/oauth/callback`, state anti-CSRF e
tokens cifrados no Postgres. A API oficial será uma busca rápida de vitrine de cauda longa;
Apify segue fallback. Ela **não** é API de compra nem de acompanhamento dos pedidos que a Lia
faz como compradora; não cadastrar `orders_v2`/`shipments` com essa expectativa.

### Correção 18–19/08/2026 — conversa presa em pedido morto e escolha de frete velha

Revisão dupla independente do `src/lib/delivery-service.ts` achou dois defeitos ligados,
ambos corrigidos e cobertos por eval E2E em `tests/manual-concierge.test.ts`:

1. **Cancelar/estornar no /ops não soltava a conversa.** `opsCancelRefund` fechava o pedido
   e deixava o contexto apontando pra ele: o cliente ouvia "ainda estou cotando" de um
   pedido cancelado e "cancelar" respondia "não tem pedido em andamento" sem limpar nada.
   Em `choosing_freight` era pior — o toque no botão de frete chamava
   `opsPublishManualQuote` num pedido cancelado, que lança, e a resposta virava erro
   genérico em loop; a única saída era "trocar endereço". Agora `opsCancelRefund` reseta o
   contexto (mesmo helper do pagamento, `resetConversationForClosedOrder`, que preserva
   cesta/pedido novo), `handleCancel` limpa o ponteiro morto antes de responder
   "não tem pedido", e o passo `awaiting_operator_quote` se cura sozinho quando o pedido
   não está mais na fila.
2. **`choosing_freight` não expirava nunca.** O cliente sumia dias e o toque em
   `frete:barato` publicava frete e promessa de data do anúncio consultados no passado
   (possivelmente já vencidos), numa cotação pagável. O passo entrou no TTL de abandono
   (`LIA_QUOTE_ABANDON_TTL_MS`, 1h) e a escolha passou a carregar `quotedAt`: toque mais
   velho que o TTL cancela o pedido não-cotado e recomeça, em vez de publicar. Toque em
   botão vencido não é reprocessado como lista de compras.

Gate: `tsc` limpo + suíte `tests/manual-concierge.test.ts`. Não publicado — deploy depende
de autorização do dono.

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
