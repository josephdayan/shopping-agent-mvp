import { prisma } from "@/lib/prisma";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";
import { getStore, DEFAULT_STORE_KEY, pickStoreForQueries, allUnits, type StoreConnector } from "@/lib/stores";
import { pickNearestUnit } from "@/lib/stores/nearest";
import { checkFreightGuard, type FreightBlock } from "@/lib/freight-guard";
import { attrMatchesItem, inferCatalogRefinement, queryTokens, scoreCatalogMatch } from "@/lib/stores/types";
import { getCourier, quoteAll } from "@/lib/couriers";
import { checkoutAdapter, pixAdapter } from "@/lib/payments/mercadopago";
import { extractShoppingList } from "@/lib/adapters/ai";
import {
  detectIntent,
  detectPaymentMethod,
  isQuestion,
  asksRunningTotal,
  looksLikeMedicine,
  narrowChoiceByName,
  normalizeMsg,
  parseBasketLines,
  parseContextualQuantity,
  parsePriceCap,
  mergeShoppingLines,
  parseChoiceReply,
  parseRefinement,
  wantsMoreOptions,
  type Intent
} from "@/lib/lia-intents";
import { CANCEL_REQUEST_FLAG, isCardCharge, paymentNote, withPaymentNote } from "@/lib/order-flags";
import { checkCoverage, coverageLabel, normalizeCity } from "@/lib/coverage";
import * as copy from "@/lib/lia-copy";

// The operational brain of the remodelled Lia. One conversation = one basket of
// everyday items, fulfilled from a pluggable store via clique-e-retire + courier.
// This module owns the WhatsApp conversation state machine AND the order lifecycle
// the operator dashboard drives. Intent detection lives in lia-intents (pure,
// unit-tested) and every customer-facing string lives in lia-copy.

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

function display(price: number): number {
  return Math.round(price * MARKUP * 100) / 100;
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
  productUrl?: string;
};

type ChoiceOption = { sku: string; name: string; brand?: string; unitPrice: number; imageUrl?: string; productUrl?: string; storeKey?: string; storeLabel?: string };
type StoreFulfillment = {
  storeKey: string;
  storeLabel: string;
  unitId: string;
  unitLabel: string;
  unitAddress: string;
  unitCep?: string;
  courierKey: string;
  courierQuoteId: string;
  deliveryFee: number;
  etaMinutes: number;
  itemsSubtotal: number;
  serviceFee: number;
};
type PendingChoice = {
  query: string;
  qty: number;
  // O cliente DISSE a quantidade ("uma coca", "2 leites") — não re-perguntar depois
  // da escolha; a pergunta de quantidade é só pra pedido sem quantidade.
  qtyExplicit?: boolean;
  options: ChoiceOption[];
  // Original query before a refinement ("coleira" when query became "coleira azul").
  baseQuery?: string;
  // Active refinement attributes ("azul", "2kg") — paging re-applies them.
  attrs?: string[];
  // Every sku already shown for this item, so "tem outras?" never repeats one — robust
  // even if the underlying ranking shifts between turns (live scrape vs seed).
  shownSkus?: string[];
};

// A frete option the customer can pick between (cheapest vs fastest courier).
type CourierOption = { kind: "barato" | "rapido"; courierKey: string; quoteId: string; fee: number; etaMinutes: number };

type DeliveryContext = {
  flow?: "delivery";
  step?: "collecting" | "need_cep" | "choosing" | "choosing_quantity" | "quoted" | "choosing_courier" | "choosing_payment" | "awaiting_payment";
  basket?: BasketItem[];
  pending?: PendingChoice[];
  quantityChoice?: { option: ChoiceOption; storeKey: string; storeLabel: string };
  courierOptions?: CourierOption[];
  storeKey?: string;
  notFound?: string[];
  // Pedido em texto cru aguardando o CEP do onboarding — vira busca COM OPÇÕES depois.
  pendingRequest?: string;
  cep?: string;
  city?: string;
  uf?: string;
  deliveryAddress?: string;
  guardBlock?: FreightBlock;
  storeUnitId?: string;
  storeUnitLabel?: string;
  storeUnitAddress?: string;
  storeUnitDistanceKm?: number;
  deliveryFee?: number;
  etaMinutes?: number;
  courierQuoteId?: string;
  courierKey?: string;
  serviceFee?: number;
  itemsSubtotal?: number;
  total?: number;
  fulfillments?: StoreFulfillment[];
  quoteUnavailable?: boolean;
  deliveryOrderId?: string;
};

const ACTIVE_ORDER_STATUSES = ["awaiting_payment", "paid", "operator_buying", "ready_for_pickup", "dispatched"];

// ---------- helpers: conversation + money + text ----------

export function normalizePhone(phone?: string) {
  if (!phone) return "+550000000000";
  const cleaned = phone.replace("whatsapp:", "").trim();
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  return `+${digits}`;
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

// A fresh context that keeps only the saved address (used after clear/cancel/paid).
function addressOnlyCtx(ctx: DeliveryContext, userCep?: string | null): DeliveryContext {
  return { flow: "delivery", cep: ctx.cep ?? userCep ?? undefined, deliveryAddress: ctx.deliveryAddress };
}

async function reply(phone: string, text: string) {
  await whatsappAdapter.sendMessage(phone, text);
}

// ---------- basket parsing + catalog matching ----------

type ExtractedLines = { lines: { phrase: string; qty: number }[]; greetingOnly: boolean; containsMedicine: boolean };

// Clean the request into a shopping list. The LLM handles greetings, synonyms
// ("pasta de dente"->creme dental), medicines and quantities; the deterministic
// splitter + medicine word-list covers OpenAI-off and OpenAI-error, so a remédio
// never slips through as a plain search.
async function extractLines(text: string): Promise<ExtractedLines> {
  const extraction = await extractShoppingList(text);
  const deterministic = parseBasketLines(text)
    .filter((line) => queryTokens(line.phrase).length)
    .filter((line) => !looksLikeMedicine(line.phrase));
  if (extraction) {
    const items = extraction.items.filter((item) => !looksLikeMedicine(item.query));
    return {
      lines: mergeShoppingLines(items.map((item) => ({ phrase: item.query, qty: item.qty })), deterministic),
      greetingOnly: extraction.greetingOnly,
      containsMedicine: extraction.containsMedicine || looksLikeMedicine(text)
    };
  }
  const raw = parseBasketLines(text).filter((line) => queryTokens(line.phrase).length);
  const safe = deterministic;
  return {
    lines: safe,
    greetingOnly: false,
    containsMedicine: safe.length < raw.length || looksLikeMedicine(text)
  };
}

type BasketResult = { basket: BasketItem[]; notFound: string[]; greetingOnly: boolean; containsMedicine: boolean };

async function buildBasket(text: string, store: StoreConnector): Promise<BasketResult> {
  const { lines, greetingOnly, containsMedicine } = await extractLines(text);

  // Search each item in the catalog in parallel so a multi-item basket costs one
  // lookup's latency, not the sum.
  const results = await Promise.all(
    lines.map(async (line) => ({ line, best: (await store.searchItems(line.phrase, 1))[0] }))
  );
  const basket: BasketItem[] = [];
  const notFound: string[] = [];
  for (const { line, best } of results) {
    if (best) {
      basket.push(choiceToBasketItem(best, line.qty, store));
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
async function buildChoices(text: string, lockedStoreKey?: string, preferredSkus?: Map<string, number>): Promise<ChoicesResult> {
  const { lines, greetingOnly, containsMedicine } = await extractLines(text);

  // One order = one store. If the order already has a store (items added earlier),
  // stay on it; otherwise pick the store that best covers this basket.
  const results = await Promise.all(
    lines.map(async (line) => {
      const lineStore = lockedStoreKey ? getStore(lockedStoreKey) : await pickStoreForQueries([line.phrase]);
      const options = await lineStore.searchItems(line.phrase, 12);
      options.sort((a, b) => (preferredSkus?.get(b.sku) ?? 0) - (preferredSkus?.get(a.sku) ?? 0));
      return { line, store: lineStore, options: options.slice(0, 3) };
    })
  );
  const autoAdded: BasketItem[] = [];
  const pending: PendingChoice[] = [];
  const notFound: string[] = [];
  for (const { line, store, options } of results) {
    if (!options.length) {
      notFound.push(line.phrase);
    } else {
      pending.push({
        query: line.phrase,
        qty: line.qty,
        ...(line.qtyExplicit ? { qtyExplicit: true } : {}),
        options: options.slice(0, 3).map((o) => ({ sku: o.sku, name: o.name, brand: o.brand, unitPrice: o.unitPrice, imageUrl: o.imageUrl, productUrl: o.productUrl, storeKey: store.key, storeLabel: store.label }))
      });
    }
  }
  return {
    store: results[0]?.store ?? getStore(lockedStoreKey),
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
  const selectedStore = o.storeKey ? getStore(o.storeKey) : store;
  return {
    sku: o.sku,
    name: o.name,
    brand: o.brand,
    qty,
    unitPrice: o.unitPrice,
    lineTotal: Math.round(o.unitPrice * qty * 100) / 100,
    storeKey: selectedStore.key,
    storeLabel: o.storeLabel ?? selectedStore.label,
    ...(o.productUrl ? { productUrl: o.productUrl } : {})
  };
}

// Customer-facing options message (prices already marked up; no store name).
function choicesTextFor(p: PendingChoice, header?: string): string {
  return copy.choicesText(
    p.query,
    p.options.map((o) => ({ name: customerChoiceName(p, o), displayPrice: display(o.unitPrice) })),
    header
  );
}

function customerChoiceName(p: PendingChoice, option: ChoiceOption): string {
  if (option.storeKey === "boticario" && /\bperfume\b/i.test(p.baseQuery ?? p.query)) {
    return option.name.replace(/desodorante col[oô]nia/gi, "Perfume");
  }
  return option.name;
}

function toChoiceOption(
  o: { sku: string; name: string; brand?: string; unitPrice: number; imageUrl?: string; productUrl?: string },
  storeRef?: { storeKey?: string; storeLabel?: string }
): ChoiceOption {
  return { sku: o.sku, name: o.name, brand: o.brand, unitPrice: o.unitPrice, imageUrl: o.imageUrl, productUrl: o.productUrl, ...storeRef };
}

async function replyPhoto(phone: string, text: string, imageUrl?: string) {
  if (imageUrl) await whatsappAdapter.sendMedia(phone, text, imageUrl);
  else await reply(phone, text);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Show the (up to 3) options with a product PHOTO each (one image message per option),
// then the numbered prompt. Falls back to the single numbered-text message when photos
// are off (LIA_SEND_PHOTOS=false) or none of the options has an image.
async function sendChoices(phone: string, p: PendingChoice, header?: string) {
  // Meta supports reply buttons inside the 24h customer-service window. One card per
  // option keeps each "Escolher este" button attached to the correct product.
  if (process.env.WHATSAPP_PROVIDER === "meta") {
    await reply(phone, header ?? copy.choicesHeader(p.query));
    try {
      const interactive = await whatsappAdapter.sendDeliveryChoices(
        phone,
        p.options.map((o, i) => ({
          id: String(i + 1),
          name: customerChoiceName(p, o),
          displayPrice: display(o.unitPrice),
          imageUrl: o.imageUrl
        }))
      );
      if (interactive) return;
    } catch (error) {
      console.warn("[whatsapp:meta:choices:fallback-text]", error instanceof Error ? error.message : error);
    }
    await reply(phone, choicesTextFor(p));
    return;
  }

  // Only lay out photos if at least one image can ACTUALLY be delivered (Petz's Akamai
  // CDN 403s Twilio, so those options use the clean single-list fallback, not per-item text).
  const withPhotos =
    process.env.LIA_SEND_PHOTOS !== "false" && p.options.some((o) => whatsappAdapter.canSendImage(o.imageUrl));
  if (!withPhotos) {
    await reply(phone, choicesTextFor(p, header));
    return;
  }
  // Small gap between media messages so WhatsApp keeps them in order.
  const gapMs = process.env.WHATSAPP_PROVIDER === "twilio" ? Number(process.env.TWILIO_PRODUCT_MESSAGE_DELAY_MS ?? 600) : 0;
  await reply(phone, header ?? copy.choicesHeader(p.query));
  for (let i = 0; i < p.options.length; i++) {
    const o = p.options[i];
    await replyPhoto(phone, copy.choiceLine(i, o.name, display(o.unitPrice)), o.imageUrl);
    if (gapMs > 0 && i < p.options.length - 1) await sleep(gapMs);
  }
  await reply(phone, copy.choicesAsk(p.options.length));
}

// CEP -> human address via ViaCEP. invalid=true means the CEP definitely doesn't
// exist; a network failure keeps invalid=false (we save the CEP and move on). Hard
// 4s timeout — a WhatsApp turn must never hang on a slow ViaCEP.
async function expandCep(cep: string): Promise<{ address?: string; city?: string; uf?: string; invalid: boolean }> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return { invalid: true };
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(Number(process.env.LIA_VIACEP_TIMEOUT_MS ?? 4000))
    });
    if (!res.ok) return { invalid: false };
    const data = (await res.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };
    if (data.erro) return { invalid: true };
    return {
      address: [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(", "),
      city: data.localidade,
      uf: data.uf,
      invalid: false
    };
  } catch {
    return { invalid: false };
  }
}

// ---------- quote + summary ----------

async function quoteBasket(ctx: DeliveryContext, store: StoreConnector) {
  const groups = new Map<string, BasketItem[]>();
  for (const item of ctx.basket ?? []) groups.set(item.storeKey, [...(groups.get(item.storeKey) ?? []), item]);
  if (!groups.size) groups.set(store.key, []);

  const fulfillments: StoreFulfillment[] = [];
  for (const [storeKey, items] of groups) {
    const groupStore = getStore(storeKey);
    const near = await pickNearestUnit(groupStore.listUnits(), ctx.cep);
    const distBlock = checkFreightGuard({ distanceKm: near.distanceKm });
    if (distBlock) {
      ctx.guardBlock = distBlock;
      return;
    }
    const unit = near.unit;
    const pool = await quoteAll({ pickupCep: unit.cep, dropoffCep: ctx.cep, pickupAddress: unit.address, dropoffAddress: ctx.deliveryAddress });
    const quotes = pool.length
      ? pool
      : [await getCourier().quote({ pickupCep: unit.cep, dropoffCep: ctx.cep, pickupAddress: unit.address, dropoffAddress: ctx.deliveryAddress })];
    const cheapest = quotes.reduce((best, quote) => (quote.fee < best.fee ? quote : best));
    const requireRealQuote = process.env.LIA_REQUIRE_REAL_COURIER_QUOTE !== "false" && process.env.WHATSAPP_PROVIDER === "meta";
    if (requireRealQuote && cheapest.mock) {
      ctx.quoteUnavailable = true;
      return;
    }
    const feeBlock = checkFreightGuard({ distanceKm: null, fee: cheapest.fee, feeIsMock: cheapest.mock });
    if (feeBlock) {
      ctx.guardBlock = feeBlock;
      return;
    }
    const itemsSubtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    fulfillments.push({
      storeKey,
      storeLabel: groupStore.label,
      unitId: unit.id,
      unitLabel: unit.label,
      unitAddress: unit.address,
      unitCep: unit.cep,
      courierKey: cheapest.courierKey,
      courierQuoteId: cheapest.quoteId,
      deliveryFee: cheapest.fee,
      etaMinutes: cheapest.etaMinutes,
      itemsSubtotal,
      serviceFee: Math.round(itemsSubtotal * (MARKUP - 1) * 100) / 100
    });
  }

  ctx.fulfillments = fulfillments;
  const first = fulfillments[0];
  ctx.storeUnitId = first?.unitId;
  ctx.storeUnitLabel = first?.unitLabel;
  ctx.storeUnitAddress = first?.unitAddress;
  ctx.courierKey = first?.courierKey;
  ctx.courierQuoteId = first?.courierQuoteId;
  ctx.itemsSubtotal = Math.round(fulfillments.reduce((sum, f) => sum + f.itemsSubtotal, 0) * 100) / 100;
  ctx.serviceFee = Math.round(fulfillments.reduce((sum, f) => sum + f.serviceFee, 0) * 100) / 100;
  ctx.deliveryFee = Math.round(fulfillments.reduce((sum, f) => sum + f.deliveryFee, 0) * 100) / 100;
  ctx.etaMinutes = Math.max(...fulfillments.map((f) => f.etaMinutes));
  ctx.total = Math.round(((ctx.itemsSubtotal ?? 0) + (ctx.serviceFee ?? 0) + (ctx.deliveryFee ?? 0)) * 100) / 100;
  ctx.courierOptions = undefined;
}

// Apply a chosen courier quote to the context (fee/eta/key/quoteId + recompute total).
function applyCourier(ctx: DeliveryContext, q: { courierKey: string; quoteId: string; fee: number; etaMinutes: number }) {
  ctx.deliveryFee = q.fee;
  ctx.etaMinutes = q.etaMinutes;
  ctx.courierQuoteId = q.quoteId;
  ctx.courierKey = q.courierKey;
  ctx.total = Math.round(((ctx.itemsSubtotal ?? 0) + (ctx.serviceFee ?? 0) + q.fee) * 100) / 100;
}

function basketForCopy(ctx: DeliveryContext): copy.CopyBasketItem[] {
  return (ctx.basket ?? []).map((item) => ({
    qty: item.qty,
    name: item.name,
    displayLineTotal: Math.round(item.unitPrice * MARKUP * item.qty * 100) / 100
  }));
}

function summaryText(ctx: DeliveryContext): string {
  const produtos = Math.round(((ctx.itemsSubtotal ?? 0) + (ctx.serviceFee ?? 0)) * 100) / 100;
  return copy.summary({
    items: basketForCopy(ctx),
    produtos,
    frete: ctx.deliveryFee ?? 0,
    etaMinutes: ctx.etaMinutes ?? 40,
    total: ctx.total ?? 0,
    notFound: ctx.notFound,
    pickupCount: ctx.fulfillments?.length ?? 1
  });
}

// After quoting: show the minimum-order nudge, the frete choice (barato/rápido), or the
// order summary — whichever applies. `prefix` is prepended (e.g. "Endereço salvo").
async function respondAfterQuote(phone: string, convoId: string, ctx: DeliveryContext, store: StoreConnector, prefix?: string) {
  const pre = prefix ? `${prefix}\n\n` : "";
  if (ctx.quoteUnavailable) {
    ctx.quoteUnavailable = undefined;
    ctx.step = "collecting";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.deliveryQuoteUnavailable());
    return;
  }
  // Guarda de frete disparou na cotação (fee real absurdo) → recusa educada + lead, sem
  // prefixo "endereço salvo" (seria contraditório). Mantém o CEP; deixa ajustar a cesta.
  if (ctx.guardBlock) {
    const reason = ctx.guardBlock.reason;
    ctx.guardBlock = undefined;
    ctx.step = "collecting";
    await writeCtx(convoId, ctx);
    if (ctx.cep) await recordWaitlistLead({ phone, cep: ctx.cep, city: ctx.city, uf: ctx.uf, reason });
    await reply(phone, copy.tooFarForDelivery(ctx.city, coverageLabel()));
    return;
  }
  const minimumStore = [...new Set((ctx.basket ?? []).map((item) => item.storeKey))]
    .map((key) => getStore(key))
    .find((candidate) => belowMinimum(ctx, candidate));
  if (minimumStore) {
    ctx.step = "collecting";
    await writeCtx(convoId, ctx);
    await reply(phone, pre + minimumOrderText(ctx, minimumStore));
    return;
  }
  if ((ctx.courierOptions?.length ?? 0) >= 2) {
    ctx.step = "choosing_courier";
    await writeCtx(convoId, ctx);
    const barato = ctx.courierOptions?.find((o) => o.kind === "barato");
    const rapido = ctx.courierOptions?.find((o) => o.kind === "rapido");
    await reply(phone, pre + copy.freteChoice(barato, rapido));
    return;
  }
  ctx.step = "choosing_payment";
  await writeCtx(convoId, ctx);
  await reply(phone, pre + summaryText(ctx));
  await sendPaymentButtons(phone, ctx);
  await sendCartActionButtons(phone);
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
  const subtotal = (ctx.basket ?? []).filter((item) => item.storeKey === store.key).reduce((sum, item) => sum + item.lineTotal, 0);
  return min > 0 && subtotal < min;
}
function minimumOrderText(ctx: DeliveryContext, store: StoreConnector): string {
  const displayMin = display(storeMinReal(store));
  const real = (ctx.basket ?? []).filter((item) => item.storeKey === store.key).reduce((sum, item) => sum + item.lineTotal, 0);
  const produtos = Math.round(real * MARKUP * 100) / 100;
  const falta = Math.max(0, Math.round((displayMin - produtos) * 100) / 100);
  const scoped = { ...ctx, basket: (ctx.basket ?? []).filter((item) => item.storeKey === store.key) };
  return copy.minimumOrder({ items: basketForCopy(scoped), produtos, displayMin, falta });
}

// ---------- the WhatsApp conversation state machine ----------

export async function handleDeliveryMessage(input: { phone?: string; text: string; name?: string; messageId?: string }) {
  const phone = normalizePhone(input.phone);
  const text = (input.text ?? "").trim();
  const { user, convo } = await getOrCreateConvo(phone, input.name);

  // Twilio retries the webhook when a turn is slow — never process the same inbound
  // message twice (a duplicated "2 arroz" would silently double the basket).
  if (input.messageId) {
    const dup = await prisma.message.findFirst({
      where: { conversationId: convo.id, metadata: input.messageId },
      select: { id: true }
    });
    if (dup) return;
  }
  await prisma.message.create({
    data: { conversationId: convo.id, sender: "user", text, metadata: input.messageId }
  });

  const ctx = readCtx(convo.context);
  const intent = detectIntent(text);

  // Auto-expire a stale cart: if the last activity was over 30 min ago, start fresh
  // (keep only the saved address) so a leftover basket from a previous session doesn't
  // bleed into a new order — the reported "old items still there" problem.
  const CART_TTL_MS = Number(process.env.LIA_CART_TTL_MS ?? 30 * 60 * 1000);
  const stale = Boolean(
    (ctx.basket?.length || ctx.pending?.length) &&
      convo.updatedAt &&
      Date.now() - new Date(convo.updatedAt).getTime() > CART_TTL_MS
  );
  if (stale) {
    const hadBasket = (ctx.basket?.length ?? 0) > 0;
    const keptCep = ctx.cep;
    const keptAddr = ctx.deliveryAddress;
    for (const key of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[key];
    ctx.flow = "delivery";
    ctx.cep = keptCep;
    ctx.deliveryAddress = keptAddr;
    // Persist before any early return (especially greeting). Previously the clear
    // lived only in memory, so the same stale warning repeated on every new message.
    await writeCtx(convo.id, ctx);
    // A stale product search is not a "cart" and should disappear silently. A real
    // basket gets context only when the customer is trying to continue, never before
    // a fresh greeting.
    if (hadBasket && intent.kind !== "greeting") await reply(phone, copy.cartExpired());
  }
  const savedCep = user.cep ?? ctx.cep;

  if (normalizeMsg(text) === "cadastrar_endereco") {
    ctx.flow = "delivery";
    ctx.step = "need_cep";
    await writeCtx(convo.id, ctx);
    await reply(phone, copy.askCepAgain());
    return;
  }

  if (normalizeMsg(text) === "adicionar_mais") {
    ctx.step = "collecting";
    await writeCtx(convo.id, ctx);
    await reply(phone, copy.askMoreItems());
    return;
  }

  if (ctx.step === "choosing_quantity" && ctx.quantityChoice) {
    const typedQty = parseContextualQuantity(text);
    if (typedQty != null) {
      await finishQuantityChoice(phone, user.cep, convo.id, ctx, typedQty);
    } else {
      await reply(phone, "Me diz uma quantidade entre 1 e 50 🙂");
    }
    return;
  }

  // ---- social / meta (work in ANY step) ----
  if (intent.kind === "thanks") {
    await reply(phone, copy.thanks());
    return;
  }
  if (intent.kind === "help") {
    await reply(phone, copy.help());
    return;
  }
  if (intent.kind === "greeting") {
    if (!savedCep) {
      ctx.flow = "delivery";
      ctx.step = "need_cep";
      await writeCtx(convo.id, ctx);
      const interactive = await whatsappAdapter.sendAddressSetup(phone, copy.welcomeAddressButton());
      if (!interactive) await reply(phone, copy.welcomeAskCep());
    } else if (ctx.step === "awaiting_payment" || (ctx.basket?.length ?? 0) > 0 || (ctx.pending?.length ?? 0) > 0) {
      // "oi" no meio de um pedido em andamento não reapresenta a Lia do zero.
      await reply(phone, copy.greetingMidOrder(ctx.step ?? "collecting", ctx.basket?.length ?? 0));
    } else {
      await reply(phone, copy.greeting());
    }
    return;
  }

  // ---- perguntas de serviço / atendimento (funcionam em QUALQUER step) ----
  if (intent.kind === "service_question") {
    // "vai mudar o frete?"/"quanto ta o frete?" com pedido já cotado → o valor REAL.
    if (
      intent.topic === "fee" &&
      ctx.deliveryFee != null &&
      (ctx.step === "quoted" || ctx.step === "choosing_payment" || ctx.step === "awaiting_payment")
    ) {
      await reply(phone, copy.currentFee(ctx.deliveryFee));
      return;
    }
    await reply(
      phone,
      copy.serviceAnswer(intent.topic, coverageLabel(), {
        hasCep: Boolean(user.cep),
        hasBasket: (ctx.basket?.length ?? 0) > 0 || (ctx.pending?.length ?? 0) > 0
      })
    );
    return;
  }
  if (intent.kind === "human") {
    await flagLatestOrder(user.id, `🙋 CLIENTE PEDIU ATENDIMENTO HUMANO: "${text.slice(0, 140)}"`);
    await reply(phone, copy.humanHandoff());
    return;
  }
  if (intent.kind === "complaint") {
    await flagLatestOrder(user.id, `⚠️ RECLAMAÇÃO DO CLIENTE: "${text.slice(0, 140)}"`);
    await reply(phone, copy.complaintAck());
    return;
  }
  if (intent.kind === "cancel_question") {
    const active = await prisma.deliveryOrder.findFirst({
      where: { userId: user.id, status: { in: ["awaiting_payment", "paid", "operator_buying", "ready_for_pickup"] } }
    });
    await reply(phone, copy.cancelHowTo(Boolean(active) || (ctx.basket?.length ?? 0) > 0));
    return;
  }
  if (intent.kind === "resend_code" || intent.kind === "switch_payment") {
    const order = await prisma.deliveryOrder.findFirst({
      where: { userId: user.id, status: "awaiting_payment" },
      orderBy: { createdAt: "desc" }
    });
    if (!order) {
      await reply(phone, (ctx.basket?.length ?? 0) > 0 ? copy.finishOrderFirst() : copy.noOrdersYet());
      return;
    }
    if (intent.kind === "switch_payment") {
      // "quero mudar a forma de pagamento" sem dizer qual → oferece as duas de novo.
      const method = isCardCharge(order) ? "pix" : "card";
      await switchPaymentMethod(phone, order, method);
    } else if (intent.expired) {
      // Pix expirado: reemitir uma cobrança NOVA em vez de reenviar o código morto.
      await switchPaymentMethod(phone, order, isCardCharge(order) ? "card" : "pix");
    } else {
      await resendCharge(phone, order);
    }
    return;
  }

  // ---- order-level commands (work in ANY step) ----
  if (intent.kind === "status") {
    await handleStatus(phone, user.id, text);
    return;
  }
  if (intent.kind === "paid_claim") {
    await handlePaidClaim(phone, convo.id, user.id, ctx);
    return;
  }
  if (intent.kind === "cancel") {
    await handleCancel(phone, convo.id, user.id, user.cep, ctx, intent.explicitOrder ?? false);
    return;
  }
  if (intent.kind === "clear_cart") {
    await writeCtx(convo.id, addressOnlyCtx(ctx, user.cep));
    await reply(phone, copy.cartCleared());
    return;
  }
  if (intent.kind === "change_address") {
    ctx.step = "need_cep";
    await writeCtx(convo.id, ctx);
    await reply(phone, copy.askNewCep());
    return;
  }

  // ---- CEP (onboarding, requested change, or spontaneously sent) ----
  if (intent.kind === "cep") {
    await handleNewCep(phone, user.id, convo.id, ctx, intent.cep, Boolean(savedCep), intent.rest);
    return;
  }

  // ---- step need_cep: um número curto ("1", "08") é tentativa de CEP, não escolha ----
  if (ctx.step === "need_cep" && intent.kind === "number") {
    await reply(phone, copy.cepNotFound(text.trim()));
    return;
  }

  // ---- onboarding: no saved address yet — stash the request, ask the CEP first ----
  // O pedido NÃO é resolvido agora (senão o 1º pedido do cliente seria auto-escolhido
  // sem opções nem preço): guarda o texto cru e roda a busca normal depois do CEP.
  if (!savedCep) {
    if (looksLikeMedicine(text)) {
      await reply(phone, copy.noMedicine());
      return;
    }
    const alreadyAsked = ctx.step === "need_cep";
    if (intent.kind === "reject") {
      // "não"/"deixa" durante o pedido de CEP: estaciona sem insistir.
      await writeCtx(convo.id, addressOnlyCtx(ctx, null));
      await reply(phone, copy.thanks());
      return;
    }
    // Pergunta ("o que vc consegue comprar?") se responde — NUNCA vira item anotado.
    const asking = intent.kind === "free_text" && isQuestion(text);
    if (asking) {
      await reply(phone, copy.serviceAnswer("generic", coverageLabel()));
      ctx.flow = "delivery";
      ctx.step = "need_cep";
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.askCepAgain());
      return;
    }
    const lines = intent.kind === "free_text" ? parseBasketLines(text) : [];
    if (lines.length) {
      ctx.pendingRequest = ctx.pendingRequest ? `${ctx.pendingRequest}, ${text}` : text;
    }
    ctx.flow = "delivery";
    ctx.step = "need_cep";
    await writeCtx(convo.id, ctx);
    const noted = ctx.pendingRequest ? parseBasketLines(ctx.pendingRequest).map((l) => `${l.qty}x ${l.phrase}`) : [];
    await reply(
      phone,
      alreadyAsked
        ? lines.length
          ? copy.notedAskCep(noted)
          : copy.askCepAgain()
        : copy.welcomeAskCep(noted)
    );
    return;
  }

  // ---- step: customer choosing the frete (cheapest vs fastest) ----
  if (
    ctx.step === "choosing_courier" &&
    (ctx.courierOptions?.length ?? 0) >= 2 &&
    intent.kind !== "remove_item" &&
    intent.kind !== "swap_item"
  ) {
    const n = normalizeMsg(text); // accent-stripped: "mais rápido" must match
    let chosen: CourierOption | undefined;
    if ((intent.kind === "number" && intent.value === 1) || /\bbarat|em conta|econom/.test(n)) {
      chosen = ctx.courierOptions?.find((o) => o.kind === "barato");
    } else if ((intent.kind === "number" && intent.value === 2) || /\brapid|urgente/.test(n)) {
      chosen = ctx.courierOptions?.find((o) => o.kind === "rapido");
    }
    if (!chosen) {
      const barato = ctx.courierOptions?.find((o) => o.kind === "barato");
      const rapido = ctx.courierOptions?.find((o) => o.kind === "rapido");
      await reply(phone, `${copy.choiceNotUnderstood()} ${copy.freteChoice(barato, rapido)}`);
      return;
    }
    applyCourier(ctx, chosen);
    ctx.courierOptions = undefined;
    ctx.step = "quoted";
    await writeCtx(convo.id, ctx);
    await reply(phone, summaryText(ctx));
    return;
  }

  // ---- step: customer choosing one of the (max 3) options for an ambiguous item ----
  // "tira X"/"troca X por Y" fall through to the basket-editing handlers below.
  if (
    ctx.step === "choosing" &&
    ctx.pending?.length &&
    intent.kind !== "remove_item" &&
    intent.kind !== "swap_item" &&
    intent.kind !== "pay" &&
    intent.kind !== "choose_payment" &&
    intent.kind !== "done"
  ) {
    await handleChoosing(phone, user.cep, convo.id, ctx, text, intent);
    return;
  }

  // ---- step: customer choosing how to pay (card carries the pass-through fee) ----
  // remove/swap fall through to edit the basket; unmatched free_text falls through
  // to add items.
  if (ctx.step === "choosing_payment" && (ctx.basket?.length ?? 0) > 0 && intent.kind !== "remove_item" && intent.kind !== "swap_item") {
    // "quanto fica no cartão?" is a price question, not a decision — restate both totals.
    if (isQuestion(text) && detectPaymentMethod(text)) {
      await reply(phone, paymentMethodText(ctx));
      return;
    }
    // The method can come as a short reply ("pix"), a number, or buried in a longer
    // natural sentence ("pode ser no pix mesmo, obrigada").
    const method = methodFromIntent(intent) ?? detectPaymentMethod(text);
    if (method) {
      await createOrderAndCharge(phone, user.id, convo.id, ctx, method);
      return;
    }
    // "só isso"/"fechado"/"pagar" aqui = pedido confirmado — só falta a forma de
    // pagamento. "Não peguei qual você quer" é copy de escolha de PRODUTO e soava perdida.
    if (intent.kind === "done" || intent.kind === "affirm" || intent.kind === "pay") {
      await reply(phone, `${copy.donePickPayment()} ${paymentMethodText(ctx)}`);
      return;
    }
    if (intent.kind !== "free_text") {
      await reply(phone, `${copy.choiceNotUnderstood()} ${paymentMethodText(ctx)}`);
      return;
    }
    // free_text with no method → fall through (customer is adding more items).
  }

  // ---- step: awaiting payment — resend / switch method instead of dead-ending ----
  if (ctx.step === "awaiting_payment" && ctx.deliveryOrderId && (intent.kind === "pay" || intent.kind === "choose_payment")) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
    if (order && order.status === "awaiting_payment") {
      const wanted = intent.kind === "choose_payment" ? intent.method : intent.kind === "pay" ? intent.method : undefined;
      if (wanted && wanted !== (isCardCharge(order) ? "card" : "pix")) {
        await switchPaymentMethod(phone, order, wanted);
      } else {
        await resendCharge(phone, order);
      }
      return;
    }
    // Order got paid/canceled meanwhile — fall through to the normal flow.
  }

  // ---- confirm + choose how to pay ----
  // A price question at the quote ("quanto fica no cartão?") gets both totals restated.
  if (ctx.step === "quoted" && (ctx.basket?.length ?? 0) > 0 && isQuestion(text) && detectPaymentMethod(text)) {
    await reply(phone, paymentMethodText(ctx));
    return;
  }
  const wantsToPay =
    intent.kind === "pay" ||
    intent.kind === "done" ||
    (ctx.step === "quoted" && intent.kind === "affirm") ||
    (intent.kind === "choose_payment" && (ctx.basket?.length ?? 0) > 0);
  const directMethod =
    intent.kind === "pay" && intent.method
      ? intent.method
      : intent.kind === "choose_payment" && (ctx.basket?.length ?? 0) > 0
        ? intent.method
        : undefined;
  if (wantsToPay || directMethod) {
    if (ctx.pending?.length) {
      await reply(phone, copy.finishChoiceFirst());
      await sendChoices(phone, ctx.pending[0]);
      return;
    }
    if (!(ctx.basket?.length ?? 0)) {
      // Maybe they mean an existing unpaid order — resend its charge.
      const order = await prisma.deliveryOrder.findFirst({
        where: { userId: user.id, status: "awaiting_payment" },
        orderBy: { createdAt: "desc" }
      });
      if (order) {
        await resendCharge(phone, order);
      } else {
        await reply(phone, copy.emptyCartPay());
      }
      return;
    }
    const payStore = [...new Set((ctx.basket ?? []).map((item) => item.storeKey))]
      .map((key) => getStore(key))
      .find((candidate) => belowMinimum(ctx, candidate)) ?? orderStore(ctx);
    if (belowMinimum(ctx, payStore)) {
      await writeCtx(convo.id, ctx);
      // "só isso"/"mais nada" abaixo do mínimo NÃO pode repetir o mesmo nudge em loop.
      if (intent.kind === "done") {
        const min = Math.round((payStore.minOrder ?? 0) * MARKUP * 100) / 100;
        const produtos = (ctx.basket ?? []).reduce((sum, i) => sum + Math.round(i.unitPrice * MARKUP * i.qty * 100) / 100, 0);
        await reply(phone, copy.minimumDeadEnd(min, Math.max(0, Math.round((min - produtos) * 100) / 100)));
      } else {
        await reply(phone, minimumOrderText(ctx, payStore));
      }
      return;
    }
    // "só isso"/"mais nada" ANTES da cotação = fechar a LISTA: mostra o total primeiro
    // (o cliente ainda nem viu o frete); a partir do resumo, "pagar" segue normal.
    if (intent.kind === "done" && ctx.step !== "quoted") {
      await quoteBasket(ctx, payStore);
      await respondAfterQuote(phone, convo.id, ctx, payStore);
      return;
    }
    if (directMethod) {
      await createOrderAndCharge(phone, user.id, convo.id, ctx, directMethod);
      return;
    }
    ctx.step = "choosing_payment";
    await writeCtx(convo.id, ctx);
    await reply(phone, paymentMethodText(ctx));
    return;
  }

  // ---- "repete o de sempre" — reorder the last basket (memory) ----
  if (intent.kind === "repeat_last") {
    const last = await prisma.deliveryOrder.findFirst({
      where: { userId: user.id, status: { in: ["delivered", "dispatched", "ready_for_pickup", "operator_buying", "paid"] } },
      orderBy: { createdAt: "desc" }
    });
    const items = (last?.items as unknown as BasketItem[]) ?? [];
    if (!items.length) {
      await reply(phone, copy.noPreviousOrder());
      return;
    }
    const next: DeliveryContext = { flow: "delivery", basket: items, notFound: [], cep: user.cep ?? ctx.cep, deliveryAddress: ctx.deliveryAddress };
    await continueAfterBasket(phone, convo.id, next, user.cep);
    return;
  }

  // ---- edit the basket: swap / remove ----
  if (intent.kind === "swap_item") {
    await handleSwap(phone, convo.id, user.cep, ctx, intent.from, intent.to);
    return;
  }
  if (intent.kind === "remove_item") {
    await handleRemove(phone, convo.id, user.cep, ctx, intent.target, { silentIfFound: Boolean(intent.andAdd) });
    // Multi-intenção "tira o arroz E coloca feijão": o remove acima, o add agora.
    if (intent.andAdd) {
      await handleSearch(phone, convo.id, user.cep, ctx, intent.andAdd, user.id);
    }
    return;
  }

  // ---- "não era isso" outside the choice step ----
  if (intent.kind === "reject") {
    await reply(phone, copy.rejectedAskAgain());
    return;
  }

  // ---- a lone "show!"/"perfeito" with nothing to confirm — friendly ack, not a search ----
  if (intent.kind === "affirm") {
    await reply(phone, copy.thanks());
    return;
  }

  // ---- a bare number with nothing to select ----
  if (intent.kind === "number") {
    await reply(phone, copy.didNotUnderstand());
    return;
  }

  // ---- "quanto deu tudo?"/"resumo" → responde pelo estado, nunca vira busca ----
  if (asksRunningTotal(text)) {
    if (ctx.step === "awaiting_payment" && ctx.total) {
      await reply(phone, copy.totalAwaitingPayment(ctx.total));
      return;
    }
    // No menu de pagamento o pedido JÁ está cotado — mostrar o resumo com frete e
    // total, nunca o parcial "te passo o total quando você fechar".
    if ((ctx.step === "quoted" || ctx.step === "choosing_payment") && ctx.total) {
      await reply(phone, summaryText(ctx));
      return;
    }
    if ((ctx.basket?.length ?? 0) > 0 || (ctx.pending?.length ?? 0) > 0) {
      const items = basketForCopy(ctx);
      const produtos = Math.round(items.reduce((sum, i) => sum + i.displayLineTotal, 0) * 100) / 100;
      await reply(phone, copy.partialTotal(items, produtos, ctx.pending?.length ?? 0));
      return;
    }
  }

  // ---- awaiting_payment + item novo: REABRE o pedido em vez de criar cesta fantasma ----
  // "ah, e adiciona um leite" com cobrança aberta: cancela a cobrança antiga (não paga),
  // avisa o cliente e segue o fluxo normal de busca com a cesta restaurada.
  if (ctx.step === "awaiting_payment" && ctx.deliveryOrderId && intent.kind === "free_text" && !isQuestion(text)) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
    if (order && order.status === "awaiting_payment") {
      await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: { status: "canceled", notes: [order.notes, "reaberto pelo cliente (item novo)"].filter(Boolean).join("\n") }
      });
      if (!ctx.basket?.length) ctx.basket = ((order.items as unknown) as BasketItem[]) ?? [];
      ctx.deliveryOrderId = undefined;
      ctx.step = "collecting";
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.orderReopened());
    }
  }

  // ---- default: treat as a product request ----
  await handleSearch(phone, convo.id, user.cep, ctx, text, user.id);
}

// ---------- intent handlers ----------

async function handleStatus(phone: string, userId: string, text?: string) {
  const order = await prisma.deliveryOrder.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!order) {
    // "que horas chega?" sem pedido = pergunta de PRAZO, não de status.
    if (text && /\b(chega|demora|horas|prazo|falta)\b/.test(normalizeMsg(text))) {
      await reply(phone, copy.serviceAnswer("eta", coverageLabel()));
    } else {
      await reply(phone, copy.noOrdersYet());
    }
    return;
  }
  await reply(
    phone,
    copy.orderStatusLine({
      shortId: order.id.slice(-6).toUpperCase(),
      status: order.status,
      trackingUrl: order.courierTrackingUrl
    })
  );
}

// "paguei": in sandbox (mock charge) it approves; with a REAL charge we VERIFY with
// Mercado Pago before believing it — a text message can't mark a real order paid.
async function handlePaidClaim(phone: string, convoId: string, userId: string, ctx: DeliveryContext) {
  const order =
    (ctx.deliveryOrderId
      ? await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } })
      : null) ??
    (await prisma.deliveryOrder.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }));
  if (!order) {
    await reply(phone, copy.noOrdersYet());
    return;
  }
  if (order.status !== "awaiting_payment") {
    if (["paid", "operator_buying", "ready_for_pickup", "dispatched"].includes(order.status)) {
      await reply(phone, copy.alreadyPaid());
    } else {
      await reply(
        phone,
        copy.orderStatusLine({ shortId: order.id.slice(-6).toUpperCase(), status: order.status, trackingUrl: order.courierTrackingUrl })
      );
    }
    return;
  }
  const isMock = (order.pixId ?? "").startsWith("mock");
  if (isMock) {
    await markDeliveryOrderPaid(order.id);
    await writeCtx(convoId, addressOnlyCtx(ctx));
    return;
  }
  if (isCardCharge(order)) {
    await reply(phone, copy.cardPending());
    return;
  }
  const status = await pixAdapter.getStatus(order.pixId ?? "");
  if (status === "approved") {
    await markDeliveryOrderPaid(order.id);
    await writeCtx(convoId, addressOnlyCtx(ctx));
    return;
  }
  await reply(phone, copy.pixNotSeenYet());
}

async function handleCancel(
  phone: string,
  convoId: string,
  userId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  explicitOrder: boolean
) {
  // Mid-cart (not charged yet): "cancelar" just clears the basket — UNLESS the
  // customer said "cancela o PEDIDO", which targets the committed order even when a
  // new basket is being assembled on top of it.
  if ((ctx.basket?.length ?? 0) > 0 && ctx.step !== "awaiting_payment" && !explicitOrder) {
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.cartCleared());
    return;
  }
  const order =
    (ctx.deliveryOrderId
      ? await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } })
      : null) ??
    (await prisma.deliveryOrder.findFirst({
      where: { userId, status: { in: ACTIVE_ORDER_STATUSES } },
      orderBy: { createdAt: "desc" }
    }));
  if (!order || !ACTIVE_ORDER_STATUSES.includes(order.status)) {
    await reply(phone, copy.nothingToCancel());
    return;
  }
  if (order.status === "awaiting_payment") {
    await prisma.deliveryOrder.update({ where: { id: order.id }, data: { status: "canceled" } });
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.canceledUnpaid());
    return;
  }
  if (order.status === "dispatched") {
    await reply(phone, copy.cancelTooLate());
    return;
  }
  // paid / operator_buying / ready_for_pickup: flag it loudly for the operator (the
  // refund is manual) and reassure the customer.
  if (!(order.notes ?? "").includes(CANCEL_REQUEST_FLAG)) {
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { notes: [order.notes, CANCEL_REQUEST_FLAG].filter(Boolean).join("\n") }
    });
  }
  await reply(phone, copy.cancelRequestedPaid());
}

async function handleNewCep(
  phone: string,
  userId: string,
  convoId: string,
  ctx: DeliveryContext,
  cep: string,
  hadCepBefore: boolean,
  // Itens que vieram JUNTO do CEP ("meu cep é X, quero arroz e leite") — processados
  // depois de salvar o endereço, nunca descartados.
  restItems?: string
) {
  const { address, city, uf, invalid } = await expandCep(cep);
  if (invalid) {
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.cepNotFound(cep));
    return;
  }

  // Trava de cobertura: nunca aceita um pedido pago que a operação não entrega. Fora da
  // área → grava o lead (vira mapa de demanda no /ops) e NÃO persiste o CEP nem cota.
  const area = checkCoverage({ cep, city, uf });
  if (!area.covered) {
    await recordWaitlistLead({ phone, cep, city, uf, reason: "outside_coverage" });
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.outsideCoverage(city, coverageLabel()));
    return;
  }

  // Guarda de frete (distância): a cidade é atendida, mas o endereço pode estar longe de
  // QUALQUER loja parceira (metrópole é grande). Recusa educada + lead too_far, sem persistir.
  const near = await pickNearestUnit(allUnits(), cep);
  const farBlock = checkFreightGuard({ distanceKm: near.distanceKm });
  if (farBlock) {
    await recordWaitlistLead({ phone, cep, city, uf, reason: "too_far" });
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.tooFarForDelivery(city, coverageLabel()));
    return;
  }

  ctx.cep = cep;
  ctx.city = city ?? ctx.city;
  ctx.uf = uf ?? ctx.uf;
  ctx.deliveryAddress = address ?? ctx.deliveryAddress;
  ctx.flow = "delivery";
  await prisma.user.update({ where: { id: userId }, data: { cep } });
  const shownAddress = ctx.deliveryAddress ?? cep;
  const savedMsg = hadCepBefore ? copy.addressUpdated(shownAddress) : copy.addressSavedPrefix(shownAddress);

  // Itens enviados na MESMA mensagem do CEP — ou guardados no onboarding — entram no
  // fluxo NORMAL de busca (com opções e preço), nunca auto-escolhidos.
  const queued = [restItems, ctx.pendingRequest].filter(Boolean).join(", ").trim();
  ctx.pendingRequest = undefined;
  if (queued) {
    await reply(phone, savedMsg);
    await handleSearch(phone, convoId, null, ctx, queued);
    return;
  }

  // CEP no MEIO de uma escolha ("choosing"): endereço atualiza, mas a pergunta pendente
  // não pode virar órfã — reapresenta a escolha em vez de resetar o passo.
  if (ctx.pending?.length) {
    ctx.step = "choosing";
    await writeCtx(convoId, ctx);
    await reply(phone, savedMsg);
    await sendChoices(phone, ctx.pending[0]);
    return;
  }

  if (ctx.basket?.length) {
    const store = orderStore(ctx);
    await quoteBasket(ctx, store);
    await respondAfterQuote(phone, convoId, ctx, store, savedMsg);
    return;
  }
  ctx.step = "collecting";
  await writeCtx(convoId, ctx);
  await reply(phone, hadCepBefore ? copy.addressUpdated(shownAddress) : copy.addressSavedAskItems(shownAddress));
}

async function handleChoosing(
  phone: string,
  userCep: string | null | undefined,
  convoId: string,
  ctx: DeliveryContext,
  text: string,
  intent: Intent
) {
  const current = ctx.pending![0];
  const store = getStore(current.options[0]?.storeKey ?? ctx.storeKey ?? orderStore(ctx).key);
  // "acha outras" pages; "tem essa em azul?"/"tem de 2kg?"/"quero uma maior" refine.
  // Both are checked AFTER an explicit pick ("2", "a colgate", "mais barato") but
  // BEFORE reject→skip — "não gostei, tem outras?" should show more, not drop the item.
  const more = wantsMoreOptions(text);
  const refineAttrs = more ? null : parseRefinement(text);
  let parsed = parseChoiceReply(text, current.options);
  // "nenhuma dessas, mostra outras" asks for MORE — don't let the skip pattern drop the item.
  if (parsed?.type === "skip" && more) parsed = null;
  if (!parsed && !more && !refineAttrs && intent.kind === "reject") parsed = { type: "skip" } as const;

  if (parsed) {
    if (parsed.type === "skip") {
      ctx.pending = ctx.pending!.slice(1);
      await reply(phone, copy.choiceSkipped(current.query));
      await advancePending(phone, convoId, ctx, userCep);
      return;
    }
    const index =
      parsed.type === "pick"
        ? parsed.index
        : parsed.type === "cheapest"
          ? current.options.reduce((best, o, i, arr) => (o.unitPrice < arr[best].unitPrice ? i : best), 0)
          : 0;
    const chosen = current.options[index];
    ctx.pending = ctx.pending!.slice(1);
    if (current.qty === 1 && !current.qtyExplicit) {
      await beginQuantityChoice(phone, convoId, ctx, store, chosen);
      return;
    }
    ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(chosen, current.qty, store)]);
    if (ctx.pending.length) {
      await writeCtx(convoId, ctx);
      await reply(phone, copy.choiceConfirmed(chosen.name));
      await sendChoices(phone, ctx.pending[0], copy.nextChoiceHeader(ctx.pending[0].query, ctx.pending.length));
      return;
    }
    await advancePending(phone, convoId, ctx, userCep, copy.choiceConfirmed(chosen.name));
    return;
  }

  if (more) {
    await pageMoreOptions(phone, convoId, ctx, store);
    return;
  }
  if (refineAttrs) {
    await refineOptions(phone, convoId, ctx, store, refineAttrs);
    return;
  }

  // "quanto deu tudo?" no meio das escolhas → parcial honesto e volta pras opções.
  if (asksRunningTotal(text)) {
    const items = basketForCopy(ctx);
    const produtos = Math.round(items.reduce((sum, i) => sum + i.displayLineTotal, 0) * 100) / 100;
    await reply(phone, copy.partialTotal(items, produtos, ctx.pending!.length));
    await sendChoices(phone, current);
    return;
  }

  // "algum até 150 reais?" — teto de preço filtra as opções na mesa (preço exibido,
  // com markup). Nenhuma dentro do teto → resposta honesta + caminhos (barato/opções).
  const priceCap = parsePriceCap(text);
  if (priceCap != null) {
    const within = current.options.filter((o) => display(o.unitPrice) <= priceCap);
    if (!within.length) {
      await reply(phone, copy.nonePriceCap(priceCap));
      await sendChoices(phone, current);
      return;
    }
    if (within.length < current.options.length) {
      current.options = within;
      await writeCtx(convoId, ctx);
      await sendChoices(phone, current, copy.narrowedChoices(current.query));
      return;
    }
    // todas cabem no teto → só reapresenta confirmando
    await sendChoices(phone, current, copy.narrowedChoices(current.query));
    return;
  }

  // "coca" com [Fanta, Coca Lata, Coca Pet] na mesa: o cliente está discriminando
  // entre as opções, não pedindo item novo. Uma só bate → escolhe; várias → estreita.
  const narrowed = narrowChoiceByName(text, current.options);
  if (narrowed.length === 1) {
    const chosen = current.options[narrowed[0]];
    ctx.pending = ctx.pending!.slice(1);
    if (current.qty === 1 && !current.qtyExplicit) {
      await beginQuantityChoice(phone, convoId, ctx, store, chosen);
      return;
    }
    ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(chosen, current.qty, store)]);
    if (ctx.pending.length) {
      await writeCtx(convoId, ctx);
      await reply(phone, copy.choiceConfirmed(chosen.name));
      await sendChoices(phone, ctx.pending[0], copy.nextChoiceHeader(ctx.pending[0].query, ctx.pending.length));
      return;
    }
    await advancePending(phone, convoId, ctx, userCep, copy.choiceConfirmed(chosen.name));
    return;
  }
  if (narrowed.length > 1 && narrowed.length < current.options.length) {
    current.options = narrowed.map((i) => current.options[i]);
    await writeCtx(convoId, ctx);
    await sendChoices(phone, current, copy.narrowedChoices(current.query));
    return;
  }

  // Refinamento aberto e sistêmico: se a resposta curta discrimina itens do catálogo
  // da busca atual, ela é atributo — mesmo que nunca tenha sido cadastrada numa lista
  // fixa. Isso cobre marca, sabor, aroma, material, número de roupa/calçado e futuras
  // características do catálogo. Se não combinar com a busca atual (ex.: "leite"
  // enquanto escolhe Coca), continua sendo tratado como um NOVO produto.
  const catalogAttrs = await contextualCatalogAttrs(store, current, text);
  if (catalogAttrs) {
    await refineOptions(phone, convoId, ctx, store, catalogAttrs);
    return;
  }

  // Not a selection — maybe they're adding MORE items mid-choice ("ah, e 2 leites").
  // Questions about the shown options ("qual é a desnatada?") must NOT be searched
  // as new products — re-show the options instead.
  if (intent.kind === "free_text" && !isQuestion(text)) {
    const added = await buildChoices(text);
    if (added.autoAdded.length || added.pending.length) {
      ctx.basket = mergeBaskets(ctx.basket ?? [], added.autoAdded);
      ctx.pending = [...(ctx.pending ?? []), ...added.pending];
      ctx.notFound = [...(ctx.notFound ?? []), ...added.notFound];
      await writeCtx(convoId, ctx);
      const notes: string[] = [];
      if (added.autoAdded.length) notes.push(copy.autoAddedNote(added.autoAdded.map((i) => `${i.qty}x ${i.name}`)));
      // Item novo no meio de uma escolha entra na FILA — avisar, senão parece ignorado.
      if (added.pending.length) notes.push(copy.queuedItemsNote(added.pending.map((p) => p.query)));
      if (added.notFound.length) notes.push(copy.notFoundNote(added.notFound));
      if (notes.length) await reply(phone, notes.join("\n"));
      await sendChoices(phone, ctx.pending![0]);
      return;
    }
  }
  await reply(phone, copy.choiceNotUnderstood());
  await sendChoices(phone, current);
}

async function contextualCatalogAttrs(store: StoreConnector, current: PendingChoice, text: string): Promise<string[] | null> {
  const candidates = await choiceCandidates(store, current);
  return inferCatalogRefinement(text, candidates);
}

async function beginQuantityChoice(
  phone: string,
  convoId: string,
  ctx: DeliveryContext,
  store: StoreConnector,
  chosen: ChoiceOption
) {
  ctx.step = "choosing_quantity";
  ctx.quantityChoice = { option: chosen, storeKey: store.key, storeLabel: store.label };
  await writeCtx(convoId, ctx);
  const interactive = await whatsappAdapter.sendQuantityChoices(phone, chosen.name);
  if (!interactive) await reply(phone, copy.quantityAsk(chosen.name));
}

async function finishQuantityChoice(
  phone: string,
  userCep: string | null | undefined,
  convoId: string,
  ctx: DeliveryContext,
  qty: number
) {
  const selected = ctx.quantityChoice!;
  const store = getStore(selected.storeKey);
  ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(selected.option, qty, store)]);
  ctx.quantityChoice = undefined;
  ctx.step = ctx.pending?.length ? "choosing" : "collecting";
  await advancePending(phone, convoId, ctx, userCep, copy.choiceConfirmed(`${qty}x ${selected.option.name}`));
}

// Ranked candidates for the item being chosen, with the active refinement attributes
// re-applied — the single source pageMoreOptions and refineOptions share, so paging
// after a refine keeps honoring the attribute filter.
async function choiceCandidates(store: StoreConnector, p: PendingChoice, attrs?: string[]) {
  const active = attrs ?? p.attrs ?? [];
  const base = p.baseQuery ?? p.query;
  const ranked = await store.searchItems(active.length ? base : p.query, 40);
  return active.length ? ranked.filter((o) => active.every((a) => attrMatchesItem(a, o))) : ranked;
}

// "acha outras": show the NEXT 3 catalog matches for the same item — never repeat a
// sku already shown. When the pool is exhausted, say so honestly.
async function pageMoreOptions(phone: string, convoId: string, ctx: DeliveryContext, store: StoreConnector) {
  const p = ctx.pending![0];
  const shown = p.shownSkus ?? p.options.map((o) => o.sku);
  const next = (await choiceCandidates(store, p)).filter((o) => !shown.includes(o.sku)).slice(0, 3);
  if (!next.length) {
    await reply(phone, copy.noMoreOptions(p.query));
    return;
  }
  const storeRef = { storeKey: p.options[0]?.storeKey, storeLabel: p.options[0]?.storeLabel };
  p.options = next.map((option) => toChoiceOption(option, storeRef));
  p.shownSkus = [...shown, ...next.map((o) => o.sku)];
  await writeCtx(convoId, ctx);
  await sendChoices(phone, p, copy.moreChoicesHeader(p.query));
}

// "tem essa em azul?" / "tem de 2kg?" / "quero uma maior": re-search the item with the
// attribute. Only results where the attribute ACTUALLY applies count (attrMatchesItem)
// — otherwise the search degrades to the base tokens and we'd re-show the same list
// under a dishonest header. No match → say so and re-show what exists.
async function refineOptions(phone: string, convoId: string, ctx: DeliveryContext, store: StoreConnector, attrs: string[]) {
  const p = ctx.pending![0];
  const base = p.baseQuery ?? p.query;
  const refined = `${base} ${attrs.join(" ")}`;
  const matches = (await choiceCandidates(store, p, attrs)).slice(0, 3);
  if (!matches.length) {
    await reply(phone, copy.refineNoResult(refined));
    await sendChoices(phone, p);
    return;
  }
  p.baseQuery = base;
  p.attrs = attrs;
  p.query = refined;
  const storeRef = { storeKey: p.options[0]?.storeKey, storeLabel: p.options[0]?.storeLabel };
  p.options = matches.map((option) => toChoiceOption(option, storeRef));
  p.shownSkus = matches.map((m) => m.sku);
  await writeCtx(convoId, ctx);
  await sendChoices(phone, p);
}

// Move to the next pending choice, or quote the finished basket (keeping the
// not-found list so the summary is honest about what's missing).
async function advancePending(
  phone: string,
  convoId: string,
  ctx: DeliveryContext,
  userCep?: string | null,
  prefix?: string
) {
  if (ctx.pending?.length) {
    await writeCtx(convoId, ctx);
    if (prefix) await reply(phone, prefix);
    await sendChoices(phone, ctx.pending[0], copy.nextChoiceHeader(ctx.pending[0].query, ctx.pending.length));
    return;
  }
  ctx.pending = undefined;
  if (!(ctx.basket?.length ?? 0)) {
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.didNotUnderstand());
    return;
  }
  const next: DeliveryContext = {
    flow: "delivery",
    basket: ctx.basket,
    notFound: ctx.notFound ?? [],
    storeKey: ctx.storeKey,
    cep: ctx.cep ?? userCep ?? undefined,
    deliveryAddress: ctx.deliveryAddress
  };
  await continueAfterBasket(phone, convoId, next, userCep, prefix);
}

function itemMatchesPhrase(phrase: string, item: { sku: string; name: string; unitPrice: number }): boolean {
  return scoreCatalogMatch(phrase, item) > 0;
}

async function handleRemove(
  phone: string,
  convoId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  target: string,
  opts?: { silentIfFound?: boolean }
) {
  const basket = ctx.basket ?? [];
  const pending = ctx.pending ?? [];
  if (!basket.length && !pending.length) {
    await reply(phone, copy.removeNotFound());
    return;
  }
  const keep = basket.filter((item) => !itemMatchesPhrase(target, item));
  const removed = basket.filter((item) => !keep.includes(item));
  const pendingKeep = pending.filter((p) => !itemMatchesPhrase(target, { sku: p.query, name: p.query, unitPrice: 0 }));
  const removedPending = pending.filter((p) => !pendingKeep.includes(p));
  if (!removed.length && !removedPending.length) {
    await reply(phone, copy.removeNotFound());
    return;
  }
  ctx.basket = keep;
  ctx.pending = pendingKeep.length ? pendingKeep : undefined;
  const names = [...removed.map((i) => i.name), ...removedPending.map((p) => p.query)].join(", ");

  if (ctx.pending?.length) {
    ctx.step = "choosing";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.removedItems(names, false));
    await sendChoices(phone, ctx.pending[0]);
    return;
  }
  if (!keep.length) {
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.removedItems(names, !opts?.silentIfFound));
    return;
  }
  // remove+add ("tira X e coloca Y"): não cota agora — o add que vem em seguida cota.
  if (opts?.silentIfFound) {
    await writeCtx(convoId, ctx);
    await reply(phone, copy.removedItems(names, false));
    return;
  }
  const store = orderStore(ctx);
  await quoteBasket(ctx, store);
  await respondAfterQuote(phone, convoId, ctx, store, copy.removedItems(names, false));
}

async function handleSwap(
  phone: string,
  convoId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  from: string,
  to: string
) {
  const basket = ctx.basket ?? [];
  if (!basket.length) {
    await reply(phone, copy.removeNotFound());
    return;
  }
  const keep = basket.filter((item) => !itemMatchesPhrase(from, item));
  const removed = basket.filter((item) => !keep.includes(item));
  // The swapped-out item may still be an unresolved pending choice, not a basket line.
  const pending = ctx.pending ?? [];
  const pendingKeep = pending.filter((p) => !itemMatchesPhrase(from, { sku: p.query, name: p.query, unitPrice: 0 }));
  const removedPending = pending.filter((p) => !pendingKeep.includes(p));
  if (!removed.length && !removedPending.length) {
    await reply(phone, copy.removeNotFound());
    return;
  }
  if (!to) {
    await reply(phone, copy.swapAskWhat([...removed.map((i) => i.name), ...removedPending.map((p) => p.query)].join(", ")));
    return;
  }
  ctx.basket = keep;
  ctx.pending = pendingKeep.length ? pendingKeep : undefined;
  const removedNames = [...removed.map((i) => i.name), ...removedPending.map((p) => p.query)].join(", ");
  const qty = removed[0]?.qty ?? removedPending[0]?.qty ?? 1;
  const store = orderStore(ctx);
  const options = await store.searchItems(to, 3);

  if (!options.length) {
    const prefix = `${copy.swapRemovedPrefix(removedNames)} ${copy.itemsNotFound([to])}`;
    if (!keep.length) {
      await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
      await reply(phone, prefix);
      return;
    }
    await quoteBasket(ctx, store);
    await respondAfterQuote(phone, convoId, ctx, store, prefix);
    return;
  }
  if (options.length === 1 && !(ctx.pending?.length)) {
    ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(options[0], qty, store)]);
    await quoteBasket(ctx, store);
    await respondAfterQuote(phone, convoId, ctx, store, copy.swappedFor(removedNames, options[0].name));
    return;
  }
  ctx.pending = [
    {
      query: to,
      qty,
      options: options.slice(0, 3).map((o) => ({ sku: o.sku, name: o.name, brand: o.brand, unitPrice: o.unitPrice, imageUrl: o.imageUrl, productUrl: o.productUrl }))
    },
    ...(ctx.pending ?? [])
  ];
  ctx.step = "choosing";
  await writeCtx(convoId, ctx);
  await reply(phone, copy.swapRemovedPrefix(removedNames));
  await sendChoices(phone, ctx.pending[0]);
}

async function handleSearch(
  phone: string,
  convoId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  text: string,
  userId?: string
) {
  // The search can take a couple seconds — acknowledge first so there's no silence.
  await reply(phone, copy.searching());
  const preferences = userId ? await preferredSkuCounts(userId) : undefined;
  const { store, autoAdded, pending, notFound, greetingOnly, containsMedicine } = await buildChoices(text, undefined, preferences);

  if (greetingOnly && !autoAdded.length && !pending.length) {
    await reply(phone, copy.greeting());
    return;
  }
  if (containsMedicine && !autoAdded.length && !pending.length) {
    await reply(phone, copy.noMedicine());
    return;
  }
  if (!autoAdded.length && !pending.length) {
    await reply(phone, notFound.length ? copy.itemsNotFound(notFound) : copy.didNotUnderstand());
    return;
  }

  const baseBasket = mergeBaskets(ctx.basket ?? [], autoAdded);
  const medicineNote = containsMedicine ? copy.medicineSkippedNote() : undefined;

  // Ambiguous items → ask the customer to pick from up to 3 options (one at a time),
  // telling them upfront what was auto-added and what wasn't found.
  if (pending.length) {
    ctx.flow = "delivery";
    ctx.step = "choosing";
    ctx.basket = baseBasket;
    ctx.pending = pending;
    ctx.notFound = notFound;
    ctx.storeKey = pickedStoreKey(ctx, store);
    ctx.cep = ctx.cep ?? userCep ?? undefined;
    await writeCtx(convoId, ctx);
    const notes: string[] = [];
    if (medicineNote) notes.push(medicineNote);
    if (autoAdded.length) notes.push(copy.autoAddedNote(autoAdded.map((i) => `${i.qty}x ${i.name}`)));
    if (notFound.length) notes.push(copy.notFoundNote(notFound));
    if (notes.length) await reply(phone, notes.join("\n"));
    if (pending.length > 1) await reply(phone, copy.choiceSequence(pending.map((p) => p.query)));
    await sendChoices(phone, pending[0]);
    return;
  }

  const next: DeliveryContext = {
    flow: "delivery",
    basket: baseBasket,
    notFound,
    storeKey: pickedStoreKey(ctx, store),
    cep: ctx.cep ?? userCep ?? undefined,
    deliveryAddress: ctx.deliveryAddress
  };
  await continueAfterBasket(phone, convoId, next, userCep, medicineNote);
}

async function preferredSkuCounts(userId: string): Promise<Map<string, number>> {
  const orders = await prisma.deliveryOrder.findMany({
    where: { userId, status: { in: ["paid", "operator_buying", "ready_for_pickup", "dispatched", "delivered"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { items: true }
  });
  const counts = new Map<string, number>();
  for (const order of orders) {
    for (const item of (order.items as unknown as BasketItem[]) ?? []) {
      counts.set(item.sku, (counts.get(item.sku) ?? 0) + Math.max(1, item.qty));
    }
  }
  return counts;
}

// Keep the store locked once the order has items from it.
function pickedStoreKey(ctx: DeliveryContext, store: StoreConnector): string {
  return ctx.basket?.length ? ctx.storeKey ?? ctx.basket[0].storeKey : store.key;
}

function paymentMethodText(ctx: DeliveryContext): string {
  const base = ctx.total ?? 0;
  return copy.paymentMethod(base, cardTotal(base));
}

async function sendPaymentButtons(phone: string, ctx: DeliveryContext) {
  const base = ctx.total ?? 0;
  const interactive = await whatsappAdapter.sendPaymentChoices(phone, base, cardTotal(base));
  if (!interactive) await reply(phone, paymentMethodText(ctx));
}

async function sendCartActionButtons(phone: string) {
  const interactive = await whatsappAdapter.sendCartActions(phone);
  if (!interactive) await reply(phone, 'Quer ajustar? Manda mais itens ou responde *cancelar*.');
}

// Which payment method (if any) an intent unambiguously names.
function methodFromIntent(intent: Intent): "pix" | "card" | undefined {
  if (intent.kind === "choose_payment") return intent.method;
  if (intent.kind === "pay") return intent.method;
  if (intent.kind === "number") return intent.value === 1 ? "pix" : intent.value === 2 ? "card" : undefined;
  return undefined;
}

// Re-send the open charge (card link or Pix code) for an awaiting_payment order.
async function resendCharge(phone: string, order: { notes?: string | null; pixCopiaECola?: string | null }) {
  if (isCardCharge(order)) {
    await reply(phone, copy.resendCard(order.pixCopiaECola ?? ""));
    return;
  }
  // Pix: intro + código em mensagem SEPARADA — copiar a mensagem inteira tem que colar.
  await reply(phone, copy.resendPix());
  if (order.pixCopiaECola) await reply(phone, order.pixCopiaECola);
}

// Anota um aviso do cliente (reclamação / pedido de humano) no pedido mais recente,
// pra aparecer no /ops. Nunca lança — é acessório da conversa.
async function flagLatestOrder(userId: string, note: string) {
  try {
    const order = await prisma.deliveryOrder.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    if (!order) return;
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { notes: order.notes ? `${order.notes}\n${note}` : note }
    });
  } catch (err) {
    console.error("[flagLatestOrder]", err);
  }
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
  convoId: string,
  ctx: DeliveryContext,
  userCep?: string | null,
  prefix?: string
) {
  const store = orderStore(ctx);
  if (!ctx.cep && !userCep) {
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.askCepForQuote((ctx.basket ?? []).map((i) => `${i.qty}x ${i.name}`)));
    return;
  }
  if (!ctx.cep && userCep) {
    ctx.cep = userCep;
    // Only hit ViaCEP when the human-readable address isn't already known — this
    // runs on every quote, so a saved address must not cost a network round-trip.
    if (!ctx.deliveryAddress) {
      ctx.deliveryAddress = (await expandCep(userCep)).address;
    }
  }
  await quoteBasket(ctx, store);
  await respondAfterQuote(phone, convoId, ctx, store, prefix);
}

async function createOrderAndCharge(phone: string, userId: string, convoId: string, ctx: DeliveryContext, method: "pix" | "card" = "pix") {
  // Hard guard: never charge an order below the store's minimum (un-fulfillable).
  const store = [...new Set((ctx.basket ?? []).map((item) => item.storeKey))]
    .map((key) => getStore(key))
    .find((candidate) => belowMinimum(ctx, candidate)) ?? orderStore(ctx);
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
      storeKey: (ctx.fulfillments?.length ?? 0) > 1 ? "multi" : ctx.basket?.[0]?.storeKey ?? DEFAULT_STORE_KEY,
      storeLabel: (ctx.fulfillments?.length ?? 0) > 1 ? `${ctx.fulfillments!.length} lojas` : ctx.basket?.[0]?.storeLabel ?? "Carrefour",
      storeUnit: ctx.storeUnitLabel,
      storeAddress: ctx.storeUnitAddress,
      items: (ctx.basket ?? []) as unknown as object,
      fulfillments: ctx.fulfillments as unknown as object,
      itemsSubtotal: ctx.itemsSubtotal ?? 0,
      courierKey: ctx.courierKey ?? "uber_direct",
      courierQuoteId: ctx.courierQuoteId,
      deliveryFee: ctx.deliveryFee ?? 0,
      serviceFee: ctx.serviceFee ?? 0,
      total,
      notes: paymentNote(method, isCard ? copy.brl(cardFee) : undefined),
      status: "awaiting_payment"
    }
  });

  // Order committed — DROP the basket from the conversation so the next request starts
  // fresh (the "phantom item" bug). Keep only the address + order id so "paguei" resolves.
  await writeCtx(convoId, {
    ...addressOnlyCtx(ctx),
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
    await reply(phone, copy.cardInstructions(total, link.initPoint, link.mock));
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
  // Intro + código em mensagens SEPARADAS: no WhatsApp copia-se a mensagem inteira —
  // com prosa junto, o copia-e-cola não cola no banco.
  await reply(phone, copy.pixInstructions(total, charge.mock));
  await reply(phone, charge.copiaECola);
}

// The customer changed their mind about how to pay while the charge is still open:
// re-issue the charge with the other method (total re-derived from the order rows so
// the fee pass-through stays honest) and keep reconciliation on the same order id.
async function switchPaymentMethod(
  phone: string,
  order: { id: string; itemsSubtotal: number; serviceFee: number; deliveryFee: number; notes?: string | null },
  method: "pix" | "card"
) {
  const base = Math.round((order.itemsSubtotal + order.serviceFee + order.deliveryFee) * 100) / 100;
  const isCard = method === "card";
  const total = isCard ? cardTotal(base) : base;
  const cardFee = Math.round((total - base) * 100) / 100;
  const description = `Lia · pedido ${order.id.slice(-6)}`;
  // Replace ONLY the payment line — other notes (e.g. a cancel-request flag) survive.
  const notes = withPaymentNote(order.notes, paymentNote(method, isCard ? copy.brl(cardFee) : undefined));

  const charge = isCard
    ? await checkoutAdapter.createLink({ orderId: order.id, amount: total, description, method: "card" }).then((link) => ({
        pixId: link.preferenceId,
        payload: link.initPoint,
        mock: link.mock
      }))
    : await pixAdapter.createPix({ orderId: order.id, amount: total, description }).then((pix) => ({
        pixId: pix.pixId,
        payload: pix.copiaECola,
        mock: pix.mock
      }));
  await prisma.deliveryOrder.update({
    where: { id: order.id },
    data: { total, notes, pixId: charge.pixId, pixCopiaECola: charge.payload }
  });
  await reply(
    phone,
    [copy.paymentSwitched(method, total), charge.payload, charge.mock ? `\n${copy.sandboxHint()}` : ""].filter(Boolean).join("\n")
  );
}

// ---------- order lifecycle (called by webhook + operator dashboard) ----------

export async function markDeliveryOrderPaid(orderId: string) {
  // Atomic status flip: MP retries webhooks and the customer may text "paguei" at the
  // same moment — only ONE caller wins, so the confirmation goes out exactly once.
  const flipped = await prisma.deliveryOrder.updateMany({
    where: { id: orderId, status: "awaiting_payment" },
    data: { status: "paid", paidAt: new Date() }
  });
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order || flipped.count === 0) return order;
  // Reset the conversation (keep the address) so the next message starts a fresh
  // basket instead of resurrecting the awaiting_payment step. If the customer has
  // ALREADY started a new basket in this conversation, leave it alone — the async
  // webhook must not wipe an in-flight order.
  if (order.conversationId) {
    try {
      const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
      if (convo) {
        const ctx = readCtx(convo.context);
        const hasNewBasket = (ctx.basket?.length ?? 0) > 0 && ctx.deliveryOrderId !== orderId;
        if (!hasNewBasket) await writeCtx(convo.id, addressOnlyCtx(ctx));
      }
    } catch (error) {
      console.warn("[delivery:paid:ctx-reset]", error instanceof Error ? error.message : error);
    }
  }
  await reply(order.phone, copy.paymentConfirmed());
  return order;
}

export async function opsMarkBought(orderId: string, storeOrderNumber: string) {
  return prisma.deliveryOrder.update({
    where: { id: orderId },
    // Blank input stays null so pickupInstructions' "—" fallback works at dispatch.
    data: { status: "operator_buying", storeOrderNumber: storeOrderNumber.trim() || null }
  });
}

export async function opsDispatchCourier(orderId: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  const fulfillments = (order.fulfillments as unknown as StoreFulfillment[] | null) ?? [];
  if (fulfillments.length > 1) {
    const dispatches = [];
    for (const fulfillment of fulfillments) {
      const store = getStore(fulfillment.storeKey);
      const courier = getCourier(fulfillment.courierKey);
      dispatches.push(await courier.dispatch({
        orderId: `${order.id}-${fulfillment.storeKey}`,
        pickupAddress: fulfillment.unitAddress,
        dropoffAddress: order.deliveryAddress ?? "",
        pickupCep: fulfillment.unitCep,
        dropoffCep: order.cep ?? undefined,
        instructions: store.pickupInstructions(order.storeOrderNumber?.trim() || "—"),
        quoteId: fulfillment.courierQuoteId,
        dropoffName: order.customerName ?? undefined,
        dropoffPhone: order.phone
      }));
    }
    const tracking = dispatches.map((dispatch, index) => `${fulfillments[index].storeLabel}: ${dispatch.trackingUrl}`).join("\n");
    const updated = await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { status: "dispatched", courierTrackingUrl: tracking, courierDispatchedAt: new Date() }
    });
    await reply(order.phone, copy.dispatched(tracking));
    return updated;
  }
  const store = getStore(order.storeKey);
  const courier = getCourier(order.courierKey);
  // Re-derive the pickup unit so the connector can re-quote at dispatch (the order-time
  // quote has expired). dropoff CEP is the customer's.
  const unit = (await pickNearestUnit(store.listUnits(), order.cep ?? undefined)).unit;
  const dispatch = await courier.dispatch({
    orderId: order.id,
    pickupAddress: order.storeAddress ?? unit.address,
    dropoffAddress: order.deliveryAddress ?? "",
    pickupCep: unit.cep,
    dropoffCep: order.cep ?? undefined,
    instructions: store.pickupInstructions(order.storeOrderNumber?.trim() || "—"),
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
  await reply(order.phone, copy.dispatched(dispatch.trackingUrl));
  return updated;
}

export async function opsMarkDelivered(orderId: string) {
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: "delivered", deliveredAt: new Date() }
  });
  await reply(order.phone, copy.delivered());
  return order;
}

export async function opsCancelRefund(orderId: string) {
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: "canceled" }
  });
  await reply(order.phone, copy.canceledRefunded());
  return order;
}

// Free-text note from the operator to the customer (out-of-stock, substitution,
// delay…) — sent as Lia, logged in the conversation.
export async function opsNotifyCustomer(orderId: string, text: string) {
  const message = (text ?? "").trim();
  if (!message) throw new Error("Empty message");
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  await reply(order.phone, message);
  if (order.conversationId) {
    try {
      await prisma.message.create({
        data: { conversationId: order.conversationId, sender: "operator", text: message }
      });
    } catch (error) {
      console.warn("[ops:notify:log]", error instanceof Error ? error.message : error);
    }
  }
  return order;
}

export async function getOperatorQueue() {
  return prisma.deliveryOrder.findMany({
    where: { status: { in: ["paid", "operator_buying", "ready_for_pickup", "dispatched"] } },
    orderBy: { createdAt: "asc" }
  });
}

// Someone asked from outside the delivery area. Deduped by (phone, cep); repeats bump
// `hits` so the /ops demand map reflects real intensity. Never throws into the chat flow.
export async function recordWaitlistLead(input: {
  phone: string;
  cep: string;
  city?: string;
  uf?: string;
  reason?: "outside_coverage" | "too_far" | "fee_too_high";
}) {
  const phone = normalizePhone(input.phone);
  const reason = input.reason ?? "outside_coverage";
  try {
    await prisma.waitlistLead.upsert({
      where: { phone_cep: { phone, cep: input.cep } },
      create: { phone, cep: input.cep, city: input.city ?? null, uf: input.uf ?? null, reason },
      update: { hits: { increment: 1 }, city: input.city ?? undefined, uf: input.uf ?? undefined, reason }
    });
  } catch (err) {
    console.error("[waitlist] failed to record lead", err);
  }
}

// Demand map for /ops: leads grouped by city (most-wanted first) + the latest raw entries.
export async function getWaitlist() {
  const leads = await prisma.waitlistLead.findMany({ orderBy: { updatedAt: "desc" }, take: 300 });
  const byRegion = new Map<string, { city: string; uf?: string; leads: number; hits: number; lastAt: Date }>();
  for (const l of leads) {
    const key = `${normalizeCity(l.city ?? "")}|${l.uf ?? ""}`;
    const cur = byRegion.get(key);
    if (cur) {
      cur.leads += 1;
      cur.hits += l.hits;
      if (l.updatedAt > cur.lastAt) cur.lastAt = l.updatedAt;
    } else {
      byRegion.set(key, { city: l.city ?? "—", uf: l.uf ?? undefined, leads: 1, hits: l.hits, lastAt: l.updatedAt });
    }
  }
  const regions = [...byRegion.values()].sort((a, b) => b.leads - a.leads || b.hits - a.hits);
  return { total: leads.length, regions, recent: leads.slice(0, 40) };
}
