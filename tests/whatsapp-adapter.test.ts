import { test } from "node:test";
import assert from "node:assert/strict";
import { safeMediaLink, whatsappAdapter } from "../src/lib/adapters/whatsapp";

test("Meta: botão de opção volta como número entendido pelo fluxo", () => {
  const inbound = whatsappAdapter.parseInbound({
    entry: [{ changes: [{ value: { messages: [{
      from: "5511999999999",
      id: "wamid.1",
      type: "interactive",
      interactive: { button_reply: { id: "2", title: "Escolher este" } }
    }] } }] }]
  });
  assert.equal(inbound.text, "2");
  assert.equal(inbound.provider, "meta");
});

test("Meta: cada produto vira uma mensagem com foto e botão Escolher esse", async () => {
  const previous = {
    provider: process.env.WHATSAPP_PROVIDER,
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    fetch: global.fetch
  };
  const bodies: Record<string, any>[] = [];
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ messages: [{ id: `m${bodies.length}` }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await whatsappAdapter.sendDeliveryChoices("+5511999999999", [
      { id: "1", name: "Coca-Cola Lata 350 ml", displayPrice: 4.83, imageUrl: "https://example.com/coca.jpg" },
      { id: "2", name: "Coca-Cola Pet 600 ml", displayPrice: 6.03, imageUrl: "https://example.com/coca-600.jpg" }
    ]);
    assert.equal(result?.mode, "delivery_choice_cards");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].interactive.header.type, "image");
    assert.equal(bodies[0].interactive.action.buttons[0].reply.id, "1");
    assert.equal(bodies[0].interactive.action.buttons[0].reply.title, "Escolher esse");
    assert.match(bodies[0].interactive.body.text, /R\$ 4,83/);
    assert.equal(bodies[0].interactive.action.buttons.length, 1);
    assert.equal(bodies[1].interactive.header.type, "image");
    assert.equal(bodies[1].interactive.action.buttons[0].reply.title, "Escolher esse");
  } finally {
    process.env.WHATSAPP_PROVIDER = previous.provider;
    process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
    process.env.WHATSAPP_PHONE_NUMBER_ID = previous.phoneId;
    global.fetch = previous.fetch;
  }
});

test("Meta: onboarding, quantidade e pagamento usam botões com ids estáveis", async () => {
  const previous = {
    provider: process.env.WHATSAPP_PROVIDER,
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    fetch: global.fetch
  };
  const bodies: Record<string, any>[] = [];
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ messages: [{ id: `m${bodies.length}` }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await whatsappAdapter.sendAddressSetup("+5511999999999", "Vamos cadastrar seu endereço");
    await whatsappAdapter.sendQuantityChoices("+5511999999999", "Coca-Cola 350ml");
    await whatsappAdapter.sendPaymentChoices("+5511999999999", 50, 52.63);
    await whatsappAdapter.sendCartActions("+5511999999999");
    assert.equal(bodies[0].interactive.action.buttons[0].reply.id, "cadastrar_endereco");
    assert.deepEqual(bodies[1].interactive.action.buttons.map((b: any) => b.reply.id), ["qty:1", "qty:2", "qty:3"]);
    assert.deepEqual(bodies[2].interactive.action.buttons.map((b: any) => b.reply.id), ["pix", "cartao"]);
    assert.match(bodies[2].interactive.footer.text, /Pix R\$ 50,00/);
    assert.deepEqual(bodies[3].interactive.action.buttons.map((b: any) => b.reply.id), ["adicionar_mais", "cancelar"]);
  } finally {
    process.env.WHATSAPP_PROVIDER = previous.provider;
    process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
    process.env.WHATSAPP_PHONE_NUMBER_ID = previous.phoneId;
    global.fetch = previous.fetch;
  }
});

test("safeMediaLink: percent-encoda apenas URL com byte não-ASCII (caso ® da Pague Menos)", () => {
  const raw = "https://paguemenos.vteximg.com.br/arquivos/ids/662056/hastes-flexiveis-cotonetes®-150-unidades_7891010560812_1.jpg?v=638054079322100000";
  const encoded = safeMediaLink(raw);
  assert.ok(!/[^\x00-\x7F]/.test(encoded), "não pode sobrar byte não-ASCII");
  assert.match(encoded, /cotonetes%C2%AE-150/);
  // URL limpa passa intocada; URL já percent-encodada NUNCA é re-encodada (%20 ficaria %2520).
  const clean = "https://obahortifruti.vteximg.com.br/arquivos/ids/9835305/Cotonetes-Johnson-75-Unidades.png?v=638659866555900000";
  assert.equal(safeMediaLink(clean), clean);
  const preEncoded = "https://cdn.exemplo.com.br/img%20com%20espaco.jpg";
  assert.equal(safeMediaLink(preEncoded), preEncoded);
});
