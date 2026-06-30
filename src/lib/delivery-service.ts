import { prisma } from "@/lib/prisma";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";
import { getStore, DEFAULT_STORE_KEY, type StoreConnector } from "@/lib/stores";
import { queryTokens } from "@/lib/stores/types";
import { getCourier } from "@/lib/couriers";
import { pixAdapter } from "@/lib/payments/mercadopago";
import { extractShoppingList } from "@/lib/adapters/ai";

// The operational brain of the remodelled Lia. One conversation = one basket of
// everyday items, fulfilled from a pluggable store via clique-e-retire + courier.
// This module owns the WhatsApp conversation state machine AND the order lifecycle
// the operator dashboard drives.

// Your margin is baked into the product price (no separate fee line). Customer sees
// each item already +10%; you pay Carrefour the real price, the markup is yours.
const MARKUP = Number(process.env.LIA_PRICE_MARKUP ?? 1.1);

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

type ChoiceOption = { sku: string; name: string; brand?: string; unitPrice: number };
type PendingChoice = { query: string; qty: number; options: ChoiceOption[] };

type DeliveryContext = {
  flow?: "delivery";
  step?: "collecting" | "need_cep" | "choosing" | "quoted" | "awaiting_payment";
  basket?: BasketItem[];
  pending?: PendingChoice[];
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
  autoAdded: BasketItem[];
  pending: PendingChoice[];
  notFound: string[];
  greetingOnly: boolean;
  containsMedicine: boolean;
};

// Like buildBasket, but instead of auto-picking the top match it returns up to 3
// OPTIONS per item so the customer chooses (numbered list — tappable buttons need an
// approved WhatsApp Business sender). Items with a single match are auto-added.
async function buildChoices(text: string, store: StoreConnector): Promise<ChoicesResult> {
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
        options: options.slice(0, 3).map((o) => ({ sku: o.sku, name: o.name, brand: o.brand, unitPrice: o.unitPrice }))
      });
    }
  }
  return {
    autoAdded: dedupeBasket(autoAdded),
    pending,
    notFound,
    greetingOnly: greetingOnly && autoAdded.length === 0 && pending.length === 0,
    containsMedicine
  };
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
  const courier = getCourier(ctx.courierKey);
  const q = await courier.quote({
    pickupCep: unit.cep,
    dropoffCep: ctx.cep,
    pickupAddress: unit.address,
    dropoffAddress: ctx.deliveryAddress
  });
  // itemsSubtotal = real Carrefour cost (what the operator pays). serviceFee = the
  // 10% markup margin (yours; NOT shown to the customer as a line). The customer is
  // charged the marked-up products + the pass-through frete.
  const realSubtotal = (ctx.basket ?? []).reduce((sum, item) => sum + item.lineTotal, 0);
  const margin = Math.round(realSubtotal * (MARKUP - 1) * 100) / 100;
  ctx.storeUnitId = unit.id;
  ctx.storeUnitLabel = unit.label;
  ctx.storeUnitAddress = unit.address;
  ctx.deliveryFee = q.fee;
  ctx.etaMinutes = q.etaMinutes;
  ctx.courierQuoteId = q.quoteId;
  ctx.courierKey = q.courierKey;
  ctx.serviceFee = margin;
  ctx.itemsSubtotal = Math.round(realSubtotal * 100) / 100;
  ctx.total = Math.round((realSubtotal + margin + q.fee) * 100) / 100;
  ctx.step = "quoted";
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
  out.push("", "Pode confirmar? Responda *pagar* que eu te mando o Pix. 💚");
  return out.join("\n");
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

  // Global commands
  if (/^(cancelar|limpar|recome[cç]ar)$/.test(normalized)) {
    await writeCtx(convo.id, { cep: ctx.cep, deliveryAddress: ctx.deliveryAddress });
    await reply(phone, "Beleza, limpei seu pedido. É só me dizer o que você quer. 🙂");
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
        if (belowMinimum(ctx, store)) {
          ctx.step = "collecting";
          await writeCtx(convo.id, ctx);
          await reply(phone, `📍 Endereço salvo: ${ctx.deliveryAddress ?? cepInMsg}.\n\n${minimumOrderText(ctx, store)}`);
        } else {
          await writeCtx(convo.id, ctx);
          await reply(phone, `📍 Endereço salvo: ${ctx.deliveryAddress ?? cepInMsg}.\n\n${summaryText(ctx)}`);
        }
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

  // Confirm + generate Pix
  if (ctx.step === "quoted" && /\b(pagar|confirmar|confirmo|fechar|sim|pode)\b/.test(normalized)) {
    await createOrderAndCharge(phone, user.id, convo.id, ctx);
    return;
  }

  // Customer is choosing one of the (max 3) options we offered for an ambiguous item.
  if (ctx.step === "choosing" && ctx.pending?.length) {
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
    ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(chosen, current.qty, store)]);
    ctx.pending = ctx.pending.slice(1);
    if (ctx.pending.length) {
      await writeCtx(convo.id, ctx);
      await reply(phone, `✅ ${chosen.name}.\n\n${choicesText(ctx.pending[0])}`);
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
    await quoteBasket(ctx, store);
    ctx.flow = "delivery";
    if (belowMinimum(ctx, store)) {
      ctx.step = "collecting";
      await writeCtx(convo.id, ctx);
      await reply(phone, minimumOrderText(ctx, store));
      return;
    }
    await writeCtx(convo.id, ctx);
    await reply(phone, summaryText(ctx));
    return;
  }

  // Otherwise: treat as a basket (items list). The search can take a couple seconds,
  // so acknowledge first (except for plain greetings) — no more silence.
  if (!/^(oi+|ola+|opa|e ?ai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|alo)\??!?$/.test(normalized)) {
    await reply(phone, "🔎 Procurando, só um instante…");
  }
  const { autoAdded, pending, notFound, greetingOnly, containsMedicine } = await buildChoices(text, store);

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
    ctx.cep = ctx.cep ?? user.cep ?? undefined;
    await writeCtx(convo.id, ctx);
    await reply(phone, choicesText(pending[0]));
    return;
  }

  const next: DeliveryContext = { flow: "delivery", basket: baseBasket, notFound, cep: ctx.cep ?? user.cep ?? undefined, deliveryAddress: ctx.deliveryAddress };
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
  const store = getStore(DEFAULT_STORE_KEY);
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
  if (belowMinimum(ctx, store)) {
    ctx.step = "collecting"; // block payment until the basket clears the store minimum
    await writeCtx(convoId, ctx);
    await reply(phone, minimumOrderText(ctx, store));
    return;
  }
  await writeCtx(convoId, ctx);
  await reply(phone, summaryText(ctx));
}

async function createOrderAndCharge(phone: string, userId: string, convoId: string, ctx: DeliveryContext) {
  // Hard guard: never charge an order below the store's minimum (un-fulfillable).
  const store = getStore(ctx.basket?.[0]?.storeKey ?? DEFAULT_STORE_KEY);
  if (belowMinimum(ctx, store)) {
    await reply(phone, minimumOrderText(ctx, store));
    return;
  }
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
      total: ctx.total ?? 0,
      status: "awaiting_payment"
    }
  });

  const charge = await pixAdapter.createPix({
    orderId: order.id,
    amount: order.total,
    description: `Lia · pedido ${order.id.slice(-6)}`
  });
  await prisma.deliveryOrder.update({
    where: { id: order.id },
    data: { pixId: charge.pixId, pixCopiaECola: charge.copiaECola }
  });

  ctx.deliveryOrderId = order.id;
  ctx.step = "awaiting_payment";
  await writeCtx(convoId, ctx);

  await reply(
    phone,
    [
      `Pronto! Total *${brl(order.total)}*.`,
      "",
      "Pague com o *Pix copia e cola* abaixo 👇",
      charge.copiaECola,
      "",
      charge.mock
        ? "_(sandbox: responda *paguei* pra simular o pagamento)_"
        : "Assim que o pagamento cair, eu já começo a separar e te aviso o rastreio. 💚"
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
  const dispatch = await courier.dispatch({
    orderId: order.id,
    pickupAddress: order.storeAddress ?? "",
    dropoffAddress: order.deliveryAddress ?? "",
    instructions: store.pickupInstructions(order.storeOrderNumber ?? "—"),
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
