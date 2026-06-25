# MVP Agente de Compras Conversacional

MVP de um agente de compras conversacional via API e WhatsApp, com web chat apenas como console de teste. O fluxo permite pedir um produto em linguagem natural, receber 3 opcoes ranqueadas, escolher por texto ou clique, confirmar checkout, gerar pagamento mockado, aprovar pagamento, criar pedido, avancar fulfillment e salvar preferencias para compras futuras.

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

## Fluxos para testar

- `quero uma escova de dente`
- `preciso de pasta de dente barata`
- `quero lenco de papel para entregar hoje`
- `repete meu ultimo pedido`

No chat, escolha uma opcao por clique ou por texto (`1`, `2`, `3`, `mais barata`, `mais rapida`, nome da marca), confirme com `sim` e use `Simular pagamento aprovado`. O dashboard fica em `/admin` e permite aprovar pagamento e avancar fulfillment.

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

## Como trocar mock por OpenAI real

O adapter em `src/lib/adapters/ai.ts` ja tenta usar a OpenAI Responses API quando `OPENAI_API_KEY` esta preenchida. Sem chave, ele cai automaticamente no parser local. O contrato continua nos mesmos metodos:

- `parseUserIntent()`
- `interpretSelection()`
- `generateAssistantResponse()`

O retorno segue `ProductIntent`. Uma boa evolucao e trocar a validacao manual por Zod antes de acionar a busca.

## Como integrar Mercado Livre

Substitua ou complemente `src/lib/adapters/products.ts`:

- `searchProducts()` chama a API de search do Mercado Livre por categoria/termo.
- Normalize os resultados para o modelo `Product`.
- Guarde `externalId`, `productUrl`, preco, frete, loja, disponibilidade e prazo.
- Mantenha `rankProducts()` local para combinar preco, prazo, avaliacao e preferencias do usuario.

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

## Limitacoes do MVP

- IA usa heuristica local por padrao.
- Catalogo e pagamento sao mockados.
- Nao ha autenticacao no admin.
- Um usuario demo e usado no web chat.
- Status de entrega avanca manualmente.
- Imagens sao demonstrativas.

## Proximos passos tecnicos

- Autenticacao e permissoes do admin.
- Webhooks reais de pagamento e WhatsApp.
- Normalizacao de catalogos externos com cache.
- Observabilidade de conversas, falhas e conversao.
- Testes automatizados da maquina de estados.
- Politicas de itens proibidos e compliance por categoria.
