# Lia — checklist de lançamento

_Última atualização: 2026-09-04 (5ª — recursos do WhatsApp)._

> **04/09 (5ª) — recursos do WhatsApp.** Código em produção (AGENTS.md 04/09 5ª).
> Configuração na Meta via `/api/ops/meta-setup` **concluída pelo Codex em 04/09** (verificada
> pelo status): perfil + foto, Flow 1048998724594022 PUBLISHED, `LIA_FLOW_ADDRESS_ID` em
> produção, boas-vindas com os 4 prompts. Lições: rótulo de TextInput ≤ 20 e sem `init-value`;
> leitura da automação é campo do número. **Conferir** se a descrição do perfil ficou gravada
> (sumiu na 2ª leitura) — `?action=profile` regrava. **Observar:** primeiro uso real do botão de localização (precisão do CEP pelo
> Nominatim) e do Flow. Carrossel só em template de marketing — não fazer.

> **04/09 (4ª) — "o de sempre".** Em produção (AGENTS.md 04/09 4ª). Direção futura, sem
> data: card único + "Ver outras" para pedido específico/básico; pergunta única em ambiguidade.
> Medir no piloto: posição escolhida e taxa de "outras".

> **04/09 (3ª) — "nunca é pra não ter algo".** Pré-voo + plano B + lembrete 30 min em
> produção (AGENTS.md 04/09 3ª). **Dono decide (a etapa sem garantia é a COMPRA):**
> (a) autorizar o Codex a finalizar o checkout dentro do teto com cartão da empresa;
> (b) job de compra para toda loja consultável (hoje só Mercado Livre); (c) manual com SLA.
> E: Carrefour/Petz/Boticário sem checkout consultável — manter via operador ou tirar da
> vitrine automática. **Observar:** primeiros planos B reais (qualidade do substituto que a
> IA escolhe; latência da simulação); `LIA_PLAN_B_PRICE_TOLERANCE` (15%).

> **04/09 (2ª) — estorno automático.** Em produção (AGENTS.md 04/09 2ª): bloqueado 6h ou sem
> compra 24h → estorna sozinho, só para pedidos pagos a partir de 04/09 12:00 UTC. Os 15 `paid`
> antigos (jun–ago, sem razão de pagamento) continuam como estavam: decidir fechar à mão. **Observar** os primeiros casos reais: motivo mostrado ao
> cliente (`customerReasonFromBlock`) e latência do provedor. Pedido #41EPW0 foi estornado à
> mão pelo dono às 09:49 de 04/09, antes da regra.

> **04/09 — login do /ops pelo WhatsApp.** Em produção (AGENTS.md 04/09). **Aberto:** link não
> é de uso único (só expira em 10 min) — se incomodar, guardar nonce usado no banco.
> **Dono:** mandar "ops" pra Lia do número do operador e tocar no link; depois clicar
> "Não consegui comprar → estornar" no pedido #41EPW0.

> **03/09 (3ª) — janela de 24h.** Aviso proativo fora da janela agora vai por template ou é
> registrado como não enviado (AGENTS.md 03/09 3ª). **Feito 04/09 (Codex):** template
> `pedido_atualizacao` aprovado na Meta e `LIA_TEMPLATE_ORDER_UPDATE` em produção — aviso ao
> cliente e alerta ao operador fora da janela agora saem por template (guia:
> docs/whatsapp-template-avisos.md). **Aberto (opcional):** canal extra pro operador (e-mail/push).

> **03/09 (2ª).** Verificação ao vivo antes dos cards + cobrança só do confirmado (AGENTS.md
> 03/09 2ª). **Aberto:** Carrefour, Petz e Boticário (maiores catálogos) não têm checkout
> consultável — decidir: manter via operador (hoje), buscar outra forma de confirmar
> estoque/entrega, ou tirar da vitrine automática. Observar em produção a latência extra
> da simulação (≤4,5s em paralelo) e o log `[live-check:dropped]`.


> **03/09 — chá pago sem estoque.** Consertos em produção (AGENTS.md 03/09). **Dono:**
> decidir o pedido `…epw0` do amigo — botão "Não consegui comprar → estornar" (motivo:
> "sem estoque para o seu endereço") ou comprar em outra loja e confirmar. **Próximo:**
> calibrar frete/simulação das lojas ainda em "tarifa padrão" (Imigrantes, Kalunga,
> Decathlon, Cacau Show, Giuliana Flores, Droga Raia) — até lá elas vão pro operador.


> **02/09 (3ª) — em produção.** Deploy READY, 4 migrations aplicadas (com o DROP das
> tabelas legadas), `CRON_SECRET` criada, envs mortas removidas, `.env.local.bak` apagado.
> **Aberto, do dono (1 min cada):** `git push origin main`; abrir `/ops?key=<OPS_TOKEN>`
> uma vez; observar o 1º pedido real (`[payment:unexpected]`, `[cron:reconcile-payments]`,
> copy da oferta do Mercado Livre); decidir #YAQHF8/#QTNL2T; escolher o caminho A/B/C/D.


> **02/09 (2ª) — as quatro melhorias foram executadas** (AGENTS.md 02/09 2ª). Fechado:
> banco de teste local + CI + migrate no build; razão de pagamentos + estorno por API +
> mock proibido em prod + cron + desfecho desconhecido + Pix vencido; legado apagado
> (Twilio, /admin, /chat, /api/v1, motor ML de junho, fluxo legado, couriers, geo);
> cérebro em 5 módulos; classificar antes de buscar + cauda longa opt-in. **Aberto, do
> dono:** deploy (3 migrations aplicam sozinhas no build de produção), `CRON_SECRET` na
> Vercel, `/ops?key=` uma vez, observar o 1º pedido real (`[payment:unexpected]`,
> `[cron:reconcile-payments]`, copy da oferta do ML), autorizar DROP das 5 tabelas
> legadas, apagar `.env.local.bak`, limpar envs mortas da Vercel, mover a Lia para um
> projeto Supabase só dela (o atual hospeda outro app). **Aberto, produto:** decidir o
> caminho A/B/C/D da seção 4.5 do relatório; rate limit por telefone; headers de
> segurança; comparação técnica; parcelamento.


> **02/09 — revisão completa.** Relatório:
> [docs/revisao-completa-2026-09-01.md](docs/revisao-completa-2026-09-01.md). Aberto,
> por ordem: (a) **dono**: aplicar `prisma migrate deploy` (índices + tabelas sem
> migration; no-op nos dados), deploy e abrir `/ops?key=` uma vez, entregar/estornar
> #YAQHF8 e #QTNL2T, apagar `.env.local.bak`, projeto Supabase só da Lia; (b) **P1
> dinheiro**: retries esgotados do workflow de cartão ficam mudos + `claimConfirmation`
> reentrante não cobra; Pagar.me 4xx tratado como "recusado"; mock aprova em produção
> sem env; estorno não é feito por API (só anotação); `awaiting_payment` não expira e
> `getStatus` mapeia `cancelled` como `rejected`; (c) **P1 conversa** (a confirmar em
> E2E): "2x arroz"/"bota 3" somam em vez de ajustar, `minSwap` pegajoso, `mergeDecision`
> sobrevive a `change_address`, dois turnos mudos residuais; TTL de cotação manual de 5
> min (decisão de produto); (d) **P2**: rate limit por telefone, headers de segurança,
> assinatura Meta antes do parse, teste/prod no mesmo banco, CI, suíte de 53 min,
> catálogo fora do bundle, guarda veterinária no caminho ML; (e) **produto**: decidir o
> caminho (A piloto de 30 pedidos com taxa fixa + uma loja por cesta / B lista
> recorrente / C parceria com varejista / D pausar) e autorizar o PR de remoção do
> legado (seção 2.3 do relatório).


> **01/09 (5ª) — revisão.** Aberto: (d) **provar no canal real** que o toque em
> "Pagar ••••" responde "Cobrando…" sem "Me perdi aqui" (a suíte não roda o workflow de
> produção); (e) item novo pendurado quando o Pix é pago com a pergunta aberta hoje vira
> aviso "me manda de novo" — V2 poderia abrir a busca sozinha (zero espera).

> **01/09 (4ª) — pós-conversa real.** Aberto: (a) **scorer/rerank do golden novo**
> ("apoio pra guitarra de chão" não pode devolver apoio de PÉ) — rodar
> `npx tsx scripts/eval-search.mts` e consertar com regra principial; (b) **dois
> pedidos abertos em paralelo** — hoje "Pedido novo" cancela o não-pago antigo (fluxo
> aprovado como V1); (c) suíte concierge completa ficou pendente de novo (regra do
> dono: nunca segurar entrega por ela) — rodar na próxima janela morta.


> **01/09 — bolha nativa de Pix: ATIVADA.** Sonda aceita (200; 1ª caiu na janela de
> 24h/131047, 2ª chegou), envs setadas, redeploy READY — toda cobrança Pix real sai
> com copia-e-cola + bolha "Lia Delivery" (AGENTS.md 01/09). Aberto: (a) observar o
> **1º pedido real** com Pix — bolha com código MP de verdade abrindo o banco (logs
> `[whatsapp:native-pix]` / `[whatsapp:meta:status-failed]`); (b) **v2**: enxugar os
> textos redundantes quando a bolha estiver provada no real e mandar `order_status`
> "pago ✅" nativo quando o webhook MP confirmar; (c) banco mostra razão social do
> MEI (nome civil) — limitação aceita, reavaliar só se cliente estranhar. Se aceitar, v2 = enxugar os textos redundantes (hoje bolha
> é aditiva por segurança) e mandar `order_status` "pago ✅" quando o webhook MP
> confirmar. Se a Graph rejeitar por permissão, cai no mesmo saco do One-Click
> (Solution Partner / GA da Meta) e nada muda pro cliente.

> **30/08 (3ª) — auditoria pós-rodadas 1–5.** Fechado e provado: teto do fone/ML
> (inclusive refino por marca e resgate), P1.8 cesta-como-conjunto, alerta de suporte do
> roteador durante escolha, filtro anti-confirmação financeira e `quero sim`. Gate:
> **479/479 sem skips + tsc + lint + build**. Continuam abertos por dependerem de
> operação/produto, não deste conserto: `LIA_BUSINESS_INFO` na Vercel; destino dos
> pedidos pagos #YAQHF8/#QTNL2T; latência fria; watchdog/reaviso do caminho manual;
> cancelamento real da cobrança anterior na rajada Pix↔cartão; comparação técnica rica;
> e nova rodada ao vivo no WhatsApp. Relatório:
> [docs/auditoria-pos-rodadas-1-a-5-2026-08-30.md](docs/auditoria-pos-rodadas-1-a-5-2026-08-30.md).

> **30/08 (2ª) — pós-ciclos estruturais.** Roteador LLM e cesta-como-conjunto V1 no
> ar. Próximos degraus registrados: (a) recomposição sob comando ("juntar entregas")
> para cesta montada card a card — hoje sai a dica honesta; (b) roteador LLM também no
> onboarding (hoje só nos becos pós-busca/escolha); (c) telemetria do roteador (log
> [llm-router] — medir acerto na rodada 6).

> **30/08 — pós-rodada 5 (4,30).** Consertos do dia em AGENTS.md. Aberto:
> (a) **Fone com teto vazando (S6)**: o cap E2E de vitrine passa; o caso do fone veio
> da cauda longa ML — re-sondar na rodada 6 e, se repetir, caçar no caminho
> ML/rescue/outras.
> (b) **Parcelamento real** no link de cartão (hoje: honesto "à vista por enquanto").
> (c) **`LIA_BUSINESS_INFO` na Vercel** (dono): sem ela o CNPJ vira alerta manual ao
> operador.
> (d) **Comparação técnica de produtos** (specs) — hoje compara nome/preço/loja.
> (e) S5: "tira cafe" num compound respondeu "não achei na cesta" mas o resultado
> final ficou certo — ruído de copy a caçar com log real.
> (f) Continuam: P1.8 cesta-como-conjunto, P2.1 latência fria (ticket ML), SLA do
> caminho manual, golden semântico, rajada Pix↔cartão com cancelamento real no MP.


> **28/08 — pós-rodada 4 (2,85, protocolo hostil).** Consertos do dia em AGENTS.md.
> Adiado com registro:
> (a) **"escolhe você" com julgamento** (S6): o autoPick pega o topo do ranking; um
> "melhor custo-benefício" de verdade (qualidade × preço via IA) é ciclo futuro.
> (b) **Rajada dentro do pagamento** (S10): a troca pix↔cartão agora avisa que o código
> antigo não vale, mas a cobrança Pix no MP não é cancelada de fato — avaliar
> cancelamento real da cobrança anterior no provedor.
> (c) **Retomada com resumo após pausa longa** cobre os casos comuns; pausa que cruza o
> TTL de 30min ainda perde a cesta por design — decidir se o TTL sobe.
> (d) **"51" sozinho** vira cachaça por sorte do matcher; apelidos de marca (51, Pitú,
> Corote) mereceriam dicionário próprio.
> (e) Continuam: P1.8 cesta-como-conjunto (frete fragmentado), P2.1 latência fria
> (ticket ML), SLA do caminho manual, golden semântico.

> **27/08 (2ª) — pós-rodada 3 (média 6,80).** Consertos do dia em AGENTS.md. Fica
> aberto, por prioridade:
> (a) **P1.8 cesta-como-conjunto** subiu de prioridade: frete fragmentado foi o
> problema nº 2 por frequência da rodada 3 (6/20 — ex.: R$48,80 de frete em R$68,52
> de produto, 3 entregas). Ranquear a composição da cesta por total+nº de entregas.
> (b) **Forense do "e arroz" (S18 r3)**: com a oferta de troca de loja na mesa, "e
> arroz" não adicionou o arroz e disparou a troca do café — reconstruir no banco.
> (c) **S10: variar a copy** quando o esgotamento de opções repete pela 3ª vez.
> (d) **"óleo" não achou nada** (era pra ser óleo de cozinha) — caso golden já
> registrado; ciclo de scorer/rerank.
> (e) Continua: decisão do dono sobre #YAQHF8/#QTNL2T (test×live no Pagar.me).

> **27/08 — pós-rodada 2: pendências novas.**
> (a) **DECISÃO DO DONO, urgente:** estornar ou entregar `#YAQHF8` (R$20,62 no cartão,
> pago 25/08, nunca comprado) e `#QTNL2T` (R$80,93, `retailer_preparing` desde 23/08).
> (b) **SLA do caminho manual**: `awaiting_operator_quote` não tem watchdog — sem
> operador agindo, o cliente fica no silêncio (S11); criar re-aviso automático +
> re-alerta do operador após N min (a copy já ficou honesta: "assim que conferir").
> (c) **Anúncio ML com frete grátis não oferece a opção rápida** (S12 — a mochila só
> tinha uma modalidade porque `shipping_options` não roda para freeShipping).
> (d) **Item indisponível numa loja aborta o pedido inteiro** pro manual (S11): abortar
> só a loja falhada e oferecer substituto do item.
> (e) **dsp-548880**: name ≠ productUrl na vitrine Drogaria SP + investigar mídia 500
> (Meta 131053) da S20 no runtime log.
> (f) **Fronteira de sessão no telefone de teste**: pedidos vivos de rodadas anteriores
> contaminam a leitura dos testadores — considerar comando de reset/flag de teste antes
> da rodada 3 (a v2 do protocolo já pede cancelamento no fim de cada sessão).
> (g) Continuam de 26/08: P1.8 cesta-como-conjunto (S18 fragmentou R$53,70 de frete em
> R$71 de produto — é o baseline do ciclo), P1.10 contrato do fallback manual, P2.1
> latência fria (ticket ML), P2.5 pergunta antes de item vago/caro (o teto de autopick
> caiu 300→100 como mitigação), golden semântico (S18 somou "óleo" → Óleo Corporal:
> caso novo pro golden — óleo sozinho = óleo de cozinha).

> **26/08 — protocolo v2 pronto pra rodada de validação.** Roteiro fixo de 20 sessões
> (8 sondas de regressão + 12 de chão novo, auditoria item a item obrigatória) em
> [docs/protocolo-teste-persona-v2.md](docs/protocolo-teste-persona-v2.md); gates: zero
> cesta contaminada, zero estorno falso, média ≥8, <20 "não entendi". Rodar e mandar o
> relatório pro agente triar (frequência × gravidade → caso de teste → conserto).

> **26/08 — pós-teste em massa: o que ficou ADIADO com registro.** Blocos 1-3 do
> relatório implementados (ver AGENTS.md). Ficam como próximos ciclos, por decisão de
> escopo (produto/qualidade, não bug de estado):
> (a) **P1.8 — otimizar a cesta como CONJUNTO**: hoje cada item acha sua loja e a compra
> semanal fragmenta em 3-4 entregas (R$60 de frete em R$80 de produto); ranquear a
> composição por total+nº de entregas+fidelidade. (b) **P1.10 — fallback manual depois
> de mostrar preço**: quando o card já mostrou valor, cair pra "alguém confere" quebra a
> expectativa; decidir o contrato. (c) **P2.1 — latência da busca fria** (teto é o actor;
> API oficial 403 — ticket pronto em docs/ticket-suporte-mercadolivre.md). (d) **P2.5 —
> pergunta curta antes de escolher item vago/caro** (trator, TikTok). (e) **golden novos
> de semântica**: toalha≠lenço umedecido, frutas≠congeladas, garrafa≠água mineral — pelo
> método (caso no golden ANTES do conserto de scorer). (f) **re-rodar as 20 sessões** do
> protocolo (docs/protocolo-teste-persona.md) como gate de reabertura: meta ≥8/10, zero
> P0 — os gates numéricos estão no fim do relatório.

> **20 sessões adversariais ao vivo — 26/08.** Nenhum pagamento foi feito. A média
> atribuída durante a rodada foi **4,55/10**; a auditoria rebaixou a sessão 19 depois de
> encontrar seis itens da sessão 18 cancelada no Pix seguinte, levando a média auditada a
> **4,30/10**. Não tratar o concierge como pronto para uso amplo: 12/20 sessões
> perderam estado com mensagens rápidas/fora da etapa, 6/20 não responderam preço de
> entrega, 7/20 tiveram mínimo/fragmentação de frete e seis geraram cancelamento/estorno
> condicional para um pedido não reconhecido. Também apareceram limites de preço
> ignorados, trocas silenciosas e `chega hoje`/`chega amanhã` nos cards. **Bloqueador
> principal:** cancelamento não é uma barreira segura contra turnos antigos; não reabrir
> piloto sem zerar vazamento de estado, falso estado financeiro e mutação silenciosa.
> Diagnóstico em
> [docs/relatorio-completo-problemas-lia-2026-08-26.md](docs/relatorio-completo-problemas-lia-2026-08-26.md);
> scorecards em
> [docs/testes-20-clientes-2026-08-26.md](docs/testes-20-clientes-2026-08-26.md).

> **Rodada adversarial ao vivo — 19/08.** Oito cenários difíceis foram executados sem
> cobrança: 5 passaram, 1 foi parcial e 2 falharam. Reabrir a validação de “mais barata”
> seco (não deve selecionar) e “Outras opções” (deve reabrir e substituir) porque a sessão
> de produção ainda mostrou o comportamento antigo. Evidência detalhada em
> [docs/testes-whatsapp-2026-08-14.md](docs/testes-whatsapp-2026-08-14.md).

Este é o painel canônico de progresso do projeto. Marque um item com `[x]` somente quando
o critério descrito estiver comprovado. Quando uma decisão mudar, atualize também
[AGENTS.md](AGENTS.md) e [STATUS.md](STATUS.md).

> **19/08 — revisão completa pré-amigos-e-família.** Quatro bloqueadores achados; o 1º já
> fechado: `/admin` + rotas legadas exigem login usuário/senha (`ADMIN_USER`/`ADMIN_PASSWORD`
> Sensitive na Vercel; falha fechado). **Todos os 4 estão PUBLICADOS em 19/08** (smoke verde):
> (2) Pix mock em falha do MP morto (`b9dbcfc`, 8 testes); (3) conversa presa após
> cancelamento no /ops + `choosing_freight` sem expiração mortos (`dac57f5`, E2E 41/41);
> (4) landing revisada no ar (zero promessa vetada no HTML servido). Bônus da revisão
> adversarial: guards de `auth.ts` falham fechado em deploy (`075fd5f`). Recomendados antes de abrir: timeout nas
> chamadas OpenAI/MP, webhook MP devolver 5xx em erro transitório, guards fail-closed quando
> segredo faltar, e as 3 verificações reais pendentes (botões de frete, pedido frio ML,
> zumbi `#CMSMCE`).

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

> **06/08 — busca da vitrine: rerank por IA + golden set (tentativa-e-erro infinita acabou).**
> O caso "carregador usb c → 3 veiculares" virou reconstrução da busca: candidatos largos nas
> 18 vitrines + rerank semântico por IA (skus validados, fallback determinístico, kill-switch)
> + 7 consertos principiais no scorer (compostos usb-c, typo≥6, marca sem typo, bônus de
> categoria/negação, desempate por variantes, diversificação de cores). Método de melhoria
> agora é medido: golden set de 32 casos + `npx tsx scripts/eval-search.mts` (placar DET/IA);
> hoje 31/32 · 32/32. Toda busca ruim reportada deve virar caso no golden ANTES do
> conserto. Também corrigido: `talk-env.mts` não carregava `.env` (ESM `__dirname`) — o
> talk-lia rodava sem IA mesmo com chave.
>
> **Varredura faz parte do método.** Passar 60 pedidos realistas pelo pipeline achou 4 bugs
> não reportados: "cotonete" não achava o cotonete que está no catálogo; "leite" devolvia
> loção de pele ("Leite de Rosas"), leite de coco e leite pet; "água" vinha com gás; e a
> penalidade nova de item-pet punia refrigerante — em catálogo brasileiro **"PET" é a
> garrafa plástica**. Todos consertados por regra geral, nunca por regra de produto.
>
> **Invariante para quem mexer no scorer: penalidade REORDENA, guarda EXCLUI.** `score > 0`
> é lido fora do scorer como "casa ou não casa" (o "tira o X" usa isso). Duas penalidades
> somadas derrubaram um match legítimo para -1 e o cliente perdeu o comando de remover item
> da cesta — a busca continuava certa. Item que passou pelas guardas nunca cai abaixo de 1.
> O golden set não pega esse tipo de dano colateral; o eval de conversa legado pega. Rodar
> os dois antes de commitar mudança de scorer.
>
> **Onboarding no mesmo lote:** validar a busca numa conversa real expôs 3 bugs que também
> produziam "busca ruim", vindos do endereço: endereço com CEP junto virava lista de compras
> ("1x apto 5") e ainda era pedido de novo; endereço como 1ª mensagem idem; e pedido feito
> durante a espera do endereço sumia. Corrigidos, com o endereço do courier preservado em
> texto cru (acento/vírgula/maiúscula). 3 regressões em `tests/manual-concierge.test.ts`.

> **09/08 — cotação instantânea no ar (cesta de vitrine paga na hora).** Pedido do dono:
> zero espera no chat. Cesta 100% vitrine → total + menu de pagamento na mesma resposta.
> **Frete = política do SITE de cada loja** (a entrega é o varejista entregando; "2 lojas =
> 2 fretes" = dois checkouts): `LIA_STORE_FREIGHT_<LOJA>` + `LIA_STORE_FREE_ABOVE_<LOJA>`
> por loja; sem política, `LIA_FREIGHT_DEFAULT` (18) marcado "(tarifa padrão)" na nota do
> /ops. Linha livre segue com o operador.
>
> **10/08 — fretes PESQUISADOS e semeados no código (11 de 18 lojas).** Simulação REAL no
> checkout VTEX (CEP 01310-100): Pague Menos R$4,90 (grátis ≥ ~R$174) · Drogaria SP R$6,90
> (≥ ~R$240) · Cobasi R$7,90 (≥ ~R$234) · Oba R$9,90 same-day (sem grátis) · Swift R$15,90
> (≥ ~R$400) · Divvino R$15,90 (≥ ~R$600) · Kopenhagen R$15,90 (≥ ~R$118) · Ri Happy R$18
> (≥ ~R$420). Política publicada: Carrefour mercado grátis > R$349 (fee ~14,90 ESTIMADO) ·
> Petz grátis SP > R$119 (fee ~9,90 ESTIMADO) · Boticário grátis > R$229 (fee ~14,90
> ESTIMADO). Limiares = MENOR carrinho observado com frete zero (conservador: nunca cobra a
> menos; o site pode zerar antes e a diferença vira margem). Tabela em
> `SEED_STORE_FREIGHT` (src/lib/instant-quote.ts); env sobrepõe sem deploy. **Restam em
> tarifa padrão (R$18):** Imigrantes (frete dinâmico por distância), Natural da Terra,
> Kalunga, Decathlon, Cacau Show, Giuliana Flores, Droga Raia. **Conferência do dono
> (rápida):** os 3 fees ESTIMADOS (Carrefour/Petz/Boticário) no checkout real, e baixar
> os limiares prováveis se quiser ser mais generoso (PM 149, Cobasi 199, RiHappy 399,
> Kopenhagen 99).

> **11/08 — PUBLICADO.** Push `e8f6198` → deploy `dpl_6yDE7mcoJTwhTSPiuwS6ZDTV5Vq5` `READY`
> em Production servindo `liadelivery.com.br`; smoke verde (landing 200, /ops 200, webhook
> GET 403 / POST sem assinatura 401). No ar: fim da linha livre, alerta ao operador, botão
> Cancelar sempre, abandono de 1h, card imune a foto 404, encoding Imigrantes.
> `LIA_OPERATOR_PHONE` foi configurada na Vercel pelo agente (CLI já autenticada) e o
> redeploy `READY` reassumiu `liadelivery.com.br` — alerta ao operador ATIVO. **Ações do
> dono que seguem pendentes:** (1) mandar "cancelar" no chat pra matar o zumbi `#CMSMCE`;
> (2) teste real: "quero um carregador" → tocar "Outras opções"; e um item inexistente
> ("camiseta de futebol") → deve responder "não tenho como trazer".

> **17/08 (6ª) — escolha de entrega com BOTÃO (rápida/cara × barata/demorada).** Pedido do
> dono. Quando o anúncio tem opção que chega antes pagando mais, a Lia pergunta antes de
> cobrar: botões `Mais barato · 25/08` / `Mais rápido · 20/08` + `Cancelar`, com os dois
> totais no corpo; o toque publica a cotação na hora e a escolha vira instrução na nota do
> /ops ("comprar ESSA opção de envio"). Texto ("1", "mais rápido") continua valendo. Gate:
> ml-freight 12/12, adapter 7/7, copy 12/12, instant-quote 6/6, intents 41/41, tsc.
> **NÃO PUBLICADO** — no teste real conferir: (1) os dois botões chegam e o toque publica;
> (2) o total do botão escolhido é o cobrado; (3) a nota do /ops diz qual envio comprar.

> **19/08 — conversa presa em pedido morto e frete velho CORRIGIDOS.** Revisão dupla
> independente do `delivery-service.ts`: (1) `opsCancelRefund` cancelava/estornava sem
> resetar o contexto — o cliente ouvia "ainda estou cotando" de pedido cancelado e, em
> `choosing_freight`, o botão de frete virava erro genérico em loop (única saída: "trocar
> endereço"); (2) `choosing_freight` não expirava nunca — toque dias depois publicava frete
> e data do anúncio já vencidos, numa cotação pagável. Agora o cancelamento reseta a
> conversa (helper compartilhado com o pagamento), `handleCancel` limpa ponteiro morto,
> `awaiting_operator_quote` se cura sozinho, e a escolha de entrega entrou no TTL de
> abandono de 1h + carimbo `quotedAt`. Gate: `tsc` + `tests/manual-concierge.test.ts`.
> **NÃO PUBLICADO** — deploy depende de autorização do dono.

> **17/08 (5ª) — frete+prazo REAIS por anúncio do ML (o R$18 automático morreu).**
> Reclamação do dono ("os 18 automático tá péssimo... no app aparece 10,99 entrega até
> amanhã, ele tem que saber isso direto"). Achado testado ao vivo, **sem credencial**:
> `api.mercadolibre.com/items/<MLB...>/shipping_options?zip_code=<CEP>` devolve 200 em
> ~0,35s com custo e data de cada opção (padrão R$14,99 chega 25/08 · Sedex R$25,99 chega
> 20/08, Av. Paulista). É a única rota aberta do ML — `/items`, `/products` e a busca dão
> 403 —, então **não depende do app do DevCenter** (o item abaixo segue valendo só pra
> deixar a BUSCA rápida). Novo `src/lib/ml-freight.ts` cobra a opção mais barata de
> entrega no endereço, soma por anúncio, manda a data pro cliente ("chega até 25/08") e
> cai pro operador quando não há número real (catálogo sem id de anúncio, sem estoque,
> falha). Gate: ml-freight 8/8, instant-quote 6/6, tsc. **NÃO PUBLICADO** — falta deploy
> e um teste real com pedido de cauda longa (ex.: mochila) conferindo frete e data no
> /ops. ⚠️ Cobertura parcial conhecida: anúncio de CATÁLOGO (`/p/`, `/up/`) sem `wid` no
> link não tem id de anúncio; medir no primeiro teste real quantos caem no manual.

> **17/08 (4ª) — Rappi FECHADO como vitrine + frete do anúncio do ML.** Decisão do dono
> depois da investigação: o SSR do Rappi só entrega as lojas do Mall (e-commerce
> nacional, entrega em dias — o que o ML já cobre); os supermercados de 1h exigem
> localização no cliente (401 na API, 403 no edge) e só sairiam com navegador, removido
> do produto de propósito. **Rappi = canal de compra manual (tag ⚡), não vitrine**; não
> reabrir sem fato novo. Junto: item do ML não cobra mais tarifa padrão R$18 quando o
> anúncio dá frete grátis (flag `freeShipping` do anúncio → cotação instantânea; item
> pago na mesma loja restaura a política). Gate: instant-quote 5/5, ML 11/11, tsc.

> **17/08 (3ª) — card do ML: slot de entrega é PRAZO (reclamação do dono) — PUBLICADO.**
> Deploy `shopping-agent-8yc44yeis` `Ready`, smoke verde. "Frete grátis" sem data não
> ocupa mais o slot (sem data = sem rótulo; o prazo oficial é a cotação), anúncio
> internacional ("enviado da China", semanas) é descartado na entrada, e no empate o
> anúncio com prazo publicado vence — na prática os cards saem "chega hoje/amanhã".
> Cache do ML versionado (v2) pro conserto valer imediatamente. Conector 11/11.

> **20/08 — ticket do suporte ML redigido e pronto.** O texto completo (erro `OPT02` +
> pergunta objetiva sobre a habilitação do `/sites/MLB/search`, que hoje devolve 403 até
> para apps registrados) está em
> [docs/ticket-suporte-mercadolivre.md](docs/ticket-suporte-mercadolivre.md), com o
> passo a passo de onde abrir e as respostas prontas para perguntas técnicas. **Ação do
> dono:** preencher CNPJ/login e enviar; sem isso a busca de cauda longa segue no actor
> (20–75s por busca fria).

> **17/08 — app Mercado Livre: bloqueio externo antes da criação.** O DevCenter foi acessado
> na conta operacional, mas a tela oficial de primeira aplicação retornou
> `OPT02-EN1XAJYDKPNW` e voltou ao início após retry. Não houve app, segredo, token ou
> alteração de conta. O proprietário precisa validar a elegibilidade/dados do titular com o
> suporte do ML e só então criar uma única app exclusiva da Lia. O código local OAuth já está
> preparado, mas requer migration + deploy posterior; ele usa a API apenas para busca rápida e
> mantém Apify como fallback — nunca compra nem acompanha pedidos de comprador.

> **17/08 (2ª) — vitrine fit/congelados PUBLICADA (caso "sorvete que não engorda").**
> Commit `8619f9a`: a colheita VTEX ganhou varredura complementar por termo (`--ft`) e os
> 3 mercados agora carregam o nicho fit que o top-vendas escondia — Sorvete Zero Nestlé,
> Açaí Zero, YoPRO, whey, sem lactose/glúten. NdT 904→1.543 itens; Oba caiu a 1.000 (a
> API da loja parou em `_from=1000`; essenciais preservados). "saborizada" virou variante
> processada (água seca continua mineral). Golden 40/40. Rappi ao vivo continua
> só-se-o-piloto-provar-demanda; a compra urgente via Rappi já funciona manual (tag ⚡).

> **17/08 — busca fria do ML ~30% mais rápida + tag "⚡ quer HOJE" PUBLICADOS.** Commits
> `dc0424a` + `ed797b2`, deploy `shopping-agent-asazb5e8i` `Ready`, smoke verde (landing
> e /ops 200). Velocidade: actor com 4GB (28,5s→21,1s medido), `waitForFinish` no lugar
> do polling e prefetch do ML em paralelo com a IA (buscas idênticas em voo compartilham
> um run) — busca fria ~30s → ~20-22s; para 10-15s só com a API oficial do ML
> (**pendência do dono**: criar app em developers.mercadolivre.com.br; aí integramos com
> fallback pro Apify). Urgência: "urgente"/"pra hoje" agora vira nota `⚡ URGENTE`,
> alerta com ⚡ e badge laranja no /ops — o operador decide o canal (Rappi/retirada
> agora vs. ML). Gate: tsc, ML 10/10, NLU 41/41, concierge E2E 36/36. Direções
> registradas sem código: busca consultiva ("algo pra X" → 2-3 categorias na extração)
> e vitrine Rappi ao vivo (actors atuais são de restaurante e caros ~R$3/busca; validar
> com 1 run só se o piloto provar demanda urgente/perecível).

> **16/08 (4ª) — 7º ciclo (13 cenários, 12 ok) → conserto de display PUBLICADO.** Push
> `20052dc` → deploy `Ready` (smoke verde). A confirmação de endereço agora mostra o CEP
> processado ("… — CEP 13010-050"). Com isso a lista de achados dos 7 ciclos está
> ZERADA (15→7→6→6→4→3→1→0) e as guardas de dinheiro/endereço/remédio não falharam desde
> o 3º ciclo. **Recomendação em pé:** piloto com 5–10 pedidos REAIS de gente de fora
> (dono no /ops, alertas ativos) — é o único teste que valida titularidade/NF, frete ao
> vivo com IP da Vercel, prazos reais e pós-venda.

> **16/08 (5ª) — Mercado Livre reaberto como cauda longa, atrás de flag.** O conector
> usa o actor real validado, cache de 6h, guarda ANVISA e prazo do próprio anúncio. No
> review pré-ativação, o fallback foi tornado estrito: as 18 vitrines locais rodam
> primeiro; o ML só é chamado sem match forte local, e o aviso de espera só nasce nesse
> momento. O prazo também foi propagado até os cards interativos da Meta. Gate completo:
> 340/340, tsc, lint e build verdes. **Ativado em Production:** flag Sensitive `true`,
> commit `5040813`, deploy `dpl_9j9Yyn2fFWoCCWEUGDb8Bax7DMxZ` `READY`, smoke verde e
> zero erro novo. **Pendente:** primeiro pedido frio no WhatsApp (prova runtime do token
> Sensitive). **Gate 2 (não bloqueia 5–10 pedidos):** confirmar a
> política do ML para muitas compras da mesma conta destinadas a endereços diferentes.

> **16/08 (3ª) — 6º ciclo (10 rodadas, 7 sucessos) → 3 consertos PUBLICADOS.** Push
> `95db8bf` → deploy `Ready` (smoke verde). No ar: filtro de contexto também nos itens
> da IA ("Para uma viagem"), escopo da negação corrigido no prompt (o exemplo da 7d
> ensinava a contaminar o vizinho), e CEP órfão limpo na captura do endereço. Régua dos
> ciclos: 15→7→6→6→4→3. Recomendação registrada: próximo ciclo limpo = abrir o piloto
> pra gente de fora.

> **16/08 (2ª) — 5º ciclo (10 rodadas) → 4 consertos PUBLICADOS.** Push `8cff5c1` →
> deploy `Ready` (smoke verde: landing 200, /ops 200, webhook 403). No ar: ocasião/dia e
> "barato" seco como modificadores; plural não duplica no merge; adição relativa na
> mesma mensagem; cesta preservada + re-cotação automática na troca de endereço. Gate
> focado (tsc + 38 units + golden 35/35 + 6 E2E dos fluxos tocados) — decisão do dono.
> Re-teste: as 4 frases exatas do ciclo, em especial a sequência completa da rodada 6.

> **16/08 — 4º ciclo (10 rodadas) → 6 consertos + botão "Outra quantidade" PUBLICADOS.**
> Push `00981df` → deploy `Ready` (smoke verde). No ar: cabo ≠ carregador (golden none),
> teto de preço sobrevivendo ao merge com a IA, tamanho filtrando todos os cards,
> "sem remédio" no começo sem virar remoção, fillers/urgência secos, CEP embutido
> consumido, botões 1 · 2 · Outra quantidade. Suíte 326/326; golden 34/35 · 35/35.
> **Segue com o dono:** limpar CNPJ/nome do perfil no WhatsApp Manager (Descrição/Sobre)
> — não é código. **Lacuna de vitrine recorrente:** cabos/acessórios de eletrônicos
> (3 recusas honestas em 4 ciclos) — candidata nº 1 pra próxima loja/categoria.

> **15/08 (2ª) — 3º ciclo (10 rodadas) → 6 consertos PUBLICADOS.** Push `3356cbc` →
> deploy `READY` em Production (smoke verde: landing 200, /ops 200, webhook 403/401).
> No ar: negação vira atributo `sem X`, "até R$30 cada", destino com CEP no meio do
> pagamento derruba a cotação velha, "mais um leite" herda o sku, "troca X por Y" em
> lista nova, lancheira recusa limpa. Suíte 320/320; golden 33/34 DET · 34/34 IA.
> **Re-teste sugerido:** churrasco com "sem pimenta"; carregador "não veicular, algo
> barato"; "Antes de pagar, vou entregar em Campinas, CEP 13010-100" com pagamento
> aberto; "mais um leite" após leite sem lactose; a mensagem do detergente/esponja/saco.

> **15/08 — re-teste (10 rodadas) → 6 consertos PUBLICADOS.** Push `4cbbaae` → deploy
> `dpl_AW75PjcJaB44exEzNTLcaLirbZ1M` `READY`; smoke verde. Rodadas 5/6/15 passaram no
> re-teste; os ruídos restantes ("três pacotes" acentuado, embalagem solta, "qualquer
> time", adversativa escondendo urgência, confirmação sem quantidade, hidratante×sabonete)
> estão corrigidos com golden/units/E2E. Decisão registrada: "o mais barato possível"
> ORDENA (mais barata no topo) mas não esconde alternativas — restrição só com teto
> explícito ("até X reais"). Suíte 314/314; golden 33/34 DET · 34/34 IA.

> **15/08 — nova rodada exploratória ao vivo, sem conserto.** Dez cenários foram executados
> no WhatsApp e cancelados antes de qualquer cobrança. A adição relativa por SKU, o estado
> da cesta e o cancelamento pré-pagamento passaram. Novos casos para priorizar: cabo de 2 m
> confundido com carregador; “pensando bem”/“chega amanhã” virando item indisponível; “sem
> remédio” confundido com remoção; teto explícito exibindo opções acima do limite; e frase
> natural com CEP pedindo o CEP novamente. O relatório está em
> `docs/testes-whatsapp-2026-08-14.md`; nenhum item é marcado como corrigido por esta rodada.

> **01/09 — perfil público do WhatsApp: “Lia Delivery” reenviado.** O print real ainda
> mostrou `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, status **Approved**. Por ordem
> do dono, foi reenviada no WhatsApp Manager a alteração para **Lia Delivery**; a Meta
> aceitou a solicitação e agora mostra **In Review**. O nome antigo continua público até a
> decisão. Não mexer em código, número, WABA, webhook ou pagamentos para resolver isto;
> acompanhar apenas a aprovação do display name.

> **15/08 — nova rodada independente de conversa.** Dez cenários foram repetidos em uma
> conversa limpa. Passaram troca de item, “sem remédio” com shampoo, presente dentro de
> R$100 e 4x → 7x → 5x do mesmo bombom. Permanecem casos para priorizar: fillers/contexto
> (“Para domingo”, “Para uma viagem”), preferência “barato”, combinação de itens e
> preservação da cesta após salvar novo endereço. Registro em
> `docs/testes-whatsapp-2026-08-14.md`.

> **14/08 (3ª) — PUBLICADO.** Push `d9fab9a` → deploy `dpl_EUQX9nHBBpYRQGHaSSmkb4wfT3n4`
> `READY` em Production; smoke verde (landing 200, /ops 200, webhook 403/401). Os 7
> consertos das 15 rodadas estão no ar. **Re-teste do dono:** rodadas 5 (esclarecimento
> na escolha), 6 (presente até R$100), 13 (quatro caixas + "4" + "mais três do mesmo") e
> 15 ("antes de pagar, quero entregar em BH").

> **14/08 (2ª) — os 7 consertos das 15 rodadas implementados e testados.** Detalhe em
> [AGENTS.md](AGENTS.md). O que ficou de fora COM REGISTRO: (a) latência ~15s no 1º turno
> (cold start + 2 LLMs; medir no piloto antes de otimizar); (b) teto de orçamento vale por
> ITEM, não pela cesta somada (relatório reconhece a ambiguidade; com a linha fantasma
> morta, 1 pedido = 1 item = teto efetivo); (c) rodadas 2/11 (carregador → manual): a
> própria nota nova no /ops vai dizer a loja/motivo no próximo caso real. Pendente:
> re-teste do dono nas rodadas 5, 6, 13 e 15 pós-deploy.

> **14/08 — 2ª revisão PUBLICADA (4 lacunas de concorrência).** Push `1620450` → deploy
> `dpl_6yCJWmRab5wp615Ra7L6RVfrRG8V` `READY` em Production; smoke verde (landing 200,
> /ops 200, webhook 403/401). No ar: lock de turno por conversa (migration
> `20260811150000` já estava no banco), troca de endereço por estado, rollback da
> cotação só quando o resumo falha, eco VTEX validado item a item. Suíte 302/302 —
> duas rodadas anteriores tiveram falhas de AMBIENTE (máquina dormiu no meio; flakes de
> contenção com o pooler), reconfirmadas isoladamente antes do push.

> **11/08 (6ª) — PUBLICADO.** Push `09f418a` → deploy `dpl_CvpvfSt2S5HmkhnSuHEiKp7z6Gri`
> `READY` em Production (`liadelivery.com.br`); smoke verde (landing 200, /ops 200, webhook
> GET 403 / POST sem assinatura 401). No ar: as 10 correções da revisão + o conserto da
> conversa duplicada (upsert por id determinístico). Suíte 297/297.

> **11/08 (5ª) — revisão de código do lote (6 P1 + 4 P2/P3) corrigida e testada.** Detalhe
> por achado em [AGENTS.md](AGENTS.md). **Ação já feita:** o índice único parcial do dedupe
> (`Message_inbound_provider_id_key`) foi aplicado no banco de produção e a migration
> marcada como aplicada — deploy do código sem esse índice NÃO teria dedupe. **Ação
> pendente do dono:** ~~conferir o pedido mínimo do Carrefour~~ — **conferido em 11/08**:
> a política publicada diz mínimo R$30, frete fixo R$14,90 e grátis acima de R$349, os
> três iguais ao que já estava no código (nada a ajustar). As outras 17 vitrines seguem
> com mínimo 0, o que só erra para o lado seguro (nunca recusa indevida; o risco é o
> operador tomar recusa no checkout de uma loja que tenha mínimo não mapeado — se
> acontecer, é só setar `LIA_<LOJA>_MIN_ORDER` na Vercel, sem deploy; toda vitrine já lê
> essa env: CACAUSHOW, BOTICARIO, CARREFOUR, DECATHLON, DIVVINO, COBASI, DROGARAIA,
> DROGARIASP, GIULIANAFLORES, IMIGRANTES, KOPENHAGEN, KALUNGA, NATURALDATERRA, OBA, PETZ,
> PAGUEMENOS, RIHAPPY, SWIFT).

> **11/08 (4ª) — bugs do teste real: card por SKU, "outras" com 3, botão Trocar endereço.**
> O id posicional dos cards era o bug do "escolhi um e veio outro" (lista trocava por baixo
> na paginação); id agora é o sku e o histórico (`shownOptions`) resolve card antigo.
> "Outras" completa até 3; resumo da cotação com botão "Trocar endereço". Pendente: novo
> teste real do dono repetindo o cenário (pedir → outras → tocar num card da 1ª leva).

> **11/08 (3ª) — fim da linha livre (regra do dono).** Item sem preço = recusa honesta na
> hora; todo fechamento sai com total na mesma resposta. Caminho manual do /ops = só
> fallback técnico. Consequência estratégica: lacuna de catálogo agora aparece como "não
> tenho" pro cliente — **ampliar a vitrine virou a alavanca de largura** (ex.: eletrônicos
> básicos/Kalunga, itens de casa; o "adaptador hdmi" e a "camiseta de futebol" de casos
> reais hoje são recusas). Rastrear recusas frequentes no log e somar loja/categoria.

> **11/08 (2ª) — botão Cancelar sempre + abandono de 1h expira sozinho.** Regras do dono
> pós-zumbi, implementadas e testadas: menu de pagamento com *Cancelar*, espera de cotação
> com *Cancelar pedido*, e retorno após 1h+ de silêncio cancela o pedido não-cotado e
> recomeça a conversa (pago/awaiting_payment intocados). Nada a configurar (TTL default
> 60 min via `LIA_QUOTE_ABANDON_TTL_MS`).

> **11/08 — alerta ao operador + card resistente a foto 404 (bug do pedido zumbi).** Pedido
> de sábado ficou 2 dias em cotação manual sem aviso; a camiseta de hoje caiu dentro dele.
> Alertas ao operador implementados (cotação nova, item adicionado, pedido pago).
> **Pendências do dono:** (1) setar `LIA_OPERATOR_PHONE=+5511976366065` na Vercel
> (Production) — sem ela o alerta fica mudo; (2) mandar "cancelar" no WhatsApp pra matar o
> pedido zumbi `#CMSMCE` e pedir de novo (ração sozinha agora fecha com total na hora);
> (3) autorizar o deploy deste lote. Limitação assumida: alerta usa mensagem comum — fora
> da janela de 24h da Meta o envio pode falhar (fica no log `[operator-alert:failed]`);
> template de operador é evolução futura se incomodar.

> **10/08 (2ª) — diversidade nas opções + botão "Outras opções" + piso na paginação.** As 3
> opções agora são produtos distintos (não o quase-mesmo em 3 tamanhos/cores); quem não
> gosta de nenhuma tem o botão **"Outras opções"** no último card Meta (ou digita "outras"
> — o fallback numerado anuncia). Paginação virou cross-store, diversificada e com piso de
> relevância (a vistoria pegou "outras" de carregador devolvendo Sérum Nivea "Cellular").
> Golden 32/33 DET · 33/33 IA. **PUBLICADO 10/08** (deploy `dpl_4Aa3SdK3pUEt5M5wBaM8H6s2rM6g`,
> commit `a4fd0ef`, smoke verde). **Pendências:** (1) 1 teste real do card com 2 botões —
> pedir um item no WhatsApp e tocar "Outras opções" (card só se prova ao vivo;
> `scripts/tail-messages.mts` lê a evidência); (2) limitação assumida: paginação usa só o
> piso léxico (sem rerank) — "outras" pode dizer "essas são todas" cedo demais em pedido
> com qualificador ("carregador de celular"); o refinamento cobre.

> **07/08 (2ª) — emoji literal resolvido na raiz (bug do minificador SWC).** O
> `🙂` do WhatsApp era o SWC fundindo strings com emoji em template literal com
> barra dupla — 5 emojis corrompidos no bundle; fonte sempre esteve certo.
> `serverMinification: false` + guarda `scripts/check-bundle-emoji.mjs` no `npm run build`
> (o build FALHA se voltar). A linha livre agora diz que a Lia procurou nas lojas e que o
> operador cota por fora (caso "adaptador hdmi": nenhuma das 18 lojas tem eletrônicos —
> lacuna conhecida; aprofundar Kalunga/nova fonte é o próximo passo da vitrine). Commit
> `dd1d636`, deploy `dpl_7FumMkVLB35EA5rhuTfQfkMP1Yzn`.

> **07/08 — cotação não engole mais pedido novo + deploy é o gate.** O screenshot de produção
> do dono mostrou: item pedido durante `awaiting_operator_quote` era descartado ("segura aí")
> e o cliente precisou cancelar. Corrigido: o item entra no mesmo pedido como linha livre, com
> nota no /ops. Os outros dois problemas da tela (cotonete sem match e emoji literal
> `🙂`) eram o código antigo em produção.
>
> **07/08 — PUBLICADO.** Com autorização do dono, os 8 commits (busca com rerank + golden set,
> consertos de matcher e onboarding, cotação sem engolir, e os 2 commits do cartão salvo de
> 05/08 com a flag desligada) foram ao GitHub e o deploy
> `dpl_Hg6fJBVaD7a8xMWZPVsKqP5eFuPg` (commit `e8dea9f`) ficou `READY` em Production. Smoke:
> landing 200, `/ops` 200, webhook 403 (GET) / 401 (POST sem assinatura). Pendências de
> verificação humana pós-deploy: (1) mandar uma conversa real no WhatsApp e conferir
> carregador usb c / cotonete / adicionar item durante cotação; (2) conferir se o emoji 🙂
> renderiza (o literal `\uD83D…` não existe no fonte — se persistir, é build, eu caço);
> (3) conferir a fila do /ops — havia pedido antigo preso em `awaiting_operator_quote`, que
> foi o gatilho do bug da tela. O rerank exige `OPENAI_API_KEY` em Production (sem ela, cai
> no determinístico, que já cobre 31/32); kill-switch: `LIA_SEARCH_RERANK_OFF=true`.

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
- [~] **19/08 — achar um operador → SUPERADO em 20/08.** Decisão do dono: as compras
  manuais serão executadas por um **agente de IA (GPT)** sob supervisão dele — sem
  contratar operador humano por ora. O `/ops` continua sendo o painel da operação
  (cotação manual quando houver, marcar comprado/despachado/entregue, estornos); o que
  muda é QUEM executa a compra no site. Riscos registrados em AGENTS.md (entrada 20/08
  5ª): anti-bot dos varejistas (a mesma classe que baniu o Browserbase no Carrefour),
  conta do ML sob risco se o agente comprar lá em volume, e a necessidade de religar o
  alerta de pedido PAGO (`LIA_OPERATOR_PAID_ALERT=true`) se ninguém ficar de olho no
  /ops. Reabrir a contratação humana se o piloto provar que o agente não dá conta.
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
- [x] **Falha do provedor de pagamento nunca vira cobrança mock (18/08).** Com
  `MERCADO_PAGO_ACCESS_TOKEN` setado, erro do Mercado Pago lança `PaymentProviderError`: o
  cliente é avisado de que nada foi cobrado, o pedido segue aguardando (repetir *pix*/*cartão*
  reemite), a falha é anotada no `/ops` e o operador recebe alerta. Fechado o furo em que um
  Pix mock (`mockpix_...`) num pedido real permitia "paguei" marcar o pedido como pago sem
  dinheiro. Coberto por `tests/payment-issue-failure.test.ts`.

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

- **2026-08-16:** rodada manual pós-deploy `8cff5c1` (10 cenários) confirmou os consertos de
  quantidade/pluralização e adição relativa, além de preservação da cesta ao trocar endereço.
  Pendências observadas ao vivo: contexto “para uma viagem” ainda pode virar item, “sem pimenta”
  pode contaminar o produto vizinho e a recotação exibiu o CEP novo sem os dígitos. Nenhum
  pagamento foi feito; evidências completas em `docs/testes-whatsapp-2026-08-14.md`.
- **2026-08-16:** reteste do 6º ciclo `95db8bf` passou os dois bugs de NLU anunciados e os
  cenários adicionais de refinamento, troca, quantidade, medicamento e cobertura geográfica.
  A recotação de Campinas preservou a cesta e eliminou “CEP.”, mas a UI não exibiu os dígitos
  de `13010-050`; confirmar o campo estruturado antes de considerar o caso totalmente fechado.
# Operador automático local

- [x] Criar fila durável e idempotente para pedidos pagos elegíveis do Mercado Livre.
- [x] Proteger endpoints do worker e limitar o piloto a links exatos.
- [x] Manter compra final bloqueada em `cart_only` e documentar a operação com Luna.
- [x] Publicar a fila, configurar o segredo no Mac/produção e ativar a verificação horária.
- [ ] Validar um pedido real até o carrinho e conferir endereço, prazo e total no ML.
- [ ] Implementar aprovação curta com hash/teto e testar recuperação sem compra duplicada.
- [ ] Só depois decidir se libera `PURCHASE_AUTOMATION_MODE=purchase`.
