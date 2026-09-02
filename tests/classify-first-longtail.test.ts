// Fase 4 da revisão (02/09): classificar ANTES de buscar e cauda longa OPT-IN.
//
// Antes: tudo que não casava com intent virava busca de produto ("seu Jorge aqui" →
// Imagem de São Jorge) e o Mercado Livre (actor pago, lento) rodava sozinho sempre que
// as vitrines locais não cobriam. Agora a frase solta passa pelo roteador primeiro, "não
// sei" é resposta legítima, e o ML só roda depois de um "sim".
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let prisma: typeof import("../src/lib/prisma").prisma;
let handleDeliveryMessage: typeof import("../src/lib/delivery-service").handleDeliveryMessage;
let setRouter: typeof import("../src/lib/adapters/ai").__setRouterInterpreterForTests;
let copy: typeof import("../src/lib/lia-copy");

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5506${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
const CACHE_KEYS = ["ml:v2:caixa de som jbl"];
const outbox: { to: string; text: string }[] = [];
let dbOk = false;
let seq = 0;
let phoneSeq = 0;
let routerCalls: string[] = [];

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}

async function customer() {
  const phone = newPhone();
  await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: "Rua das Flores, 123, Bela Vista, São Paulo - SP" } });
  return {
    phone,
    async send(text: string): Promise<string> {
      const start = outbox.length;
      await handleDeliveryMessage({ phone, text, messageId: `cfl_${RUN}_${++seq}` });
      return outbox.slice(start).filter((m) => m.to === phone).map((m) => m.text).join("\n---\n");
    },
    async ctx() {
      const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
      const convo = await prisma.conversation.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
      return JSON.parse(convo?.context ?? "{}") as { step?: string; pending?: unknown[]; longTailOffer?: unknown; basket?: unknown[] };
    }
  };
}

before(async () => {
  await import("./helpers/load-env");
  process.env.LIA_ENABLE_MERCADOLIVRE = "true";
  process.env.APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || "apify_test_token";
  process.env.LIA_LONGTAIL_OPTIN = "true";
  process.env.LIA_CLASSIFY_FIRST = "true";
  ({ prisma } = await import("../src/lib/prisma"));
  const adapters = await import("../src/lib/adapters/whatsapp");
  ({ handleDeliveryMessage } = await import("../src/lib/delivery-service"));
  ({ __setRouterInterpreterForTests: setRouter } = await import("../src/lib/adapters/ai"));
  copy = await import("../src/lib/lia-copy");
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
    console.warn("⚠️  Banco indisponível — testes de classificação/cauda longa serão pulados.");
    return;
  }
  // Produto EXCLUSIVO deste arquivo: os testes de ML rodam em paralelo no mesmo banco e
  // apagam as próprias chaves de cache no after() — chave compartilhada vira corrida.
  const caixa = {
    sku: "ml-MLB300000003",
    name: "Caixa de Som JBL Bluetooth Portátil",
    brand: "JBL",
    unitPrice: 250,
    productUrl: "https://produto.mercadolivre.com.br/MLB-300000003-caixa-de-som-jbl",
    mlPosition: 1
  };
  await prisma.searchCache.upsert({
    where: { queryKey: "ml:v2:caixa de som jbl" },
    create: { queryKey: "ml:v2:caixa de som jbl", query: "caixa de som jbl", source: "mercado_livre", items: [caixa] as unknown as object },
    update: { items: [caixa] as unknown as object }
  });
});

after(async () => {
  setRouter(null);
  if (!dbOk) return;
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.message.deleteMany({ where: { conversation: { userId: { in: ids } } } });
    await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.searchCache.deleteMany({ where: { queryKey: { in: CACHE_KEYS } } });
  await prisma.$disconnect();
});

// ---------- classificar antes de buscar ----------

test("frase social é classificada ANTES da busca: 'seu Jorge aqui' não vira produto", async (t) => {
  if (!dbOk) return t.skip();
  routerCalls = [];
  setRouter(async ({ text }) => {
    routerCalls.push(text);
    return { action: "smalltalk", reply: "Prazer, Jorge! Me diz o que você precisa hoje." };
  });
  const c = await customer();
  const out = await c.send("seu Jorge aqui, tudo bem?");
  assert.equal(routerCalls.length, 1, "o roteador tem que rodar primeiro");
  assert.match(out, /Prazer, Jorge/);
  assert.doesNotMatch(out, /opç(ões|ão)|Responde \*1\*|Imagem/i, `virou busca: ${out.slice(0, 200)}`);
  const ctx = await c.ctx();
  assert.equal(ctx.pending, undefined);
});

test("lista de compras evidente NÃO paga o classificador: vai direto pra busca", async (t) => {
  if (!dbOk) return t.skip();
  routerCalls = [];
  setRouter(async ({ text }) => {
    routerCalls.push(text);
    return { action: "unknown" };
  });
  const c = await customer();
  const out = await c.send("2 arroz e 1 leite");
  assert.equal(routerCalls.length, 0, "lista com quantidades não passa pela IA");
  assert.match(out, /arroz/i);
});

test("pergunta que nem a IA entende recebe 'não sei', não uma busca", async (t) => {
  if (!dbOk) return t.skip();
  setRouter(async () => ({ action: "unknown" }));
  const c = await customer();
  const out = await c.send("vocês patrocinam eventos esportivos?");
  assert.equal(out, copy.questionNotUnderstood());
});

// ---------- cauda longa opt-in ----------

test("item sem vitrine local vira PERGUNTA; 'sim' busca no Mercado Livre e mostra as opções", async (t) => {
  if (!dbOk) return t.skip();
  setRouter(async () => null);
  const c = await customer();
  const offer = await c.send("quero uma caixa de som jbl");
  assert.match(offer, /Mercado Livre/, `sem oferta: ${offer.slice(0, 300)}`);
  assert.match(offer, /\*sim\*/);
  assert.doesNotMatch(offer, /Caixa de Som JBL/, "o ML não pode rodar antes do sim");
  let ctx = await c.ctx();
  assert.ok(ctx.longTailOffer, "oferta tem que ficar guardada no contexto");

  const found = await c.send("sim");
  assert.match(found, /Caixa de Som JBL/i, `ML não rodou depois do sim: ${found.slice(0, 300)}`);
  ctx = await c.ctx();
  assert.equal(ctx.step, "choosing");
  assert.equal(ctx.longTailOffer, undefined);
});

test("'não' à oferta limpa e deixa de fora, sem busca", async (t) => {
  if (!dbOk) return t.skip();
  setRouter(async () => null);
  const c = await customer();
  await c.send("quero uma caixa de som jbl");
  const out = await c.send("não precisa");
  assert.equal(out, copy.longTailDeclined());
  const ctx = await c.ctx();
  assert.equal(ctx.longTailOffer, undefined);
  assert.equal(ctx.pending, undefined);
});

test("kill-switch: LIA_LONGTAIL_OPTIN=false volta ao resgate automático", async (t) => {
  if (!dbOk) return t.skip();
  setRouter(async () => null);
  process.env.LIA_LONGTAIL_OPTIN = "false";
  try {
    const c = await customer();
    const out = await c.send("quero uma caixa de som jbl");
    assert.match(out, /Caixa de Som JBL/i, `resgate automático não rodou: ${out.slice(0, 300)}`);
  } finally {
    process.env.LIA_LONGTAIL_OPTIN = "true";
  }
});
