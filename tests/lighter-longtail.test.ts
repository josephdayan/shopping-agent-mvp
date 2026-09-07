// Caso real 06/09 (pai do dono, isqueiro pra charuto): opções do Mercado Livre na mesa e o
// cliente especifica ("isqueiro maçarico", "tem que ser estilo tocha", "isqueiro charuto")
// → busca NOVA no ML com a frase e troca das opções; a IA que encurta a frase não pode
// apagar o qualificador da busca (raw).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let prisma: typeof import("../src/lib/prisma").prisma;
let handleDeliveryMessage: typeof import("../src/lib/delivery-service").handleDeliveryMessage;
let intents: typeof import("../src/lib/lia-intents");
const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5502${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
const TEST_ADDRESS = "Rua das Flores, 123, Bela Vista, São Paulo - SP";
const outbox: { to: string; text: string }[] = [];
let seq = 0;
let dbOk = false;

const ml = (id: string, name: string, unitPrice: number) => ({ sku: `ml-MLB${id}`, name, unitPrice, productUrl: `https://produto.mercadolivre.com.br/MLB-${id}-x`, mlPosition: 1 });
const GENERIC = [ml("100001", "Isqueiro Acendedor Elétrico Usb Recarregável Luxo", 22.99), ml("100002", "Isqueiro Bic Maxi Grande 12 Unidades", 72)];
const TORCH = [ml("200001", "Isqueiro Maçarico Tocha Para Charuto Recarregável Jet", 49.9), ml("200002", "Isqueiro Tocha Charuto Chama Azul Maçarico", 39.9)];
const KEYS: Record<string, unknown[]> = {
  "ml:v2:isqueiro": GENERIC,
  "ml:v2:isqueiro maçarico": TORCH,
  "ml:v2:isqueiro macarico": TORCH,
  "ml:v2:isqueiro tocha": TORCH,
  "ml:v2:isqueiro charuto": TORCH,
  "ml:v2:isqueiro pra charuto": TORCH
};

before(async () => {
  await import("./helpers/load-env");
  process.env.LIA_ENABLE_MERCADOLIVRE = "true";
  process.env.APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || "apify_test_token";
  process.env.LIA_LONGTAIL_OPTIN = "true";
  ({ prisma } = await import("../src/lib/prisma"));
  const adapters = await import("../src/lib/adapters/whatsapp");
  ({ handleDeliveryMessage } = await import("../src/lib/delivery-service"));
  intents = await import("../src/lib/lia-intents");
  (adapters.whatsappAdapter as { sendMessage: unknown }).sendMessage = async (to: string, text: string) => {
    outbox.push({ to, text });
    return { provider: "test", to, text };
  };
  (adapters.whatsappAdapter as { sendMedia: unknown }).sendMedia = async (to: string, text: string) => {
    outbox.push({ to, text });
    return { provider: "test", to, text };
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    if (process.env.LIA_REQUIRE_DB === "1") throw error;
    return;
  }
  for (const [queryKey, items] of Object.entries(KEYS)) {
    await prisma.searchCache.upsert({
      where: { queryKey },
      create: { queryKey, query: queryKey.slice(6), source: "mercado_livre", items: items as unknown as object },
      update: { items: items as unknown as object }
    });
  }
});
after(async () => {
  if (!dbOk) return;
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.message.deleteMany({ where: { conversation: { userId: { in: ids } } } });
    await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.searchCache.deleteMany({ where: { queryKey: { in: Object.keys(KEYS) } } });
  await prisma.$disconnect();
});
async function customer(): Promise<string> {
  const phone = `${PREFIX}${String(++seq).padStart(4, "0")}`;
  await prisma.user.create({ data: { phone, cep: "01229-000", defaultAddress: TEST_ADDRESS } });
  return phone;
}
async function send(phone: string, text: string): Promise<string> {
  const start = outbox.length;
  await handleDeliveryMessage({ phone, text, messageId: `lt_${RUN}_${++seq}` });
  return outbox.slice(start).filter((m) => m.to === phone).map((m) => m.text).join("\n");
}
async function genericOnTable(phone: string) {
  const offer = await send(phone, "isqueiro");
  assert.match(offer, /Mercado Livre/i, offer.slice(0, 300));
  const options = await send(phone, "longtail_sim");
  assert.match(options, /Isqueiro Acendedor Elétrico/, options.slice(0, 400));
  return options;
}

test("raw: a frase completa sobrevive ao encurtamento da IA para a busca no ML", () => {
  const merged = intents.mergeShoppingLines([{ phrase: "isqueiro", qty: 1 }], intents.parseBasketLines("queria um isqueiro pra charuto"));
  assert.equal(merged[0].phrase, "isqueiro");
  assert.equal(merged[0].raw, "isqueiro pra charuto");
  const same = intents.mergeShoppingLines([{ phrase: "arroz", qty: 1 }], intents.parseBasketLines("quero arroz"));
  assert.equal(same[0].raw, undefined);
});

test("'Isqueiro maçarico' com opções genéricas do ML na mesa → busca nova no ML e troca as opções", async (t) => {
  if (!dbOk) return t.skip();
  const phone = await customer();
  await genericOnTable(phone);
  const reply = await send(phone, "Isqueiro maçarico");
  assert.match(reply, /Ficou entre essas de \*isqueiro maçarico\*/i, reply.slice(0, 400));
  assert.match(reply, /Maçarico Tocha|Tocha Charuto/, reply.slice(0, 400));
  assert.doesNotMatch(reply, /procuro no Mercado Livre|Isqueiro Acendedor Elétrico/i);
});

test("'Estes não são bons. Tem que ser estilo tocha' → busca 'isqueiro tocha' e troca as opções", async (t) => {
  if (!dbOk) return t.skip();
  const phone = await customer();
  await genericOnTable(phone);
  const reply = await send(phone, "Estes não são bons . Tem que ser estilo tocha");
  assert.match(reply, /Ficou entre essas de \*isqueiro tocha\*/i, reply.slice(0, 400));
  assert.match(reply, /Tocha/, reply.slice(0, 400));
});

test("'isqueiro charuto' no meio da escolha não vira oferta ignorada: troca direto", async (t) => {
  if (!dbOk) return t.skip();
  const phone = await customer();
  await genericOnTable(phone);
  const reply = await send(phone, "isqueiro charuto");
  assert.doesNotMatch(reply, /procuro no Mercado Livre/i, reply.slice(0, 300));
  assert.match(reply, /Charuto/, reply.slice(0, 400));
});
