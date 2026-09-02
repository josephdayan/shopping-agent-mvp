// Regressão do teto na cauda longa: "fone até 150" seguido de "Philco" não pode
// substituir os cards corretos por um anúncio Philco acima do orçamento.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let prisma: typeof import("../src/lib/prisma").prisma;
let handleDeliveryMessage: typeof import("../src/lib/delivery-service").handleDeliveryMessage;

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PHONE = `+5504${String(Date.now()).slice(-8)}${String(process.pid).slice(-2)}`;
const CACHE_KEYS = ["ml:v2:fone bluetooth", "ml:v2:fone bluetooth philco", "ml:v2:philco"];
const outbox: { to: string; text: string }[] = [];
let dbOk = false;
let seq = 0;

async function send(text: string): Promise<string> {
  const start = outbox.length;
  await handleDeliveryMessage({ phone: PHONE, text, messageId: `mlcap_${RUN}_${++seq}` });
  return outbox
    .slice(start)
    .filter((message) => message.to === PHONE)
    .map((message) => message.text)
    .join("\n---\n");
}

before(async () => {
  await import("./helpers/load-env");
  process.env.LIA_MANUAL_CONCIERGE = "true";
  process.env.LIA_ENABLE_MERCADOLIVRE = "true";
  process.env.LIA_LONGTAIL_OPTIN = "false"; // este teste cobre o resgate AUTOMÁTICO
  process.env.APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || "apify_test_token";
  ({ prisma } = await import("../src/lib/prisma"));
  const adapters = await import("../src/lib/adapters/whatsapp");
  ({ handleDeliveryMessage } = await import("../src/lib/delivery-service"));
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
    console.warn("⚠️  Banco indisponível — teste de teto no ML será pulado.");
    return;
  }

  const generic = {
    sku: "ml-MLB100000001",
    name: "Fone Bluetooth Sem Fio Básico",
    brand: "Genérico",
    unitPrice: 100,
    productUrl: "https://produto.mercadolivre.com.br/MLB-100000001-fone-bluetooth",
    mlPosition: 1
  };
  const expensivePhilco = {
    sku: "ml-MLB200000002",
    name: "Fone Bluetooth Philco Premium",
    brand: "Philco",
    unitPrice: 200,
    productUrl: "https://produto.mercadolivre.com.br/MLB-200000002-fone-philco",
    mlPosition: 1
  };
  for (const [query, items] of [
    ["fone bluetooth", [generic]],
    ["fone bluetooth philco", [expensivePhilco]],
    ["philco", [expensivePhilco]]
  ] as const) {
    const queryKey = `ml:v2:${query}`;
    await prisma.searchCache.upsert({
      where: { queryKey },
      create: { queryKey, query, source: "mercado_livre", items: items as unknown as object },
      update: { items: items as unknown as object }
    });
  }
  await prisma.user.create({
    data: { phone: PHONE, cep: "01310-100", defaultAddress: "Rua das Flores, 123, São Paulo - SP" }
  });
});

after(async () => {
  if (!dbOk) return;
  const user = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
  if (user) {
    await prisma.message.deleteMany({ where: { conversation: { userId: user.id } } });
    await prisma.deliveryOrder.deleteMany({ where: { userId: user.id } });
    await prisma.conversation.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.searchCache.deleteMany({ where: { queryKey: { in: CACHE_KEYS } } });
  await prisma.$disconnect();
});

test("marca no meio da escolha preserva o teto no Mercado Livre", async (t) => {
  if (!dbOk) return t.skip();
  const first = await send("quero um fone bluetooth até 150 reais");
  assert.match(first, /Fone Bluetooth/i, first.slice(0, 400));
  const refined = await send("Philco");
  assert.match(refined, /não achei.*fone bluetooth philco/i, refined.slice(0, 400));
  assert.doesNotMatch(refined, /220,00|Philco Premium/i, refined.slice(0, 400));

  const conversation = await prisma.conversation.findFirst({ where: { user: { phone: PHONE } } });
  const ctx = JSON.parse(conversation!.context ?? "{}") as {
    pending?: Array<{ cap?: number; options: Array<{ unitPrice: number; name: string }> }>;
  };
  assert.equal(ctx.pending?.[0]?.cap, 150);
  assert.ok(
    ctx.pending?.[0]?.options.every((option) => option.unitPrice < 150),
    JSON.stringify(ctx.pending?.[0]?.options)
  );
});
