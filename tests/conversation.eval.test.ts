// End-to-end conversation evals: drives handleDeliveryMessage exactly like the
// WhatsApp webhook does and asserts on what Lia replies. Uses the real database
// (unique test phone numbers, cleaned up at the end), the mock WhatsApp provider,
// the deterministic NLU fallback (no OpenAI) and mock couriers/Pix — so the whole
// flow runs offline-ish and repeatably. Run: npm test
import "./helpers/load-env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage } from "../src/lib/delivery-service";
import { getStore } from "../src/lib/stores";
import { scoreCatalogMatch } from "../src/lib/stores/types";
import { seedGeoCache } from "../src/lib/geo";

// Geo é semeado (sem rede) pros CEPs que os evals usam, senão pickNearestUnit geocodificaria
// via BrasilAPI/Nominatim a cada turno — lento e flaky. Coords aproximadas bastam (guarda 12km).
seedGeoCache("01310100", { lat: -23.5614, lng: -46.6559 }); // Av. Paulista (SP capital)
seedGeoCache("04538132", { lat: -23.586, lng: -46.679 }); // Itaim Bibi (SP capital)
seedGeoCache("06233030", { lat: -23.5329, lng: -46.792 }); // Osasco (~5km de Tamboré)
seedGeoCache("07500000", { lat: -23.317, lng: -46.221 }); // Santa Isabel (~40km, longe demais)

const PREFIX = "+5500991";
// Unique per run so a crashed/killed previous run can't collide (phones) nor trip
// the webhook dedupe (messageIds).
const RUN = `${Date.now().toString(36)}${process.pid}`;
let phoneSeq = 0;
let msgSeq = 0;
let dbOk = false;

const outbox: { to: string; text: string }[] = [];
// Capture everything Lia sends instead of hitting a real provider.
(whatsappAdapter as { sendMessage: unknown }).sendMessage = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};
(whatsappAdapter as { sendMedia: unknown }).sendMedia = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}

function driver(phone: string) {
  async function send(text: string): Promise<string> {
    const start = outbox.length;
    await handleDeliveryMessage({ phone, text, messageId: `eval_${RUN}_${++msgSeq}` });
    return outbox
      .slice(start)
      .filter((m) => m.to === phone)
      .map((m) => m.text)
      .join("\n---\n");
  }
  // Sends a message and auto-answers "1" while Lia is offering numbered options,
  // so scenarios that don't care about the choice reach the summary.
  async function sendAndResolve(text: string): Promise<string> {
    let transcript = await send(text);
    for (let i = 0; i < 6 && /Responde \*1\*/.test(transcript); i++) {
      transcript += "\n---\n" + (await send("1"));
    }
    return transcript;
  }
  return { send, sendAndResolve };
}

// Creates a user that already finished onboarding (saved CEP), like a returning customer.
async function returningCustomer() {
  const phone = newPhone();
  await prisma.user.create({ data: { phone, cep: "01310-100" } });
  return { phone, ...driver(phone) };
}

// Pick a real catalog item the deterministic matcher will resolve, so scenarios
// adapt to catalog changes instead of hardcoding product names.
// Names with "," or " e " would be split by the deterministic line parser — skip those.
function cleanName(name: string): boolean {
  return !/,|\se\s|^\d/i.test(name);
}

function expensiveItemQuery(): { query: string; qty: number } {
  const catalog = getStore("carrefour").listCatalog();
  const item =
    catalog.find((i) => i.unitPrice >= 20 && i.unitPrice <= 80 && cleanName(i.name)) ?? catalog[0];
  const qty = Math.max(1, Math.ceil(60 / item.unitPrice));
  return { query: item.name, qty };
}

function cheapItemQuery(): string {
  const catalog = getStore("carrefour").listCatalog();
  const item = catalog
    .filter((i) => i.unitPrice > 2 && i.unitPrice < 10 && cleanName(i.name))
    .sort((a, b) => a.unitPrice - b.unitPrice)[0];
  return item?.name ?? "sabonete";
}

async function wipeTestData() {
  await prisma.waitlistLead.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  const convos = await prisma.conversation.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const convoIds = convos.map((c) => c.id);
  await prisma.message.deleteMany({ where: { conversationId: { in: convoIds } } });
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { id: { in: convoIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    await wipeTestData(); // leftovers from a crashed previous run
  } catch {
    dbOk = false;
    console.warn("⚠️  Banco indisponível — evals de conversa serão pulados.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipeTestData();
  await prisma.$disconnect();
});

test("saudação: sem CEP pede o CEP; com CEP se apresenta e pede itens", async (t) => {
  if (!dbOk) return t.skip();
  const fresh = driver(newPhone());
  const hello = await fresh.send("oi");
  assert.match(hello, /CEP/);
  const back = await returningCustomer();
  const hi = await back.send("bom dia");
  assert.match(hi, /Lia/);
  assert.doesNotMatch(hi, /Procurando/);
});

test("onboarding: pedido antes do CEP anota itens, CEP destrava a cotação", async (t) => {
  if (!dbOk) return t.skip();
  const { query, qty } = expensiveItemQuery();
  const d = driver(newPhone());
  const first = await d.send(`quero ${qty} ${query}`);
  assert.match(first, /CEP/);
  assert.match(first, /anotei/i);
  let quoted = await d.send("01310-100");
  assert.match(quoted, /Endereço salvo/);
  for (let i = 0; i < 6 && /Responde \*1\*/.test(quoted); i++) quoted += "\n---\n" + (await d.send("1"));
  assert.match(quoted, /Seu pedido|mínimo/);
});

test("multi-item com quantidade: '2 X e 1 Y' vira cesta com 2x", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const transcript = await c.sendAndResolve("2 arroz e 1 oleo de soja");
  assert.match(transcript, /Procurando/);
  assert.match(transcript, /2x /);
  assert.match(transcript, /Total: R\$|mínimo/);
});

test("produto ambíguo: mostra opções numeradas; 'mais barato' escolhe a mais barata", async (t) => {
  if (!dbOk) return t.skip();
  const store = getStore("carrefour");
  const candidates = ["leite", "arroz", "refrigerante", "sabonete", "cafe"];
  let ambiguous: string | undefined;
  let options: { name: string; unitPrice: number }[] = [];
  for (const q of candidates) {
    const found = await store.searchItems(q, 3);
    if (found.length >= 2) {
      ambiguous = q;
      options = found;
      break;
    }
  }
  assert.ok(ambiguous, "nenhuma query ambígua no catálogo?");
  const c = await returningCustomer();
  const offer = await c.send(`quero ${ambiguous}`);
  assert.match(offer, /opções/);
  assert.match(offer, /\*1\)\*/);
  const cheapest = options.reduce((best, o) => (o.unitPrice < best.unitPrice ? o : best));
  const picked = await c.send("o mais barato");
  assert.ok(picked.includes(cheapest.name), `esperava ${cheapest.name} em: ${picked.slice(0, 200)}`);
});

test("remover item: 'tira o X' recalcula a cesta; cesta vazia é comunicada", async (t) => {
  if (!dbOk) return t.skip();
  const { query, qty } = expensiveItemQuery();
  const c = await returningCustomer();
  await c.sendAndResolve(`${qty} ${query}`);
  const removed = await c.send(`tira o ${query.split(" ")[0]}`);
  assert.match(removed, /tirei/i);
});

test("trocar item: 'troca X por Y' remove e busca o novo", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.sendAndResolve("2 arroz");
  const swapped = await c.sendAndResolve("troca o arroz por feijao");
  assert.match(swapped, /Troquei|tirei/i);
  assert.match(swapped, /feij|Feij|Seu pedido|opções/);
});

test("pedido mínimo: item barato + 'pagar' avisa quanto falta", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.sendAndResolve(cheapItemQuery());
  const pay = await c.send("pagar");
  assert.match(pay, /mínimo/);
  assert.match(pay, /Falta|falta/);
});

// ---- cadeia de pagamento (mesmo cliente do início ao fim) ----
let payer: { phone: string; send: (t: string) => Promise<string>; sendAndResolve: (t: string) => Promise<string> };

test("pagar com Pix: resumo → pagar → escolher pix → copia-e-cola", async (t) => {
  if (!dbOk) return t.skip();
  payer = await returningCustomer();
  const { query, qty } = expensiveItemQuery();
  const summary = await payer.sendAndResolve(`${qty} ${query}`);
  assert.match(summary, /Total: R\$/);
  const methods = await payer.send("pagar");
  assert.match(methods, /Como prefere pagar/);
  assert.match(methods, /Pix/);
  assert.match(methods, /Cartão/);
  const pix = await payer.send("pix");
  assert.match(pix, /copia e cola/i);
  assert.match(pix, /MOCKPIX/);
  assert.match(pix, /paguei/); // dica de sandbox
});

test("'paguei' confirma (sandbox) e pagamento duplicado é tratado com calma", async (t) => {
  if (!dbOk) return t.skip();
  const confirm = await payer.send("paguei");
  assert.match(confirm, /Pagamento confirmado/);
  const dup = await payer.send("paguei");
  assert.match(dup, /já está confirmado|já recebi/i);
});

test("status: responde o estado real do pedido", async (t) => {
  if (!dbOk) return t.skip();
  const status = await payer.send("cade meu pedido?");
  assert.match(status, /#\w{6}/);
  assert.match(status, /separando/);
});

test("pedido anterior: 'repete o de sempre' remonta a última cesta", async (t) => {
  if (!dbOk) return t.skip();
  const again = await payer.send("repete o de sempre");
  assert.match(again, /Seu pedido|mínimo/);
  await payer.send("limpar carrinho");
});

test("item não encontrado: resposta honesta com sugestão de reformular", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const resp = await c.send("quero criptonita galactica");
  assert.match(resp, /Não achei|Não entendi/);
});

test("remédio: recusa educada citando a lei, mesmo sem OpenAI", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const resp = await c.send("quero dipirona");
  assert.match(resp, /Remédio|farmácia/);
  assert.doesNotMatch(resp, /Não achei/);
});

test("cancelar antes de pagar: cancela na hora sem cobrança", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const { query, qty } = expensiveItemQuery();
  await c.sendAndResolve(`${qty} ${query}`);
  await c.send("pagar");
  await c.send("pix");
  const cancel = await c.send("cancelar");
  assert.match(cancel, /cancelei/i);
  const order = await prisma.deliveryOrder.findFirst({
    where: { phone: c.phone },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(order?.status, "canceled");
  const status = await c.send("status");
  assert.match(status, /cancelado/);
});

test("pagar com cartão: link com taxa embutida (total maior que o Pix)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const { query, qty } = expensiveItemQuery();
  await c.sendAndResolve(`${qty} ${query}`);
  const methods = await c.send("pagar");
  const totals = [...methods.matchAll(/R\$ (\d+,\d{2})/g)].map((m) => Number(m[1].replace(",", ".")));
  assert.ok(totals.length >= 2 && totals[1] > totals[0], `cartão deve custar mais que pix: ${methods}`);
  const card = await c.send("cartão");
  assert.match(card, /mock\.lia|http/);
  assert.match(card, /cartão/);
});

test("trocar endereço: pede o novo CEP e atualiza", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const ask = await c.send("quero trocar meu endereço");
  assert.match(ask, /CEP/);
  const updated = await c.send("04538-132");
  assert.match(updated, /atualizado|salvo/i);
  const user = await prisma.user.findUnique({ where: { phone: c.phone } });
  assert.equal(user?.cep, "04538-132");
});

test("cobertura: CEP fora da área não vira pedido — entra na lista de espera", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer(); // já tem 01310-100 (SP capital)
  const reply = await c.send("50030-000"); // Recife — CEP puro = troca de endereço
  assert.match(reply, /não chega|anotei|espera/i);
  // não sobrescreveu o CEP coberto que ele já tinha
  const user = await prisma.user.findUnique({ where: { phone: c.phone } });
  assert.equal(user?.cep, "01310-100");
  // gravou o lead pra virar demanda no /ops
  const lead = await prisma.waitlistLead.findFirst({ where: { phone: c.phone, cep: "50030-000" } });
  assert.ok(lead, "esperava um lead na lista de espera");
});

test("cobertura: CEP de SP capital passa normal", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const updated = await c.send("04538-132"); // Itaim Bibi, SP capital
  assert.match(updated, /atualizado|salvo/i);
  const user = await prisma.user.findUnique({ where: { phone: c.phone } });
  assert.equal(user?.cep, "04538-132");
});

function withPreset(preset: string, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.LIA_COVERAGE_PRESET;
  process.env.LIA_COVERAGE_PRESET = preset;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.LIA_COVERAGE_PRESET;
    else process.env.LIA_COVERAGE_PRESET = prev;
  });
}

test("Grande SP: Osasco é aceito (cobre + guarda de distância passa)", async (t) => {
  if (!dbOk) return t.skip();
  await withPreset("grande-sp", async () => {
    const phone = newPhone();
    const d = driver(phone);
    await d.send("oi, quero arroz"); // onboarding → pede CEP
    const r = await d.sendAndResolve("06233-030"); // Osasco (~5km de Tamboré)
    assert.ok(!/longe demais|não chega/i.test(r), `recusou Osasco indevidamente: ${r.slice(0, 160)}`);
    const user = await prisma.user.findUnique({ where: { phone } });
    assert.equal(user?.cep, "06233-030"); // CEP salvo = passou nas duas travas
  });
});

test("guarda de frete: cidade coberta mas longe demais → recusa + lead too_far", async (t) => {
  if (!dbOk) return t.skip();
  await withPreset("grande-sp", async () => {
    const c = await returningCustomer(); // tem 01310-100
    const r = await c.send("07500-000"); // Santa Isabel: coberta na RMSP, ~40km de qualquer loja
    assert.match(r, /longe demais|lojas parceiras|anotei/i);
    const user = await prisma.user.findUnique({ where: { phone: c.phone } });
    assert.equal(user?.cep, "01310-100"); // NÃO trocou pro CEP longe
    const lead = await prisma.waitlistLead.findFirst({ where: { phone: c.phone, cep: "07500-000" } });
    assert.equal(lead?.reason, "too_far");
  });
});

function optionNames(transcript: string): string[] {
  return [...transcript.matchAll(/\*\d\)\* (.+?) — R\$/g)].map((m) => m[1]);
}

test("escolhendo: 'tem outras?' mostra as PRÓXIMAS opções, nunca as mesmas", async (t) => {
  if (!dbOk) return t.skip();
  const store = getStore("carrefour");
  let query: string | undefined;
  for (const q of ["leite", "arroz", "cafe", "sabonete", "refrigerante"]) {
    if ((await store.searchItems(q, 9)).length >= 6) {
      query = q;
      break;
    }
  }
  assert.ok(query, "nenhuma query com 6+ opções no catálogo?");
  const c = await returningCustomer();
  const first = await c.send(`quero ${query}`);
  const firstNames = optionNames(first);
  assert.ok(firstNames.length >= 2, `esperava opções: ${first.slice(0, 200)}`);
  const more = await c.send("acha outras, por favor.");
  assert.match(more, /Mais opções/);
  const moreNames = optionNames(more);
  assert.ok(moreNames.length > 0, `esperava novas opções: ${more.slice(0, 200)}`);
  for (const name of moreNames) {
    assert.ok(!firstNames.includes(name), `opção repetida na paginação: ${name}`);
  }
});

test("escolhendo: 'tem de Xkg?' refina de verdade ou responde honesto", async (t) => {
  if (!dbOk) return t.skip();
  const store = getStore("carrefour");
  // Derive a (base, weight) pair from the catalog so the test adapts to catalog changes.
  let pair: { base: string; attr: string } | undefined;
  for (const item of store.listCatalog()) {
    const m = item.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .match(/\b(\d+(?:kg|g|l|ml))\b/);
    if (!m) continue;
    const base = item.name.split(/\s+/)[0].toLowerCase();
    if (base.length < 4 || /[^a-zà-ú]/i.test(base)) continue;
    if ((await store.searchItems(base, 3)).length < 2) continue;
    const refined = (await store.searchItems(`${base} ${m[1]}`, 6)).filter((o) => scoreCatalogMatch(m[1], o) > 0);
    if (refined.length >= 1) {
      pair = { base, attr: m[1] };
      break;
    }
  }
  assert.ok(pair, "nenhum par base+peso no catálogo?");
  const c = await returningCustomer();
  const first = await c.send(`quero ${pair.base}`);
  assert.ok(optionNames(first).length >= 2, `esperava opções: ${first.slice(0, 200)}`);
  const refinedReply = await c.send(`tem de ${pair.attr}?`);
  // The refined list must actually contain the attribute — never the same list re-sent.
  assert.match(refinedReply.toLowerCase(), new RegExp(pair.attr), `refino não trouxe ${pair.attr}: ${refinedReply.slice(0, 300)}`);
  assert.doesNotMatch(refinedReply, /Não peguei/);

  // And an attribute that doesn't exist gets an HONEST answer (not a fake refresh).
  const azul = (await store.searchItems(`${pair.base} azul`, 6)).filter((o) => scoreCatalogMatch("azul", o) > 0);
  const colorReply = await c.send("tem essa em azul?");
  if (azul.length) {
    assert.match(colorReply.toLowerCase(), /azul/);
  } else {
    assert.match(colorReply, /não achei/i);
    assert.match(colorReply, /\*1\)\*/); // re-shows what exists
  }
});

test("webhook duplicado (retry do Twilio): mesma mensagem não processa duas vezes", async (t) => {
  if (!dbOk) return t.skip();
  const phone = newPhone();
  await prisma.user.create({ data: { phone, cep: "01310-100" } });
  const before = outbox.length;
  await handleDeliveryMessage({ phone, text: "2 arroz", messageId: "dup_1" });
  const afterFirst = outbox.length;
  await handleDeliveryMessage({ phone, text: "2 arroz", messageId: "dup_1" });
  assert.ok(afterFirst > before, "primeira mensagem deve responder");
  assert.equal(outbox.length, afterFirst, "retry com mesmo MessageSid não pode responder de novo");
});

test("social: obrigado e 'não era isso' têm respostas humanas, sem busca", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const thanks = await c.send("obrigado!");
  assert.doesNotMatch(thanks, /Procurando/);
  assert.match(thanks, /chamar|Imagina/i);
  const reject = await c.send("não era isso");
  assert.doesNotMatch(reject, /Procurando/);
  assert.match(reject, /outro jeito|marca/i);
});
