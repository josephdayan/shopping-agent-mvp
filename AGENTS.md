# Lia — contexto obrigatório para agentes

_Última atualização: 2026-07-15._

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
- uma conta/Context não pode atender carrinhos concorrentes sem fila ou isolamento.

### Cotação Carrefour antes da cobrança

- **Implementado em código em 15/07:** com a automação Carrefour habilitada, a Lia cria
  a cotação pendente, monta o carrinho em `cart_only` e só mostra Pix/cartão após o
  checkout expor total, frete e promessa de entrega do varejista;
- a cotação expira em 5 minutos por padrão, exige escolha explícita de Pix/cartão depois
  do resumo e libera o Context se vencer ou for cancelada;
- o checkout falha fechado para `needs_human` se não expuser itens, total, frete ou prazo;
- migrations aplicadas e versão implantada em produção em 15/07/2026. A primeira
  validação ao vivo confirmou que o modal de CEP usa Enter (correção também implantada),
  mas o Context Carrefour estava sem login antes de limpar/adicionar o SKU de teste;
  nenhuma sacola, checkout ou cobrança foi criada;
- TypeScript, testes focados e build passaram. **A validação de estoque, frete, prazo,
  cartão e 3DS ainda depende de reautenticar o Context e repetir o teste controlado.**
  Não tratar como evidência de cobertura, preço ou prazo reais até então.

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

### Deploy e testes

- produção foi implantada e estava `Ready` após as mudanças de busca/carrinho;
- `npx tsc --noEmit` passou;
- testes focados de compra/busca/política passaram;
- o `npm test` completo ainda contém evals históricos que esperam coleta de CEP, enquanto
  o comportamento atual pede endereço completo. Não declarar a suíte inteira verde até
  alinhar esses contratos.

## Segurança e limites financeiros

- Produção deve permanecer com `PURCHASE_AUTOMATION_MODE=cart_only` até piloto auditado.
- Nunca clicar no botão final de compra sem confirmação explícita no momento da ação.
- Nunca repetir automaticamente um clique financeiro quando o resultado for incerto.
- CAPTCHA, OTP, login, CVV e 3DS viram `needs_human`; não burlar desafios.
- Não guardar número de cartão ou CVV. O Pagar.me recebe os dados diretamente pelo
  `tokenizecard.js`; a Lia persiste somente IDs tokenizados, últimos quatro dígitos e o
  registro de consentimento necessários para a recompra.
- Não pedir cartão pelo chat. O usuário digita dados financeiros diretamente no checkout
  seguro do provedor/varejista.
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
- Manter idempotência, hash do carrinho e revalidação imediatamente antes de qualquer
  aprovação.

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
3. Mover cotação real para antes da cobrança na conversa.
4. Adaptar `/ops` e estados do pedido de retirada/motoboy para entrega/rastreio do varejista.
5. Testar cartão salvo, CVV, 3DS, CAPTCHA e antifraude sem habilitar compra automática.
6. Pilotar 5–10 pedidos controlados com entrega direta.
7. Para same-day, obter parceiro local ou contrato merchant/courier antes de desenvolver
   nova automação de retirada.
8. Alinhar os evals históricos de CEP com o contrato atual de endereço completo.
9. Antes de ativar One-Click: aplicar migrations de pagamento, liberar Payments API BR na
   WABA, liberar o domínio no Pagar.me e configurar as chaves/webhooks em produção.

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
