import { prisma } from "@/lib/prisma";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";
import { getStore, DEFAULT_STORE_KEY, pickStoreForQueries, type StoreConnector } from "@/lib/stores";
import { queryTokens, scoreCatalogMatch } from "@/lib/stores/types";
import { getCourier, quoteAll } from "@/lib/couriers";
import { checkoutAdapter, pixAdapter } from "@/lib/payments/mercadopago";
import { extractShoppingList } from "@/lib/adapters/ai";

// The operational brain of the remodelled Lia. One conversation = one basket of
// everyday items, fulfilled from a pluggable store via clique-e-retire + courier.
// This module owns the WhatsApp conversation state machine AND the order lifecycle
// the operator dashboard drives.

// Your margin is baked into the product price (no separate fee line). Customer sees
// each item already +10%; you pay Carrefour the real price, the markup is yours.
const MARKUP = Number(process.env.LIA_PRICE_MARKUP ?? 1.1);

// Card MDR (~4.99% à vista) passed through to the customer when they choose card, so the
// 10% margin survives. Gross-up: charged = net / (1 - mdr). Tunable via env as volume
// lowers the rate. Pix has no fee, so its total is the base.
const CARD_MDR = Math.min(0.3, Math.max(0, Number(process.env.LIA_CARD_MDR ?? 0.0499)));
function cardTotal(base: number): number {
  return Math.round((base / (1 - CARD_MDR)) * 100) / 100;
}

type BasketItem = {
  sku: string;
  name: string;
  brand?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  storeKey: string;
  storeLabel: string;
};

type ChoiceOption = { sku: string; name: string; brand?: string; unitPrice: number; imageUrl?: string };
type PendingChoice = { query: string; qty: number; options: ChoiceOption[] };

// A frete option the customer can pick between (cheapest vs fastest courier).
type CourierOption = { kind: "barato" | "rapido"; courierKey: string; quoteId: string; fee: number; etaMinutes: number };

type DeliveryContext = {
  flow?: "delivery";
  step?: "collecting" | "need_cep" | "choosing" | "quoted" | "choosing_courier" | "choosing_payment" | "awaiting_payment";
  basket?: BasketItem[];
  pending?: PendingChoice[];
  courierOptions?: CourierOption[];
  storeKey?: string;
  notFound?: string[];
  cep?: string;
  deliveryAddress?: string;
  storeUnitId?: string;
  storeUnitLabel?: string;
  storeUnitAddress?: string;
  deliveryFee?: number;
  etaMinutes?: number;
  courierQuoteId?: string;
  courierKey?: string;
  serviceFee?: number;
  itemsSubtotal?: number;
  total?: number;
  deliveryOrderId?: string;
};

// ---------- helpers: conversation + money + text ----------

export function normalizePhone(phone?: string) {
  if (!phone) return "+550000000000";
  const cleaned = phone.replace("whatsapp:", "").trim();
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  return `+${digits}`;
}

function brl(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function normalize(input: string) {
  return (input ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

async function getOrCreateConvo(phone: string, name?: string) {
  const user = await prisma.user.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name }
  });
  let convo = await prisma.conversation.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { updatedAt: "desc" }
  });
  if (!convo) {
    convo = await prisma.conversation.create({
      data: { userId: user.id, status: "active", currentStep: "delivery" }
    });
  }
  return { user, convo };
}

function readCtx(context: string | null): DeliveryContext {
  try {
    return context ? (JSON.parse(context) as DeliveryContext) : {};
  } catch {
    return {};
  }
}

async function writeCtx(convoId: string, ctx: DeliveryContext) {
  await prisma.conversation.update({
    where: { id: convoId },
    data: { context: JSON.stringify(ctx), currentStep: ctx.step ?? "delivery" }
  });
}

async function reply(phone: string, text: string) {
  await whatsappAdapter.sendMessage(phone, text);
}

// ---------- basket parsing + catalog matching ----------

function parseBasketLines(text: string): { phrase: string; qty: number }[] {
  return text
    .replace(/\bquero\b|\bme manda\b|\bmanda\b|\bpreciso de\b|\bpode ser\b/gi, "")
    .split(/[,\n;]|\s+e\s+/i)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 1)
    .map((raw) => {
      const m = raw.match(/^(\d+)\s*(?:x|un|unidades?)?\s+(.*)$/i);
      if (m) return { phrase: m[2].trim(), qty: Math.max(1, Number(m[1])) };
      return { phrase: raw, qty: 1 };
    });
}

type BasketResult = { basket: BasketItem[]; notFound: string[]; greetingOnly: boolean; containsMedicine: boolean };

async function buildBasket(text: string, store: StoreConnector): Promise<BasketResult> {
  // 1. Clean the request into a shopping list. The LLM handles greetings, synonyms
  //    ("pasta de dente"->creme dental), medicines and quantities. Falls back to a
  //    deterministic line splitter when OpenAI is off.
  const extraction = await extractShoppingList(text);
  let lines: { phrase: string; qty: number }[];
  let greetingOnly = false;
  let containsMedicine = false;
  if (extraction) {
    greetingOnly = extraction.greetingOnly;
    containsMedicine = extraction.containsMedicine;
    lines = extraction.items.map((item) => ({ phrase: item.query, qty: item.qty }));
  } else {
    lines = parseBasketLines(text).filter((line) => queryTokens(line.phrase).length);
  }

  // 2. Search each item in the live Carrefour catalog (or seed) — in parallel so a
  //    multi-item basket costs one scrape's latency, not the sum.
  const results = await Promise.all(
    lines.map(async (line) => ({ line, best: (await store.searchItems(line.phrase, 1))[0] }))
  );
  const basket: BasketItem[] = [];
  const notFound: string[] = [];
  for (const { line, best } of results) {
    if (best) {
      basket.push({
        sku: best.sku,
        name: best.name,
        brand: best.brand,
        qty: line.qty,
        unitPrice: best.unitPrice,
        lineTotal: Math.round(best.unitPrice * line.qty * 100) / 100,
        storeKey: store.key,
        storeLabel: store.label
      });
    } else {
      notFound.push(line.phrase);
    }
  }

  return {
    basket: dedupeBasket(basket),
    notFound,
    greetingOnly: greetingOnly && basket.length === 0,
    containsMedicine
  };
}

function dedupeBasket(items: BasketItem[]): BasketItem[] {
  const out: BasketItem[] = [];
  for (const item of items) {
    const found = out.find((x) => x.sku === item.sku);
    if (found) {
      found.qty += item.qty;
      found.lineTotal = Math.round(found.unitPrice * found.qty * 100) / 100;
    } else {
      out.push(item);
    }
  }
  return out;
}

type ChoicesResult = {
  store: StoreConnector;
  autoAdded: BasketItem[];
  pending: PendingChoice[];
  notFound: string[];
  greetingOnly: boolean;
  containsMedicine: boolean;
};

// Like buildBasket, but instead of auto-picking the top match it returns up to 3
// OPTIONS per item so the customer chooses (numbered list — tappable buttons need an
// approved WhatsApp Business sender). Items with a single match are auto-added.
async function buildChoices(text: string, lockedStoreKey?: string): Promise<ChoicesResult> {
  const extraction = await extractShoppingList(text);
  let lines: { phrase: string; qty: number }[];
  let greetingOnly = false;
  let containsMedicine = false;
  if (extraction) {
    greetingOnly = extraction.greetingOnly;
    containsMedicine = extraction.containsMedicine;
    lines = extraction.items.map((item) => ({ phrase: item.query, qty: item.qty }));
  } else {
    lines = parseBasketLines(text).filter((line) => queryTokens(line.phrase).length);
  }

  // One order = one store. If the order already has a store (items added earlier),
  // stay on it; otherwise pick the store that best covers this basket.
  const store = lockedStoreKey ? getStore(lockedStoreKey) : await pickStoreForQueries(lines.map((l) => l.phrase));

  const results = await Promise.all(
    lines.map(async (line) => ({ line, options: await store.searchItems(line.phrase, 3) }))
  );
  const autoAdded: BasketItem[] = [];
  const pending: PendingChoice[] = [];
  const notFound: string[] = [];
  for (const { line, options } of results) {
    if (!options.length) {
      notFound.push(line.phrase);
    } else if (options.length === 1) {
      autoAdded.push(choiceToBasketItem(options[0], line.qty, store));
    } else {
      pending.push({
        query: line.phrase,
        qty: line.qty,
        options: options.slice(0, 3).map((o) => ({ sku: o.sku, name: o.name, brand: o.brand, unitPrice: o.unitPrice, imageUrl: o.imageUrl }))
      });
    }
  }
  return {
    store,
    autoAdded: dedupeBasket(autoAdded),
    pending,
    notFound,
    greetingOnly: greetingOnly && autoAdded.length === 0 && pending.length === 0,
    containsMedicine
  };
}

// The store an in-progress order belongs to (picked when the basket was built).
function orderStore(ctx: DeliveryContext): StoreConnector {
  return getStore(ctx.storeKey ?? ctx.basket?.[0]?.storeKey ?? DEFAULT_STORE_KEY);
}

function choiceToBasketItem(o: ChoiceOption, qty: number, store: StoreConnector): BasketItem {
  return {
    sku: o.sku,
    name: o.name,
    brand: o.brand,
    qty,
    unitPrice: o.unitPrice,
    lineTotal: Math.round(o.unitPrice * qty * 100) / 100,
    storeKey: store.key,
    storeLabel: store.label
  };
}

// Customer-facing options message (prices already marked up; no store name).
function choicesText(p: PendingChoice): string {
  const opts = p.options.map((o, i) => `*${i + 1})* ${o.name} — ${brl(Math.round(o.unitPrice * MARKUP * 100) / 100)}`);
  const nums = p.options.map((_, i) => i + 1);
  const ask = nums.length <= 1 ? "Responda *1*" : `Responda *${nums.slice(0, -1).join("*, *")}* ou *${nums[nums.length - 1]}*`;
  return [`Achei essas opções de *${p.query}*:`, ...opts, "", `${ask} pra escolher (ou *qualquer*). 🙂`].join("\n");
}

function askLine(p: PendingChoice): string {
  const nums = p.options.map((_, i) => i + 1);
  return nums.length <= 1
    ? "Responda *1* pra escolher (ou *qualquer*). 🙂"
    : `Responda *${nums.slice(0, -1).join("*, *")}* ou *${nums[nums.length - 1]}* pra escolher (ou *qualquer*). 🙂`;
}

async function replyPhoto(phone: string, text: string, imageUrl?: string) {
  if (imageUrl) await whatsappAdapter.sendMedia(phone, text, imageUrl);
  else await reply(phone, text);
}

// Show the (up to 3) options with a product PHOTO each (one image message per option),
// then the numbered prompt. Falls back to the single numbered-text message when photos
// are off (LIA_SEND_PHOTOS=false) or none of the options has an image.
async function sendChoices(phone: string, p: PendingChoice) {
  // Only lay out photos if at least one image can ACTUALLY be delivered (Petz's Akamai
  // CDN 403s Twilio, so those options use the clean single-list fallback, not per-item text).
  const withPhotos =
    process.env.LIA_SEND_PHOTOS !== "false" && p.options.some((o) => whatsappAdapter.canSendImage(o.imageUrl));
  if (!withPhotos) {
    await reply(phone, choicesText(p));
    return;
  }
  await reply(phone, `Achei essas opções de *${p.query}*:`);
  for (let i = 0; i < p.options.length; i++) {
    const o = p.options[i];
    await replyPhoto(phone, `*${i + 1})* ${o.name} — ${brl(Math.round(o.unitPrice * MARKUP * 100) / 100)}`, o.imageUrl);
  }
  await reply(phone, askLine(p));
}

async function expandCep(cep: string): Promise<string | undefined> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return undefined;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };
    if (data.erro) return undefined;
    return [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(", ");
  } catch {
    return undefined;
  }
}

// ---------- quote + summary ----------

async function quoteBasket(ctx: DeliveryContext, store: StoreConnector) {
  const unit = await store.nearestUnit(ctx.cep);
  // Quote every registered courier in parallel. Default to the CHEAPEST; if the FASTEST
  // is a different courier that costs more, offer the customer the choice (barato vs rápido).
  const pool = await quoteAll({
    pickupCep: unit.cep,
    dropoffCep: ctx.cep,
    pickupAddress: unit.address,
    dropoffAddress: ctx.deliveryAddress
  });
  const quotes = pool.length
    ? pool
    : [await getCourier(ctx.courierKey).quote({ pickupCep: unit.cep, dropoffCep: ctx.cep, pickupAddress: unit.address, dropoffAddress: ctx.deliveryAddress })];
  const cheapest = quotes.reduce((best, q) => (q.fee < best.fee ? q : best));
  const fastest = quotes.reduce((best, q) => (q.etaMinutes < best.etaMinutes ? q : best));

  // itemsSubtotal = real Carrefour cost (what the operator pays). serviceFee = the
  // 10% markup margin (yours; NOT shown to the customer as a line). The customer is
  // charged the marked-up products + the pass-through frete.
  const realSubtotal = (ctx.basket ?? []).reduce((sum, item) => sum + item.lineTotal, 0);
  const margin = Math.round(realSubtotal * (MARKUP - 1) * 100) / 100;
  ctx.storeUnitId = unit.id;
  ctx.storeUnitLabel = unit.label;
  ctx.storeUnitAddress = unit.address;
  ctx.serviceFee = margin;
  ctx.itemsSubtotal = Math.round(realSubtotal * 100) / 100;

  // Default: just use the CHEAPEST (the "fastest" option is only as trustworthy as each
  // courier's ETA, and some — e.g. Lalamove — don't return one). The barato-vs-rápido
  // choice is OFF unless LIA_OFFER_FRETE_CHOICE=true; flip it on once couriers expose a
  // reliable ETA. When on, only offer it for a genuine tradeoff (different courier that's
  // strictly quicker AND strictly pricier).
  const worthChoosing =
    process.env.LIA_OFFER_FRETE_CHOICE === "true" &&
    fastest.courierKey !== cheapest.courierKey &&
    fastest.etaMinutes < cheapest.etaMinutes &&
    fastest.fee > cheapest.fee + 0.001;
  ctx.courierOptions = worthChoosing
    ? [
        { kind: "barato", courierKey: cheapest.courierKey, quoteId: cheapest.quoteId, fee: cheapest.fee, etaMinutes: cheapest.etaMinutes },
        { kind: "rapido", courierKey: fastest.courierKey, quoteId: fastest.quoteId, fee: fastest.fee, etaMinutes: fastest.etaMinutes }
      ]
    : undefined;

  applyCourier(ctx, {
    courierKey: cheapest.courierKey,
    quoteId: cheapest.quoteId,
    fee: cheapest.fee,
    etaMinutes: cheapest.etaMinutes
  });
}

// Apply a chosen courier quote to the context (fee/eta/key/quoteId + recompute total).
function applyCourier(ctx: DeliveryContext, q: { courierKey: string; quoteId: string; fee: number; etaMinutes: number }) {
  ctx.deliveryFee = q.fee;
  ctx.etaMinutes = q.etaMinutes;
  ctx.courierQuoteId = q.quoteId;
  ctx.courierKey = q.courierKey;
  ctx.total = Math.round(((ctx.itemsSubtotal ?? 0) + (ctx.serviceFee ?? 0) + q.fee) * 100) / 100;
}

// After quoting: show the minimum-order nudge, the frete choice (barato/rápido), or the
// order summary — whichever applies. `prefix` is prepended (e.g. "Endereço salvo").
async function respondAfterQuote(phone: string, convoId: string, ctx: DeliveryContext, store: StoreConnector, prefix?: string) {
  const pre = prefix ? `${prefix}\n\n` : "";
  if (belowMinimum(ctx, store)) {
    ctx.step = "collecting";
    await writeCtx(convoId, ctx);
    await reply(phone, pre + minimumOrderText(ctx, store));
    return;
  }
  if ((ctx.courierOptions?.length ?? 0) >= 2) {
    ctx.step = "choosing_courier";
    await writeCtx(convoId, ctx);
    await reply(phone, pre + freteChoiceText(ctx));
    return;
  }
  ctx.step = "quoted";
  await writeCtx(convoId, ctx);
  await reply(phone, pre + summaryText(ctx));
}

// Frete choice: cheapest vs fastest (frete is pass-through, shown raw).
function freteChoiceText(ctx: DeliveryContext): string {
  const barato = ctx.courierOptions?.find((o) => o.kind === "barato");
  const rapido = ctx.courierOptions?.find((o) => o.kind === "rapido");
  const lines = ["Como prefere o frete? 🛵"];
  if (barato) lines.push(`*1)* Mais barato — ${brl(barato.fee)} · chega em ~${barato.etaMinutes} min`);
  if (rapido) lines.push(`*2)* Mais rápido — ${brl(rapido.fee)} · chega em ~${rapido.etaMinutes} min`);
  lines.push("", "Responde *1* (mais barato) ou *2* (mais rápido).");
  return lines.join("\n");
}

function summaryText(ctx: DeliveryContext): string {
  // Customer-facing prices already include the markup; no separate fee line.
  const lines = (ctx.basket ?? []).map(
    (item) => `• ${item.qty}x ${item.name} — ${brl(Math.round(item.unitPrice * MARKUP * item.qty * 100) / 100)}`
  );
  const produtos = Math.round(((ctx.itemsSubtotal ?? 0) + (ctx.serviceFee ?? 0)) * 100) / 100;
  const out = [
    "🛒 *Seu pedido:*",
    ...lines,
    "",
    `Produtos: ${brl(produtos)}`,
    `🛵 Frete (cotado agora): ${brl(ctx.deliveryFee ?? 0)} · chega em ~${ctx.etaMinutes ?? 40} min`,
    `*Total: ${brl(ctx.total ?? 0)}*`
  ];
  if (ctx.notFound?.length) {
    out.push("", `_Não achei: ${ctx.notFound.join(", ")} (me fala de outro jeito que eu procuro)._`);
  }
  out.push("", "Pode confirmar? Responda *pagar* que eu fecho o pedido. 💚");
  return out.join("\n");
}

// Pix (no fee) vs card (fee passed through). Shown after the customer confirms "pagar".
function paymentMethodText(ctx: DeliveryContext): string {
  const base = ctx.total ?? 0;
  return [
    "Como prefere pagar? 💳",
    `• *Pix* — ${brl(base)} _(sem taxa)_`,
    `• *Cartão* — ${brl(cardTotal(base))} _(já com a taxa do cartão)_`,
    "",
    "Responde *Pix* ou *cartão*."
  ].join("\n");
}

// Minimum order is a PER-STORE rule (e.g., Carrefour clique-e-retire ≈ R$30 of
// products), declared on the StoreConnector — NOT a global Lia rule. A store with no
// minimum sets 0 and this never triggers. min is on the real cost (what we pay the
// store); the customer is shown the marked-up equivalent.
function storeMinReal(store: StoreConnector): number {
  return store.minOrder ?? 0;
}
function belowMinimum(ctx: DeliveryContext, store: StoreConnector): boolean {
  const min = storeMinReal(store);
  return min > 0 && (ctx.itemsSubtotal ?? 0) < min;
}
function minimumOrderText(ctx: DeliveryContext, store: StoreConnector): string {
  const displayMin = Math.round(storeMinReal(store) * MARKUP * 100) / 100;
  const produtos = Math.round(((ctx.itemsSubtotal ?? 0) + (ctx.serviceFee ?? 0)) * 100) / 100;
  const falta = Math.max(0, Math.round((displayMin - produtos) * 100) / 100);
  const lines = (ctx.basket ?? []).map(
    (item) => `• ${item.qty}x ${item.name} — ${brl(Math.round(item.unitPrice * MARKUP * item.qty * 100) / 100)}`
  );
  return [
    "🛒 *Seu pedido até agora:*",
    ...lines,
    "",
    `Produtos: ${brl(produtos)}`,
    "",
    `O pedido mínimo é de *${brl(displayMin)}* em produtos. Falta *${brl(falta)}* — me manda mais alguns itens que eu fecho o pedido! 🙂`
  ].join("\n");
}

// ---------- the WhatsApp conversation state machine ----------

export async function handleDeliveryMessage(input: { phone?: string; text: string; name?: string }) {
  const phone = normalizePhone(input.phone);
  const text = (input.text ?? "").trim();
  const normalized = normalize(text);
  const { user, convo } = await getOrCreateConvo(phone, input.name);
  const ctx = readCtx(convo.context);
  const store = getStore(DEFAULT_STORE_KEY);

  await prisma.message.create({ data: { conversationId: convo.id, sender: "user", text } });

  // Auto-expire a stale cart: if the last activity was over 30 min ago, start fresh
  // (keep only the saved address) so a leftover basket from a previous session doesn't
  // bleed into a new order — the reported "old items still there" problem.
  const CART_TTL_MS = Number(process.env.LIA_CART_TTL_MS ?? 30 * 60 * 1000);
  if (ctx.basket?.length && convo.updatedAt && Date.now() - new Date(convo.updatedAt).getTime() > CART_TTL_MS) {
    const keptCep = ctx.cep;
    const keptAddr = ctx.deliveryAddress;
    for (const key of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[key];
    ctx.flow = "delivery";
    ctx.cep = keptCep;
    ctx.deliveryAddress = keptAddr;
  }

  // Global "clear the cart" command — broad on purpose ("limpar carrinho", "zerar",
  // "novo pedido", "tira tudo", "tira os anteriores", "começar de novo", …) so the
  // customer can always start fresh without hunting for the exact word.
  const clearCart =
    /\b(cancelar|cancela tudo|recome[cç]ar|come[cç]ar de novo|novo pedido|outro pedido)\b/.test(normalized) ||
    /\b(zera|zerar)\b/.test(normalized) ||
    /\b(limpa|limpar)\s+(o\s+|a\s+)?(carrinho|cesta|pedido|tudo|lista)\b/.test(normalized) ||
    /\b(tira|tirar|remove|remover|apaga|apagar|esquece|esquecer)\s+(o\s+|os\s+|a\s+|as\s+)?(tudo|anteriores|antigos|de antes|carrinho|cesta)\b/.test(normalized);
  if (clearCart) {
    await writeCtx(convo.id, { flow: "delivery", cep: ctx.cep, deliveryAddress: ctx.deliveryAddress });
    await reply(phone, "Prontinho, limpei seu carrinho! 🧹 É só me dizer o que você quer agora. 🙂");
    return;
  }

  // Onboarding: the CEP/endereço is configured ONCE, up front, before any order.
  // After it's saved on the user, every future order reuses the same address.
  const savedCep = user.cep ?? ctx.cep;
  if (!savedCep) {
    const cepInMsg = (normalized.match(/\d{5}-?\d{3}/) ?? [])[0];
    if (cepInMsg) {
      ctx.cep = cepInMsg;
      ctx.deliveryAddress = (await expandCep(cepInMsg)) ?? ctx.deliveryAddress;
      await prisma.user.update({ where: { id: user.id }, data: { cep: cepInMsg } });
      ctx.flow = "delivery";
      if (ctx.basket?.length) {
        await quoteBasket(ctx, store);
        await respondAfterQuote(phone, convo.id, ctx, store, `📍 Endereço salvo: ${ctx.deliveryAddress ?? cepInMsg}.`);
      } else {
        ctx.step = "collecting";
        await writeCtx(convo.id, ctx);
        await reply(
          phone,
          `📍 Endereço salvo: ${ctx.deliveryAddress ?? cepInMsg}! Configurei uma vez e uso em todos os próximos pedidos. 💚\n\nAgora me diz o que você quer — ex.: *"guaraná, pasta de dente e papel higiênico"*.`
        );
      }
      return;
    }
    // No CEP yet: capture anything they already mentioned, then ask the CEP first.
    const built = await buildBasket(text, store);
    if (built.basket.length) ctx.basket = mergeBaskets(ctx.basket ?? [], built.basket);
    ctx.flow = "delivery";
    ctx.step = "need_cep";
    await writeCtx(convo.id, ctx);
    const note = built.basket.length
      ? `Já anotei:\n${built.basket.map((i) => `• ${i.qty}x ${i.name}`).join("\n")}\n\n`
      : "";
    await reply(
      phone,
      `Oi! 💚 Sou a Lia — faço suas compras do dia a dia e entrego em casa. ${note}Pra começar, qual seu *CEP*? Configuro uma vez só e uso em todos os pedidos. 📍`
    );
    return;
  }

  // Payment confirmation (sandbox: "paguei" approves; prod: MP webhook does it)
  if (ctx.step === "awaiting_payment" && /\b(paguei|pago|ja paguei|fiz o pix)\b/.test(normalized)) {
    if (ctx.deliveryOrderId) {
      await markDeliveryOrderPaid(ctx.deliveryOrderId);
    }
    await writeCtx(convo.id, {});
    return;
  }

  // Customer is choosing the frete (cheapest vs fastest).
  if (ctx.step === "choosing_courier" && (ctx.courierOptions?.length ?? 0) >= 2) {
    let chosen: CourierOption | undefined;
    if (/\b(1|barato|mais barato|mais em conta|economico|econômico|barata)\b/.test(normalized)) {
      chosen = ctx.courierOptions?.find((o) => o.kind === "barato");
    } else if (/\b(2|rapido|rápido|mais rapido|mais rápido|rapida|rápida|urgente)\b/.test(normalized)) {
      chosen = ctx.courierOptions?.find((o) => o.kind === "rapido");
    }
    if (!chosen) {
      await reply(phone, `Não peguei 🤔. ${freteChoiceText(ctx)}`);
      return;
    }
    applyCourier(ctx, chosen);
    ctx.courierOptions = undefined;
    ctx.step = "quoted";
    await writeCtx(convo.id, ctx);
    await reply(phone, summaryText(ctx));
    return;
  }

  // Confirm + generate the payment link. Explicit pay words ("pagar", "finalizar")
  // also work when the basket is still below the store minimum (step "collecting") —
  // createOrderAndCharge guards the minimum and replies with how much is missing,
  // instead of "pagar" falling through to a product search and dead-ending on the
  // greeting ("Oi! Sou a Lia…"), which is what happened in the reported bug.
  const saysPay = /\b(pagar|pagamento|finaliza|finalizar|fecha|fechar|checkout)\b/.test(normalized);
  const confirmsQuote = ctx.step === "quoted" && /\b(confirmar|confirmo|sim|pode|isso|ok|fechado|bora)\b/.test(normalized);
  if ((ctx.step === "quoted" || ctx.step === "collecting") && (ctx.basket?.length ?? 0) > 0 && (saysPay || confirmsQuote)) {
    const payStore = orderStore(ctx);
    if (belowMinimum(ctx, payStore)) {
      await writeCtx(convo.id, ctx);
      await reply(phone, minimumOrderText(ctx, payStore));
      return;
    }
    ctx.step = "choosing_payment";
    await writeCtx(convo.id, ctx);
    await reply(phone, paymentMethodText(ctx));
    return;
  }

  // Customer is choosing how to pay (card carries the pass-through fee).
  if (ctx.step === "choosing_payment" && (ctx.basket?.length ?? 0) > 0) {
    if (/\bpix\b/.test(normalized)) {
      await createOrderAndCharge(phone, user.id, convo.id, ctx, "pix");
      return;
    }
    if (/\b(cart[aã]o|cartao|credito|crédito|debito|débito|cred)\b/.test(normalized)) {
      await createOrderAndCharge(phone, user.id, convo.id, ctx, "card");
      return;
    }
    await reply(phone, `Não peguei 🤔. ${paymentMethodText(ctx)}`);
    return;
  }

  // Customer is choosing one of the (max 3) options we offered for an ambiguous item.
  if (ctx.step === "choosing" && ctx.pending?.length) {
    const chosenStore = orderStore(ctx);
    const current = ctx.pending[0];
    let idx = -1;
    if (/\b(qualquer|qualqer|tanto faz|pode ser|o primeiro|primeiro)\b/.test(normalized)) idx = 0;
    else {
      const m = normalized.match(/\b([1-9])\b/);
      if (m) idx = Number(m[1]) - 1;
    }
    if (idx < 0 || idx >= current.options.length) {
      await reply(phone, `Não peguei 🤔. ${choicesText(current)}`);
      return;
    }
    const chosen = current.options[idx];
    ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(chosen, current.qty, chosenStore)]);
    ctx.pending = ctx.pending.slice(1);
    if (ctx.pending.length) {
      await writeCtx(convo.id, ctx);
      await reply(phone, `✅ ${chosen.name}.`);
      await sendChoices(phone, ctx.pending[0]);
      return;
    }
    ctx.pending = undefined;
    const next: DeliveryContext = {
      flow: "delivery",
      basket: ctx.basket,
      notFound: [],
      cep: ctx.cep ?? user.cep ?? undefined,
      deliveryAddress: ctx.deliveryAddress
    };
    await continueAfterBasket(phone, user.id, convo.id, next, user.cep);
    return;
  }

  // "repete o de sempre" — reorder last delivered basket (memory)
  if (/\b(repete|repetir|de sempre|o mesmo|igual)\b/.test(normalized)) {
    const last = await prisma.deliveryOrder.findFirst({
      where: { userId: user.id, status: { in: ["delivered", "dispatched", "ready_for_pickup", "operator_buying", "paid"] } },
      orderBy: { createdAt: "desc" }
    });
    const items = (last?.items as unknown as BasketItem[]) ?? [];
    if (!items.length) {
      await reply(phone, "Ainda não tenho um pedido anterior seu pra repetir. Me diz o que você quer. 🙂");
      return;
    }
    const next: DeliveryContext = { flow: "delivery", basket: items, notFound: [], cep: user.cep ?? ctx.cep, deliveryAddress: ctx.deliveryAddress };
    await continueAfterBasket(phone, user.id, convo.id, next, user.cep);
    return;
  }

  // CEP step
  if (ctx.step === "need_cep" && /\d{5}-?\d{3}/.test(normalized)) {
    const cep = (normalized.match(/\d{5}-?\d{3}/) ?? [])[0];
    ctx.cep = cep;
    ctx.deliveryAddress = (await expandCep(cep!)) ?? ctx.deliveryAddress;
    if (input.phone) {
      await prisma.user.update({ where: { id: user.id }, data: { cep } });
    }
    const cepStore = orderStore(ctx);
    await quoteBasket(ctx, cepStore);
    ctx.flow = "delivery";
    await respondAfterQuote(phone, convo.id, ctx, cepStore);
    return;
  }

  // Remove / edit an item already in the basket: "tira a esponja", "remove o arroz",
  // "tira tudo". Without this, "tira a esponja" was treated as a NEW product search —
  // it re-added items and never removed anything (the reported bug).
  const wantsRemove = /^(tira|tirar|remove|remover|retira|retirar|exclui|excluir|apaga|apagar|sem)\b/.test(normalized);
  if (wantsRemove && (ctx.basket?.length ?? 0) > 0) {
    const target = normalized
      .replace(/^(tira|tirar|remove|remover|retira|retirar|exclui|excluir|apaga|apagar|sem)\b/, "")
      .replace(/\b(o|a|os|as|um|uma|da cesta|do pedido|da lista|por favor|pff?v?|esse|essa)\b/g, " ")
      .trim();
    const clearAll = !target || /\b(tudo|todos|todas)\b/.test(target);
    let removed: BasketItem[];
    if (clearAll) {
      removed = ctx.basket ?? [];
      ctx.basket = [];
    } else {
      const keep = (ctx.basket ?? []).filter(
        (item) => scoreCatalogMatch(target, { sku: item.sku, name: item.name, unitPrice: item.unitPrice }) <= 0
      );
      removed = (ctx.basket ?? []).filter((item) => !keep.includes(item));
      ctx.basket = keep;
    }
    if (!removed.length) {
      await reply(phone, "Não achei esse item na sua cesta 🤔. Me diz o nome como está na lista que eu tiro.");
      return;
    }
    const removedNames = removed.map((i) => i.name).join(", ");
    if (!ctx.basket.length) {
      await writeCtx(convo.id, { flow: "delivery", cep: ctx.cep ?? user.cep ?? undefined, deliveryAddress: ctx.deliveryAddress });
      await reply(phone, `Pronto, tirei ${removedNames}. Sua cesta ficou vazia — me diz o que você quer. 🙂`);
      return;
    }
    const removeStore = orderStore(ctx);
    await quoteBasket(ctx, removeStore);
    await respondAfterQuote(phone, convo.id, ctx, removeStore, `Pronto, tirei ${removedNames}.`);
    return;
  }

  // Otherwise: treat as a basket (items list). The search can take a couple seconds,
  // so acknowledge first (except for plain greetings) — no more silence.
  if (!/^(oi+|ola+|opa|e ?ai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|alo)\??!?$/.test(normalized)) {
    await reply(phone, "🔎 Procurando, só um instante…");
  }
  const { store: pickedStore, autoAdded, pending, notFound, greetingOnly, containsMedicine } = await buildChoices(text, ctx.storeKey);

  if (greetingOnly && !autoAdded.length && !pending.length) {
    await reply(
      phone,
      "Oi! 💚 Sou a Lia. Me diz o que você precisa do dia a dia — ex.: *\"guaraná, pasta de dente e papel higiênico\"* — que eu trago e entrego pra você."
    );
    return;
  }
  if (containsMedicine && !autoAdded.length && !pending.length) {
    await reply(
      phone,
      "Remédio eu não consigo trazer (por lei, só farmácia vende) 🙏. Mas faço higiene, beleza, limpeza, mercado, bebida e pet. O que você precisa?"
    );
    return;
  }
  if (!autoAdded.length && !pending.length) {
    await reply(
      phone,
      notFound.length
        ? `Não achei ${notFound.join(", ")} 🤔. Tenta de outro jeito (ex.: \"pasta de dente Colgate\", \"fralda Pampers M\", \"café Pilão\").`
        : "Não entendi seu pedido 🤔. Me diz os itens, ex.: \"guaraná e pasta de dente\"."
    );
    return;
  }

  const baseBasket = mergeBaskets(ctx.basket ?? [], autoAdded);

  // Ambiguous items → ask the customer to pick from up to 3 options (one at a time).
  if (pending.length) {
    ctx.flow = "delivery";
    ctx.step = "choosing";
    ctx.basket = baseBasket;
    ctx.pending = pending;
    ctx.storeKey = pickedStore.key;
    ctx.cep = ctx.cep ?? user.cep ?? undefined;
    await writeCtx(convo.id, ctx);
    await sendChoices(phone, pending[0]);
    return;
  }

  const next: DeliveryContext = { flow: "delivery", basket: baseBasket, notFound, storeKey: pickedStore.key, cep: ctx.cep ?? user.cep ?? undefined, deliveryAddress: ctx.deliveryAddress };
  await continueAfterBasket(phone, user.id, convo.id, next, user.cep);
}

function mergeBaskets(existing: BasketItem[], incoming: BasketItem[]): BasketItem[] {
  const out = [...existing];
  for (const item of incoming) {
    const found = out.find((x) => x.sku === item.sku);
    if (found) {
      found.qty += item.qty;
      found.lineTotal = Math.round(found.unitPrice * found.qty * 100) / 100;
    } else {
      out.push(item);
    }
  }
  return out;
}

async function continueAfterBasket(
  phone: string,
  _userId: string,
  convoId: string,
  ctx: DeliveryContext,
  userCep?: string | null
) {
  const store = orderStore(ctx);
  if (!ctx.cep && !userCep) {
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    const list = (ctx.basket ?? []).map((i) => `• ${i.qty}x ${i.name}`).join("\n");
    await reply(phone, `Anotei:\n${list}\n\nQual seu *CEP*? Assim eu calculo o frete e o prazo certinhos. 📦`);
    return;
  }
  if (!ctx.cep && userCep) {
    ctx.cep = userCep;
    ctx.deliveryAddress = (await expandCep(userCep)) ?? ctx.deliveryAddress;
  }
  await quoteBasket(ctx, store);
  await respondAfterQuote(phone, convoId, ctx, store);
}

async function createOrderAndCharge(phone: string, userId: string, convoId: string, ctx: DeliveryContext, method: "pix" | "card" = "pix") {
  // Hard guard: never charge an order below the store's minimum (un-fulfillable).
  const store = getStore(ctx.basket?.[0]?.storeKey ?? DEFAULT_STORE_KEY);
  if (belowMinimum(ctx, store)) {
    await reply(phone, minimumOrderText(ctx, store));
    return;
  }
  // Pix is charged at the base total (no fee); card grosses up by the MDR so the margin
  // survives — the difference is the fee the customer agreed to absorb.
  const base = ctx.total ?? 0;
  const isCard = method === "card";
  const total = isCard ? cardTotal(base) : base;
  const cardFee = Math.round((total - base) * 100) / 100;
  const order = await prisma.deliveryOrder.create({
    data: {
      userId,
      conversationId: convoId,
      phone,
      cep: ctx.cep,
      deliveryAddress: ctx.deliveryAddress,
      storeKey: ctx.basket?.[0]?.storeKey ?? DEFAULT_STORE_KEY,
      storeLabel: ctx.basket?.[0]?.storeLabel ?? "Carrefour",
      storeUnit: ctx.storeUnitLabel,
      storeAddress: ctx.storeUnitAddress,
      items: (ctx.basket ?? []) as unknown as object,
      itemsSubtotal: ctx.itemsSubtotal ?? 0,
      courierKey: ctx.courierKey ?? "uber_direct",
      courierQuoteId: ctx.courierQuoteId,
      deliveryFee: ctx.deliveryFee ?? 0,
      serviceFee: ctx.serviceFee ?? 0,
      total,
      notes: isCard ? `Pagamento: cartão (taxa ~${brl(cardFee)} embutida)` : "Pagamento: Pix",
      status: "awaiting_payment"
    }
  });

  // Order committed — DROP the basket from the conversation so the next request starts
  // fresh (the "phantom item" bug). Keep only the address + order id so "paguei" resolves.
  await writeCtx(convoId, {
    flow: "delivery",
    cep: ctx.cep,
    deliveryAddress: ctx.deliveryAddress,
    deliveryOrderId: order.id,
    step: "awaiting_payment"
  });

  if (isCard) {
    // Card → a Checkout Pro link (MP-hosted card page). Reuse the nullable columns:
    // pixId = preference id, pixCopiaECola = the link. Webhook reconciles by order id.
    const link = await checkoutAdapter.createLink({
      orderId: order.id,
      amount: order.total,
      description: `Lia · pedido ${order.id.slice(-6)}`,
      method: "card"
    });
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { pixId: link.preferenceId, pixCopiaECola: link.initPoint }
    });
    await reply(
      phone,
      [
        `Pronto! Total *${brl(total)}* no cartão _(já com a taxa)_.`,
        "",
        "Pague no *cartão* por este link 👇",
        link.initPoint,
        "",
        link.mock
          ? "_(sandbox: responda *paguei* pra simular o pagamento)_"
          : "Assim que o pagamento cair, eu já começo a separar e te aviso o rastreio. 💚"
      ].join("\n")
    );
    return;
  }

  // Pix → the raw copia-e-cola generated ON THE SPOT, paid inside the bank app (no
  // leaving WhatsApp for a hosted page). Webhook reconciles by external_reference = order id.
  const charge = await pixAdapter.createPix({
    orderId: order.id,
    amount: order.total,
    description: `Lia · pedido ${order.id.slice(-6)}`
  });
  await prisma.deliveryOrder.update({
    where: { id: order.id },
    data: { pixId: charge.pixId, pixCopiaECola: charge.copiaECola }
  });
  await reply(
    phone,
    [
      `Pronto! Total *${brl(total)}* no Pix.`,
      "",
      "É só copiar o código abaixo e colar no *Pix copia e cola* do seu banco 👇",
      charge.copiaECola,
      "",
      charge.mock
        ? "_(sandbox: responda *paguei* pra simular o pagamento)_"
        : "Assim que o Pix cair, eu já começo a separar e te aviso o rastreio. 💚"
    ].join("\n")
  );
}

// ---------- order lifecycle (called by webhook + operator dashboard) ----------

export async function markDeliveryOrderPaid(orderId: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "awaiting_payment") return order;
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: "paid", paidAt: new Date() }
  });
  await reply(order.phone, "Pagamento confirmado! ✅ Já estou separando seu pedido. Te aviso quando sair pra entrega. 🛵");
  return updated;
}

export async function opsMarkBought(orderId: string, storeOrderNumber: string) {
  return prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: "operator_buying", storeOrderNumber }
  });
}

export async function opsDispatchCourier(orderId: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  const store = getStore(order.storeKey);
  const courier = getCourier(order.courierKey);
  // Re-derive the pickup unit so the connector can re-quote at dispatch (the order-time
  // quote has expired). dropoff CEP is the customer's.
  const unit = await store.nearestUnit(order.cep ?? undefined);
  const dispatch = await courier.dispatch({
    orderId: order.id,
    pickupAddress: order.storeAddress ?? unit.address,
    dropoffAddress: order.deliveryAddress ?? "",
    pickupCep: unit.cep,
    dropoffCep: order.cep ?? undefined,
    instructions: store.pickupInstructions(order.storeOrderNumber ?? "—"),
    quoteId: order.courierQuoteId ?? undefined,
    dropoffName: order.customerName ?? undefined,
    dropoffPhone: order.phone
  });
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "dispatched",
      courierTrackingUrl: dispatch.trackingUrl,
      courierDispatchedAt: new Date()
    }
  });
  await reply(
    order.phone,
    `🛵 Saiu pra entrega! Chega em ~${30} min.${dispatch.trackingUrl ? `\nRastreio: ${dispatch.trackingUrl}` : ""}`
  );
  return updated;
}

export async function opsMarkDelivered(orderId: string) {
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: "delivered", deliveredAt: new Date() }
  });
  await reply(order.phone, "Entregue! 🎉 Qualquer coisa é só me chamar. Quer que eu guarde isso pra repetir depois? 💚");
  return order;
}

export async function opsCancelRefund(orderId: string) {
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: "canceled" }
  });
  await reply(order.phone, "Seu pedido foi cancelado e o valor estornado. Desculpa o transtorno! 🙏");
  return order;
}

export async function getOperatorQueue() {
  return prisma.deliveryOrder.findMany({
    where: { status: { in: ["paid", "operator_buying", "ready_for_pickup", "dispatched"] } },
    orderBy: { createdAt: "asc" }
  });
}
