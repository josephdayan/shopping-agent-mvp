// Carrossel da vitrine (dono, 07/09): template de marketing com 2–3 cards, conteúdo
// variável, botão "Escolher este" voltando como optsku:<sku>. Fallback pros cards soltos
// quando não dá (desligado, 1 opção, foto ruim, template recusado pela Meta).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAROUSEL_CARD_COUNTS, buildCarouselTemplate, carouselTemplateName } from "../src/lib/meta-setup";
import { buildCarouselPayload, whatsappAdapter } from "../src/lib/adapters/whatsapp";

const OPTIONS = [
  { id: "optsku:petz-1", sku: "petz-1", name: "Ração Golden Adulto 15kg", displayPrice: 189.9, imageUrl: "https://example.com/a.jpg", delivery: "prazo da loja: 1 dia útil" },
  { id: "optsku:ml-2", sku: "ml-2", name: "Ração Premier Adulto 15kg\nRaças médias", displayPrice: 210, imageUrl: "https://example.com/b.jpg", badge: "Você já pediu este" },
  { id: "optsku:cobasi-3", sku: "cobasi-3", name: "Ração Royal Canin 15kg", displayPrice: 320.5, imageUrl: "https://example.com/c.jpg", delivery: "prazo da loja: 2 dias" }
];

test("template do carrossel respeita os limites da Meta (2 e 3 cards)", () => {
  for (const cards of CAROUSEL_CARD_COUNTS) {
    const t = buildCarouselTemplate(cards, "4::handle") as any;
    assert.equal(t.name, carouselTemplateName(cards));
    assert.equal(t.category, "marketing");
    assert.equal(t.language, "pt_BR");
    const body = t.components[0];
    assert.ok(body.text.length <= 1024);
    for (const text of [body.text, t.components[1].cards[0].components[1].text]) {
      assert.doesNotMatch(text, /\{\{\d+\}\}\s*$/, `não pode terminar em variável: ${text}`);
      assert.doesNotMatch(text, /^\s*\{\{\d+\}\}/, `não pode começar com variável: ${text}`);
    }
    assert.ok(body.example.body_text[0].length === (body.text.match(/\{\{\d+\}\}/g) ?? []).length);
    const carousel = t.components[1];
    assert.equal(carousel.cards.length, cards);
    const first = JSON.stringify(carousel.cards[0]);
    for (const card of carousel.cards) {
      assert.equal(JSON.stringify(card), first, "todos os cards têm os mesmos componentes");
      const cardBody = card.components.find((c: any) => c.type === "body");
      assert.ok(cardBody.text.length <= 160);
      assert.equal(cardBody.example.body_text[0].length, 3);
      const buttons = card.components.find((c: any) => c.type === "buttons").buttons;
      assert.ok(buttons.length <= 2);
      for (const b of buttons) assert.ok(b.text.length <= 25, b.text);
      assert.deepEqual(buttons.map((b: any) => b.text), ["Escolher este", "Outras opções"]);
      assert.equal(card.components.find((c: any) => c.type === "header").format, "image");
    }
  }
});

test("payload do envio: header por link, 3 variáveis por card e botões com sku", () => {
  const p = buildCarouselPayload("+5511999999999", "vitrine_carrossel_3", "Opções de *ração*:", OPTIONS) as any;
  assert.equal(p.type, "template");
  assert.equal(p.template.name, "vitrine_carrossel_3");
  assert.equal(p.template.components[0].parameters[0].text, "Opções de *ração*:");
  const cards = p.template.components[1].cards;
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((c: any) => c.card_index), [0, 1, 2]);
  assert.equal(cards[0].components[0].parameters[0].image.link, "https://example.com/a.jpg");
  const body = cards[1].components[1].parameters.map((x: any) => x.text);
  assert.equal(body.length, 3);
  assert.match(body[0], /⭐ Você já pediu este · Ração Premier/);
  assert.doesNotMatch(body[0], /\n/, "parâmetro de template não aceita quebra de linha");
  assert.equal(body[1], "R$ 210,00");
  assert.equal(body[2], "confirmo na cotação");
  assert.equal(cards[2].components[1].parameters[2].text, "2 dias");
  assert.equal(cards[0].components[2].parameters[0].payload, "optsku:petz-1");
  for (const card of cards) assert.equal(card.components[3].parameters[0].payload, "opt:outras");
});

async function withMeta(fn: (bodies: any[], fail?: { current: boolean }) => Promise<void>) {
  const previous = { provider: process.env.WHATSAPP_PROVIDER, token: process.env.WHATSAPP_ACCESS_TOKEN, phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID, carousel: process.env.LIA_CAROUSEL, fetch: global.fetch };
  const bodies: any[] = [];
  const fail = { current: false };
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
  process.env.LIA_CAROUSEL = "true";
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.method !== "POST") return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
    bodies.push(JSON.parse(String(init.body)));
    if (fail.current) return new Response(JSON.stringify({ error: { message: "Template name does not exist" } }), { status: 400 });
    return new Response(JSON.stringify({ messages: [{ id: `m${bodies.length}` }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await fn(bodies, fail);
  } finally {
    process.env.WHATSAPP_PROVIDER = previous.provider;
    process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
    process.env.WHATSAPP_PHONE_NUMBER_ID = previous.phoneId;
    if (previous.carousel === undefined) delete process.env.LIA_CAROUSEL;
    else process.env.LIA_CAROUSEL = previous.carousel;
    global.fetch = previous.fetch;
  }
}

test("Meta: 2 opções viram UMA mensagem de template vitrine_carrossel_v2_2", async () => {
  await withMeta(async (bodies) => {
    const result = await whatsappAdapter.sendDeliveryCarousel("+5511999999999", "Opções de *ração*:", OPTIONS.slice(0, 2));
    assert.equal(result?.mode, "delivery_choice_carousel");
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].template.name, "vitrine_carrossel_v2_2");
    assert.equal(bodies[0].template.components[1].cards.length, 2);
  });
});

test("Meta: 1 opção, desligado ou template recusado → null (cai nos cards soltos)", async () => {
  await withMeta(async (bodies, fail) => {
    assert.equal(await whatsappAdapter.sendDeliveryCarousel("+5511999999999", "x", OPTIONS.slice(0, 1)), null);
    process.env.LIA_CAROUSEL = "false";
    assert.equal(await whatsappAdapter.sendDeliveryCarousel("+5511999999999", "x", OPTIONS), null);
    process.env.LIA_CAROUSEL = "true";
    fail!.current = true;
    assert.equal(await whatsappAdapter.sendDeliveryCarousel("+5511999999999", "x", OPTIONS), null);
    assert.equal(bodies.length, 1, "só a tentativa recusada foi ao Graph");
  });
});
