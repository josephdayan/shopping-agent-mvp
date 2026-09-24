# API de compra nas lojas, sem operador — sondagem de 23/09/2026

Pergunta do dono: "não existe API de lojas individuais (Carrefour etc.) que faça o fluxo
completo da Lia sem operador? Tem que existir. Acha uma e testa se funciona."

**Resposta curta.** API *oficial* de compra pelo lado do comprador não existe no Brasil em
set/2026 — nem no Carrefour, nem em marketplace, nem em app de delivery. O que existe e
**funciona hoje, testado ao vivo por HTTP puro (sem navegador, sem perfil Chrome)**, é a API
pública de checkout da VTEX que os próprios sites usam. Em **3 lojas** (Drogaria São Paulo,
Cobasi, Pague Menos) ela aceitou, do servidor, a sequência inteira até a escolha do Pix:
busca → carrinho → perfil de convidado sem login → endereço de sondagem → opção de entrega com
preço e prazo → Pix selecionado. A única etapa não executada é o **fechamento** (`transaction`),
porque cria um pedido real — e é exatamente onde a VTEX documenta os dois portões que podem
barrar um programa (reCAPTCHA e Payment App). Esse teste final custa um pedido de ~R$15–20 e
está pronto para rodar (`--buy`), mas depende de autorização e documento do dono.

## 1. O que existe no mundo (pesquisa, set/2026)

| Candidato | API de compra pelo comprador? | Brasil? | Estado |
|---|---|---|---|
| OpenAI ACP / Instant Checkout | Quem compra é o ChatGPT; lojista expõe endpoints | Não | Recuou em 03/2026 para "Apps", parceiros aprovados ([OpenAI](https://openai.com/index/buy-it-in-chatgpt/), [DC360](https://www.digitalcommerce360.com/2026/03/06/openai-shifts-checkout-plans-agentic-commerce-strategy/)) |
| Google UCP + AP2 | Só dentro de AI Mode/Gemini | Não | Allowlist; checkout EUA/CA/AU ([Merchant Center](https://support.google.com/merchants/answer/16837055?hl=en)) |
| VTEX (Carrefour, Petz, Cobasi, Oba…) | Sem programa público de agente | Anunciado | Conector UCP "(U.S.)" no VTEX Day 04/2026, sem GA nem BR ([VTEX](https://www.vtex.com/en-us/press/vtex-vision-ai-native-commerce-suite-2026)) |
| VTEX Checkout API `/api/checkout/pub/orderForm` | Documentada para a própria loja e integrações | Sim (técnico) | **É o que testamos.** Nenhuma cláusula pública da VTEX proíbe; o veto tende a vir dos termos da loja ([doc](https://developers.vtex.com/docs/guides/checkout-api-overview)) |
| Shopify Catalog/Cart/Checkout MCP | Único com papel "agente terceiro" documentado | Sem BRL/Pix documentado | Checkout MCP só para "trusted agents"; nenhuma loja da cesta da Lia é Shopify ([shopify.dev](https://shopify.dev/docs/agents)) |
| Mercado Livre, Magalu, Amazon BR, Americanas, Shopee | Só APIs de vendedor | Sim | Sem porta de compra ([ML](https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas)) |
| iFood, Rappi, Zé Delivery, Daki, Uber Eats | API é do lojista ou inexistente | Sim | Rappi + OpenAI = ChatGPT Go grátis, não commerce ([iFood](https://developermercado.ifood.com.br/docs/guides/order-api/)) |
| Carrefour Brasil | API de **seller** via Mirakl | Sim | Nada para comprador; o site barra servidor (503 Akamai) |
| Zinc / Rye | Compra real por API | Não / não documentado | Zinc só EUA; Rye "qualquer URL" sem opt-in do lojista = botting terceirizado ([Zinc](https://zinc.com/docs), [Rye](https://docs.rye.com/api-v2/example-flows/simple-checkout)) |
| Mastercard Agent Pay / Visa Intelligent Commerce | Camada de **pagamento**, não de pedido | Piloto BR | Itaú/Santander; gated por emissor |

Pix de saída (pagar o QR da loja por API) **é resolvível**: Asaas (`POST /v3/pix/qrCodes/pay`,
já codificado em `src/lib/payments/pix-out/asaas.ts`), Efí, Inter (só PJ, não MEI), Stark Bank.
Mercado Pago não tem payout self-serve.

## 2. O que foi testado ao vivo (HTTP puro, do Mac, CEP de sondagem)

Script: `npx tsx scripts/vtex-api-probe.mts <loja>` (modo seco, esvazia a cesta no fim; JSON
completo em `.retail-buyer/probes/vtex-api-*.json`). Endereço = bloco `probe` privado.

| Loja | Catálogo | Carrinho + item | Perfil convidado | Entrega no CEP (opção · frete · prazo) | Pix | Veredito |
|---|---|---|---|---|---|---|
| **Drogaria São Paulo** | 206 | 200 | 200, sem login | NORMAL R$6,90 2 dias · **SUPER EXPRESSA R$8,90 90 min** · EXPRESSA R$8,90 17 h | sim | **aberta até o Pix** |
| **Cobasi** | 206 | 200 | 200, sem login | Econômica R$7,90 1–2 dias · **Cobasi Já R$9,90 16 h** (entrega só aparece com lat/lng no endereço) | sim | **aberta até o Pix** |
| **Pague Menos** | 206 | 200 | 200, sem login | Econômica R$4,90 1 dia · **Expressa R$6,90 2 h** | sim | **aberta até o Pix** |
| Oba | 206 | 200 | 200 | Convencional R$9,90 hoje | **não** (só cartão/Google Pay) | fora: exigiria cartão da Lia na API |
| Swift | 206 | 200 | — | só retirada nesse CEP | sim | fora (cobertura) |
| Natural da Terra | 206 | 200 | — | item indisponível no CEP | sim | inconclusiva |
| Divvino | 206 | 200 | — | NORMAL R$11,29 5 dias | Pix só via Pagaleve | fora (prazo) |
| Ri Happy | 206 | 200 | — | item de marketplace sem estoque | — | inconclusiva |
| Kopenhagen | **403** | 200 | — | — | — | catálogo barrado |
| **Carrefour** | **503** | **503** | — | — | — | **Akamai barra servidor** |
| **Petz** | **403** | **404** | — | — | — | **barrada** |

Todas as chamadas nas 3 lojas abertas voltaram `loggedIn:false`, `canEditData:true`, sem
nenhum token de CAPTCHA pedido; `paymentSystems` lista Pix (id 125) com
`requiresAuthentication:false`. Cestas esvaziadas ao fim de cada corrida; nenhum pedido criado.

## 3. O que ainda NÃO está provado (o fechamento)

1. **`POST /orderForm/{id}/transaction`.** É onde a VTEX aplica o reCAPTCHA
   (`recaptchaValidation`: never / always / vtexCriteria). A doc diz que vale para "pedidos pagos
   com cartão de crédito ou débito" e que sem token o endpoint devolve `403 CHK0082`. Pix não
   está listado — mas a Pague Menos mostrou "Não sou um robô" na UI mesmo em Pix (10/09). Só a
   chamada real responde. Também é o ponto onde a loja exige documento (CPF/CNPJ) no perfil.
2. **Ler o código Pix.** O conector entrega `paymentAppData.payload` (`code`, `qrCodeBase64Image`)
   ao Payment App da loja, e a VTEX escreve que "IO apps do not work in headless environments".
   O script tenta os dois lugares públicos (`orders/order-group/{og}` e
   `vtexpayments.com.br/api/pub/transactions/{tid}/payments`) e procura o EMV no JSON. Se não
   vier por aí, resta o e-mail de confirmação da loja (leitor Gmail já existe em
   `scripts/retail-buyer/mailbox.ts`).
3. **Janela de 5 minutos** entre `transaction` e `gatewayCallback`, senão o pedido cancela como
   "incomplete". Pix vence em 15–60 min sem pagamento (cancelamento automático).
4. **Pagar o Pix** por API: Asaas cash-out está codificado, sem chave configurada
   (`LIA_PIX_OUT_PROVIDER=asaas` + `ASAAS_API_KEY`).
5. **Rastreio**: `GET /api/oms/user/orders/{id}` exige cookie de login (VTEX ID por código de
   e-mail, 24 h + refresh). Para pedido de convidado, o e-mail da loja é a fonte.

## 4. O teste final (um pedido real, ~R$15–20)

```bash
LIA_PROBE_CONFIRM=sim LIA_PROBE_DOCUMENT=<CPF ou CNPJ do comprador> \
npx tsx scripts/vtex-api-probe.mts drogariasp --term "sabonete" --sla NORMAL --buy
```

O documento entra só na chamada de perfil, não é impresso nem gravado. O script fecha o pedido,
manda o Pix ao gateway, chama o callback, lê o pedido por 60 s e imprime o copia-e-cola se o
encontrar. Na primeira vez o Pix é pago pelo celular do dono; se o pedido chegar, a arquitetura
"API + Pix-out" está provada para essa loja. Repetir em Cobasi e Pague Menos. Se voltar
`403 CHK0082`, a loja exige reCAPTCHA no fechamento e sai da lista — sem tentar contornar.

## 5. Limites honestos

- **Largura**: 3 lojas (farmácia sem remédio ×2 e pet). Mercado (Carrefour, Oba sem Pix,
  Swift/Natural da Terra sem cobertura no CEP) continua fora. Beleza (Boticário) não é VTEX aberta.
- **Termos da loja**: a VTEX não proíbe; os termos de uso de cada varejista podem proibir compra
  automatizada. Conta de convidado sem histórico também é mais sujeita a antifraude.
- **WAF/429**: a VTEX limita por rota e manda não fazer `POST` em paralelo; lojas grandes põem
  bot manager na borda (Carrefour, Petz) e podem ligar isso a qualquer momento.
- **Nota fiscal** sai no documento do comprador (Lia), não do cliente — mesma questão do concierge.
- Isto **não muda a decisão de 15/09** (operador humano). É evidência para, se o dono quiser,
  reabrir a compra automática com escopo estreito: estas 3 lojas, por API, sem navegador.
