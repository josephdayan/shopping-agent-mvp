# Lia

Lia funciona como um concierge de compras com IA via API e WhatsApp, com web chat apenas como console de teste. O fluxo permite pedir um produto em linguagem natural, receber 3 opcoes ranqueadas, escolher por texto ou clique, confirmar checkout, gerar pagamento mockado, aprovar pagamento, criar pedido, avancar fulfillment e salvar preferencias para compras futuras.

## Como rodar localmente

1. Instale as dependencias:

```bash
npm install
```

2. Configure o ambiente:

```bash
cp .env.example .env
```

3. Suba o Postgres:

```bash
docker compose up -d
```

4. Crie o banco e carregue o catalogo mockado:

```bash
npm run db:reset
```

5. Rode o app:

```bash
npm run dev
```

Abra `http://localhost:3000`.

Se o navegador ficar preso no loading depois de rodar `npm run build`, pare o servidor (`Ctrl+C`) e rode `npm run dev` novamente. O build recria a pasta `.next`, e um dev server antigo pode ficar apontando para chunks JavaScript que nao existem mais. Se `localhost` falhar no navegador, teste tambem `http://127.0.0.1:3000`.

## Canais principais

### API

Enviar uma mensagem por telefone, criando ou reutilizando a conversa ativa:

```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-api-token" \
  -d '{
    "phone": "+5511999990000",
    "name": "Cliente Demo",
    "text": "quero uma escova de dente",
    "defaultAddress": "Rua das Flores, 123 - Sao Paulo, SP"
  }'
```

Criar conversa explicitamente:

```bash
curl -X POST http://localhost:3000/api/v1/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-api-token" \
  -d '{ "phone": "+5511999990000", "name": "Cliente Demo" }'
```

Responder em uma conversa especifica:

```bash
curl -X POST http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-api-token" \
  -d '{ "text": "1" }'
```

Aprovar pagamento mockado:

```bash
curl -X POST http://localhost:3000/api/v1/conversations/CONVERSATION_ID/approve-payment \
  -H "Authorization: Bearer dev-api-token"
```

### WhatsApp webhook

Webhook compativel com Twilio Sandbox e Meta Cloud API:

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: dev-webhook-secret" \
  -d '{
    "from": "+5511999990000",
    "profileName": "Cliente Demo",
    "body": "preciso de pasta de dente barata"
  }'
```

Resposta retorna `outbound.text`, simulando a mensagem que seria enviada de volta ao WhatsApp. O adapter fica em `src/lib/adapters/whatsapp.ts`.

Para Twilio Sandbox, configure no console da Twilio:

```text
When a message comes in:
https://shopping-agent-mvp.vercel.app/api/whatsapp/webhook

Method:
POST
```

Na Vercel:

```env
WHATSAPP_PROVIDER="twilio"
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="seu-auth-token-da-twilio"
TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
TWILIO_WEBHOOK_URL="https://shopping-agent-mvp.vercel.app/api/whatsapp/webhook"
```

O webhook responde TwiML diretamente para a Twilio. Se `TWILIO_AUTH_TOKEN` estiver configurado, o app valida o header `X-Twilio-Signature` antes de processar a mensagem. `TWILIO_WEBHOOK_URL` precisa ser exatamente a URL configurada no console da Twilio. Para sandbox, `TWILIO_WHATSAPP_FROM` costuma ser `whatsapp:+14155238886`.

Depois de configurar as variaveis, valide sem expor segredo:

```bash
curl https://shopping-agent-mvp.vercel.app/api/twilio/status \
  -H "Authorization: Bearer SEU_API_TOKEN"
```

O status da Lia tambem mostra preparo para Twilio Agent Connect.

## Fluxos para testar

- `quero uma escova de dente`
- `preciso de pasta de dente barata`
- `quero lenco de papel para entregar hoje`
- `repete meu ultimo pedido`

Na Lia, escolha uma opcao por clique ou por texto (`1`, `2`, `3`, `mais barata`, `mais rapida`, nome da marca), confirme com `sim` e use `Simular pagamento aprovado`. O dashboard fica em `/admin` e permite aprovar pagamento e avancar fulfillment.

## Estrutura do projeto

- `src/app`: rotas do Next.js, tela de chat, admin e APIs.
- `src/components`: componentes client-side do chat e acoes do admin.
- `src/lib/chat-service.ts`: maquina de estados da conversa.
- `src/lib/admin-service.ts`: leitura e mutacoes do dashboard.
- `src/lib/adapters`: contratos para IA, busca de produtos, pagamento, fulfillment, mensageria e WhatsApp.
- `prisma/schema.prisma`: modelos de usuario, conversa, mensagens, produtos, opcoes, pedidos e preferencias em Postgres.
- `docker-compose.yml`: Postgres local para desenvolvimento.
- `prisma/seed.ts`: catalogo e usuario demo.

## Variaveis de ambiente

- `DATABASE_URL`: conexao Postgres. Padrao local: `postgresql://postgres:postgres@localhost:5432/shopping_agent?schema=public`.
- `DIRECT_URL`: conexao Postgres usada pelo Prisma para migrations. No Supabase, use a session-mode pooler ou direct connection.
- `OPENAI_API_KEY`: opcional. Sem ela, o adapter de IA usa heuristicas locais.
- `OPENAI_MODEL`: modelo de interpretacao de intencao. Padrao: `gpt-5.4-mini`.
- `API_TOKEN`: token bearer para endpoints `/api/v1/*`.
- `WHATSAPP_PROVIDER`: `twilio`, `meta`, `mock` ou `zapi`.
- `WHATSAPP_WEBHOOK_SECRET`: segredo exigido no header `x-webhook-secret`.
- `WHATSAPP_VERIFY_TOKEN`: token que voce define na Meta para validar o webhook.
- `WHATSAPP_ACCESS_TOKEN`: token da WhatsApp Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: ID do numero remetente na WhatsApp Cloud API.
- `TWILIO_ACCOUNT_SID`: Account SID da Twilio.
- `TWILIO_AUTH_TOKEN`: Auth Token da Twilio usado para validar `X-Twilio-Signature`.
- `TWILIO_WHATSAPP_FROM`: remetente WhatsApp no formato `whatsapp:+14155238886` no sandbox, ou seu numero aprovado depois.
- `TWILIO_WEBHOOK_URL`: URL publica exata configurada no webhook da Twilio. Use em producao para evitar divergencia de proxy/host.
- `TWILIO_AGENT_CONNECT_ENABLED`: `true` quando voce for usar TAC/Conversation Memory.
- `TWILIO_API_KEY` e `TWILIO_API_SECRET`: credenciais recomendadas para TAC em producao.
- `TWILIO_CONVERSATION_CONFIGURATION_ID`: configuracao do Conversation Orchestrator.
- `TWILIO_MEMORY_STORE_ID`: Memory Store do Conversation Memory.
- `TWILIO_TRAIT_GROUPS`: grupos de traits usados na memoria. Padrao: `Contact,Preferences`.
- `TWILIO_PRODUCT_OPTIONS_CONTENT_SID`: ContentSid de template `twilio/quick-reply` para botoes de escolha no WhatsApp. Sem ele, Lia usa imagens + texto como fallback.
- `TWILIO_PHONE_NUMBER`: numero Twilio principal em formato E.164.
- `TWILIO_VOICE_PUBLIC_DOMAIN`: dominio publico para voz/ConversationRelay, se ativar voz.
- `MERCADO_LIVRE_REAL_SEARCH`: `true` para tentar busca real no Mercado Livre.
- `MERCADO_LIVRE_ACCESS_TOKEN`: token OAuth do Mercado Livre. Sem ele, a API de listings pode responder 403 e o app cai no mock.
- `MERCADO_LIVRE_SEARCH_LIMIT`: quantidade de resultados buscados antes do ranking. Padrao: `8`.
- `MERCADO_LIVRE_DEFAULT_SHIPPING`: frete estimado quando a API nao traz frete. Padrao: `12.90`.
- `MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS`: prazo estimado usado no ranking. Padrao: `48`.
- `APIFY_API_TOKEN`: chave opcional da Apify. Quando existe, a Lia usa Apify primeiro para buscar Mercado Livre.
- `APIFY_MERCADO_LIVRE_ACTOR`: actor da Apify. Padrao: `karamelo/mercadolivre-scraper-brasil-portugues`.
- `APIFY_WEBHOOK_SECRET`: segredo usado no callback assíncrono da Apify. Pode ser o mesmo valor de `WHATSAPP_WEBHOOK_SECRET`.
- `APIFY_MERCADO_LIVRE_CALLBACK_URL`: URL pública que a Apify chama ao terminar a busca. Ex.: `https://shopping-agent-mvp.vercel.app/api/apify/mercadolivre/callback`.
- `APIFY_MERCADO_LIVRE_MAX_PAGES`: paginas por busca na Apify. Padrao: `1`.
- `APIFY_MERCADO_LIVRE_TIMEOUT_SECONDS`: timeout da execucao sincrona. Padrao: `60`.
- `UNWRANGLE_API_KEY`: chave opcional para busca externa real no Mercado Livre quando a API oficial de listings responder 403.
- `UNWRANGLE_MERCADO_LIVRE_URL`: endpoint opcional da Unwrangle. Padrao: `https://data.unwrangle.com/api/getter/`.
- `UNWRANGLE_MERCADO_LIVRE_PLATFORM`: plataforma opcional da Unwrangle. Padrao: `mercado_search`.

## Como trocar mock por OpenAI real

O adapter em `src/lib/adapters/ai.ts` ja tenta usar a OpenAI Responses API quando `OPENAI_API_KEY` esta preenchida. Sem chave, ele cai automaticamente no parser local. O contrato continua nos mesmos metodos:

- `parseUserIntent()`
- `interpretSelection()`
- `generateAssistantResponse()`

O retorno segue `ProductIntent`. Uma boa evolucao e trocar a validacao manual por Zod antes de acionar a busca.

## Como integrar Mercado Livre

O conector fica em `src/lib/adapters/suppliers.ts`. Quando `APIFY_API_TOKEN` existe, a Lia busca primeiro pela Apify. Sem Apify, ele tenta listings reais no Mercado Livre Brasil (`MLB`) quando `MERCADO_LIVRE_REAL_SEARCH="true"` ou `MERCADO_LIVRE_ACCESS_TOKEN` existe.

Importante: a API publica de search pode retornar `403` mesmo com credenciais OAuth se o app ainda nao tiver acesso liberado. Por isso, em producao a ordem recomendada e Apify -> Mercado Livre oficial -> Unwrangle -> catalogo do Mercado Livre -> dados internos. Quando a busca real funciona, os itens sao salvos/atualizados em `Product` com:

- `externalId`: `mlb-{item_id}`
- `productUrl`: link real do item
- `automationLevel`: `real_search_manual_checkout`, `real_apify_search`, `real_external_search` ou `real_catalog_manual_checkout`
- `fulfillmentMode`: `marketplace_native` ou `manual_operator`

Isso ainda nao compra automaticamente. A etapa de compra/checkout real precisara de OAuth, regras comerciais e provavelmente operacao manual ou API autorizada.

## Como integrar Mercado Pago/PIX

Substitua `src/lib/adapters/payment.ts`:

- `createPayment()` cria preferencia/link ou cobranca PIX.
- `checkPaymentStatus()` consulta o provider.
- Webhook do Mercado Pago atualiza `paymentStatus`.
- Ao aprovar, chame o mesmo fluxo usado pelo mock para criar fulfillment e salvar preferencias.

## Como integrar WhatsApp

O endpoint de entrada ja existe em `/api/whatsapp/webhook`.

Para testar agora com Twilio WhatsApp Sandbox:

1. No Twilio Console, abra `Messaging > Try it out > Send a WhatsApp message`.
2. Entre no sandbox pelo WhatsApp usando o codigo indicado pela Twilio.
3. Em `Sandbox settings`, configure `When a message comes in`:

```text
https://shopping-agent-mvp.vercel.app/api/whatsapp/webhook
```

4. Metodo: `POST`.
5. Na Vercel, use `WHATSAPP_PROVIDER="twilio"`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` e `TWILIO_WEBHOOK_URL`.

Em conta trial, a Twilio so envia para numeros verificados e o sandbox WhatsApp tem limite diario. Isso e normal para teste.

### Imagens e botoes no WhatsApp

Quando a resposta tem opcoes de produto, o webhook Twilio responde com TwiML contendo uma mensagem de resumo e uma mensagem por produto com imagem (`<Media>`), descricao, preco, prazo, fonte e instrucao para responder `1`, `2` ou `3`.

Para habilitar botoes nativos de escolha, crie um template de quick reply na Twilio Content API:

```bash
TWILIO_ACCOUNT_SID="AC..." \
TWILIO_AUTH_TOKEN="..." \
npm run twilio:create-product-options-template
```

O comando imprime:

```env
TWILIO_PRODUCT_OPTIONS_CONTENT_SID=HX...
```

Coloque esse valor na Vercel em Production/Preview e faca redeploy. Dentro da janela de 24h do WhatsApp, a Twilio pode enviar quick replies sem aprovacao de template; se o envio com botoes falhar ou a variavel nao existir, Lia cai automaticamente para imagem + texto.

Tambem da para checar ou criar o template por API, usando `API_TOKEN`:

```bash
curl https://shopping-agent-mvp.vercel.app/api/twilio/product-options-template \
  -H "Authorization: Bearer SEU_API_TOKEN"
```

Se `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` existirem no ambiente:

```bash
curl -X POST https://shopping-agent-mvp.vercel.app/api/twilio/product-options-template \
  -H "Authorization: Bearer SEU_API_TOKEN"
```

O retorno mostra o `TWILIO_PRODUCT_OPTIONS_CONTENT_SID` que deve ser salvo na Vercel.

### Twilio Agent Connect

A Lia ainda roda seu proprio concierge de compras. O Twilio Agent Connect entra como middleware futuro para memoria, orquestracao multi-canal e voz. A camada pronta fica em `src/lib/adapters/twilio-agent-connect.ts`.

Hoje existem dois modos:

- `local_memory`: usa as preferencias e pedidos salvos no nosso Postgres.
- `conversation_memory`: ativado quando `TWILIO_MEMORY_STORE_ID` existir.

Para checar o preparo:

```bash
curl https://shopping-agent-mvp.vercel.app/api/twilio/status \
  -H "Authorization: Bearer SEU_API_TOKEN"
```

Para ver o contexto de memoria local que seria injetado num agente TAC:

```bash
curl "https://shopping-agent-mvp.vercel.app/api/twilio/agent-connect/context?phone=+5511999990000" \
  -H "Authorization: Bearer SEU_API_TOKEN"
```

Quando TAC for habilitado de verdade, use o setup wizard do SDK Python da Twilio para criar Conversation Memory e Conversation Configuration, depois preencha `TWILIO_CONVERSATION_CONFIGURATION_ID` e `TWILIO_MEMORY_STORE_ID`. O SDK TypeScript do TAC ainda nao esta publicado no npm; por isso a Lia nao instala esse runtime diretamente.

Para usar a Meta WhatsApp Cloud API depois, configure:

```env
WHATSAPP_PROVIDER="meta"
WHATSAPP_VERIFY_TOKEN="um-token-que-voce-escolhe"
WHATSAPP_ACCESS_TOKEN="token-da-meta"
WHATSAPP_PHONE_NUMBER_ID="id-do-numero"
```

Na Meta, configure o callback URL:

```text
https://SEU_DOMINIO/api/whatsapp/webhook
```

E use o mesmo valor de `WHATSAPP_VERIFY_TOKEN` no campo Verify Token.

- Webhook Twilio/Z-API recebe mensagem e identifica `phone`.
- Busque ou crie `User` pelo telefone.
- Reutilize `handleUserMessage()` para processar a conversa.
- Envie respostas via API do provedor.
- Para cards, envie lista/template quando o provedor suportar; caso contrario, transforme as opcoes em texto numerado.

## Limitacoes atuais da Lia

- A IA usa heuristica local por padrao quando nao ha chave OpenAI.
- Alguns fornecedores ainda usam catalogo demo quando nao ha API real configurada.
- Nao ha autenticacao no admin.
- Um usuario demo e usado no web chat.
- Status de entrega avanca manualmente.
- Imagens sao demonstrativas.

## Proximos passos tecnicos da Lia

- Autenticacao e permissoes do admin.
- Webhooks reais de pagamento e WhatsApp.
- Normalizacao de catalogos externos com cache.
- Observabilidade de conversas, falhas e conversao.
- Testes automatizados da maquina de estados.
- Politicas de itens proibidos e compliance por categoria.
