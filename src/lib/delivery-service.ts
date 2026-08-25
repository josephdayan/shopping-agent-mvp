import { displayPrice, serviceFeeForItems, serviceFeeForSubtotal } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";
import {
  getStore,
  DEFAULT_STORE_KEY,
  pickStoreForQueries,
  gatherCrossStoreCandidates,
  prefetchLongTailIfNeeded,
  allUnits,
  type StoreCandidate,
  type StoreConnector
} from "@/lib/stores";
import { pickNearestUnit } from "@/lib/stores/nearest";
import { mercadoLivreEnabled, prefetchMercadoLivre, searchMercadoLivre } from "@/lib/stores/mercadolivre";
import { mlItemIdFrom } from "@/lib/ml-freight";
import { checkFreightGuard, type FreightBlock } from "@/lib/freight-guard";
import {
  attrMatchesItem,
  conciergeMatchIsStrong,
  diversifyOptions,
  inferCatalogRefinement,
  queryTokens,
  sameProductVariant,
  scoreCatalogMatch
} from "@/lib/stores/types";
import { assertDispatchIsAllowed, getCourier, quoteAll } from "@/lib/couriers";
import { PaymentProviderError, checkoutAdapter, paymentsAreMocked, pixAdapter } from "@/lib/payments/mercadopago";
import {
  cardOnFileEnabled,
  confirmSavedCardTap,
  createCardAttempt,
  expireOpenPaymentAttempts,
  findPendingSavedCardAttempt,
  getConfirmedPaymentAttempt,
  getOneClickCredential
} from "@/lib/payments/whatsapp-pay";
import { createCardEnrollmentSession, isCardEnrollmentAvailable } from "@/lib/payments/card-enrollment";
import { extractShoppingList, rerankShoppingOptions } from "@/lib/adapters/ai";
import {
  computeStoreFreights,
  freightBreakdownLabel,
  instantQuoteEligible,
  PER_AD_FREIGHT_STORES,
  storeFreight,
  type InstantQuoteItem
} from "@/lib/instant-quote";
import { liveFreightEnabled, liveStoreFreight } from "@/lib/live-freight";
import { mlBasketFreight } from "@/lib/ml-freight";
import {
  detectIntent,
  detectPaymentMethod,
  isQuestion,
  asksRunningTotal,
  looksLikeMedicine,
  hasUrgencySignal,
  isRequestModifier,
  sharesProductNoun,
  stripMedicineNegation,
  narrowChoiceByName,
  normalizeMsg,
  parseBasketLines,
  parseContextualQuantity,
  parsePriceCap,
  splitPriceCap,
  mergeShoppingLines,
  parseChoiceReply,
  stripListNumbering,
  parseRefinement,
  wantsMoreOptions,
  type Intent,
  type ParsedLine
} from "@/lib/lia-intents";
import {
  ACTIVE_DELIVERY_ORDER_STATUSES,
  AWAITING_OPERATOR_QUOTE_STATUS,
  CONCIERGE_STORE_KEY,
  CONCIERGE_STORE_LABEL,
  OPS_QUEUE_STATUSES,
  PAID_OR_IN_FULFILLMENT_STATUSES,
  REFUND_CONFIRMED_PREFIX,
  REFUND_PENDING_FLAG,
  REPEATABLE_DELIVERY_ORDER_STATUSES,
  RETAILER_OUT_FOR_DELIVERY_STATUS,
  appendOrderNote,
  isCardCharge,
  isOperatorCourierOrder,
  isOrderOutForDelivery,
  isRetailerDeliveryOrder,
  paymentNote,
  statusAfterStorePurchase,
  withPaymentNote
} from "@/lib/order-flags";
import { checkCoverage, coverageLabel, isSaoPauloState, normalizeCity } from "@/lib/coverage";
import * as copy from "@/lib/lia-copy";

// The operational brain of the remodelled Lia. One conversation = one basket of
// everyday items, fulfilled by a pluggable store. Retailer delivery is the default;
// pickup + courier remains only for formally-authorized partners. This module owns
// the WhatsApp conversation state machine AND the order lifecycle the operator
// dashboard drives. Intent detection lives in lia-intents (pure, unit-tested) and
// every customer-facing string lives in lia-copy.

// The active product: a WhatsApp concierge with breadth — the customer asks
// for anything from anywhere, the operator sources, prices and buys it by hand, and a
// courier (Uber Direct/Lalamove) delivers same-hour from the operator to the customer.
// No live retailer automation (Browserbase) sits on the critical path here; the operator
// is the source of truth for the quote. Flip LIA_MANUAL_CONCIERGE=false to fall back to
// the legacy catalog auto-quote flow (still exercised by the conversation evals).
function manualConciergeEnabled(): boolean {
  return process.env.LIA_MANUAL_CONCIERGE !== "false";
}

// Alerta operacional no WhatsApp do operador (LIA_OPERATOR_PHONE; sem env = silêncio).
// Caso real (11/08): um pedido ficou 2 DIAS em awaiting_operator_quote porque nada avisava
// o operador de que havia trabalho no /ops — pro cliente, o "te mando em instantes" virou
// nunca. Best-effort: falha de envio jamais afeta o fluxo do cliente.
async function notifyOperator(text: string) {
  const to = process.env.LIA_OPERATOR_PHONE?.trim();
  if (!to) return;
  try {
    await whatsappAdapter.sendMessage(to, text);
  } catch (error) {
    console.warn("[operator-alert:failed]", error instanceof Error ? error.message : error);
  }
}

// Where the operator hands the goods to the courier (their own base). Same-hour courier
// pickup is from HERE, never a store counter — so the retailer third-party-pickup document
// rules never apply. Configured once via env for same-hour operation.
function operatorPickup(): { address: string; cep?: string } {
  const address = process.env.LIA_OPERATOR_PICKUP_ADDRESS?.trim();
  const cep = process.env.LIA_OPERATOR_PICKUP_CEP?.replace(/\D/g, "");
  return {
    address: address || "",
    cep: cep || undefined
  };
}

function requireOperatorPickup(): { address: string; cep: string } {
  const pickup = operatorPickup();
  if (!pickup.address || !pickup.cep || pickup.cep.length !== 8) {
    throw new Error("Configure LIA_OPERATOR_PICKUP_ADDRESS e LIA_OPERATOR_PICKUP_CEP antes de despachar o courier.");
  }
  return { address: pickup.address, cep: pickup.cep };
}

function customerCoverageLabel(): string {
  return manualConciergeEnabled() ? "o estado de São Paulo" : coverageLabel();
}

// Your margin is baked into the product price (no separate fee line). O markup é
// PROGRESSIVO por faixa (23/08): vive em src/lib/pricing.ts — displayPrice é o ponto
// único; serviceFeeForItems/Subtotal mantêm o total consistente com os cards.

// Card MDR (~4.99% à vista) passed through to the customer when they choose card, so the
// 10% margin survives. Gross-up: charged = net / (1 - mdr). Tunable via env as volume
// lowers the rate. Pix has no fee, so its total is the base.
const CARD_MDR = Math.min(0.3, Math.max(0, Number(process.env.LIA_CARD_MDR ?? 0.0499)));
function cardTotal(base: number): number {
  return Math.round((base / (1 - CARD_MDR)) * 100) / 100;
}

function display(price: number): number {
  return displayPrice(price);
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
  // A oferta escolhida declarava frete grátis (anúncio do ML) — a cotação não cobra
  // frete por cima do que o próprio anúncio dá de graça.
  freeShipping?: boolean;
};

type ChoiceOption = { sku: string; name: string; brand?: string; unitPrice: number; imageUrl?: string; productUrl?: string; storeKey?: string; storeLabel?: string; delivery?: string; freeShipping?: boolean };
type StoreFulfillment = {
  storeKey: string;
  storeLabel: string;
  unitId: string;
  unitLabel: string;
  unitAddress: string;
  unitCep?: string;
  courierKey: string;
  courierQuoteId: string;
  deliveryMode?: "retailer_delivery" | "authorized_courier";
  deliveryPromise?: string;
  retailerTotal?: number;
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
  // TODA opção já mostrada (com dados completos), para o toque num card ANTIGO — de
  // antes do "outras"/refino — continuar escolhendo exatamente o produto daquele card.
  // Caso real 11/08: ids posicionais fizeram "Escolher esse" confirmar outro produto.
  shownOptions?: ChoiceOption[];
  // Escolha REABERTA ("Outras opções" depois de já ter escolhido): o novo pick
  // SUBSTITUI esta linha da cesta em vez de somar uma segunda mochila.
  replaceSku?: string;
};

// A frete option the customer can pick between (cheapest vs fastest courier).
type CourierOption = { kind: "barato" | "rapido"; courierKey: string; quoteId: string; fee: number; etaMinutes: number };

type DeliveryContext = {
  flow?: "delivery";
  step?:
    | "collecting"
    | "need_cep"
    | "need_address"
    | "choosing"
    | "choosing_quantity"
    | "quoted"
    | "choosing_courier"
    | "choosing_freight"
    | "choosing_payment"
    | "awaiting_operator_quote"
    | "awaiting_supplier_validation"
    | "awaiting_quote_confirmation"
    | "payment_issuing"
    | "awaiting_payment";
  basket?: BasketItem[];
  pending?: PendingChoice[];
  quantityChoice?: { option: ChoiceOption; storeKey: string; storeLabel: string };
  courierOptions?: CourierOption[];
  // Cotação instantânea PARADA esperando o cliente escolher a entrega (barata/lenta ×
  // rápida/cara do anúncio). Nada é cobrado antes do toque; os dois totais já estão
  // calculados, então a resposta publica a cotação na hora.
  freightChoice?: {
    orderId: string;
    itemsSubtotal: number;
    // Margem exata por item (faixas progressivas) — botões e publicação usam o MESMO
    // número, consistente com os preços dos cards.
    serviceFee?: number;
    // Quando o frete/data foram consultados no anúncio (epoch ms). É o que permite
    // recusar um toque de botão feito dias depois, com promessa de entrega já vencida.
    quotedAt?: number;
    stores: number;
    barato: { fee: number; estimate?: string };
    rapido: { fee: number; estimate?: string };
  };
  storeKey?: string;
  notFound?: string[];
  // Proposta viva de troca de loja pro pedido mínimo (24/08): itens da loja travada +
  // substitutos de loja sem mínimo. Validada contra a cesta na hora do aceite.
  minSwap?: {
    fromStoreKey: string;
    replacements: { fromSku: string; qty: number; option: ChoiceOption }[];
  };
  // Última escolha CONCLUÍDA (com o sku escolhido): "Outras opções"/"mais barato" fora
  // da escolha reabrem ela — o toque num card antigo não pode cair no "me diz de outro
  // jeito" (teste real 19/08).
  lastChoice?: PendingChoice & { chosenSku: string };
  // Pedido em texto cru aguardando o CEP do onboarding — vira busca COM OPÇÕES depois.
  pendingRequest?: string;
  cep?: string;
  city?: string;
  uf?: string;
  deliveryAddress?: string;
  // ViaCEP only identifies the street/area; a courier needs the customer's actual
  // destination. This flips true only after the customer confirms a full address.
  deliveryAddressVerified?: boolean;
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
  // Cliente sinalizou que quer receber HOJE/agora ("urgente", "pra hoje"). Vira a tag
  // "⚡ URGENTE" no pedido do /ops — o operador escolhe o canal por isso na cotação.
  urgent?: boolean;
};

const ACTIVE_ORDER_STATUSES = ACTIVE_DELIVERY_ORDER_STATUSES;

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
    // Id DETERMINÍSTICO por cliente: duas mensagens simultâneas do mesmo número
    // convergem para a MESMA conversa, porque upsert por chave primária é atômico.
    // Com `create`, o ler-depois-criar abria DUAS conversas ativas — cada mensagem
    // caía numa, dividindo a cesta e furando o dedupe do webhook (que é por conversa).
    // Conversa nunca é desativada no produto, então reaproveitar o id é seguro.
    convo = await prisma.conversation.upsert({
      where: { id: `conv_${user.id}` },
      update: { status: "active" },
      create: { id: `conv_${user.id}`, userId: user.id, status: "active", currentStep: "delivery" }
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
  return {
    flow: "delivery",
    cep: ctx.cep ?? userCep ?? undefined,
    deliveryAddress: ctx.deliveryAddress,
    deliveryAddressVerified: ctx.deliveryAddressVerified
  };
}

// TTL de abandono: cotação parada + cliente sumido = ele não quer mais aquilo. Lido a
// cada chamada (e não uma vez no módulo) porque os evals ajustam o env em tempo de teste.
function quoteAbandonTtlMs(): number {
  const configured = Number(process.env.LIA_QUOTE_ABANDON_TTL_MS ?? 60 * 60 * 1000);
  return Number.isFinite(configured) && configured > 0 ? configured : 60 * 60 * 1000;
}

// Toque nos botões da escolha de entrega (barata × rápida).
function isFreightChoicePayload(text: string): boolean {
  return /^frete:(barato|rapido)$/.test(normalizeMsg(text));
}

// A conversa não pode continuar apontando para um pedido que FECHOU (pago, cancelado,
// estornado): o cliente ouvia "ainda estou cotando" de um pedido morto e, em
// `choosing_freight`, o botão de frete caía num erro sem saída. Se ele JÁ começou outra
// cesta/outro pedido aqui, o contexto novo vale mais e nada é apagado.
async function resetConversationForClosedOrder(
  order: { id: string; conversationId?: string | null },
  tag: string
) {
  if (!order.conversationId) return;
  try {
    const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
    if (!convo) return;
    const ctx = readCtx(convo.context);
    const movedOn = Boolean(ctx.deliveryOrderId) && ctx.deliveryOrderId !== order.id;
    const hasNewBasket = (ctx.basket?.length ?? 0) > 0 && ctx.deliveryOrderId !== order.id;
    if (movedOn || hasNewBasket) return;
    await writeCtx(convo.id, addressOnlyCtx(ctx));
  } catch (error) {
    console.warn(`[delivery:${tag}:ctx-reset]`, error instanceof Error ? error.message : error);
  }
}

async function reply(phone: string, text: string) {
  await whatsappAdapter.sendMessage(phone, text);
}

// Quando o cliente falou/agiu pela última vez ANTES desta mensagem. Base dos dois TTLs
// (cesta parada, cotação abandonada). Usa a mensagem anterior da conversa — NÃO o
// `Conversation.updatedAt`: ele se move quando contexto é gravado E quando o lock de
// turno é reivindicado, então nunca serviria de relógio de inatividade; já a mensagem
// anterior é a atividade real (toda mensagem, do cliente ou da Lia, conta).
async function lastActivityAt(convoId: string, exceptMessageId?: string): Promise<Date | undefined> {
  const previous = await prisma.message.findFirst({
    where: { conversationId: convoId, ...(exceptMessageId ? { id: { not: exceptMessageId } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  return previous?.createdAt;
}

// Um turno POR VEZ por conversa (2ª revisão, 11/08). Duas mensagens simultâneas do
// mesmo cliente liam a mesma cesta e cada uma gravava o contexto INTEIRO — a última
// apagava o item da primeira. Lock cooperativo no banco (vale entre instâncias
// serverless): claim atômico via updateMany; TTL de 60s liberta conversa de turno
// travado; quem espera demais entra assim mesmo (o webhook não pode pendurar — melhor
// a corrida rara de antes do que mensagem sem resposta).
const TURN_LOCK_TTL_MS = 60_000;
const TURN_LOCK_MAX_WAIT_MS = 15_000;

async function acquireTurnLock(convoId: string): Promise<string> {
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + TURN_LOCK_MAX_WAIT_MS;
  for (;;) {
    const claimed = await prisma.conversation.updateMany({
      where: {
        id: convoId,
        OR: [{ turnLock: null }, { turnLockAt: null }, { turnLockAt: { lt: new Date(Date.now() - TURN_LOCK_TTL_MS) } }]
      },
      data: { turnLock: token, turnLockAt: new Date() }
    });
    if (claimed.count) return token;
    if (Date.now() >= deadline) {
      console.warn("[turn-lock:barge]", convoId);
      await prisma.conversation.updateMany({ where: { id: convoId }, data: { turnLock: token, turnLockAt: new Date() } });
      return token;
    }
    await sleep(400);
  }
}

async function releaseTurnLock(convoId: string, token: string) {
  try {
    // Só solta se o lock ainda é NOSSO — quem entrou por barge/TTL não pode ser solto
    // por um turno velho terminando atrasado.
    await prisma.conversation.updateMany({ where: { id: convoId, turnLock: token }, data: { turnLock: null, turnLockAt: null } });
  } catch (error) {
    console.warn("[turn-lock:release-failed]", error instanceof Error ? error.message : error);
  }
}

// Mensagens de ESPERA de cotação sempre saem com o botão "Cancelar pedido" no Meta
// (pedido do dono, 11/08: a saída tem que estar visível, não escondida num comando).
// Sem Meta (ou em falha), cai no texto puro — "cancelar" digitado funciona igual.
// Dispara "estou procurando" só se a busca passar de LIA_SEARCH_NOTICE_MS (2,5s) —
// busca de catálogo local (instantânea) nunca chega a mandar a mensagem.
const lastSearchNoticeAt = new Map<string, number>();

// Início do turno por telefone: o orçamento do resgate de última chance mede daqui.
export const turnStartedAt = new Map<string, number>();

function searchNoticeTimer(phone: string): { cancel: () => void } {
  const delay = Number(process.env.LIA_SEARCH_NOTICE_MS ?? 2500);
  const timer = setTimeout(() => {
    // Um aviso por rajada: a busca inicial e o resgate de última chance criam timers
    // separados e o cliente via "Procurando…" DUAS vezes (teste real 19/08).
    const last = lastSearchNoticeAt.get(phone) ?? 0;
    if (Date.now() - last < 90_000) return;
    lastSearchNoticeAt.set(phone, Date.now());
    void reply(phone, copy.searchingWider()).catch(() => {});
  }, delay);
  return { cancel: () => clearTimeout(timer) };
}

async function replyQuoteNotice(phone: string, text: string) {
  try {
    if (await whatsappAdapter.sendCancelableNotice(phone, text)) return;
  } catch (error) {
    console.warn("[whatsapp:cancel-notice:fallback-text]", error instanceof Error ? error.message : error);
  }
  await reply(phone, text);
}

// ---------- basket parsing + catalog matching ----------

type ExtractedLines = { lines: ParsedLine[]; greetingOnly: boolean; containsMedicine: boolean };

// Clean the request into a shopping list. The LLM handles greetings, synonyms
// ("pasta de dente"->creme dental), medicines and quantities; the deterministic
// splitter + medicine word-list covers OpenAI-off and OpenAI-error, so a remédio
// never slips through as a plain search.
async function extractLines(text: string): Promise<ExtractedLines> {
  // "sem remédio"/"não quero remédio" é negação: sai da mensagem ANTES de qualquer
  // detecção — senão a Lia avisa que removeu um medicamento que ninguém pediu
  // (rodadas 4 e 14 dos testes reais de 14/08).
  const sanitized = stripMedicineNegation(text);
  const extraction = await extractShoppingList(sanitized);
  const deterministic = parseBasketLines(sanitized)
    .filter((line) => queryTokens(line.phrase).length)
    .filter((line) => !looksLikeMedicine(line.phrase));
  if (extraction) {
    // A IA às vezes devolve contexto como item ("Para uma viagem") — o mesmo filtro de
    // modificador do parser determinístico vale pra ela (6º ciclo, rodada 1).
    const items = extraction.items.filter((item) => !looksLikeMedicine(item.query) && !isRequestModifier(item.query));
    return {
      lines: mergeShoppingLines(items.map((item) => ({ phrase: item.query, qty: item.qty })), deterministic),
      greetingOnly: extraction.greetingOnly,
      containsMedicine: extraction.containsMedicine || looksLikeMedicine(sanitized)
    };
  }
  const raw = parseBasketLines(sanitized).filter((line) => queryTokens(line.phrase).length);
  const safe = deterministic;
  return {
    lines: safe,
    greetingOnly: false,
    containsMedicine: safe.length < raw.length || looksLikeMedicine(sanitized)
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
  // As mesmas linhas de `notFound`, mas com a quantidade preservada. O concierge precisa
  // disso para transformar "2 pães de forma" numa linha livre com qty=2 em vez de perder o
  // número no caminho (o fluxo legado só mostra os nomes, por isso `notFound` é string[]).
  notFoundLines: ParsedLine[];
  // As opções já passaram pelo julgamento semântico da IA (rerank). Quando true, o piso
  // léxico do concierge NÃO deve rodar por cima: a IA entende sinônimos que o piso mata
  // ("escova de dente" ≈ "Escova Dental") e já descartou o que não serve.
  reranked: boolean;
  greetingOnly: boolean;
  containsMedicine: boolean;
};

// Like buildBasket, but instead of auto-picking the top match it returns up to 3
// OPTIONS per item so the customer chooses (numbered list — tappable buttons need an
// approved WhatsApp Business sender).
async function buildChoices(
  text: string,
  lockedStoreKey?: string,
  preferredSkus?: Map<string, number>,
  onLongTailSearch?: () => void,
  forceLongTail?: boolean
): Promise<ChoicesResult> {
  // Enquanto a IA extrai a lista (~2-5s), o parser determinístico já sabe quais linhas
  // não têm match local forte — o run frio do ML (~21s) começa AGORA e roda em paralelo.
  // A busca de verdade lá embaixo se acopla ao mesmo run (dedupe em voo no conector).
  const crossStore = !lockedStoreKey && manualConciergeEnabled();
  if (crossStore && !forceLongTail && mercadoLivreEnabled()) {
    const sanitized = stripMedicineNegation(text);
    for (const line of parseBasketLines(sanitized)) {
      if (!queryTokens(line.phrase).length || looksLikeMedicine(line.phrase)) continue;
      void prefetchLongTailIfNeeded(splitPriceCap(line.phrase).phrase).catch(() => {});
    }
  }

  const { lines, greetingOnly, containsMedicine } = await extractLines(text);

  // Candidatos por linha. No concierge sem loja travada a busca é LARGA (todas as
  // vitrines): eleger uma loja única por palpite léxico escondia o item certo — no
  // empate a ordem do registry decidia, e "carregador usb c" caía na Petz (veicular)
  // com o carregador de parede USB-C parado na Pague Menos. No fluxo legado vale
  // "one order = one store", então a linha continua buscando numa loja só.
  const perLine = await Promise.all(
    lines.map(async (line) => {
      // "vinho até 40 reais": o teto NÃO é termo de busca — vira filtro sobre o
      // preço exibido (com markup), senão a lista mostra item acima do que pediram.
      const { phrase: searchPhrase, cap } = splitPriceCap(line.phrase);
      let candidates: StoreCandidate[];
      if (crossStore) {
        candidates = await gatherCrossStoreCandidates(searchPhrase, 12, 4, { onLongTailSearch, forceLongTail });
      } else {
        const lineStore = lockedStoreKey ? getStore(lockedStoreKey) : await pickStoreForQueries([searchPhrase]);
        candidates = (await lineStore.searchItems(searchPhrase, 12)).map((item) => ({ store: lineStore, item }));
      }
      if (cap != null) candidates = candidates.filter((c) => display(c.item.unitPrice) <= cap);
      // Tamanho/volume pedido ("30 litros", "2kg") vale para TODOS os cards, não só a
      // escolha (rodada 7, 4º ciclo: 1 das 3 opções não era de 30l). Se ao menos um
      // candidato tem o atributo, os que não têm saem da vitrine.
      const sizeAsk = searchPhrase.match(/\d+(?:[.,]\d+)?\s*(?:kg|ml|lt?s?|litros?|g(?![a-z]))\b/i)?.[0];
      if (sizeAsk) {
        const sized = candidates.filter((c) => attrMatchesItem(sizeAsk, c.item));
        if (sized.length) candidates = sized;
      }
      // Recompra: o que o cliente já escolheu antes sobe (sort estável preserva o
      // ranking de relevância entre itens sem histórico).
      candidates.sort((a, b) => (preferredSkus?.get(b.item.sku) ?? 0) - (preferredSkus?.get(a.item.sku) ?? 0));
      return { line: { ...line, phrase: searchPhrase }, candidates };
    })
  );

  // UMA chamada de IA julga todas as linhas: dos candidatos, o que é realmente o
  // produto pedido, em que ordem — e lista vazia quando nada serve (a linha vira
  // livre/não-achei, que é o resultado honesto). IA off/falhou → null → ranking
  // determinístico de sempre, diversificado.
  const withCandidates = perLine.filter((entry) => entry.candidates.length);
  const rerank = withCandidates.length
    ? await rerankShoppingOptions(
        text,
        withCandidates.map((entry) => ({
          query: entry.line.phrase,
          candidates: entry.candidates.map((c) => ({
            sku: c.item.sku,
            name: c.item.name,
            brand: c.item.brand,
            price: display(c.item.unitPrice),
            store: c.store.label
          }))
        }))
      )
    : null;
  const rerankedSkus = new Map<(typeof perLine)[number], string[]>();
  if (rerank) withCandidates.forEach((entry, i) => rerankedSkus.set(entry, rerank.lines[i].skus));

  const autoAdded: BasketItem[] = [];
  const pending: PendingChoice[] = [];
  const notFound: string[] = [];
  const notFoundLines: ParsedLine[] = [];
  let firstStore: StoreConnector | undefined;
  for (const entry of perLine) {
    const { line, candidates } = entry;
    const bySku = new Map(candidates.map((c) => [c.item.sku, c]));
    const chosen = rerankedSkus.get(entry);
    const options: StoreCandidate[] = chosen
      ? chosen.map((sku) => bySku.get(sku)).filter((c): c is StoreCandidate => Boolean(c))
      : diversifyOptions(line.phrase, candidates.map((c) => c.item), 3).map((item) => bySku.get(item.sku)!);
    if (!options.length) {
      notFound.push(line.phrase);
      notFoundLines.push(line);
      continue;
    }
    firstStore = firstStore ?? options[0].store;
    pending.push({
      query: line.phrase,
      qty: line.qty,
      ...(line.qtyExplicit ? { qtyExplicit: true } : {}),
      options: options.slice(0, 3).map(({ store, item }) =>
        toChoiceOption(item, { storeKey: store.key, storeLabel: store.label })
      )
    });
  }
  return {
    store: firstStore ?? getStore(lockedStoreKey),
    autoAdded: dedupeBasket(autoAdded),
    pending,
    notFound,
    notFoundLines,
    reranked: Boolean(rerank),
    greetingOnly: greetingOnly && autoAdded.length === 0 && pending.length === 0,
    containsMedicine
  };
}

async function buildChoicesWithSearchNotice(
  phone: string,
  text: string,
  lockedStoreKey?: string,
  preferredSkus?: Map<string, number>,
  forceLongTail?: boolean
): Promise<ChoicesResult> {
  let notice: ReturnType<typeof searchNoticeTimer> | undefined;
  return buildChoices(
    text,
    lockedStoreKey,
    preferredSkus,
    () => {
      notice ??= searchNoticeTimer(phone);
    },
    forceLongTail
  ).finally(() => notice?.cancel());
}

// The store an in-progress order belongs to (picked when the basket was built).
function orderStore(ctx: DeliveryContext): StoreConnector {
  return getStore(ctx.storeKey ?? ctx.basket?.[0]?.storeKey ?? DEFAULT_STORE_KEY);
}

// A free-form concierge line: whatever the customer asked for, verbatim. No catalog
// price yet — the operator sets the real price at quote time. The name-based sku lets
// mergeBaskets fold duplicates ("mais 2 pães").
function conciergeItem(phrase: string, qty: number): BasketItem {
  const name = phrase.trim().replace(/\s+/g, " ");
  return {
    sku: `concierge:${normalizeMsg(name)}`,
    name,
    qty: Math.max(1, qty),
    unitPrice: 0,
    lineTotal: 0,
    storeKey: CONCIERGE_STORE_KEY,
    storeLabel: CONCIERGE_STORE_LABEL
  };
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
    ...(o.productUrl ? { productUrl: o.productUrl } : {}),
    ...(o.freeShipping ? { freeShipping: true } : {})
  };
}

// Customer-facing options message (prices already marked up; no store name).
function choicesTextFor(p: PendingChoice, header?: string): string {
  return copy.choicesText(
    p.query,
    p.options.map((o) => ({ name: customerChoiceName(p, o), displayPrice: display(o.unitPrice), delivery: o.delivery })),
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
  o: { sku: string; name: string; brand?: string; unitPrice: number; imageUrl?: string; productUrl?: string; category?: string; freeShipping?: boolean },
  storeRef?: { storeKey?: string; storeLabel?: string }
): ChoiceOption {
  // Vitrine ao vivo do ML manda o prazo do anúncio em `category` ("chega hoje").
  const delivery = storeRef?.storeKey === "mercadolivre" ? o.category : undefined;
  return {
    sku: o.sku,
    name: o.name,
    brand: o.brand,
    unitPrice: o.unitPrice,
    imageUrl: o.imageUrl,
    productUrl: o.productUrl,
    ...storeRef,
    ...(delivery ? { delivery } : {}),
    ...(o.freeShipping ? { freeShipping: true } : {})
  };
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
        // O id do botão carrega o SKU, não a posição: card antigo (de antes do
        // "outras"/refino) tocado depois escolhe o produto DAQUELE card — id
        // posicional confirmava outro produto quando a lista trocava por baixo.
        p.options.map((o) => ({
          id: `optsku:${o.sku}`,
          name: customerChoiceName(p, o),
          displayPrice: display(o.unitPrice),
          imageUrl: o.imageUrl,
          delivery: o.delivery
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
    await replyPhoto(phone, copy.choiceLine(i, o.name, display(o.unitPrice), o.delivery), o.imageUrl);
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
    // A store with no physical units (e.g. Oba, vitrine-only stores) is fulfilled by
    // retailer delivery or the concierge operator — there is no pickup counter, so the
    // legacy distance guard doesn't apply and the courier quote uses the customer's own
    // CEP as a proxy (fine for the mock/base-fee path this legacy flow relies on).
    const units = groupStore.listUnits();
    const near = units.length ? await pickNearestUnit(units, ctx.cep) : null;
    const distBlock = near ? checkFreightGuard({ distanceKm: near.distanceKm }) : null;
    if (distBlock) {
      ctx.guardBlock = distBlock;
      return;
    }
    const unit = near?.unit;
    const pool = await quoteAll({ pickupCep: unit?.cep ?? ctx.cep, dropoffCep: ctx.cep, pickupAddress: unit?.address ?? ctx.deliveryAddress, dropoffAddress: ctx.deliveryAddress });
    const quotes = pool.length
      ? pool
      : [await getCourier().quote({ pickupCep: unit?.cep ?? ctx.cep, dropoffCep: ctx.cep, pickupAddress: unit?.address ?? ctx.deliveryAddress, dropoffAddress: ctx.deliveryAddress })];
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
      // Unit-less store: the retailer/concierge delivers, so there is no pickup counter.
      unitId: unit?.id ?? "retailer",
      unitLabel: unit?.label ?? groupStore.label,
      unitAddress: unit?.address ?? "—",
      unitCep: unit?.cep,
      courierKey: cheapest.courierKey,
      courierQuoteId: cheapest.quoteId,
      deliveryFee: cheapest.fee,
      etaMinutes: cheapest.etaMinutes,
      itemsSubtotal,
      serviceFee: serviceFeeForSubtotal(itemsSubtotal)
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
    displayLineTotal: Math.round(display(item.unitPrice) * item.qty * 100) / 100
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
    deliveryAddress: ctx.deliveryAddress,
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
    await reply(phone, copy.tooFarForDelivery(ctx.city, customerCoverageLabel()));
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

// Minimum order is a PER-STORE rule (in real R$ of
// products), declared on the StoreConnector — NOT a global Lia rule. A store with no
// minimum sets 0 and this never triggers. min is on the real cost (what we pay the
// store); the customer is shown the marked-up equivalent.
function storeMinReal(store: StoreConnector): number {
  return store.minOrder ?? 0;
}
// Lojas da cesta (concierge = cesta mista) cujo subtotal está abaixo do mínimo DELAS.
// Linha do próprio concierge não tem loja real, então não tem mínimo — e `getStore` cai
// no default quando a chave é desconhecida, o que faria a Lia cobrar o mínimo do
// Carrefour por engano.
function conciergeStoresBelowMinimum(ctx: DeliveryContext): StoreConnector[] {
  return [...new Set((ctx.basket ?? []).map((item) => item.storeKey))]
    .filter((key): key is string => Boolean(key) && key !== CONCIERGE_STORE_KEY)
    .map((key) => getStore(key))
    .filter((store) => belowMinimum(ctx, store));
}

function belowMinimum(ctx: DeliveryContext, store: StoreConnector): boolean {
  const min = storeMinReal(store);
  const subtotal = (ctx.basket ?? []).filter((item) => item.storeKey === store.key).reduce((sum, item) => sum + item.lineTotal, 0);
  return min > 0 && subtotal < min;
}
function minimumOrderText(ctx: DeliveryContext, store: StoreConnector): string {
  const displayMin = display(storeMinReal(store));
  const real = (ctx.basket ?? []).filter((item) => item.storeKey === store.key).reduce((sum, item) => sum + item.lineTotal, 0);
  const produtos = (ctx.basket ?? [])
    .filter((item) => item.storeKey === store.key)
    .reduce((sum, item) => sum + Math.round(display(item.unitPrice) * item.qty * 100) / 100, 0);
  const falta = Math.max(0, Math.round((displayMin - produtos) * 100) / 100);
  const scoped = { ...ctx, basket: (ctx.basket ?? []).filter((item) => item.storeKey === store.key) };
  // O resto da cesta aparece junto: a mensagem parecia resumo COMPLETO e o cliente
  // achava que os outros itens tinham sumido (rodadas 3 e 10, 14/08).
  const others = { ...ctx, basket: (ctx.basket ?? []).filter((item) => item.storeKey !== store.key) };
  return copy.minimumOrder({
    items: basketForCopy(scoped),
    produtos,
    displayMin,
    falta,
    storeLabel: store.label,
    otherItems: basketForCopy(others)
  });
}

// Só o mínimo de UMA loja trava e os itens têm equivalente FORTE em loja sem mínimo →
// oferece a troca com botão. Melhor caminho pro cliente pequeno (teste real 24/08:
// pasta de R$6 presa no mínimo de R$30 do mercado; o cliente desistiu).
async function offerMinimumSwap(
  phone: string,
  convoId: string,
  ctx: DeliveryContext,
  store: StoreConnector
): Promise<boolean> {
  const stuck = (ctx.basket ?? []).filter((item) => item.storeKey === store.key);
  if (!stuck.length) return false;
  const replacements: { fromSku: string; qty: number; option: ChoiceOption }[] = [];
  for (const item of stuck) {
    const tokens = queryTokens(item.name);
    let found: ChoiceOption | undefined;
    for (const take of [4, 3]) {
      const query = tokens.slice(0, take).join(" ");
      if (!query) break;
      const candidates = await gatherCrossStoreCandidates(query, 12);
      const alts = candidates.filter(
        (c) =>
          c.store.key !== store.key &&
          storeMinReal(c.store) === 0 &&
          conciergeMatchIsStrong(query, c.item)
      );
      // Entre as lojas que servem, frete CONHECIDO ganha de tarifa padrão (R$18 numa
      // pasta de R$6 mataria a vantagem da troca), e o fee menor desempata.
      const ranked = alts
        .map((c) => ({ c, freight: storeFreight(c.store.key, c.store.label, 0) }))
        .sort((a, b) => {
          const aPad = a.freight.source === "padrao" ? 1 : 0;
          const bPad = b.freight.source === "padrao" ? 1 : 0;
          if (aPad !== bPad) return aPad - bPad;
          return a.freight.fee - b.freight.fee;
        });
      if (ranked.length) {
        const alt = ranked[0].c;
        found = toChoiceOption(alt.item, { storeKey: alt.store.key, storeLabel: alt.store.label });
        break;
      }
      // Nenhuma vitrine local sem mínimo tem o item → MERCADO LIVRE (dono, 25/08:
      // "ele pode ir pra outra loja, o Meli, e comprar direto"). Sem mínimo por
      // definição (cada anúncio é um checkout). Só anúncio que fecha sozinho serve:
      // com id (frete ao vivo por anúncio) ou frete grátis declarado — senão o
      // fechamento abortaria pro operador e a troca viraria espera.
      if (mercadoLivreEnabled()) {
        try {
          const mlItems = await searchMercadoLivre(query, 4);
          const mlAlt = mlItems.find(
            (item) =>
              conciergeMatchIsStrong(query, item) &&
              (item.freeShipping === true || mlItemIdFrom(item) !== null)
          );
          if (mlAlt) {
            const mlStore = getStore("mercadolivre");
            found = toChoiceOption(mlAlt, { storeKey: mlStore.key, storeLabel: mlStore.label });
            break;
          }
        } catch (error) {
          console.warn("[minswap:ml-failed]", error instanceof Error ? error.message : error);
        }
      }
    }
    if (!found) return false;
    replacements.push({ fromSku: item.sku, qty: item.qty, option: found });
  }
  const oldDisplay = stuck.reduce((sum, i) => sum + Math.round(display(i.unitPrice) * i.qty * 100) / 100, 0);
  const newDisplay = replacements.reduce((sum, r) => sum + Math.round(display(r.option.unitPrice) * r.qty * 100) / 100, 0);
  ctx.minSwap = { fromStoreKey: store.key, replacements };
  await writeCtx(convoId, ctx);
  const body = copy.minimumSwapOffer({ newTotal: newDisplay, delta: Math.round((newDisplay - oldDisplay) * 100) / 100, storeLabel: store.label });
  try {
    const interactive = await whatsappAdapter.sendStoreSwapOffer(phone, body);
    if (interactive) return true;
  } catch (error) {
    console.warn("[whatsapp:minswap:fallback-text]", error instanceof Error ? error.message : error);
  }
  await reply(phone, `${body}\n(responde *trocar de loja* que eu troco)`);
  return true;
}

// ---------- the WhatsApp conversation state machine ----------

export async function handleDeliveryMessage(input: { phone?: string; text: string; name?: string; messageId?: string }) {
  const phone = normalizePhone(input.phone);
  turnStartedAt.set(phone, Date.now());
  const text = (input.text ?? "").trim();
  const { user, convo } = await getOrCreateConvo(phone, input.name);

  // Twilio/Meta retry the webhook when a turn is slow — never process the same inbound
  // message twice (a duplicated "2 arroz" would silently double the basket). O dedupe é
  // ATÔMICO pelo índice único (conversationId, metadata): checar-depois-gravar deixava
  // duas entregas SIMULTÂNEAS do mesmo sid passarem juntas pelo findFirst.
  let inboundMessageId: string | undefined;
  try {
    const created = await prisma.message.create({
      data: { conversationId: convo.id, sender: "user", text, metadata: input.messageId }
    });
    inboundMessageId = created.id;
  } catch (error) {
    if (input.messageId && (error as { code?: string })?.code === "P2002") return;
    throw error;
  }

  // Um turno por vez por conversa (ver acquireTurnLock). O dedupe fica ANTES do lock
  // de propósito: retry do webhook sai na hora, sem esperar o turno original terminar.
  const lockToken = await acquireTurnLock(convo.id);
  try {
    // Recarrega a conversa DEPOIS do lock: o turno anterior pode ter gravado contexto
    // enquanto esperávamos — processar sobre o snapshot velho recriaria a corrida.
    const freshConvo = (await prisma.conversation.findUnique({ where: { id: convo.id } })) ?? convo;
    await handleDeliveryTurn(phone, text, user, freshConvo, inboundMessageId);
  } finally {
    await releaseTurnLock(convo.id, lockToken);
  }
}

async function handleDeliveryTurn(
  phone: string,
  text: string,
  user: Awaited<ReturnType<typeof getOrCreateConvo>>["user"],
  convo: Awaited<ReturnType<typeof getOrCreateConvo>>["convo"],
  inboundMessageId?: string
) {
  const ctx = readCtx(convo.context);
  // Addresses saved through the legacy checkout are customer-entered and can be
  // reused safely by the delivery flow.
  if (!ctx.deliveryAddress && user.defaultAddress) {
    ctx.deliveryAddress = user.defaultAddress;
    ctx.deliveryAddressVerified = true;
  }
  const intent = detectIntent(text);

  // Auto-expire a stale cart: if the last activity was over 30 min ago, start fresh
  // (keep only the saved address) so a leftover basket from a previous session doesn't
  // bleed into a new order — the reported "old items still there" problem.
  const CART_TTL_MS = Number(process.env.LIA_CART_TTL_MS ?? 30 * 60 * 1000);
  // ÚLTIMA ATIVIDADE REAL = a mensagem anterior da conversa. `Conversation.updatedAt` só
  // muda quando o contexto é gravado: quem só faz perguntas ("já saiu o total?") ficava
  // com o relógio parado e podia ser expirado no meio de uma conversa viva.
  const idleSince = await lastActivityAt(convo.id, inboundMessageId);
  const idleMs = idleSince ? Date.now() - idleSince.getTime() : 0;
  const stale = Boolean((ctx.basket?.length || ctx.pending?.length) && idleSince && idleMs > CART_TTL_MS);
  if (stale) {
    const hadBasket = (ctx.basket?.length ?? 0) > 0;
    const keptCep = ctx.cep;
    const keptAddr = ctx.deliveryAddress;
    const keptAddrVerified = ctx.deliveryAddressVerified;
    for (const key of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[key];
    ctx.flow = "delivery";
    ctx.cep = keptCep;
    ctx.deliveryAddress = keptAddr;
    ctx.deliveryAddressVerified = keptAddrVerified;
    // Persist before any early return (especially greeting). Previously the clear
    // lived only in memory, so the same stale warning repeated on every new message.
    await writeCtx(convo.id, ctx);
    // A stale product search is not a "cart" and should disappear silently. A real
    // basket gets context only when the customer is trying to continue, never before
    // a fresh greeting.
    if (hadBasket && intent.kind !== "greeting") await reply(phone, copy.cartExpired());
  }
  // "Foi embora no meio" (pedido do dono, 11/08): cotação parada + cliente sumido por
  // LIA_QUOTE_ABANDON_TTL_MS (60 min) = ele não quer mais aquilo. Na volta, o pedido
  // não-pago é cancelado sozinho, a conversa recomeça do zero (endereço preservado) e a
  // mensagem nova é processada normalmente — o zumbi de sábado (2 dias preso em
  // awaiting_operator_quote, camiseta caindo dentro) não pode se repetir. Pedido PAGO
  // nunca é tocado; awaiting_payment também não (o cliente pode estar pagando o Pix
  // agora mesmo — e a cotação vencida já bloqueia pagamento velho por conta própria).
  // `choosing_freight` entra na lista (revisão 18/08): a escolha da entrega ficava VIVA
  // pra sempre — o cliente sumia dias e o toque publicava frete e data consultados no
  // passado, já vencidos, numa cotação pagável.
  const QUOTE_ABANDON_TTL_MS = quoteAbandonTtlMs();
  const quoteWaitSteps: Array<DeliveryContext["step"]> = [
    "awaiting_operator_quote",
    "awaiting_supplier_validation",
    "awaiting_quote_confirmation",
    "choosing_freight"
  ];
  if (quoteWaitSteps.includes(ctx.step) && idleSince && idleMs > QUOTE_ABANDON_TTL_MS) {
    let canceledShortId: string | undefined;
    // O operador pode ter publicado a cotação no exato instante em que o cliente voltou.
    // Se a corrida for perdida, NÃO limpamos a conversa: o contexto correto acabou de ser
    // escrito por opsPublishManualQuote e o cliente já recebeu o total.
    let lostRaceToOperator = false;
    if (ctx.deliveryOrderId) {
      const order = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
      if (order?.status === AWAITING_OPERATOR_QUOTE_STATUS) {
        // Guardado por status no próprio UPDATE (nada de ler-depois-escrever por id).
        const canceled = await prisma.deliveryOrder.updateMany({
          where: { id: order.id, status: AWAITING_OPERATOR_QUOTE_STATUS },
          data: {
            status: "canceled",
            notes: appendOrderNote(order.notes, "⏰ Cancelado automático: cliente ficou 1h+ sem resposta antes da cotação sair.")
          }
        });
        if (canceled.count) canceledShortId = order.id.slice(-6).toUpperCase();
        else lostRaceToOperator = true;
      } else if (order && (await cancelPendingRetailerQuote(order.id))) {
        canceledShortId = order.id.slice(-6).toUpperCase();
      }
    }
    if (!lostRaceToOperator) {
      const fresh = addressOnlyCtx(ctx);
      for (const key of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[key];
      Object.assign(ctx, fresh);
      await writeCtx(convo.id, ctx);
      if (canceledShortId) await reply(phone, copy.staleQuoteRestart(canceledShortId));
      // Toque num BOTÃO velho não é mensagem nova pra processar: sem isso "frete:barato"
      // seguiria adiante como se fosse uma lista de compras.
      if (isFreightChoicePayload(text)) {
        if (!canceledShortId) await reply(phone, copy.quoteExpired());
        return;
      }
    }
  }

  // Depois dos dois resets acima, para a marca não morrer na mesma mensagem que a criou.
  // Persistida pelo writeCtx do handler que tratar a mensagem (toda rota de pedido grava).
  if (!ctx.urgent && hasUrgencySignal(text)) ctx.urgent = true;

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
    // Botão "Outra quantidade": abre a pergunta livre — o cliente digita o número.
    if (normalizeMsg(text) === "qty:other") {
      await reply(phone, copy.quantityAskFree(ctx.quantityChoice.option.name));
      return;
    }
    const typedQty = parseContextualQuantity(text);
    if (typedQty != null) {
      await finishQuantityChoice(phone, user.cep, convo.id, ctx, typedQty);
      return;
    }
    // "só isso"/"fechado"/"pode ser" na pergunta de quantidade = 1 unidade e segue.
    if (intent.kind === "done" || intent.kind === "affirm") {
      await finishQuantityChoice(phone, user.cep, convo.id, ctx, 1);
      return;
    }
    // Só o que realmente não faz sentido re-pergunta; "cancelar"/"status"/"pagar"
    // etc. seguem pro roteador normal — a pergunta de quantidade não é uma prisão.
    if (intent.kind === "free_text" || intent.kind === "number") {
      await reply(phone, "Só consigo de 1 a 50 unidades. Quantas?");
      return;
    }
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
    if (!user.defaultAddress) {
      ctx.flow = "delivery";
      ctx.step = "need_address";
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.welcomeAskFullDeliveryAddress());
    } else if (!savedCep) {
      ctx.flow = "delivery";
      ctx.step = "need_cep";
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.welcomeAskCep());
    } else if (
      ctx.step === "awaiting_operator_quote" ||
      ctx.step === "awaiting_supplier_validation" ||
      ctx.step === "awaiting_quote_confirmation" ||
      ctx.step === "payment_issuing" ||
      ctx.step === "awaiting_payment" ||
      (ctx.basket?.length ?? 0) > 0 ||
      (ctx.pending?.length ?? 0) > 0
    ) {
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
      copy.serviceAnswer(intent.topic, customerCoverageLabel(), {
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
      where: {
        userId: user.id,
        status: { in: ACTIVE_ORDER_STATUSES.filter((status) => !isOrderOutForDelivery(status)) }
      }
    });
    const hasPaidOrder = Boolean(active && PAID_OR_IN_FULFILLMENT_STATUSES.includes(active.status));
    await reply(phone, copy.cancelHowTo(hasPaidOrder));
    return;
  }
  if (intent.kind === "resend_code" || intent.kind === "switch_payment") {
    const order = await prisma.deliveryOrder.findFirst({
      where: { userId: user.id, status: "awaiting_payment" },
      orderBy: { createdAt: "desc" }
    });
    if (!order) {
      const validating = await prisma.deliveryOrder.findFirst({
        where: { userId: user.id, status: { in: ["awaiting_supplier_validation", "payment_issuing"] } },
        orderBy: { createdAt: "desc" }
      });
      if (validating) {
        await reply(phone, copy.supplierValidationPending());
        return;
      }
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
  // Cartão salvo (modo sem Meta Payments): o toque no botão traz o attemptId; o texto
  // humano ("usar cartão") resolve pela última tentativa pendente do pedido em aberto.
  if (intent.kind === "saved_card_pay") {
    await handleSavedCardPay(phone, user.id, intent.attemptId);
    return;
  }
  if (intent.kind === "saved_card_other") {
    await handleSavedCardOther(phone, user.id);
    return;
  }
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
  // "mais três do mesmo" repete o ÚLTIMO item da cesta pelo sku — nunca nova busca
  // (a busca genérica podia trazer OUTRA marca; rodada 13 dos testes de 14/08).
  if (intent.kind === "add_more_same") {
    // Com substantivo ("mais um desse CAFÉ"), mira o item da cesta que casa com ele;
    // sem substantivo, o último item. Nunca vira nova busca.
    const basket = ctx.basket ?? [];
    const byNoun = intent.noun ? [...basket].reverse().find((item) => itemMatchesPhrase(intent.noun!, item)) : undefined;
    const last = byNoun ?? basket[basket.length - 1];
    if (last) {
      last.qty = Math.min(50, last.qty + intent.qty);
      last.lineTotal = Math.round(last.unitPrice * last.qty * 100) / 100;
      // Cesta JÁ cotada (fluxo legado auto-cota após a escolha): quantidade nova muda o
      // total — re-cota em vez de deixar um total velho parado no menu de pagamento.
      if (ctx.step === "quoted" || ctx.step === "choosing_payment" || ctx.step === "choosing_courier") {
        await continueAfterBasket(phone, convo.id, ctx, user.cep, copy.moreOfSameAdded(intent.qty, last.name, last.qty));
        return;
      }
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.moreOfSameAdded(intent.qty, last.name, last.qty));
      return;
    }
    await reply(phone, copy.askWhatYouWant());
    return;
  }
  // Trocar endereço vale em QUALQUER estado — inclusive nos de ESPERA, que abaixo
  // respondem e retornam (o cliente pedia a troca e recebia de volta o menu de
  // pagamento, podendo pagar uma cotação amarrada ao endereço velho). Como o frete foi
  // calculado pro endereço antigo, uma cotação em aberto cai antes de pedir o CEP novo.
  // Recusa da troca de loja: mantém a cesta e lembra o caminho de completar.
  if (ctx.minSwap && normalizeMsg(text) === "minswap:no") {
    const fromStore = getStore(ctx.minSwap.fromStoreKey);
    ctx.minSwap = undefined;
    await writeCtx(convo.id, ctx);
    await reply(phone, minimumOrderText(ctx, fromStore));
    return;
  }

  // Aceite da troca de loja do pedido mínimo (botão minswap:yes, "trocar de loja" ou
  // um sim com a proposta na mesa). Valida contra a cesta atual: proposta velha morre.
  if (ctx.minSwap && (normalizeMsg(text) === "minswap:yes" || /^troca(r)? de loja$/.test(normalizeMsg(text)) || intent.kind === "affirm")) {
    const swap = ctx.minSwap;
    const basket = ctx.basket ?? [];
    const valid = swap.replacements.every((r) => basket.some((b) => b.sku === r.fromSku));
    ctx.minSwap = undefined;
    if (!valid) {
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.didNotUnderstand());
      return;
    }
    const keep = basket.filter((b) => !swap.replacements.some((r) => r.fromSku === b.sku));
    const added = swap.replacements.map((r) =>
      choiceToBasketItem(r.option, r.qty, r.option.storeKey ? getStore(r.option.storeKey) : orderStore(ctx))
    );
    ctx.basket = mergeBaskets(keep, added);
    await writeCtx(convo.id, ctx);
    await continueAfterBasket(phone, convo.id, ctx, user.cep, copy.minimumSwapDone());
    return;
  }

  // "Quanto falta?"/"o que peço pra completar?" — responde o mínimo que falta, nunca busca.
  if (intent.kind === "missing_question") {
    const below = conciergeStoresBelowMinimum(ctx)[0];
    if (below) {
      await reply(phone, minimumOrderText(ctx, below));
      if (!ctx.minSwap) await offerMinimumSwap(phone, convo.id, ctx, below);
      return;
    }
    if (ctx.basket?.length) {
      const produtos = Math.round(basketForCopy(ctx).reduce((sum, i) => sum + i.displayLineTotal, 0) * 100) / 100;
      await reply(phone, copy.partialTotal(basketForCopy(ctx), produtos, ctx.pending?.length ?? 0));
      return;
    }
    await reply(phone, copy.didNotUnderstand());
    return;
  }

  // "Vc salvou o endereço?": confirma o que está em arquivo — nunca vira busca.
  if (intent.kind === "address_question") {
    const saved = ctx.deliveryAddress ?? user.defaultAddress;
    if (saved) {
      await reply(phone, copy.addressUpdated(saved, ctx.cep ?? user.cep ?? undefined));
    } else {
      await reply(phone, copy.askFullDeliveryAddress());
    }
    return;
  }

  if (intent.kind === "change_address") {
    // Cobrança já emitida (Pix/cartão vivos): trocar o endereço agora deixaria uma
    // cobrança válida amarrada a um total de outro frete — e a conversa órfã do pedido.
    // O caminho honesto é cancelar primeiro (o cancel contextual estorna nada: não pago).
    if (ctx.step === "awaiting_payment" || ctx.step === "payment_issuing") {
      await reply(phone, copy.addressChangeNeedsCancel());
      return;
    }
    // Pedido ainda SEM preço (fila do operador): sobrevive à troca — o deliveryOrderId
    // fica no contexto e, quando o endereço novo for confirmado, o pedido é atualizado
    // (antes ele ficava órfão no /ops com o endereço velho).
    // `choosing_freight` também é pedido SEM preço na fila do operador (a cotação está
    // calculada mas não publicada), então sobrevive à troca do mesmo jeito — e o frete novo
    // sai pelo CEP novo quando a lista re-cotar.
    const keepOrder = (ctx.step === "awaiting_operator_quote" || ctx.step === "choosing_freight") && Boolean(ctx.deliveryOrderId);
    if (!keepOrder && ctx.deliveryOrderId && (ctx.step === "awaiting_quote_confirmation" || ctx.step === "awaiting_supplier_validation")) {
      const openOrder = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
      if (await cancelPendingRetailerQuote(ctx.deliveryOrderId)) {
        await reply(phone, copy.quoteDroppedForNewAddress());
        // Cesta preservada: com o endereço novo salvo, o fluxo re-cota sozinho.
        ctx.basket = ((openOrder?.items as unknown as BasketItem[]) ?? []).filter((item) => item.unitPrice > 0);
      }
    }
    // A new CEP must never inherit the previous door number/address.
    ctx.deliveryAddress = undefined;
    ctx.deliveryAddressVerified = false;
    ctx.step = "need_cep";
    if (!keepOrder) ctx.deliveryOrderId = undefined;
    await writeCtx(convo.id, ctx);
    await reply(phone, copy.askNewCep());
    return;
  }
  if (ctx.step === "awaiting_operator_quote") {
    // O pedido pode ter morrido por fora (cancelado/estornado no /ops): sem isso a
    // conversa respondia "ainda estou cotando" de um pedido que não existe mais. Limpa e
    // deixa a mensagem seguir como pedido novo.
    if (ctx.deliveryOrderId) {
      const openOrder = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
      if (!openOrder || openOrder.status !== AWAITING_OPERATOR_QUOTE_STATUS) {
        const fresh = addressOnlyCtx(ctx, user.cep);
        for (const key of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[key];
        Object.assign(ctx, fresh);
        await writeCtx(convo.id, ctx);
      }
    }
  }
  if (ctx.step === "awaiting_operator_quote") {
    // Pedido NOVO enquanto o operador cota não pode ser engolido (caso real de produção,
    // 07/08: "quero um cotonete" → "segura aí" e o item sumia; o cliente teve que
    // CANCELAR pra conseguir pedir). A cotação ainda não saiu, então item novo entra no
    // MESMO pedido como linha livre — o operador cota tudo junto e vê a adição no /ops.
    if (intent.kind === "free_text" && !isQuestion(text) && ctx.deliveryOrderId) {
      const { lines, containsMedicine } = await extractLines(text);
      if (lines.length) {
        const order = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
        if (order && order.status === AWAITING_OPERATOR_QUOTE_STATUS) {
          const added = lines.map((line) => conciergeItem(line.phrase, line.qty));
          const items = mergeBaskets((order.items as unknown as BasketItem[]) ?? [], added);
          const addedLabels = added.map((i) => `${i.qty}x ${i.name}`);
          await prisma.deliveryOrder.update({
            where: { id: order.id },
            data: {
              items: items as unknown as object,
              notes: appendOrderNote(order.notes, `➕ Cliente adicionou durante a cotação: ${addedLabels.join(", ")}`)
            }
          });
          const notes: string[] = [];
          if (containsMedicine) notes.push(copy.medicineSkippedNote());
          notes.push(copy.addedToPendingQuote(addedLabels));
          await replyQuoteNotice(phone, notes.join("\n"));
          await notifyOperator(copy.operatorItemAddedAlert(order.id.slice(-6).toUpperCase(), addedLabels));
          return;
        }
      }
      // A mensagem era SÓ remédio (a extração filtra): responde a recusa certa em vez
      // de fingir que está cotando algo que não pode vender.
      if (!lines.length && containsMedicine) {
        await reply(phone, copy.noMedicine());
        return;
      }
    }
    await replyQuoteNotice(phone, copy.operatorQuoteStillWorking());
    return;
  }
  if (ctx.step === "awaiting_supplier_validation") {
    await reply(phone, copy.supplierValidationPending());
    return;
  }
  if (ctx.step === "payment_issuing") {
    await reply(phone, "Gerando seu pagamento agora. Um instante.");
    return;
  }
  if (ctx.step === "awaiting_quote_confirmation" && ctx.deliveryOrderId) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
    if (!order || order.status !== "awaiting_quote_confirmation") {
      await writeCtx(convo.id, addressOnlyCtx(ctx, user.cep));
    } else {
      const method = methodFromIntent(intent);
      if (method) {
        const issued = await issueValidatedRetailerQuotePayment(order.id, method);
        if (issued.expired) {
          await writeCtx(convo.id, addressOnlyCtx(ctx, user.cep));
          await reply(phone, copy.quoteExpired());
        }
        return;
      }
      if (order.quoteExpiresAt && order.quoteExpiresAt.getTime() <= Date.now()) {
        await cancelPendingRetailerQuote(order.id);
        await writeCtx(convo.id, addressOnlyCtx(ctx, user.cep));
        await reply(phone, copy.quoteExpired());
        return;
      }
      // CEP no meio do menu de pagamento ("Antes de pagar, vou entregar em Campinas,
      // CEP 13010-100") é troca de DESTINO — a cotação do endereço velho cai e o CEP
      // segue pro fluxo normal de endereço. Antes, qualquer texto que não fosse
      // pix/cartão devolvia o menu do endereço antigo (3º ciclo, rodada 6).
      if (intent.kind === "cep") {
        if (await cancelPendingRetailerQuote(order.id)) {
          await reply(phone, copy.quoteDroppedForNewAddress());
        }
        // A CESTA volta do pedido cancelado pro contexto: depois do endereço novo, o
        // fluxo re-cota sozinho (5º ciclo, rodada 6: a Lia "esquecia" a cesta e pedia
        // pra começar de novo).
        ctx.basket = ((order.items as unknown as BasketItem[]) ?? []).filter((item) => item.unitPrice > 0);
        ctx.deliveryOrderId = undefined;
        ctx.deliveryAddress = undefined;
        ctx.deliveryAddressVerified = false;
        // segue para a seção de CEP abaixo, que salva e pede o endereço completo
      } else {
        await reply(phone, copy.paymentMethod(order.total, cardTotal(order.total)));
        return;
      }
    }
  }
  if (intent.kind === "clear_cart") {
    await writeCtx(convo.id, addressOnlyCtx(ctx, user.cep));
    await reply(phone, copy.cartCleared());
    return;
  }

  // ---- CEP (onboarding, requested change, or spontaneously sent) ----
  if (intent.kind === "cep") {
    await handleNewCep(phone, user.id, convo.id, ctx, intent.cep, Boolean(savedCep), intent.rest, text);
    return;
  }

  // A CEP identifies the neighbourhood, not the door. Do not send an address-like
  // message to a courier until the customer confirms street + number.
  if (ctx.step === "need_address") {
    await handleDeliveryAddress(phone, user.id, convo.id, ctx, user.cep, text);
    return;
  }

  // ---- step need_cep: um número curto ("1", "08") é tentativa de CEP, não escolha ----
  if (ctx.step === "need_cep" && intent.kind === "number") {
    await reply(phone, copy.cepNotFound(text.trim()));
    return;
  }

  // ---- step: cliente escolhendo a ENTREGA do anúncio (barata/lenta × rápida/cara) ----
  // A cotação está calculada e PARADA (nada cobrado): o toque — ou "1"/"2", ou "mais
  // rápido" por texto — publica na hora. Fica ANTES do onboarding de endereço porque lá o
  // texto não reconhecido vira lista de compras, e o toque `frete:barato` acabaria virando
  // item da cesta. Cancelar e trocar endereço são tratados acima e não chegam aqui.
  if (ctx.step === "choosing_freight" && ctx.freightChoice) {
    const n = normalizeMsg(text);
    const choice = ctx.freightChoice;
    // O frete e a DATA vieram da consulta ao anúncio no instante da cotação. Publicar isso
    // muito depois entrega promessa vencida (data possivelmente no passado) numa cotação
    // pagável — e, se o pedido já morreu por fora, `opsPublishManualQuote` lançaria erro a
    // cada toque (loop de genericError, sem saída além de "trocar endereço").
    // Contexto sem `quotedAt` é anterior a esta trava: tratado como velho, porque não dá
    // pra provar que é fresco.
    const quoteAgeMs = choice.quotedAt ? Date.now() - choice.quotedAt : Number.POSITIVE_INFINITY;
    const openOrder = await prisma.deliveryOrder.findUnique({
      where: { id: choice.orderId },
      select: { status: true, notes: true }
    });
    const quotable = openOrder?.status === AWAITING_OPERATOR_QUOTE_STATUS;
    if (!quotable || quoteAgeMs > quoteAbandonTtlMs()) {
      const canceled = quotable
        ? await prisma.deliveryOrder.updateMany({
            where: { id: choice.orderId, status: AWAITING_OPERATOR_QUOTE_STATUS },
            data: {
              status: "canceled",
              notes: appendOrderNote(
                openOrder?.notes ?? null,
                "⏰ Cancelado automático: entrega escolhida muito depois da cotação — frete e data do anúncio já vencidos."
              )
            }
          })
        : { count: 0 };
      // Só limpa a conversa se ela AINDA estiver parada nesta escolha: o operador pode ter
      // publicado a cotação neste exato instante, e o contexto dele (recém-escrito) vale
      // mais que o nosso, que já nasceu velho.
      const stored = readCtx(
        (await prisma.conversation.findUnique({ where: { id: convo.id }, select: { context: true } }))?.context ?? null
      );
      if (stored.step !== "choosing_freight" || stored.freightChoice?.orderId !== choice.orderId) return;
      await writeCtx(convo.id, addressOnlyCtx(ctx, user.cep));
      await reply(
        phone,
        canceled.count ? copy.staleQuoteRestart(choice.orderId.slice(-6).toUpperCase()) : copy.quoteExpired()
      );
      return;
    }
    let picked: { fee: number; estimate?: string } | undefined;
    let label = "";
    if (n === "frete:barato" || (intent.kind === "number" && intent.value === 1) || /\bbarat|econom|em conta|demorad|devagar/.test(n)) {
      picked = choice.barato;
      label = "mais barata";
    } else if (n === "frete:rapido" || (intent.kind === "number" && intent.value === 2) || /\brapid|urgent|antes|logo|hoje/.test(n)) {
      picked = choice.rapido;
      label = "mais rápida";
    }
    if (!picked) {
      await reply(phone, copy.choiceNotUnderstood());
      await sendFreightChoice(phone, choice);
      return;
    }
    // A escolha vai pra nota ANTES de publicar: é ela que diz ao operador qual opção de
    // envio comprar no anúncio (comprar a errada quebraria a data prometida ao cliente).
    const current = await prisma.deliveryOrder.findUnique({ where: { id: choice.orderId }, select: { notes: true } });
    await prisma.deliveryOrder.update({
      where: { id: choice.orderId },
      data: {
        notes: appendOrderNote(
          current?.notes ?? null,
          `🚚 Cliente escolheu a entrega ${label} (frete ${copy.brl(picked.fee)}${picked.estimate ? `, chega até ${picked.estimate}` : ""}) — comprar ESSA opção de envio no anúncio.`
        )
      }
    });
    await publishInstantQuote(choice.orderId, {
      itemsSubtotal: choice.itemsSubtotal,
      serviceFee: choice.serviceFee,
      fee: picked.fee,
      estimate: picked.estimate,
      stores: choice.stores
    });
    return;
  }

  // ---- onboarding: save the complete delivery address once, before the first basket ----
  if (!user.defaultAddress) {
    if (looksLikeMedicine(text)) {
      await reply(phone, copy.noMedicine());
      return;
    }
    if (intent.kind === "reject") {
      await writeCtx(convo.id, addressOnlyCtx(ctx, null));
      await reply(phone, copy.thanks());
      return;
    }
    const asking = intent.kind === "free_text" && isQuestion(text);
    if (asking) {
      await reply(phone, copy.serviceAnswer("generic", customerCoverageLabel()));
      ctx.flow = "delivery";
      ctx.step = "need_address";
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.askFullDeliveryAddress());
      return;
    }
    // Cliente que abre a conversa mandando o endereço direto (sem "oi") está respondendo
    // à pergunta que ainda nem foi feita — salvar, não tratar como lista de compras
    // ("1x Av Paulista 1000", "1x apto 5").
    if (looksLikeDeliveryAddress(text)) {
      ctx.flow = "delivery";
      await handleDeliveryAddress(phone, user.id, convo.id, ctx, user.cep, text);
      return;
    }
    const lines = intent.kind === "free_text" ? parseBasketLines(text) : [];
    if (lines.length) {
      ctx.pendingRequest = ctx.pendingRequest ? `${ctx.pendingRequest}, ${text}` : text;
    }
    ctx.flow = "delivery";
    ctx.step = "need_address";
    await writeCtx(convo.id, ctx);
    const noted = ctx.pendingRequest ? parseBasketLines(ctx.pendingRequest).map((line) => `${line.qty}x ${line.phrase}`) : [];
    await reply(phone, copy.welcomeAskFullDeliveryAddress(noted));
    return;
  }

  // ---- onboarding: address saved, but no CEP yet — stash the request, ask the CEP ----
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
      await reply(phone, copy.serviceAnswer("generic", customerCoverageLabel()));
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

  // ---- "quero" / "queria comprar" sozinho: vontade de comprar sem dizer o quê ----
  // Buscar isso viraria "Não entendi seu pedido" (frio). Perguntamos o item; se havia
  // uma escolha aberta, reapresentamos as opções.
  if (intent.kind === "want_items") {
    if (ctx.pending?.length) {
      await sendChoices(phone, ctx.pending[0]);
    } else {
      await reply(phone, copy.askWhatYouWant());
    }
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
    // Concierge: "só isso"/"pagar"/"pix" close the list and hand it to the operator to
    // quote — there is no total to charge until the operator sends the quote.
    if (manualConciergeEnabled()) {
      // Fechar no meio de uma escolha não descarta o item NEM vira linha livre (regra
      // 11/08: só item com preço entra no pedido) — a Lia pede pra terminar a escolha,
      // que é o único jeito de fechar com total na hora.
      if (ctx.pending?.length) {
        await reply(phone, copy.finishChoiceFirst());
        await sendChoices(phone, ctx.pending[0]);
        return;
      }
      if ((ctx.basket?.length ?? 0) > 0) {
        await continueAfterBasket(phone, convo.id, ctx, user.cep);
        return;
      }
      const openOrder = await prisma.deliveryOrder.findFirst({
        where: { userId: user.id, status: { in: [AWAITING_OPERATOR_QUOTE_STATUS, "awaiting_payment"] } },
        orderBy: { createdAt: "desc" }
      });
      if (openOrder?.status === AWAITING_OPERATOR_QUOTE_STATUS) {
        await replyQuoteNotice(phone, copy.operatorQuoteStillWorking());
        return;
      }
      if (openOrder?.status === "awaiting_payment") {
        await resendCharge(phone, openOrder);
        return;
      }
      await reply(phone, copy.emptyCartPay());
      return;
    }
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
      // "pix"/"fecha no cartão" idem: o cliente já escolheu ATÉ a forma de pagamento —
      // repetir o nudge genérico vira loop; a saída honesta (minimumDeadEnd) explica e
      // dá opção. "pagar" seco continua no nudge (mostra a cesta + quanto falta).
      if (intent.kind === "done" || intent.kind === "choose_payment" || (intent.kind === "pay" && intent.method)) {
        const min = display(payStore.minOrder ?? 0);
        const produtos = (ctx.basket ?? []).reduce((sum, i) => sum + Math.round(display(i.unitPrice) * i.qty * 100) / 100, 0);
        await reply(phone, copy.minimumDeadEnd(min, Math.max(0, Math.round((min - produtos) * 100) / 100)));
      } else {
        await reply(phone, minimumOrderText(ctx, payStore));
      }
      // A saída de verdade: mesmos itens em loja sem mínimo (teste real 24/08).
      await offerMinimumSwap(phone, convo.id, ctx, payStore);
      return;
    }
    // "só isso"/"mais nada" ANTES da cotação = fechar a LISTA: mostra o total primeiro
    // (o cliente ainda nem viu o frete); a partir do resumo, "pagar" segue normal.
    if (intent.kind === "done" && ctx.step !== "quoted") {
      await continueAfterBasket(phone, convo.id, ctx, user.cep);
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
      where: { userId: user.id, status: { in: REPEATABLE_DELIVERY_ORDER_STATUSES } },
      orderBy: { createdAt: "desc" }
    });
    const items = (last?.items as unknown as BasketItem[]) ?? [];
    if (!items.length) {
      await reply(phone, copy.noPreviousOrder());
      return;
    }
    const next: DeliveryContext = {
      flow: "delivery",
      basket: items,
      notFound: [],
      cep: user.cep ?? ctx.cep,
      deliveryAddress: ctx.deliveryAddress,
      deliveryAddressVerified: ctx.deliveryAddressVerified
    };
    await continueAfterBasket(phone, convo.id, next, user.cep);
    return;
  }

  // ---- edit the basket: swap / remove ----
  if (intent.kind === "swap_item") {
    await handleSwap(phone, convo.id, user.cep, ctx, intent.from, intent.to, text, intent.attr);
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

  // ---- "Outras opções"/"mais barato" com a escolha já fechada: reabre a última ----
  if (intent.kind === "more_options") {
    if (await reopenLastChoice(phone, convo.id, ctx, intent.cheaper ? "cheaper" : "more")) return;
    await reply(phone, copy.rejectedAskAgain());
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
    // "4" logo depois de um item entrar na cesta = ajuste de quantidade do ÚLTIMO item
    // (rodada 13 dos testes de 14/08: o cliente tentou corrigir a quantidade assim e
    // recebeu "não entendi"). Fora desse contexto, segue o honesto "não entendi".
    const last = ctx.basket?.[ctx.basket.length - 1];
    if (last && intent.value >= 1 && intent.value <= 50 && (ctx.step === "collecting" || ctx.step === undefined)) {
      last.qty = intent.value;
      last.lineTotal = Math.round(last.unitPrice * last.qty * 100) / 100;
      await writeCtx(convo.id, ctx);
      await reply(phone, copy.qtyAdjusted(last.qty, last.name));
      return;
    }
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
      await reply(phone, copy.serviceAnswer("eta", customerCoverageLabel()));
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
    if (PAID_OR_IN_FULFILLMENT_STATUSES.includes(order.status)) {
      await reply(phone, copy.alreadyPaid());
    } else {
      await reply(
        phone,
        copy.orderStatusLine({ shortId: order.id.slice(-6).toUpperCase(), status: order.status, trackingUrl: order.courierTrackingUrl })
      );
    }
    return;
  }
  // Cobrança mock só existe sem credencial (dev/testes). Com token real, um id "mock"
  // é resíduo — nunca autorização de pagamento: cai na verificação normal abaixo.
  const isMock = paymentsAreMocked() && (order.pixId ?? "").startsWith("mock");
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
  // Escolha aberta (opções na tela / pergunta de quantidade) também é "carrinho em
  // montagem": "cancelar" limpa, em vez de "não achei pedido" deixando a escolha viva.
  if (
    ((ctx.basket?.length ?? 0) > 0 || (ctx.pending?.length ?? 0) > 0 || ctx.quantityChoice) &&
    ctx.step !== "awaiting_payment" &&
    !explicitOrder
  ) {
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
    // O contexto ainda aponta pra um pedido que não está mais ativo (cancelado/estornado
    // no /ops): "não tem pedido pra cancelar" não podia deixar o passo velho vivo — o
    // cliente ficava preso ouvindo "ainda estou cotando", ou sem saída na escolha de frete.
    if (ctx.deliveryOrderId) {
      const fresh = addressOnlyCtx(ctx, userCep);
      // Lista em montagem sobrevive: quem disse "cancela o PEDIDO" não pediu pra apagá-la.
      if (ctx.pending?.length) {
        fresh.pending = ctx.pending;
        fresh.step = "choosing";
      } else if (ctx.basket?.length) {
        fresh.basket = ctx.basket;
        fresh.step = "collecting";
      }
      await writeCtx(convoId, fresh);
    }
    await reply(phone, copy.nothingToCancel());
    return;
  }
  if (order.status === AWAITING_OPERATOR_QUOTE_STATUS) {
    await prisma.deliveryOrder.update({ where: { id: order.id }, data: { status: "canceled" } });
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.canceledUnpaid());
    return;
  }
  if (order.status === "awaiting_supplier_validation" || order.status === "awaiting_quote_confirmation") {
    await cancelPendingRetailerQuote(order.id);
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.canceledUnpaid());
    return;
  }
  if (order.status === "awaiting_payment") {
    await prisma.deliveryOrder.update({ where: { id: order.id }, data: { status: "canceled" } });
    await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
    await reply(phone, copy.canceledUnpaid());
    return;
  }
  if (isOrderOutForDelivery(order.status)) {
    await reply(phone, copy.cancelTooLate());
    return;
  }
  // Paid orders do not offer customer-initiated cancellation for now. Missing items
  // are refunded; delays are communicated. The operator's exceptional refund action
  // remains available in /ops, but chat does not create a cancellation request.
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
  // depois de salvar o endereço, nunca descartados. Já vem normalizado (sem acento/
  // pontuação), o que serve pra busca mas não pra endereço — daí o rawText.
  restItems?: string,
  // Mensagem original. O endereço que vai pro courier tem que sair daqui: "Av Paulista
  // 1000, apto 5" não pode virar "av paulista 1000 apto 5" no rótulo da entrega.
  rawText?: string
) {
  const normalizedCep = cep.replace(/\D/g, "");
  const previousCep = ctx.cep?.replace(/\D/g, "");
  const cepChanged = Boolean(previousCep && previousCep !== normalizedCep);
  const { address, city, uf, invalid } = await expandCep(cep);
  if (invalid) {
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.cepNotFound(cep));
    return;
  }

  // Trava de cobertura: nunca aceita um pedido pago que a operação não entrega. Fora da
  // área → grava o lead (vira mapa de demanda no /ops) e NÃO persiste o CEP nem cota.
  // The active concierge has a hard state boundary. Legacy catalog mode keeps its
  // configurable city/preset behavior for compatibility with the conversation evals.
  const area = manualConciergeEnabled()
    ? { covered: isSaoPauloState({ cep, city, uf }), city, uf }
    : checkCoverage({ cep, city, uf });
  if (!area.covered) {
    await recordWaitlistLead({ phone, cep, city, uf, reason: "outside_coverage" });
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.outsideCoverage(city, customerCoverageLabel()));
    return;
  }

  // Guarda de frete (distância até loja): legado do motoboy que retirava na loja. No
  // concierge o operador compra onde for e o courier sai da base dele, então distância
  // até uma unidade não prova nada — a guarda só roda no fluxo legado de catálogo.
  if (!manualConciergeEnabled()) {
    const near = await pickNearestUnit(allUnits(), cep);
    const farBlock = checkFreightGuard({ distanceKm: near.distanceKm });
    if (farBlock) {
      await recordWaitlistLead({ phone, cep, city, uf, reason: "too_far" });
      ctx.step = "need_cep";
      await writeCtx(convoId, ctx);
      await reply(phone, copy.tooFarForDelivery(city, customerCoverageLabel()));
      return;
    }
  }

  ctx.cep = cep;
  ctx.city = city ?? ctx.city;
  ctx.uf = uf ?? ctx.uf;
  // ViaCEP's street fragment is useful context but cannot be sent as the final
  // courier destination. A confirmed address remains valid only for the same CEP.
  if (cepChanged || !ctx.deliveryAddressVerified) {
    ctx.deliveryAddress = address;
    ctx.deliveryAddressVerified = false;
  }
  ctx.flow = "delivery";
  await prisma.user.update({ where: { id: userId }, data: { cep } });
  // "Av Paulista 1000, Bela Vista, São Paulo, 01310-100" é UMA mensagem com endereço E
  // CEP — o jeito mais natural de responder. O resto da mensagem só é "itens" quando não
  // é a própria rua: sem esta checagem o endereço virava pedido ("1x apto 5") e o cliente
  // ainda tinha que redigitar tudo.
  const restIsAddress = Boolean(restItems && looksLikeDeliveryAddress(restItems));
  if (restIsAddress && !ctx.deliveryAddressVerified) {
    // O texto ORIGINAL menos o CEP — com acento, maiúscula e vírgula, do jeito que o
    // motoboy precisa ler. Só cai no `restItems` normalizado se o raw não sobreviver.
    const fromRaw = (rawText ?? "")
      .replace(/\b\d{5}-?\d{3}\b/, " ")
      // A palavra "CEP" órfã depois de remover os dígitos ("… - SP, CEP .") não pode
      // sobrar no endereço salvo (6º ciclo, rodada 8: exibia "CEP." sem números).
      .replace(/[,;]?\s*\bcep\b\s*[.:]?\s*/gi, " ")
      .replace(/\s*[,;]\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/[,;]+$/, "");
    ctx.deliveryAddress = looksLikeDeliveryAddress(fromRaw) ? fromRaw : restItems!.trim();
    ctx.deliveryAddressVerified = true;
    await prisma.user.update({ where: { id: userId }, data: { defaultAddress: ctx.deliveryAddress } });
  }
  // Itens enviados na MESMA mensagem do CEP — ou guardados no onboarding — entram no
  // fluxo NORMAL de busca (com opções e preço), nunca auto-escolhidos.
  const queued = [restIsAddress ? undefined : restItems, ctx.pendingRequest].filter(Boolean).join(", ").trim();
  ctx.pendingRequest = queued || undefined;
  if (!ctx.deliveryAddressVerified) {
    ctx.step = "need_address";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.askFullDeliveryAddress());
    return;
  }

  const shownAddress = ctx.deliveryAddress ?? cep;
  const savedMsg = hadCepBefore ? copy.addressUpdated(shownAddress, ctx.cep) : copy.addressSavedPrefix(shownAddress, ctx.cep);
  ctx.pendingRequest = undefined;
  if (await syncAwaitingQuoteOrderAddress(phone, convoId, ctx)) return;
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
    await continueAfterBasket(phone, convoId, ctx, cep, savedMsg);
    return;
  }
  ctx.step = "collecting";
  await writeCtx(convoId, ctx);
  await reply(phone, hadCepBefore ? copy.addressUpdated(shownAddress, ctx.cep) : copy.addressSavedAskItems(shownAddress));
}

// Uma mensagem é o ENDEREÇO de entrega (e não um pedido de produto)? Marcador de
// logradouro + número é o menor sinal confiável, sem tentar parsing frágil. Serve às
// duas pontas: aceitar o endereço e — no caminho do CEP — não confundir a rua com item.
function looksLikeDeliveryAddress(text: string): boolean {
  const address = text.trim();
  const hasStreet = /\b(?:rua|r\.?|avenida|av\.?|alameda|travessa|estrada|rodovia|pra[çc]a|largo)\b/i.test(address);
  const hasNumber = /(?:\d|\bs\/?n\b)/i.test(address);
  return address.length >= 12 && hasStreet && hasNumber;
}

async function handleDeliveryAddress(
  phone: string,
  userId: string,
  convoId: string,
  ctx: DeliveryContext,
  userCep: string | null | undefined,
  rawAddress: string
) {
  const address = rawAddress.trim();
  if (!looksLikeDeliveryAddress(address)) {
    const kind = detectIntent(address).kind;
    const hasSavedAddress = Boolean(ctx.deliveryAddress && ctx.deliveryAddressVerified);
    // "Vc salvou o endereço já?" — pergunta SOBRE o endereço com endereço na mão:
    // confirma e destrava, nunca re-pede (teste real 24/08: loop infinito de endereço).
    if (hasSavedAddress && /\b(endereco|cep)\b/.test(normalizeMsg(address))) {
      ctx.step = "collecting";
      const queued = ctx.pendingRequest;
      ctx.pendingRequest = undefined;
      await writeCtx(convoId, ctx);
      await reply(phone, copy.addressUpdated(ctx.deliveryAddress!, ctx.cep));
      if (queued) await handleSearch(phone, convoId, null, ctx, queued);
      return;
    }
    // Endereço já existe e a mensagem é OUTRA coisa: o passo travado não pode reter o
    // cliente — destrava pra coleta e roteia a mensagem como pedido normal.
    if (hasSavedAddress) {
      ctx.step = "collecting";
      await writeCtx(convoId, ctx);
      if (kind === "free_text" && !isQuestion(address)) {
        await handleSearch(phone, convoId, null, ctx, address);
        return;
      }
      await reply(phone, copy.addressSavedAskItems(ctx.deliveryAddress!));
      return;
    }
    // Pergunta no meio do onboarding: responde e pede o endereço de novo — pergunta não
    // é pedido e nunca entra no estoque.
    if (isQuestion(address) || kind === "help" || kind === "service_question") {
      await reply(phone, copy.serviceAnswer("generic", customerCoverageLabel()));
      ctx.step = "need_address";
      await writeCtx(convoId, ctx);
      await reply(phone, copy.askFullDeliveryAddress());
      return;
    }
    // Não é endereço — mas TAMBÉM não é lixo: quem responde "preciso de um carregador"
    // aqui está fazendo o pedido, não errando o endereço. Guardar em vez de descartar,
    // pra rodar a busca assim que o endereço chegar. Só PEDIDO entra no estoque:
    // "pode ser amanhã" (affirm), "obrigado" e afins ficam de fora (24/08).
    if (kind === "free_text" && queryTokens(address).length && !looksLikeMedicine(address)) {
      ctx.pendingRequest = ctx.pendingRequest ? `${ctx.pendingRequest}, ${address}` : address;
    }
    ctx.step = "need_address";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.askFullDeliveryAddress());
    return;
  }

  ctx.deliveryAddress = address;
  ctx.deliveryAddressVerified = true;
  await prisma.user.update({ where: { id: userId }, data: { defaultAddress: address } });

  if (!ctx.cep && userCep) ctx.cep = userCep;
  if (!ctx.cep) {
    ctx.step = "need_cep";
    await writeCtx(convoId, ctx);
    await reply(phone, copy.addressSavedAskCep());
    return;
  }

  if (await syncAwaitingQuoteOrderAddress(phone, convoId, ctx)) return;
  ctx.step = "collecting";

  const queued = ctx.pendingRequest;
  ctx.pendingRequest = undefined;
  if (queued) {
    await reply(phone, copy.addressUpdated(address, ctx.cep));
    await handleSearch(phone, convoId, null, ctx, queued);
    return;
  }

  if (ctx.basket?.length) {
    await continueAfterBasket(phone, convoId, ctx, userCep, copy.addressUpdated(address, ctx.cep));
    return;
  }

  await writeCtx(convoId, ctx);
  await reply(phone, copy.addressSavedAskItems(address));
}

// Endereço novo confirmado com um pedido AINDA na fila do operador (2ª revisão, 11/08):
// o pedido segue vivo — atualiza cep/endereço NELE, avisa o /ops e devolve a conversa
// pra espera da cotação. Antes, "trocar endereço" órfãva o pedido no /ops com o
// endereço velho. Só vale pra awaiting_operator_quote (sem preço ainda); estados com
// cotação/cobrança são tratados na entrada do change_address.
async function syncAwaitingQuoteOrderAddress(phone: string, convoId: string, ctx: DeliveryContext): Promise<boolean> {
  if (!ctx.deliveryOrderId || !ctx.deliveryAddress || !ctx.deliveryAddressVerified) return false;
  const order = await prisma.deliveryOrder.findUnique({ where: { id: ctx.deliveryOrderId } });
  if (!order || order.status !== AWAITING_OPERATOR_QUOTE_STATUS) return false;
  const updated = await prisma.deliveryOrder.updateMany({
    where: { id: order.id, status: AWAITING_OPERATOR_QUOTE_STATUS },
    data: {
      cep: ctx.cep,
      deliveryAddress: ctx.deliveryAddress,
      notes: appendOrderNote(order.notes, `📍 Cliente trocou o endereço durante a cotação: ${ctx.deliveryAddress}`)
    }
  });
  if (!updated.count) return false;
  ctx.step = AWAITING_OPERATOR_QUOTE_STATUS;
  await writeCtx(convoId, ctx);
  await reply(phone, copy.addressUpdatedQuoteContinues(ctx.deliveryAddress));
  await notifyOperator(copy.operatorAddressChangedAlert(order.id.slice(-6).toUpperCase(), ctx.deliveryAddress));
  return true;
}

// Caminho único de confirmação de escolha (número digitado, "a mais barata", nome ou
// toque no card por sku): tira o item da fila, pergunta quantidade quando falta, soma na
// cesta e segue. A loja é a do PRODUTO escolhido — com opções cross-store, a opção 2
// pode ser de outra loja que a opção 1.
async function confirmChosenOption(
  phone: string,
  convoId: string,
  ctx: DeliveryContext,
  userCep: string | null | undefined,
  fallbackStore: StoreConnector,
  current: PendingChoice,
  chosen: ChoiceOption
) {
  const chosenStore = chosen.storeKey ? getStore(chosen.storeKey) : fallbackStore;
  ctx.pending = ctx.pending!.slice(1);
  // Memória da escolha concluída: "Outras opções"/"mais barato" depois dela reabrem
  // esta mesma escolha (e o novo pick substitui o item na cesta, não soma outro).
  const { replaceSku, ...lastBase } = current;
  ctx.lastChoice = { ...lastBase, chosenSku: chosen.sku };
  if (replaceSku && replaceSku !== chosen.sku) {
    ctx.basket = (ctx.basket ?? []).filter((item) => item.sku !== replaceSku);
  }
  if (current.qty === 1 && !current.qtyExplicit) {
    await beginQuantityChoice(phone, convoId, ctx, chosenStore, chosen);
    return;
  }
  ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(chosen, current.qty, chosenStore)]);
  if (ctx.pending.length) {
    await writeCtx(convoId, ctx);
    await reply(phone, copy.choiceConfirmed(chosen.name, current.qty));
    await sendChoices(phone, ctx.pending[0], copy.nextChoiceHeader(ctx.pending[0].query, ctx.pending.length));
    return;
  }
  await advancePending(phone, convoId, ctx, userCep, copy.choiceConfirmed(chosen.name, current.qty));
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
  // Toque em "Escolher esse": o id carrega o SKU do card, então mesmo um card ANTIGO
  // (de antes do "outras"/refino) escolhe exatamente o produto mostrado nele. Vem antes
  // de qualquer parser: é string de máquina, não linguagem.
  const skuTap = text.trim().match(/^optsku:(.+)$/i);
  if (skuTap) {
    const wanted = skuTap[1].trim().toLowerCase();
    const tapped =
      current.options.find((o) => o.sku.toLowerCase() === wanted) ??
      current.shownOptions?.find((o) => o.sku.toLowerCase() === wanted);
    if (!tapped) {
      // Card de outro item/conversa antiga: não chuta produto — reapresenta a escolha atual.
      await reply(phone, copy.choiceNotUnderstood());
      await sendChoices(phone, current);
      return;
    }
    await confirmChosenOption(phone, convoId, ctx, userCep, store, current, tapped);
    return;
  }
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
    // "mais barato"/"mais caro" SEM verbo de escolha: mostrar opções nessa faixa —
    // nunca colocar no carrinho o que o cliente não pediu (teste real 19/08).
    if (parsed.type === "cheaper" || parsed.type === "pricier") {
      await showPriceSortedOptions(phone, convoId, ctx, store, parsed.type === "cheaper" ? "asc" : "desc");
      return;
    }
    const index =
      parsed.type === "pick"
        ? parsed.index
        : parsed.type === "cheapest"
          ? current.options.reduce((best, o, i, arr) => (o.unitPrice < arr[best].unitPrice ? i : best), 0)
          : 0;
    await confirmChosenOption(phone, convoId, ctx, userCep, store, current, current.options[index]);
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
    await confirmChosenOption(phone, convoId, ctx, userCep, store, current, current.options[narrowed[0]]);
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
  const catalogAttrs = await contextualCatalogAttrs(store, ctx, current, text);
  if (catalogAttrs) {
    await refineOptions(phone, convoId, ctx, store, catalogAttrs);
    return;
  }

  // Not a selection — maybe they're adding MORE items mid-choice ("ah, e 2 leites").
  // Questions about the shown options ("qual é a desnatada?") must NOT be searched
  // as new products — re-show the options instead.
  if (intent.kind === "free_text" && !isQuestion(text)) {
    const added = await buildChoicesWithSearchNotice(phone, text);
    // "Só shampoo normal, sem preferência de marca" ENQUANTO escolhe shampoo é
    // esclarecimento do MESMO item — substitui as opções na mesa, nunca vira uma
    // segunda linha (rodada 5 dos testes de 14/08: a linha duplicada fez o cliente
    // escolher DOIS shampoos sem perceber e a cesta foi contraditória pro pagamento).
    if (!added.autoAdded.length && added.pending.length === 1 && sharesProductNoun(added.pending[0].query, current.query)) {
      const clarified = added.pending[0];
      current.baseQuery = undefined;
      current.attrs = undefined;
      current.query = clarified.query;
      if (clarified.qtyExplicit) {
        current.qty = clarified.qty;
        current.qtyExplicit = true;
      }
      const remembered = new Set((current.shownOptions ?? current.options).map((o) => o.sku));
      current.shownOptions = [...(current.shownOptions ?? current.options), ...clarified.options.filter((o) => !remembered.has(o.sku))];
      current.options = clarified.options;
      current.shownSkus = [...new Set([...(current.shownSkus ?? []), ...clarified.options.map((o) => o.sku)])];
      await writeCtx(convoId, ctx);
      await sendChoices(phone, current, copy.narrowedChoices(current.query));
      return;
    }
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

async function contextualCatalogAttrs(store: StoreConnector, ctx: DeliveryContext, current: PendingChoice, text: string): Promise<string[] | null> {
  const candidates = await choiceCandidates(store, ctx, current);
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
// after a refine keeps honoring the attribute filter. No concierge sem loja travada o
// pool vem de TODAS as vitrines (como o buildChoices que gerou as opções): paginar só
// na loja da opção 1 escondia os produtos das outras — cada opção carrega a própria
// loja no resultado.
async function choiceCandidates(store: StoreConnector, ctx: DeliveryContext, p: PendingChoice, attrs?: string[]): Promise<ChoiceOption[]> {
  const active = attrs ?? p.attrs ?? [];
  const query = active.length ? (p.baseQuery ?? p.query) : p.query;
  let pool: ChoiceOption[];
  if (!ctx.storeKey && manualConciergeEnabled()) {
    const candidates = await gatherCrossStoreCandidates(query, 40, 12);
    pool = candidates.map((c) => toChoiceOption(c.item, { storeKey: c.store.key, storeLabel: c.store.label }));
  } else {
    pool = (await store.searchItems(query, 40)).map((item) => toChoiceOption(item, { storeKey: store.key, storeLabel: store.label }));
  }
  // Piso de relevância TAMBÉM na paginação/refino (vistoria 10/08: "outras" de
  // "carregador de celular" devolvia Sérum Nivea "Cellular" e chip de operadora —
  // score>0 sem piso). O rerank de IA não roda aqui (resposta na hora), então o piso
  // léxico é a única guarda; pool que esvazia vira o honesto "essas são todas".
  pool = pool.filter((o) => conciergeMatchIsStrong(query, o));
  return active.length ? pool.filter((o) => active.every((a) => attrMatchesItem(a, o))) : pool;
}

// "acha outras" (ou o botão "Outras opções"): show the NEXT 3 catalog matches for the
// same item — never repeat a sku already shown. When the pool is exhausted, say so
// honestly.
// "mais barato"/"mais caro" na escolha: reordena o pool conhecido (tudo que já foi
// mostrado + candidatos frescos) por preço e mostra os 3 primeiros — produtos
// distintos primeiro, variantes preenchem. É navegação, nunca compra.
async function showPriceSortedOptions(
  phone: string,
  convoId: string,
  ctx: DeliveryContext,
  store: StoreConnector,
  dir: "asc" | "desc"
) {
  const p = ctx.pending![0];
  const known = new Map<string, ChoiceOption>();
  for (const o of [...(p.shownOptions ?? []), ...p.options]) known.set(o.sku, o);
  try {
    for (const o of await choiceCandidates(store, ctx, p)) if (!known.has(o.sku)) known.set(o.sku, o);
  } catch (error) {
    console.warn("[choice:price-sort:pool-failed]", error instanceof Error ? error.message : error);
  }
  const pool = [...known.values()].sort((a, b) => (dir === "asc" ? a.unitPrice - b.unitPrice : b.unitPrice - a.unitPrice));
  const picked: ChoiceOption[] = [];
  for (const o of pool) {
    if (picked.length >= 3) break;
    if (!picked.some((cur) => sameProductVariant(p.query, cur, o))) picked.push(o);
  }
  for (const o of pool) {
    if (picked.length >= 3) break;
    if (!picked.some((cur) => cur.sku === o.sku)) picked.push(o);
  }
  if (!picked.length) {
    await sendChoices(phone, p);
    return;
  }
  const remembered = new Set((p.shownOptions ?? p.options).map((o) => o.sku));
  p.shownOptions = [...(p.shownOptions ?? p.options), ...picked.filter((o) => !remembered.has(o.sku))];
  p.shownSkus = [...new Set([...(p.shownSkus ?? p.options.map((o) => o.sku)), ...picked.map((o) => o.sku)])];
  p.options = picked;
  await writeCtx(convoId, ctx);
  await sendChoices(phone, p, copy.priceSortedHeader(p.query, dir === "asc"));
}

// "Outras opções"/"mais barato" FORA da escolha (ela já fechou — inclusive por uma
// escolha que o cliente não quis): reabre a última escolha; o novo pick SUBSTITUI o
// item na cesta. Só vale no passo de coleta — com cotação/pagamento na mesa, não mexe.
async function reopenLastChoice(
  phone: string,
  convoId: string,
  ctx: DeliveryContext,
  mode: "more" | "cheaper"
): Promise<boolean> {
  const last = ctx.lastChoice;
  if (!last) return false;
  if (ctx.step && ctx.step !== "collecting") return false;
  const { chosenSku, ...pendingBase } = last;
  const restored: PendingChoice = { ...pendingBase, replaceSku: chosenSku };
  ctx.pending = [restored, ...(ctx.pending ?? [])];
  ctx.step = "choosing";
  await writeCtx(convoId, ctx);
  const store = getStore(restored.options[0]?.storeKey ?? ctx.storeKey ?? orderStore(ctx).key);
  if (mode === "cheaper") await showPriceSortedOptions(phone, convoId, ctx, store, "asc");
  else await pageMoreOptions(phone, convoId, ctx, store);
  return true;
}

async function pageMoreOptions(phone: string, convoId: string, ctx: DeliveryContext, store: StoreConnector) {
  const p = ctx.pending![0];
  const shown = p.shownSkus ?? p.options.map((o) => o.sku);
  const pool = (await choiceCandidates(store, ctx, p)).filter((o) => !shown.includes(o.sku));
  // Quem pediu "outras" dispensou o que está na mesa: variante do dispensado não é
  // "outra opção". Só volta a valer se não sobrar mais nada de distinto.
  const fresh = pool.filter((o) => !p.options.some((cur) => sameProductVariant(p.query, cur, o)));
  const next = diversifyOptions(p.query, fresh.length ? fresh : pool, 3);
  // "Outras" tem que vir com 3 de verdade (pedido do dono, 11/08): completa com o que
  // sobrou no pool — variante repetida ainda atende melhor que uma opção solitária.
  for (const option of pool) {
    if (next.length >= 3) break;
    if (!next.some((n) => n.sku === option.sku)) next.push(option);
  }
  if (!next.length) {
    await reply(phone, copy.noMoreOptions(p.query));
    return;
  }
  // Memória de TUDO que já foi mostrado: o toque num card antigo resolve por sku.
  const remembered = new Set((p.shownOptions ?? p.options).map((o) => o.sku));
  p.shownOptions = [...(p.shownOptions ?? p.options), ...next.filter((o) => !remembered.has(o.sku))];
  p.options = next;
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
  const matches = diversifyOptions(refined, await choiceCandidates(store, ctx, p, attrs), 3);
  if (!matches.length) {
    await reply(phone, copy.refineNoResult(refined));
    await sendChoices(phone, p);
    return;
  }
  p.baseQuery = base;
  p.attrs = attrs;
  p.query = refined;
  // O que JÁ estava na mesa antes do refino — capturado antes de sobrescrever p.options.
  const previouslyShownSkus = p.shownSkus ?? p.options.map((o) => o.sku);
  const previouslyShown = p.shownOptions ?? p.options;
  const remembered = new Set(previouslyShown.map((o) => o.sku));
  p.shownOptions = [...previouslyShown, ...matches.filter((o) => !remembered.has(o.sku))];
  p.options = matches;
  // Histórico de paginação ACUMULA (não substitui): refinar e depois pedir "outras"
  // repetia cards já mostrados, porque o refino apagava o que a paginação usa pra não
  // repetir. Skus fora do refino atual continuam valendo como "já mostrei isso".
  p.shownSkus = [...new Set([...previouslyShownSkus, ...matches.map((m) => m.sku)])];
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
  // No concierge, acabar as escolhas NÃO fecha a lista. O fluxo legado cotava aqui porque
  // escolher era o último passo; aqui o cliente ainda pode somar itens e só fecha quando
  // disser "só isso". Fechar sozinho tiraria dele o controle da lista.
  if (manualConciergeEnabled()) {
    ctx.step = "collecting";
    ctx.cep = ctx.cep ?? userCep ?? undefined;
    await writeCtx(convoId, ctx);
    // As três saídas naturais pós-escolha viram botão no canal Meta (Pagar /
    // Adicionar mais itens / Cancelar); os ids voltam como texto e caem nos ramos
    // já existentes. Sem Meta (ou falha do envio interativo), o texto de sempre.
    const body = [prefix, copy.conciergeChooseNext()].filter(Boolean).join("\n");
    try {
      const interactive = await whatsappAdapter.sendChoiceFollowUp(phone, body);
      if (interactive) return;
    } catch (error) {
      console.warn("[whatsapp:choice-followup:fallback-text]", error instanceof Error ? error.message : error);
    }
    const notes: string[] = [];
    if (prefix) notes.push(prefix);
    notes.push(copy.conciergeKeepAdding());
    await reply(phone, notes.join("\n"));
    return;
  }
  const next: DeliveryContext = {
    flow: "delivery",
    basket: ctx.basket,
    notFound: ctx.notFound ?? [],
    storeKey: ctx.storeKey,
    cep: ctx.cep ?? userCep ?? undefined,
    deliveryAddress: ctx.deliveryAddress,
    deliveryAddressVerified: ctx.deliveryAddressVerified
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
  await continueAfterBasket(phone, convoId, ctx, userCep, copy.removedItems(names, false));
}

async function handleSwap(
  phone: string,
  convoId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  from: string,
  to: string,
  rawText?: string,
  attrSwap?: boolean
) {
  const basket = ctx.basket ?? [];
  // "quero A e B; pensando bem, troca B por C" numa LISTA NOVA (cesta vazia): não há o
  // que remover — a autocorreção vale para a PRÓPRIA mensagem. Monta a lista corrigida
  // (linhas antes do "troca", menos o B, mais o C) e segue o fluxo normal de busca
  // (3º ciclo de testes 15/08, rodada 3: respondia "não achei pra tirar").
  if (!basket.length && !(ctx.pending?.length)) {
    const before = (rawText ?? "").split(/\b(?:troca|trocar|substitui|substituir|muda|mudar)\b/i)[0] ?? "";
    const keptLines = parseBasketLines(before).filter(
      (l) => queryTokens(l.phrase).length && !itemMatchesPhrase(from, { sku: l.phrase, name: l.phrase, unitPrice: 0 })
    );
    const corrected = [...keptLines.map((l) => (l.qtyExplicit && l.qty > 1 ? `${l.qty} ${l.phrase}` : l.phrase)), to]
      .filter(Boolean)
      .join(", ");
    if (corrected.trim()) {
      await handleSearch(phone, convoId, userCep, ctx, corrected);
      return;
    }
    await reply(phone, copy.removeNotFound());
    return;
  }
  if (!basket.length) {
    await reply(phone, copy.removeNotFound());
    return;
  }
  let keep = basket.filter((item) => !itemMatchesPhrase(from, item));
  let removed = basket.filter((item) => !keep.includes(item));
  // Referência à cesta ≠ busca: "não quero DE UVA" aponta pro suco de uva da cesta,
  // mas a regra de aposição da BUSCA zera "uva" contra "Suco de Uva" (qualificador
  // não responde pedido de 1 palavra). Pra remoção, presença do token basta — desde
  // que aponte pra UM item só (ambíguo mantém o comportamento antigo).
  if (!removed.length && from) {
    const fromTokens = queryTokens(from);
    const byFrom = basket.filter((item) => {
      const nameTokens = new Set(queryTokens(item.name));
      return fromTokens.length > 0 && fromTokens.every((t) => nameTokens.has(t));
    });
    if (byFrom.length === 1) {
      removed = byFrom;
      keep = basket.filter((item) => item !== byFrom[0]);
    }
  }
  // "coca zero em vez da NORMAL": o from ("normal") não nomeia produto nenhum — mas o
  // TO compartilha token com exatamente UM item da cesta (a coca). Esse item é o alvo.
  if (!removed.length && to) {
    const toTokens = queryTokens(to);
    const byTo = basket.filter((item) => {
      const nameTokens = new Set(queryTokens(item.name));
      return toTokens.some((t) => nameTokens.has(t));
    });
    if (byTo.length === 1) {
      removed = byTo;
      keep = basket.filter((item) => item !== byTo[0]);
    }
  }
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
  // "troca X por Y" busca nas MESMAS vitrines que o pedido normal. Como no concierge
  // `ctx.storeKey` é "concierge", `orderStore` caía na loja default e o Y só era
  // procurado no Carrefour — as outras 17 vitrines ficavam invisíveis nesse comando.
  const crossStore = !ctx.storeKey || ctx.storeKey === CONCIERGE_STORE_KEY;
  // Troca de ATRIBUTO ("não quero de uva, quero de laranja"): buscar "laranja" solta
  // acharia a fruta — compõe com o substantivo do item trocado ("suco laranja"). Só na
  // frase de atributo (attr) e quando o to ainda não carrega o substantivo.
  let searchPhrase = to;
  const removedHead = removed[0] ? queryTokens(removed[0].name)[0] : undefined;
  if (attrSwap && removedHead && !queryTokens(to).includes(removedHead)) {
    searchPhrase = `${removedHead} ${to}`;
  }
  const candidates: StoreCandidate[] = crossStore
    ? await gatherCrossStoreCandidates(searchPhrase, 12)
    : (await store.searchItems(searchPhrase, 3)).map((item) => ({ store, item }));
  const options = diversifyOptions(searchPhrase, candidates.map((c) => c.item), 3)
    .filter((item) => conciergeMatchIsStrong(searchPhrase, item))
    .map((item) => candidates.find((c) => c.item.sku === item.sku)!);

  if (!options.length) {
    const prefix = `${copy.swapRemovedPrefix(removedNames)} ${copy.itemsNotFound([to])}`;
    if (!keep.length) {
      await writeCtx(convoId, addressOnlyCtx(ctx, userCep));
      await reply(phone, prefix);
      return;
    }
    await continueAfterBasket(phone, convoId, ctx, userCep, prefix);
    return;
  }
  if (options.length === 1 && !(ctx.pending?.length)) {
    const only = options[0];
    ctx.basket = mergeBaskets(ctx.basket ?? [], [choiceToBasketItem(toChoiceOption(only.item, { storeKey: only.store.key, storeLabel: only.store.label }), qty, only.store)]);
    await continueAfterBasket(phone, convoId, ctx, userCep, copy.swappedFor(removedNames, only.item.name));
    return;
  }
  ctx.pending = [
    {
      query: to,
      qty,
      options: options.map(({ store: optionStore, item }) => toChoiceOption(item, { storeKey: optionStore.key, storeLabel: optionStore.label }))
    },
    ...(ctx.pending ?? [])
  ];
  ctx.step = "choosing";
  await writeCtx(convoId, ctx);
  await reply(phone, copy.swapRemovedPrefix(removedNames));
  await sendChoices(phone, ctx.pending[0]);
}

// Concierge mode request: parse the message into free-form lines (medicine still
// filtered by law), add them to the basket and confirm — no catalog, no options step.
async function handleConciergeRequest(
  phone: string,
  convoId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  text: string
) {
  // LISTA ENCAMINHADA (pedido do dono, 20/08): mensagem com 3+ linhas de itens não
  // vira interrogatório de cards — a Lia escolhe o melhor match de cada linha (mesmo
  // ranking da escolha) e monta a cesta inteira de uma vez; "troca X por Y"/"tira X"
  // ajustam depois. Numeração de lista ("1. coca") é índice, não quantidade.
  text = stripListNumbering(text);
  const bulkList = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).length >= 3;
  // "Pode colocar mais um leite": adição RELATIVA a um item que já está na cesta herda
  // o item exato (sku) — a busca genérica perdia o atributo ("sem lactose" virava leite
  // integral; 3º ciclo de testes 15/08, rodadas 3 e 8).
  const moreOf = normalizeMsg(text).match(
    /^(?:(?:pode|coloca|poe|bota|adiciona|acrescenta|quero|queria|me ve|manda|e)\s+)*(?:colocar\s+|adicionar\s+)?mais\s+(.+)$/
  );
  if (moreOf && ctx.basket?.length) {
    const lines = parseBasketLines(moreOf[1]).filter((l) => queryTokens(l.phrase).length);
    if (lines.length === 1) {
      const target = [...ctx.basket].reverse().find((item) => itemMatchesPhrase(lines[0].phrase, item));
      if (target) {
        const add = Math.max(1, lines[0].qty);
        target.qty = Math.min(50, target.qty + add);
        target.lineTotal = Math.round(target.unitPrice * target.qty * 100) / 100;
        await writeCtx(convoId, ctx);
        await reply(phone, copy.moreOfSameAdded(add, target.name, target.qty));
        return;
      }
    }
  }

  // Vitrine híbrida: procura o que o cliente pediu nas 18 lojas e mostra até 3 opções com
  // foto para ele escolher. O que NÃO tiver match vira linha livre, como antes — a largura
  // ("qualquer coisa, de qualquer lugar") continua sendo o moat e nada é recusado.
  //
  // Sem travar loja (`lockedStoreKey` fica indefinido): no concierge quem compra é o
  // operador, que vai em quantas lojas precisar. A cesta pode ser mista, diferente do fluxo
  // legado, onde um pedido = uma loja = uma entrega do varejista.
  // ML ligado = a busca pode custar ~25s numa consulta fria (medido 16/08). O cliente
  // não pode ficar no silêncio: avisa ANTES e as opções chegam na mensagem seguinte.
  // Busca quente (cache) não avisa — responde na hora, como sempre.
  const raw = mercadoLivreEnabled()
    ? await buildChoicesWithSearchNotice(phone, text)
    : await buildChoices(text);
  // Piso de relevância próprio do concierge: opção que não responde pelo que o cliente
  // escreveu é descartada e a linha volta a ser livre. Sugerir errado é pior que não
  // sugerir, porque a linha livre resolve o pedido de verdade.
  //
  // Quando o rerank de IA rodou, ELE é o piso: já descartou o que não serve e entende
  // sinônimos que o piso léxico mata ("escova de dente" ≈ "Escova Dental"). Rodar o
  // piso por cima desfaria exatamente esses acertos.
  const pending: PendingChoice[] = [];
  const weakLines: ParsedLine[] = [];
  for (const choice of raw.pending) {
    const strong = raw.reranked
      ? choice.options
      : choice.options.filter((option) => conciergeMatchIsStrong(choice.query, option));
    if (strong.length) pending.push({ ...choice, options: strong });
    else weakLines.push({ phrase: choice.query, qty: choice.qty, ...(choice.qtyExplicit ? { qtyExplicit: true } : {}) });
  }
  let notFoundLines = [...raw.notFoundLines, ...weakLines];
  const { greetingOnly, containsMedicine } = raw;

  // ÚLTIMA CHANCE antes de dizer "não tenho": as linhas que o pipeline inteiro
  // descartou (piso + rerank) vão ao fornecedor de cauda longa mesmo que alguma
  // vitrine local tenha "casado" — caso real 17/08: "violão" batia no brinquedo da
  // Patrulha Canina, o gate achava que estava resolvido, o rerank descartava o
  // brinquedo (certíssimo) e o cliente ficava sem violão. Custo do ML só é pago aqui,
  // no exato caso em que a alternativa era recusar.
  const turnElapsedMs = Date.now() - (turnStartedAt.get(phone) ?? Date.now());
  const rescueBudgetMs = Number(process.env.LIA_RESCUE_BUDGET_MS ?? 120000);
  if (notFoundLines.length && mercadoLivreEnabled() && turnElapsedMs > rescueBudgetMs) {
    // O resgate custa mais uma rodada inteira (extração + actor + rerank, ~40-70s). Com
    // o turno já estourado, recusar honesto AGORA vence morrer no teto da função em
    // silêncio (caso real 19/08).
    console.warn(`[search:rescue-skipped] turno com ${Math.round(turnElapsedMs / 1000)}s; recusa honesta sem 2ª rodada`);
  }
  if (notFoundLines.length && mercadoLivreEnabled() && turnElapsedMs <= rescueBudgetMs) {
    // O retry vai re-extrair e re-rankear (~3-6s de IA); o run do ML começa já, com a
    // frase determinística, e a busca do retry se acopla a ele (dedupe em voo).
    for (const line of notFoundLines) prefetchMercadoLivre(splitPriceCap(line.phrase).phrase);
    const retryText = notFoundLines.map((line) => line.phrase).join(", ");
    const retry = await buildChoicesWithSearchNotice(phone, retryText, undefined, undefined, true);
    const rescued: PendingChoice[] = [];
    for (const choice of retry.pending) {
      const strong = retry.reranked
        ? choice.options
        : choice.options.filter((option) => conciergeMatchIsStrong(choice.query, option));
      if (strong.length) rescued.push({ ...choice, options: strong });
    }
    if (rescued.length) {
      // A linha resgatada sai de "não tenho" e vira escolha normal, com a quantidade
      // que o cliente pediu na mensagem original.
      const rescuedQueries = new Set(rescued.map((choice) => normalizeMsg(choice.query)));
      notFoundLines = notFoundLines.filter((line) => !rescuedQueries.has(normalizeMsg(line.phrase)));
      for (const choice of rescued) {
        const original = [...raw.notFoundLines, ...weakLines].find(
          (line) => normalizeMsg(line.phrase) === normalizeMsg(choice.query)
        );
        pending.push(original?.qtyExplicit ? { ...choice, qty: original.qty, qtyExplicit: true } : choice);
      }
    }
  }
  if (greetingOnly && !pending.length && !notFoundLines.length) {
    await reply(phone, copy.greeting());
    return;
  }
  if (!pending.length && !notFoundLines.length) {
    await reply(phone, containsMedicine ? copy.noMedicine() : copy.didNotUnderstand());
    return;
  }

  const hadBasket = (ctx.basket?.length ?? 0) > 0;
  // Regra do dono (11/08): item sem preço nas lojas parceiras NUNCA vira espera de
  // cotação — "se não tem, fala que não tem". A linha livre saiu do fluxo do cliente:
  // só item com preço entra na cesta, e por isso todo fechamento tem total NA HORA.
  const unavailable = notFoundLines.map((line) => (line.qty > 1 ? `${line.qty}x ${line.phrase}` : line.phrase));
  ctx.flow = "delivery";
  // A cesta continua pertencendo ao "concierge" mesmo quando o item veio de uma vitrine: o
  // pedido é cotado e comprado à mão, então não há uma loja dona do pedido.
  ctx.storeKey = CONCIERGE_STORE_KEY;
  ctx.cep = ctx.cep ?? userCep ?? undefined;
  ctx.notFound = undefined;

  // Modo lista: 2+ itens resolvidos de uma mensagem de 3+ linhas → cesta direta com o
  // topo do ranking de cada linha (rerank/determinístico — o mesmo que "escolhe você").
  // Sem cards por item (10 cards é spam); o resumo sai com os botões de sempre e
  // "troca"/"tira"/"opções de X" continuam valendo item a item.
  if (pending.length >= 2 && bulkList) {
    const added: BasketItem[] = [];
    for (const choice of pending) {
      const top = choice.options[0];
      const store = top.storeKey ? getStore(top.storeKey) : orderStore(ctx);
      added.push(choiceToBasketItem(top, Math.max(1, choice.qty), store));
    }
    ctx.basket = mergeBaskets(ctx.basket ?? [], added);
    ctx.pending = undefined;
    ctx.step = "collecting";
    const notes: string[] = [
      copy.bulkBasketAdded(added.map((i) => ({ qty: i.qty, name: i.name, total: display(i.unitPrice) * i.qty })))
    ];
    if (containsMedicine) notes.push(copy.medicineSkippedNote());
    if (unavailable.length) notes.push(copy.itemsNotAvailable(unavailable));
    await advancePending(phone, convoId, ctx, userCep, notes.join("\n"));
    return;
  }

  if (pending.length) {
    ctx.step = "choosing";
    ctx.pending = pending;
    await writeCtx(convoId, ctx);
    const notes: string[] = [];
    if (containsMedicine) notes.push(copy.medicineSkippedNote());
    // Os itens sem preço são recusados ANTES das opções — mas com escopo explícito:
    // "não achei X — o resto tá abaixo" (a copy global parecia contradição, 19/08).
    if (unavailable.length) notes.push(copy.itemsNotAvailableWithOptions(unavailable));
    if (notes.length) await reply(phone, notes.join("\n"));
    if (pending.length > 1) await reply(phone, copy.choiceSequence(pending.map((p) => p.query)));
    await sendChoices(phone, pending[0]);
    return;
  }

  // Nada com preço nesta mensagem: recusa honesta na hora; a cesta que já existia fica
  // exatamente como estava.
  if (hadBasket) ctx.step = "collecting";
  await writeCtx(convoId, ctx);
  const notes: string[] = [];
  if (containsMedicine) notes.push(copy.medicineSkippedNote());
  notes.push(copy.itemsNotAvailable(unavailable));
  await reply(phone, notes.join("\n"));
}

async function handleSearch(
  phone: string,
  convoId: string,
  userCep: string | null | undefined,
  ctx: DeliveryContext,
  text: string,
  userId?: string
) {
  // Concierge mode: no catalog gate. Whatever the customer asks for becomes a free-form
  // line the operator will source and price. Breadth — "anything from anywhere" — is the
  // moat, and a human buyer needs zero integration to honor it.
  if (manualConciergeEnabled()) {
    await handleConciergeRequest(phone, convoId, userCep, ctx, text);
    return;
  }
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
    deliveryAddress: ctx.deliveryAddress,
    deliveryAddressVerified: ctx.deliveryAddressVerified
  };
  await continueAfterBasket(phone, convoId, next, userCep, medicineNote);
}

async function preferredSkuCounts(userId: string): Promise<Map<string, number>> {
  const orders = await prisma.deliveryOrder.findMany({
    where: { userId, status: { in: REPEATABLE_DELIVERY_ORDER_STATUSES } },
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

// The card is entered exactly once in Pagar.me's tokenization form. Once stored, every
// later card payment is confirmed in-chat (Meta order_details when enabled, common
// reply buttons otherwise). Gated on cardOnFileEnabled: a configured Pagar.me key with
// no flag must never silently change the checkout path away from Checkout Pro.
async function sendFirstCardEnrollment(order: { id: string; userId: string; phone: string; total: number }) {
  if (!cardOnFileEnabled() || !isCardEnrollmentAvailable()) return false;
  const enrollment = await createCardEnrollmentSession({ orderId: order.id, userId: order.userId });
  await reply(order.phone, copy.cardEnrollmentInstructions(order.total, enrollment.url, process.env.PAGARME_MOCK === "true"));
  return true;
}

// Toque em "Pagar •••• 1234" (ou o texto "usar cartão"). O attemptId do botão localiza a
// tentativa exata; a forma por texto resolve pela última pendente do pedido em aberto.
async function handleSavedCardPay(phone: string, userId: string, attemptId?: string) {
  let resolved = attemptId;
  let last4: string | undefined;
  if (!resolved) {
    const order = await prisma.deliveryOrder.findFirst({
      where: { userId, status: "awaiting_payment" },
      orderBy: { createdAt: "desc" }
    });
    const pending = order ? await findPendingSavedCardAttempt(order.id) : null;
    if (!pending) {
      await reply(phone, copy.savedCardNothingPending());
      return;
    }
    resolved = pending.id;
    last4 = pending.credential.last4;
  }
  if (last4) await reply(phone, copy.savedCardCharging(last4));
  // Claim + cobrança idempotente acontecem no pipeline (workflow ou fallback síncrono);
  // o desfecho volta por mensagem própria (aprovado / recusado + fallback de link).
  await confirmSavedCardTap(resolved, phone);
}

// "Outro cartão": expira a cobrança pendente e manda um link novo de cadastro — o
// cartão anterior deixa de ser cobrado e a credencial é substituída no submit.
async function handleSavedCardOther(phone: string, userId: string) {
  const order = await prisma.deliveryOrder.findFirst({
    where: { userId, status: "awaiting_payment" },
    orderBy: { createdAt: "desc" }
  });
  if (!order || !isCardCharge(order)) {
    await reply(phone, copy.savedCardNothingPending());
    return;
  }
  if (await getConfirmedPaymentAttempt(order.id)) {
    await reply(phone, copy.cardPaymentProcessing());
    return;
  }
  await expireOpenPaymentAttempts(order.id);
  if (await sendFirstCardEnrollment(order)) return;
  // Sem cadastro disponível → link Checkout Pro, o fallback permanente de cartão.
  let link;
  try {
    link = await checkoutAdapter.createLink({
      orderId: order.id,
      amount: order.total,
      description: `Lia · pedido ${order.id.slice(-6)}`,
      method: "card"
    });
  } catch (error) {
    await reportChargeIssueFailure(phone, order, error);
    return;
  }
  await prisma.deliveryOrder.update({
    where: { id: order.id },
    data: { pixId: link.preferenceId, pixCopiaECola: link.initPoint }
  });
  await reply(phone, copy.cardInstructions(order.total, link.initPoint, link.mock));
}

// Which payment method (if any) an intent unambiguously names.
function methodFromIntent(intent: Intent): "pix" | "card" | undefined {
  if (intent.kind === "choose_payment") return intent.method;
  if (intent.kind === "pay") return intent.method;
  if (intent.kind === "number") return intent.value === 1 ? "pix" : intent.value === 2 ? "card" : undefined;
  return undefined;
}

// Mercado Pago com credencial real caiu na hora de emitir a cobrança. Com o fallback
// mock removido, o pedido fica SEM cobrança em vez de ganhar um Pix falso que o
// "paguei" aprovaria de graça. O pedido continua aguardando (o cliente repete
// *pix*/*cartão* e a Lia tenta de novo), a falha vira nota no /ops e o operador é
// avisado na hora. Nunca lança — a conversa não pode morrer por causa do aviso.
async function reportChargeIssueFailure(
  phone: string,
  order: { id: string; notes?: string | null },
  error: unknown
) {
  const detail = error instanceof Error ? error.message.slice(0, 180) : "erro desconhecido";
  console.error("[payment:issue:failed]", order.id, detail);
  try {
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { notes: appendOrderNote(order.notes ?? null, `⚠️ Falha ao gerar a cobrança: ${detail}`) }
    });
  } catch (err) {
    console.error("[payment:issue:failed:note]", err);
  }
  await reply(phone, copy.paymentIssueFailed());
  await notifyOperator(copy.operatorPaymentFailedAlert(order.id.slice(-6).toUpperCase(), detail));
}

// Emite a cobrança de um pedido JÁ criado e aguardando pagamento (Pix copia-e-cola ou
// link de cartão). Usada na criação e na RETENTATIVA — quando o Mercado Pago falha, o
// pedido fica sem `pixCopiaECola` e o próximo "pagar" volta aqui em vez de reenviar um
// código que não existe. Devolve false quando a cobrança não saiu (cliente já avisado).
async function issueChargeForOrder(
  phone: string,
  order: {
    id: string;
    userId: string;
    phone: string;
    total: number;
    deliveryFee: number;
    items: unknown;
    status: string;
    notes?: string | null;
  },
  method: "pix" | "card",
  total: number
): Promise<boolean> {
  const description = `Lia · pedido ${order.id.slice(-6)}`;
  if (method === "card") {
    const credential = await getOneClickCredential(order.userId);
    if (credential) {
      try {
        await createCardAttempt(order, credential);
        return true;
      } catch (error) {
        // The order itself is already durable. If Meta refuses the native payload,
        // retain the well-tested Checkout Pro route instead of leaving it unpaid.
        console.warn("[whatsapp-pay:create:fallback-checkout]", error instanceof Error ? error.message : error);
      }
    }
    if (await sendFirstCardEnrollment(order)) return true;
    // Card → a Checkout Pro link (MP-hosted card page). Reuse the nullable columns:
    // pixId = preference id, pixCopiaECola = the link. Webhook reconciles by order id.
    let link;
    try {
      link = await checkoutAdapter.createLink({ orderId: order.id, amount: total, description, method: "card" });
    } catch (error) {
      await reportChargeIssueFailure(phone, order, error);
      return false;
    }
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { pixId: link.preferenceId, pixCopiaECola: link.initPoint }
    });
    await reply(phone, copy.cardInstructions(total, link.initPoint, link.mock));
    return true;
  }

  // Pix → the raw copia-e-cola generated ON THE SPOT, paid inside the bank app (no
  // leaving WhatsApp for a hosted page). Webhook reconciles by external_reference = order id.
  let charge;
  try {
    charge = await pixAdapter.createPix({ orderId: order.id, amount: total, description });
  } catch (error) {
    await reportChargeIssueFailure(phone, order, error);
    return false;
  }
  await prisma.deliveryOrder.update({
    where: { id: order.id },
    data: { pixId: charge.pixId, pixCopiaECola: charge.copiaECola }
  });
  // Intro + código em mensagens SEPARADAS: no WhatsApp copia-se a mensagem inteira —
  // com prosa junto, o copia-e-cola não cola no banco.
  await reply(phone, copy.pixInstructions(total, charge.mock));
  await reply(phone, charge.copiaECola);
  return true;
}

// Re-send the open charge (card link or Pix code) for an awaiting_payment order.
async function resendCharge(phone: string, order: {
  id: string;
  userId: string;
  phone: string;
  total: number;
  deliveryFee: number;
  items: unknown;
  status: string;
  notes?: string | null;
  pixCopiaECola?: string | null;
}) {
  if (isCardCharge(order)) {
    if (await getConfirmedPaymentAttempt(order.id)) {
      await reply(phone, copy.cardPaymentProcessing());
      return;
    }
    const credential = await getOneClickCredential(order.userId);
    if (credential) {
      await createCardAttempt(order, credential);
      return;
    }
    if (await sendFirstCardEnrollment(order)) return;
    // Sem link salvo = a emissão anterior falhou (Mercado Pago fora do ar). Emitir de
    // novo, em vez de reenviar um link vazio.
    if (!order.pixCopiaECola) {
      await issueChargeForOrder(phone, order, "card", order.total);
      return;
    }
    await reply(phone, copy.resendCard(order.pixCopiaECola));
    return;
  }
  if (!order.pixCopiaECola) {
    await issueChargeForOrder(phone, order, "pix", order.total);
    return;
  }
  // Pix: intro + código em mensagem SEPARADA — copiar a mensagem inteira tem que colar.
  await reply(phone, copy.resendPix());
  await reply(phone, order.pixCopiaECola);
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
      ctx.deliveryAddressVerified = false;
    }
  }
  if (!ctx.deliveryAddress || !ctx.deliveryAddressVerified) {
    ctx.step = "need_address";
    await writeCtx(convoId, ctx);
    if (prefix) await reply(phone, prefix);
    await reply(phone, copy.askFullDeliveryAddress());
    return;
  }
  if (manualConciergeEnabled()) {
    // Pedido mínimo é regra DA LOJA (o operador compra no site dela): fechar abaixo do
    // mínimo cota, cobra e depois toma recusa no checkout. A checagem existia só no
    // fluxo legado, depois do return acima — no concierge nunca rodava.
    const belowStore = conciergeStoresBelowMinimum(ctx)[0];
    if (belowStore) {
      ctx.step = "collecting";
      await writeCtx(convoId, ctx);
      if (prefix) await reply(phone, prefix);
      await reply(phone, minimumOrderText(ctx, belowStore));
      // A saída de verdade: mesmos itens em loja sem mínimo (teste real 24/08).
      await offerMinimumSwap(phone, convoId, ctx, belowStore);
      return;
    }
    await createOperatorQuoteRequest(phone, convoId, ctx, prefix);
    return;
  }
  await quoteBasket(ctx, store);
  await respondAfterQuote(phone, convoId, ctx, store, prefix);
}

// Concierge finish: the list is closed, so create (or refresh) an order that waits for
// the operator to quote by hand. No catalog price, no fake total — the customer sees the
// real number only after the operator publishes the quote (opsPublishManualQuote).
//
// EXCEÇÃO (decisão do dono, 09/08): cesta 100% de vitrine cota NA HORA — o cliente não
// espera no chat. A Lia publica sozinha a mesma cotação que o operador digitaria
// (subtotal da vitrine + frete POR LOJA, da unidade mais próxima até a casa do cliente;
// 2 lojas = 2 fretes) e o pedido chega ao /ops já indo pra pagamento. Linha livre (sem
// preço) mantém o caminho manual — não se cobra o que não tem preço.
async function createOperatorQuoteRequest(phone: string, convoId: string, ctx: DeliveryContext, prefix?: string) {
  const convo = await prisma.conversation.findUnique({ where: { id: convoId } });
  if (!convo) throw new Error("Conversation not found while creating concierge quote request.");
  const basket = (ctx.basket ?? []) as unknown as object;
  const itemNames = (ctx.basket ?? []).map((item) => `${item.qty}x ${item.name}`);

  // Tag de urgência (pedido do dono, 17/08): o cliente disse "urgente"/"pra hoje" em
  // algum momento da conversa — o operador decide o canal por isso (Rappi/retirada
  // agora vs. ML/dia seguinte). Só marca o pedido; nada muda para o cliente.
  const URGENT_NOTE = "⚡ URGENTE: cliente quer receber hoje.";

  const existing = await prisma.deliveryOrder.findFirst({
    where: { conversationId: convoId, status: AWAITING_OPERATOR_QUOTE_STATUS },
    orderBy: { createdAt: "desc" }
  });
  let order;
  if (existing) {
    const addUrgent = ctx.urgent && !(existing.notes ?? "").includes(URGENT_NOTE);
    order = await prisma.deliveryOrder.update({
      where: { id: existing.id },
      data: {
        items: basket,
        cep: ctx.cep,
        deliveryAddress: ctx.deliveryAddress,
        ...(addUrgent ? { notes: appendOrderNote(existing.notes, URGENT_NOTE) } : {})
      }
    });
  } else {
    order = await prisma.deliveryOrder.create({
      data: {
        userId: convo.userId,
        conversationId: convoId,
        phone,
        cep: ctx.cep,
        deliveryAddress: ctx.deliveryAddress,
        storeKey: CONCIERGE_STORE_KEY,
        storeLabel: CONCIERGE_STORE_LABEL,
        items: basket,
        // Default to same-hour operator courier; the operator can switch to retailer
        // delivery when quoting, per item availability.
        fulfillments: [{ storeKey: CONCIERGE_STORE_KEY, storeLabel: CONCIERGE_STORE_LABEL, deliveryMode: "operator_courier" }] as unknown as object,
        itemsSubtotal: 0,
        courierKey: "uber_direct",
        deliveryFee: 0,
        serviceFee: 0,
        total: 0,
        notes: ctx.urgent
          ? `${URGENT_NOTE}\nPedido concierge aguardando cotação do operador.`
          : "Pedido concierge aguardando cotação do operador.",
        status: AWAITING_OPERATOR_QUOTE_STATUS
      }
    });
  }
  await writeCtx(convoId, { ...addressOnlyCtx(ctx), deliveryOrderId: order.id, step: AWAITING_OPERATOR_QUOTE_STATUS });

  if (instantQuoteEligible((ctx.basket ?? []) as InstantQuoteItem[], CONCIERGE_STORE_KEY) && ctx.cep) {
    // `true` = a Lia resolveu o turno (publicou a cotação OU parou na escolha de entrega).
    const handled = await tryPublishInstantQuote(order.id, phone, ctx, prefix, convoId);
    if (handled) return;
  }

  if (prefix) await reply(phone, prefix);
  await replyQuoteNotice(phone, existing ? copy.operatorQuoteStillWorking() : copy.operatorQuoteRequested(itemNames));
  const alert = copy.operatorQuoteAlert(order.id.slice(-6).toUpperCase(), itemNames);
  await notifyOperator(ctx.urgent ? `⚡ URGENTE — ${alert}` : alert);
}

// Publica a cotação instantânea reutilizando opsPublishManualQuote — status, mensagem ao
// cliente e menu de pagamento são EXATAMENTE os mesmos da cotação manual. Qualquer erro
// (frete incalculável, endereço longe demais, corrida com o /ops) devolve false e o
// fluxo cai no caminho manual de sempre: nunca quebra o fechamento da lista.
async function tryPublishInstantQuote(
  orderId: string,
  phone: string,
  ctx: DeliveryContext,
  prefix?: string,
  convoId?: string
): Promise<boolean> {
  try {
    const items = ctx.basket ?? [];
    // A entrega é pelo SITE de cada loja (o operador compra lá e a loja entrega), então
    // o frete é a política de cada site — por loja, com frete grátis por limiar.
    const seeded = computeStoreFreights(items as InstantQuoteItem[]);
    let freights = seeded.freights;
    if (!freights.length) return false;
    // Mercado Livre: o frete é do ANÚNCIO + CEP, não da loja — a consulta pública do
    // próprio ML (`shipping_options`, ~0,35s) devolve custo e data reais. É o que
    // substitui a tarifa padrão de R$18 (reprovada pelo dono, 17/08). Sem número real, o
    // pedido inteiro vai pro operador em vez de fechar com chute.
    let mlEstimate: string | undefined;
    // Alternativa "chega antes pagando mais" do anúncio: vira PERGUNTA com botão ao
    // cliente (dono, 17/08) em vez de decisão nossa.
    let mlFaster: { fee: number; estimate?: string } | undefined;
    let mlCheapFee = 0;
    for (let i = 0; i < freights.length; i++) {
      if (!PER_AD_FREIGHT_STORES.has(freights[i].storeKey)) continue;
      const mlItems = items.filter((item) => item.storeKey === freights[i].storeKey);
      const outcome = await mlBasketFreight(mlItems, ctx.cep!);
      console.log("[instant-quote:ml-freight]", outcome.kind, outcome.kind === "ok" ? outcome.fee : outcome.reason);
      if (outcome.kind === "manual") {
        const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId }, select: { notes: true } });
        await prisma.deliveryOrder.update({
          where: { id: orderId },
          data: { notes: appendOrderNote(current?.notes ?? null, `⚠️ Cotação instantânea abortada: Mercado Livre — ${outcome.reason}.`) }
        });
        return false;
      }
      freights[i] = { ...freights[i], fee: outcome.fee, source: "vivo" };
      mlEstimate = outcome.estimate;
      mlCheapFee = outcome.fee;
      mlFaster = outcome.faster ? { fee: outcome.faster.fee, estimate: outcome.faster.estimate } : undefined;
    }
    // Precisão final: consulta AO VIVO no checkout de cada loja (cesta + CEP reais), em
    // PARALELO com timeout curto — o fechamento nunca espera mais que um timeout. Site
    // respondeu → frete exato daquele endereço (grátis incluso). Site sem entrega pro
    // CEP → operador cota à mão. Falhou/bloqueou → tabela semeada de sempre.
    if (liveFreightEnabled() && ctx.cep) {
      const outcomes = await Promise.all(
        freights.map((f) =>
          liveStoreFreight(
            f.storeKey,
            items.filter((i) => i.storeKey === f.storeKey).map((i) => ({ sku: i.sku, qty: i.qty })),
            ctx.cep!
          )
        )
      );
      for (let i = 0; i < freights.length; i++) {
        const outcome = outcomes[i];
        console.log("[instant-quote:live]", freights[i].storeKey, outcome.kind, outcome.kind === "ok" ? outcome.fee : "");
        // Site não entrega nesse CEP, ou algum item da cesta está indisponível lá: nos
        // dois casos não dá pra cobrar automático — o operador cota à mão. A nota diz
        // POR QUE (rodadas 2 e 11 de 14/08: o mesmo carregador caiu 2x no manual e
        // ninguém sabia o motivo sem o runtime log de 1h).
        if (outcome.kind === "no-delivery" || outcome.kind === "item-unavailable") {
          const why = outcome.kind === "no-delivery" ? "site não entrega no CEP" : "item indisponível no site";
          const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId }, select: { notes: true } });
          await prisma.deliveryOrder.update({
            where: { id: orderId },
            data: { notes: appendOrderNote(current?.notes ?? null, `⚠️ Cotação instantânea abortada: ${freights[i].storeKey} — ${why}.`) }
          });
          return false;
        }
        if (outcome.kind === "ok") freights[i] = { ...freights[i], fee: outcome.fee, source: "vivo" };
      }
    }
    const totalFee = Math.round(freights.reduce((sum, f) => sum + f.fee, 0) * 100) / 100;
    const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0));
    if (itemsSubtotal <= 0) return false;
    const breakdown = freightBreakdownLabel(freights);
    await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { notes: `Cotação instantânea (vitrine, entrega pelo site). Frete por loja: ${breakdown}.` }
    });
    if (prefix) await reply(phone, prefix);

    // Duas formas de entrega no anúncio: QUEM ESCOLHE É O CLIENTE (dono, 17/08 — "tem q
    // perguntar se ele quer o mais rápido e caro ou mais demorado e barato e tem q ter
    // botão"). A cotação fica parada aqui, sem cobrar nada, até o toque; os dois totais já
    // estão calculados, então a resposta publica na hora — não é espera, é escolha.
    if (mlFaster && convoId) {
      const rapidoFee = roundMoney(totalFee - mlCheapFee + mlFaster.fee);
      const choice = {
        orderId,
        itemsSubtotal,
        serviceFee: serviceFeeForItems(items as { unitPrice: number; qty: number }[]),
        stores: freights.length,
        quotedAt: Date.now(),
        barato: { fee: totalFee, estimate: mlEstimate },
        rapido: { fee: rapidoFee, estimate: mlFaster.estimate }
      };
      await writeCtx(convoId, { ...addressOnlyCtx(ctx), deliveryOrderId: orderId, step: "choosing_freight", freightChoice: choice });
      await sendFreightChoice(phone, choice);
      return true;
    }

    await publishInstantQuote(orderId, {
      itemsSubtotal,
      serviceFee: serviceFeeForItems(items as { unitPrice: number; qty: number }[]),
      fee: totalFee,
      estimate: mlEstimate,
      stores: freights.length
    });
    return true;
  } catch (error) {
    console.warn("[instant-quote:fallback-manual]", error instanceof Error ? error.message : error);
    return false;
  }
}

// Publica a cotação instantânea. A data vem do próprio anúncio pro CEP do cliente (consulta
// do ML) — é promessa da loja, não estimativa nossa. Sem data publicada, a frase segue sem
// prazo (inventar prazo segue proibido).
async function publishInstantQuote(
  orderId: string,
  input: { itemsSubtotal: number; serviceFee?: number; fee: number; estimate?: string; stores: number }
) {
  const base = input.stores > 1 ? `pela própria loja (${input.stores} entregas)` : "pela própria loja";
  await opsPublishManualQuote(orderId, {
    itemsSubtotal: input.itemsSubtotal,
    serviceFee: input.serviceFee,
    deliveryFee: input.fee,
    deliveryMode: "retailer_delivery",
    deliveryPromise: input.estimate ? `${base} · chega até ${input.estimate}` : base
  });
}

// A pergunta da entrega com BOTÃO (dono, 17/08). Os totais mostrados são o que o cliente
// vai pagar de verdade: produtos com markup + o frete de cada opção.
type FreightChoiceState = NonNullable<DeliveryContext["freightChoice"]>;

async function sendFreightChoice(phone: string, choice: FreightChoiceState) {
  const totalFor = (fee: number) =>
    roundMoney(choice.itemsSubtotal + (choice.serviceFee ?? serviceFeeForSubtotal(choice.itemsSubtotal)) + fee);
  const barato = { total: totalFor(choice.barato.fee), estimate: choice.barato.estimate };
  const rapido = { total: totalFor(choice.rapido.fee), estimate: choice.rapido.estimate };
  const body = copy.shippingSpeedChoice(barato, rapido);
  try {
    const interactive = await whatsappAdapter.sendShippingChoices(phone, body, choice.barato, choice.rapido);
    if (interactive) return;
  } catch (error) {
    console.warn("[whatsapp:shipping-choice:fallback-text]", error instanceof Error ? error.message : error);
  }
  await reply(phone, body);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function quoteTtlMinutes(): number {
  const configured = Number(process.env.LIA_RETAILER_QUOTE_TTL_MINUTES ?? 5);
  return Number.isFinite(configured) ? Math.max(1, Math.min(15, Math.floor(configured))) : 5;
}

async function cancelPendingRetailerQuote(orderId: string): Promise<boolean> {
  const canceled = await prisma.deliveryOrder.updateMany({
    where: { id: orderId, status: { in: ["awaiting_supplier_validation", "awaiting_quote_confirmation"] } },
    data: { status: "canceled" }
  });
  if (!canceled.count) return false;
  await prisma.purchaseJob.updateMany({
    where: { deliveryOrderId: orderId, status: { in: ["preflight_queued", "preflighting", "cart_ready"] } },
    data: { status: "canceled", lastErrorCode: "QUOTE_CANCELED", lastErrorMessage: "Cotação cancelada antes do pagamento." }
  });
  return true;
}

// Volta a conversa pro menu de pagamento da cotação depois de uma falha ao emitir a
// cobrança: sem isso o contexto fica em awaiting_payment (passo do pedido já cobrado)
// enquanto o pedido voltou pra awaiting_quote_confirmation, e o cliente não consegue
// repetir *pix*/*cartão*.
async function setQuoteConversationAwaitingConfirmation(order: { id: string; conversationId?: string | null }) {
  if (!order.conversationId) return;
  const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
  if (!convo) return;
  const ctx = readCtx(convo.context);
  if (ctx.deliveryOrderId === order.id) await writeCtx(convo.id, { ...ctx, step: "awaiting_quote_confirmation" });
}

async function setQuoteConversationAwaitingPayment(order: { id: string; conversationId?: string | null }) {
  if (!order.conversationId) return;
  const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
  if (!convo) return;
  const ctx = readCtx(convo.context);
  if (ctx.deliveryOrderId === order.id) await writeCtx(convo.id, { ...addressOnlyCtx(ctx), deliveryOrderId: order.id, step: "awaiting_payment" });
}

export async function issueValidatedRetailerQuotePayment(orderId: string, method: "pix" | "card"): Promise<{ expired: boolean }> {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "awaiting_quote_confirmation") return { expired: false };
  if (!order.quoteExpiresAt || order.quoteExpiresAt.getTime() <= Date.now()) {
    await cancelPendingRetailerQuote(order.id);
    return { expired: true };
  }

  const isCard = method === "card";
  const base = order.total;
  const total = isCard ? cardTotal(base) : base;
  const cardFee = roundMoney(total - base);
  const notes = withPaymentNote(order.notes, paymentNote(method, isCard ? copy.brl(cardFee) : undefined));
  const claimed = await prisma.deliveryOrder.updateMany({
    where: { id: order.id, status: "awaiting_quote_confirmation", quoteExpiresAt: { gt: new Date() } },
    data: { status: "payment_issuing", total, notes }
  });
  if (claimed.count !== 1) {
    const current = await prisma.deliveryOrder.findUnique({ where: { id: order.id }, select: { status: true } });
    return { expired: current?.status === "canceled" };
  }

  try {
    if (isCard) {
      const credential = await getOneClickCredential(order.userId);
      const awaitingPayment = await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: { status: "awaiting_payment", pixId: null, pixCopiaECola: null, quoteExpiresAt: null }
      });
      await setQuoteConversationAwaitingPayment(order);
      if (credential) {
        try {
          await createCardAttempt(awaitingPayment, credential);
          return { expired: false };
        } catch (error) {
          console.warn("[retailer-quote:card:fallback-checkout]", error instanceof Error ? error.message : error);
        }
      }
      if (await sendFirstCardEnrollment(awaitingPayment)) return { expired: false };
      const link = await checkoutAdapter.createLink({ orderId: order.id, amount: total, description: `Lia · pedido ${order.id.slice(-6)}`, method: "card" });
      await prisma.deliveryOrder.update({ where: { id: order.id }, data: { pixId: link.preferenceId, pixCopiaECola: link.initPoint } });
      await reply(order.phone, copy.cardInstructions(total, link.initPoint, link.mock));
    } else {
      const charge = await pixAdapter.createPix({ orderId: order.id, amount: total, description: `Lia · pedido ${order.id.slice(-6)}` });
      await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: { status: "awaiting_payment", pixId: charge.pixId, pixCopiaECola: charge.copiaECola, quoteExpiresAt: null }
      });
      await setQuoteConversationAwaitingPayment(order);
      await reply(order.phone, copy.pixInstructions(total, charge.mock));
      await reply(order.phone, charge.copiaECola);
    }
    return { expired: false };
  } catch (error) {
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { status: "awaiting_quote_confirmation", notes: [notes, `⚠️ Falha ao emitir pagamento: ${error instanceof Error ? error.message.slice(0, 180) : "erro desconhecido"}`].filter(Boolean).join("\n") }
    });
    await setQuoteConversationAwaitingConfirmation(order);
    // Mercado Pago fora do ar: a cotação continua de pé (o TTL ainda vale), então o
    // cliente repete *pix*/*cartão* e a Lia tenta emitir de novo. Não relança — isso
    // devolveria 500 pro webhook do WhatsApp e o cliente ficaria sem resposta nenhuma.
    if (error instanceof PaymentProviderError) {
      await reply(order.phone, copy.paymentIssueFailed());
      await notifyOperator(
        copy.operatorPaymentFailedAlert(order.id.slice(-6).toUpperCase(), error.message.slice(0, 180))
      );
      return { expired: false };
    }
    throw error;
  }
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
      storeLabel: (ctx.fulfillments?.length ?? 0) > 1 ? `${ctx.fulfillments!.length} lojas` : ctx.basket?.[0]?.storeLabel ?? orderStore(ctx).label,
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
      // Checkout must be immediate. Retailer validation begins only after payment,
      // so a slow cart/browser session never delays the customer's payment link.
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

  // A cobrança em si (e a falha do Mercado Pago) vive em issueChargeForOrder: o pedido
  // já está durável em awaiting_payment, então uma falha só o deixa sem cobrança —
  // o cliente repete *pix*/*cartão* e a Lia emite de novo.
  await issueChargeForOrder(phone, order, isCard ? "card" : "pix", total);
}

// The customer changed their mind about how to pay while the charge is still open:
// re-issue the charge with the other method (total re-derived from the order rows so
// the fee pass-through stays honest) and keep reconciliation on the same order id.
async function switchPaymentMethod(
  phone: string,
  order: {
    id: string;
    userId: string;
    phone: string;
    total: number;
    items: unknown;
    status: string;
    itemsSubtotal: number;
    serviceFee: number;
    deliveryFee: number;
    notes?: string | null;
  },
  method: "pix" | "card"
) {
  const base = Math.round((order.itemsSubtotal + order.serviceFee + order.deliveryFee) * 100) / 100;
  const isCard = method === "card";
  const total = isCard ? cardTotal(base) : base;
  const cardFee = Math.round((total - base) * 100) / 100;
  const description = `Lia · pedido ${order.id.slice(-6)}`;
  // Replace ONLY the payment line — other notes (e.g. a cancel-request flag) survive.
  const notes = withPaymentNote(order.notes, paymentNote(method, isCard ? copy.brl(cardFee) : undefined));

  if (isCard) {
    if (await getConfirmedPaymentAttempt(order.id)) {
      await reply(phone, copy.cardPaymentProcessing());
      return;
    }
    await expireOpenPaymentAttempts(order.id);
    const credential = await getOneClickCredential(order.userId);
    if (credential) {
      const updated = await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: { total, notes, pixId: null, pixCopiaECola: null }
      });
      try {
        await createCardAttempt(updated, credential);
        return;
      } catch (error) {
        console.warn("[whatsapp-pay:switch:fallback-checkout]", error instanceof Error ? error.message : error);
      }
    }
    const updated = await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { total, notes, pixId: null, pixCopiaECola: null }
    });
    if (await sendFirstCardEnrollment(updated)) {
      await reply(phone, copy.paymentSwitched(method, total));
      return;
    }
    let link;
    try {
      link = await checkoutAdapter.createLink({ orderId: order.id, amount: total, description, method: "card" });
    } catch (error) {
      // O pedido já está com o total/notas do cartão e sem cobrança: repetir *cartão*
      // reemite pelo resendCharge. O que não pode é sair link de mentira.
      await reportChargeIssueFailure(phone, { id: order.id, notes }, error);
      return;
    }
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { total, notes, pixId: link.preferenceId, pixCopiaECola: link.initPoint }
    });
    await reply(phone, [copy.paymentSwitched(method, total), link.initPoint, link.mock ? `\n${copy.sandboxHint()}` : ""].filter(Boolean).join("\n"));
    return;
  }

  await expireOpenPaymentAttempts(order.id);
  let charge;
  try {
    charge = await pixAdapter.createPix({ orderId: order.id, amount: total, description }).then((pix) => ({
      pixId: pix.pixId,
      payload: pix.copiaECola,
      mock: pix.mock
    }));
  } catch (error) {
    // Nada foi gravado ainda: o pedido continua na forma de pagamento anterior e
    // aguardando. Um Pix mock aqui viraria "paguei" aprovado sem dinheiro.
    await reportChargeIssueFailure(phone, order, error);
    return;
  }
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
  await resetConversationForClosedOrder(order, "paid");
  // Não existe mais carrinho reservado por robô: quem compra é o operador, depois do
  // pagamento confirmado. O aviso ao cliente é sempre o mesmo.
  await reply(order.phone, copy.paymentConfirmed());
  // Pedido pago é o alerta mais urgente de todos: dinheiro na mão e ninguém comprando.
  // Alerta de PAGO desligado por padrão (pedido do dono, 20/08 — ele é o operador e o
  // /ops já mostra). Religar com LIA_OPERATOR_PAID_ALERT=true quando entrar gente de
  // fora: foi este alerta que matou o pedido-zumbi de 2 dias em 11/08.
  if (process.env.LIA_OPERATOR_PAID_ALERT === "true") {
    await notifyOperator(copy.operatorPaidAlert(order.id.slice(-6).toUpperCase(), order.total));
  }
  // Create the durable local-worker task after the money state is committed. This is
  // best-effort: a queue outage must not undo a real payment; claim() backfills paid
  // orders that missed this hook.
  try {
    const { ensurePurchaseJobForPaidOrder } = await import("@/lib/purchase-worker");
    await ensurePurchaseJobForPaidOrder(order.id);
  } catch (error) {
    console.error("[purchase-worker:enqueue-failed]", error instanceof Error ? error.message : error);
  }
  return order;
}

// O operador publica a cotação feita à mão no /ops: grava custo real dos produtos +
// frete + modalidade, move o pedido para awaiting_quote_confirmation e manda ao cliente
// o resumo com os botões de pagamento — a cobrança em si é issueValidatedRetailerQuotePayment.
export async function opsPublishManualQuote(
  orderId: string,
  input: {
    itemsSubtotal: number;
    deliveryFee: number;
    deliveryMode?: "operator_courier" | "retailer_delivery";
    deliveryPromise?: string;
    etaMinutes?: number;
    // Margem exata por item (cotação instantânea). Ausente = cotação manual do /ops,
    // onde só existe o subtotal — as faixas progressivas valem sobre ele inteiro.
    serviceFee?: number;
    items?: { qty: number; name: string; unitPrice?: number }[];
  }
) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.status !== AWAITING_OPERATOR_QUOTE_STATUS) {
    throw new Error("Só é possível cotar um pedido que está aguardando cotação do operador.");
  }
  const itemsSubtotal = roundMoney(Math.max(0, Number(input.itemsSubtotal) || 0));
  const deliveryFee = roundMoney(Math.max(0, Number(input.deliveryFee) || 0));
  if (itemsSubtotal <= 0) throw new Error("Informe o custo dos produtos (maior que zero).");
  const serviceFee = input.serviceFee != null ? roundMoney(input.serviceFee) : serviceFeeForSubtotal(itemsSubtotal);
  // "produtos" shown to the customer already includes the markup.
  const produtos = roundMoney(itemsSubtotal + serviceFee);
  const total = roundMoney(produtos + deliveryFee);
  const deliveryMode = input.deliveryMode === "retailer_delivery" ? "retailer_delivery" : "operator_courier";
  const sameHour = deliveryMode === "operator_courier";
  // Never publish a quote that can charge the customer when the operator's own
  // pickup base is not configured. The same validation runs again at dispatch.
  if (sameHour) requireOperatorPickup();
  const courierKey = deliveryMode === "retailer_delivery" ? "retailer_delivery" : "uber_direct";

  const items: BasketItem[] = input.items?.length
    ? input.items.map((entry) => {
        const qty = Math.max(1, Math.round(Number(entry.qty) || 1));
        const unitPrice = Math.max(0, Number(entry.unitPrice) || 0);
        return {
          sku: `concierge:${normalizeMsg(entry.name)}`,
          name: entry.name,
          qty,
          unitPrice,
          lineTotal: roundMoney(unitPrice * qty),
          storeKey: CONCIERGE_STORE_KEY,
          storeLabel: CONCIERGE_STORE_LABEL
        };
      })
    : ((order.items as unknown as BasketItem[]) ?? []);

  const quoteExpiresAt = new Date(Date.now() + quoteTtlMinutes() * 60_000);
  const fulfillment = {
    storeKey: order.storeKey,
    storeLabel: order.storeLabel,
    deliveryMode,
    deliveryPromise: input.deliveryPromise,
    deliveryFee,
    retailerTotal: produtos,
    etaMinutes: input.etaMinutes
  };
  // Flip ATÔMICO: a condição de status vai no próprio UPDATE. Sem isso, um cancelamento
  // concorrente (cliente mandando "cancelar", ou a expiração de abandono) era
  // sobrescrito e o pedido "ressuscitava" indo pedir pagamento.
  const claimed = await prisma.deliveryOrder.updateMany({
    where: { id: order.id, status: AWAITING_OPERATOR_QUOTE_STATUS },
    data: {
      status: "awaiting_quote_confirmation",
      items: items as unknown as object,
      fulfillments: [fulfillment] as unknown as object,
      itemsSubtotal,
      serviceFee,
      deliveryFee,
      total,
      courierKey,
      quoteExpiresAt,
      notes: appendOrderNote(order.notes, `Cotação manual enviada (${sameHour ? "motoboy na hora" : "entrega do varejista"}).`)
    }
  });
  if (!claimed.count) {
    throw new Error("O pedido mudou de estado antes da cotação sair (cancelado ou já cotado). Recarregue o /ops.");
  }

  if (order.conversationId) {
    const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
    if (convo) {
      const ctx = readCtx(convo.context);
      await writeCtx(convo.id, { ...addressOnlyCtx(ctx), deliveryOrderId: order.id, step: "awaiting_quote_confirmation" });
    }
  }

  const summaryInput = {
    items: items.map((item) => ({ qty: item.qty, name: item.name })),
    produtos,
    frete: deliveryFee,
    deliveryPromise: input.deliveryPromise,
    etaMinutes: input.etaMinutes,
    total,
    deliveryAddress: order.deliveryAddress ?? undefined,
    sameHour
  };
  // O pedido JÁ saiu de "aguardando cotação". Se o RESUMO (a peça essencial) falhar, o
  // cliente fica sem total nenhum e o operador sem poder recotar → rollback pra fila.
  // Depois que o resumo saiu, NÃO se faz rollback: menu e aviso de validade são
  // acessórios ("pix"/"cartão" por texto funcionam), e reverter aqui desalinharia
  // pedido e conversa — o cliente pode já ter tocado num botão e o pedido avançado.
  try {
    // Resumo com botão "Trocar endereço" (dono, 11/08). Corpo interativo tem teto de 1024
    // chars na Meta — resumo comprido (ou canal sem botão) cai no texto com a dica escrita.
    let summarySent = false;
    const buttonBody = copy.manualQuoteSummary({ ...summaryInput, addressButton: true });
    if (summaryInput.deliveryAddress && buttonBody.length <= 1024) {
      try {
        summarySent = Boolean(await whatsappAdapter.sendQuoteSummary(order.phone, buttonBody));
      } catch (error) {
        console.warn("[whatsapp:quote-summary:fallback-text]", error instanceof Error ? error.message : error);
      }
    }
    if (!summarySent) await reply(order.phone, copy.manualQuoteSummary(summaryInput));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[ops:publish-quote:send-failed]", detail);
    const rolled = await prisma.deliveryOrder.updateMany({
      where: { id: order.id, status: "awaiting_quote_confirmation" },
      data: {
        status: AWAITING_OPERATOR_QUOTE_STATUS,
        quoteExpiresAt: null,
        notes: appendOrderNote(order.notes, `⚠️ Cotação revertida: falha ao enviar no WhatsApp (${detail.slice(0, 120)}). Tente cotar de novo.`)
      }
    });
    // A conversa só volta pra "aguardando cotação" se o PEDIDO de fato voltou — se ele
    // já avançou (corrida com um toque de pagamento), reescrever o contexto aqui
    // desalinharia os dois.
    if (rolled.count && order.conversationId) {
      const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
      if (convo) {
        const ctx = readCtx(convo.context);
        await writeCtx(convo.id, { ...addressOnlyCtx(ctx), deliveryOrderId: order.id, step: AWAITING_OPERATOR_QUOTE_STATUS });
      }
    }
    throw error;
  }
  try {
    const interactive = await whatsappAdapter.sendPaymentChoices(order.phone, total, cardTotal(total));
    if (!interactive) await reply(order.phone, copy.paymentMethod(total, cardTotal(total)));
    await reply(order.phone, copy.quoteValidFor(quoteTtlMinutes()));
  } catch (error) {
    // Resumo já chegou: o cliente tem o total e "pix"/"cartão" por texto funcionam.
    console.warn("[ops:publish-quote:followup-send-failed]", error instanceof Error ? error.message : error);
  }
  return prisma.deliveryOrder.findUnique({ where: { id: order.id } });
}

export async function opsMarkBought(orderId: string, storeOrderNumber: string, trackingUrl?: string) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status !== "paid") throw new Error("Somente um pedido pago pode ser marcado como comprado.");
  // Link de acompanhamento do pedido NA LOJA (ML e afins), colado já na compra — que é
  // quando o operador tem a página aberta. Sem isso o cliente só recebia rastreio no
  // "saiu pra entrega", instante que nos pedidos entregues pela loja o operador não tem
  // como saber (dono, 17/08: "ele tem que poder ver e acompanhar").
  const safeTrackingUrl = (trackingUrl ?? "").trim();
  if (safeTrackingUrl && !/^https:\/\//i.test(safeTrackingUrl)) {
    throw new Error("O link de acompanhamento precisa ser uma URL https.");
  }
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    // Blank input stays null so legacy pickupInstructions' "—" fallback works if
    // this is an authorized-courier order.
    data: {
      status: statusAfterStorePurchase(current),
      storeOrderNumber: storeOrderNumber.trim() || null,
      // Coluna legada de courier = link de rastreio genérico voltado ao cliente (mesma
      // usada por opsMarkRetailerOutForDelivery). Só sobrescreve quando veio link novo.
      ...(safeTrackingUrl ? { courierTrackingUrl: safeTrackingUrl } : {}),
      notes: appendOrderNote(current.notes, `🧾 Compra marcada pelo operador em ${new Date().toISOString()}.`)
    }
  });
  // Keep the durable purchase queue aligned when the operator finishes a claimed
  // job through /ops. This also makes recovery safe if the worker loses its HTTP
  // response after the retailer accepted the order.
  await prisma.purchaseJob.updateMany({
    where: {
      deliveryOrderId: orderId,
      status: { in: ["queued", "retrying", "claimed", "awaiting_approval", "approved"] }
    },
    data: {
      status: "completed",
      storeOrderNumber: storeOrderNumber.trim() || null,
      lockedAt: null,
      nextAttemptAt: null,
      completedAt: new Date()
    }
  });
  // O cliente era o único que não sabia da compra (17/08): entre "pagamento confirmado" e
  // "saiu pra entrega" ele ficava no silêncio, que num pedido de loja pode durar horas —
  // e silêncio depois de pagar é onde nasce o "cadê meu pedido?". Falha de envio não
  // desfaz a compra: o status já mudou e o /ops é a fonte da verdade.
  try {
    await reply(
      updated.phone,
      copy.orderStatusLine({
        shortId: updated.id.slice(-6).toUpperCase(),
        status: updated.status,
        trackingUrl: updated.courierTrackingUrl
      })
    );
  } catch (error) {
    console.warn("[ops:mark-bought:notify-failed]", error instanceof Error ? error.message : error);
  }
  return updated;
}

export async function opsDispatchCourier(orderId: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  // A second click must never create a second courier job. Returning the existing
  // dispatch is idempotent and keeps a slow/double-click from charging twice.
  if (order.status === "dispatched") return order;
  if (isRetailerDeliveryOrder(order)) {
    throw new Error("Pedidos com entrega do varejista não podem despachar courier externo.");
  }
  if (!["operator_buying", "ready_for_pickup"].includes(order.status)) {
    throw new Error("O pedido precisa estar comprado antes de despachar o courier.");
  }
  const fulfillments = (order.fulfillments as unknown as StoreFulfillment[] | null) ?? [];
  if (fulfillments.length > 1) {
    const dispatches = [];
    for (const fulfillment of fulfillments) {
      const store = getStore(fulfillment.storeKey);
      const courier = getCourier(fulfillment.courierKey);
      const dispatch = await courier.dispatch({
        orderId: `${order.id}-${fulfillment.storeKey}`,
        pickupAddress: fulfillment.unitAddress,
        dropoffAddress: order.deliveryAddress ?? "",
        pickupCep: fulfillment.unitCep,
        dropoffCep: order.cep ?? undefined,
        instructions: store.pickupInstructions(order.storeOrderNumber?.trim() || "—"),
        quoteId: fulfillment.courierQuoteId,
        dropoffName: order.customerName ?? undefined,
        dropoffPhone: order.phone
      });
      assertDispatchIsAllowed(dispatch);
      dispatches.push(dispatch);
    }
    const tracking = dispatches.map((dispatch, index) => `${fulfillments[index].storeLabel}: ${dispatch.trackingUrl}`).join("\n");
    const updated = await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: {
        status: "dispatched",
        courierTrackingUrl: tracking,
        courierDispatchedAt: new Date(),
        notes: appendOrderNote(order.notes, `🧾 Courier despachado pelo operador em ${new Date().toISOString()}.`)
      }
    });
    await reply(order.phone, copy.dispatched(tracking));
    return updated;
  }
  const courier = getCourier(order.courierKey);
  let pickupAddress: string;
  let pickupCep: string | undefined;
  let instructions: string;
  if (isOperatorCourierOrder(order)) {
    // Same-hour concierge: the operator already holds the goods; the courier picks up at
    // the operator's base and delivers to the customer — no store counter, no titleholder
    // documents. This is the pilot's motoboy path.
    const pickup = requireOperatorPickup();
    pickupAddress = pickup.address;
    pickupCep = pickup.cep;
    instructions = `Retirar com a Lia e entregar ao cliente${order.storeOrderNumber?.trim() ? ` (ref. ${order.storeOrderNumber.trim()})` : ""}.`;
  } else {
    // Legacy authorized-partner pickup: re-derive the store unit so the connector can
    // re-quote at dispatch (the order-time quote has expired).
    const store = getStore(order.storeKey);
    const unit = (await pickNearestUnit(store.listUnits(), order.cep ?? undefined)).unit;
    pickupAddress = order.storeAddress ?? unit.address;
    pickupCep = unit.cep;
    instructions = store.pickupInstructions(order.storeOrderNumber?.trim() || "—");
  }
  const dispatch = await courier.dispatch({
    orderId: order.id,
    pickupAddress,
    dropoffAddress: order.deliveryAddress ?? "",
    pickupCep,
    dropoffCep: order.cep ?? undefined,
    instructions,
    quoteId: order.courierQuoteId ?? undefined,
    dropoffName: order.customerName ?? undefined,
    dropoffPhone: order.phone
  });
  assertDispatchIsAllowed(dispatch);
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "dispatched",
      courierTrackingUrl: dispatch.trackingUrl,
      courierDispatchedAt: new Date(),
      notes: appendOrderNote(order.notes, `🧾 Courier despachado pelo operador em ${new Date().toISOString()}.`)
    }
  });
  await reply(order.phone, copy.dispatched(dispatch.trackingUrl));
  return updated;
}

export async function opsMarkRetailerOutForDelivery(orderId: string, trackingUrl?: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (!isRetailerDeliveryOrder(order)) {
    throw new Error("Esta ação é exclusiva de pedidos entregues pelo varejista.");
  }
  if (!["retailer_preparing", "operator_buying"].includes(order.status)) {
    throw new Error("O pedido precisa estar comprado e em preparação antes de sair para entrega.");
  }
  const safeTrackingUrl = (trackingUrl ?? "").trim();
  if (safeTrackingUrl && !/^https:\/\//i.test(safeTrackingUrl)) {
    throw new Error("O rastreio precisa ser uma URL https.");
  }
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: RETAILER_OUT_FOR_DELIVERY_STATUS,
      // This legacy column is now the generic customer-facing tracking URL. Keeping
      // it avoids a risky production migration during the controlled pilot.
      courierTrackingUrl: safeTrackingUrl || null,
      courierDispatchedAt: new Date(),
      notes: appendOrderNote(order.notes, `🧾 Varejista saiu para entrega em ${new Date().toISOString()}.`)
    }
  });
  await reply(order.phone, copy.retailerOutForDelivery(safeTrackingUrl || null));
  return updated;
}

export async function opsMarkDelivered(orderId: string) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (!isOrderOutForDelivery(current.status)) {
    throw new Error("O pedido precisa estar em rota antes de ser marcado como entregue.");
  }
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
      notes: appendOrderNote(current.notes, `🧾 Entrega marcada pelo operador em ${new Date().toISOString()}.`)
    }
  });
  await reply(order.phone, copy.delivered());
  return order;
}

export async function opsCancelRefund(orderId: string) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status === "refund_pending") return current;
  const paymentReceived = Boolean(current.paidAt) || PAID_OR_IN_FULFILLMENT_STATUSES.includes(current.status);
  const [order] = await prisma.$transaction([
    prisma.deliveryOrder.update({
      where: { id: orderId },
      data: paymentReceived
        ? {
            status: "refund_pending",
            notes: appendOrderNote(
              appendOrderNote(current.notes, REFUND_PENDING_FLAG),
              `🧾 Estorno solicitado pelo operador em ${new Date().toISOString()}.`
            )
          }
        : { status: "canceled", notes: appendOrderNote(current.notes, `🧾 Pedido cancelado sem pagamento em ${new Date().toISOString()}.`) }
    }),
    // Cancel every pre-purchase step so a released/abandoned cart never blocks the
    // next customer. A job already in purchasing/ordered is intentionally preserved
    // for reconciliation; the late store result cannot resurrect the DeliveryOrder.
    prisma.purchaseJob.updateMany({
      where: {
        deliveryOrderId: orderId,
        status: { in: ["preflight_queued", "preflighting", "cart_ready", "awaiting_approval", "approved"] }
      },
      data: {
        status: "canceled",
        lastErrorCode: "ORDER_CANCELED",
        lastErrorMessage: "Pedido cancelado antes da finalização na loja.",
        nextAttemptAt: null
      }
    })
  ]);
  // O pedido fechou: a conversa não pode continuar presa nele (revisão 18/08 — cliente
  // ouvia "ainda estou cotando" de pedido cancelado e, em `choosing_freight`, o botão de
  // frete não tinha saída).
  await resetConversationForClosedOrder(order, paymentReceived ? "refund" : "cancel");
  await reply(order.phone, paymentReceived ? copy.refundRequested() : copy.canceledUnpaid());
  return order;
}

export async function opsConfirmRefund(orderId: string, reference: string, amount?: number) {
  const safeReference = reference.replace(/[\r\n]/g, " ").trim().slice(0, 120);
  if (!safeReference) throw new Error("Informe a referência do estorno para auditoria.");
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status !== "refund_pending") throw new Error("O pedido não está aguardando estorno.");
  const refundAmount = amount == null ? current.total : roundMoney(Number(amount));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > current.total + 0.01) {
    throw new Error("O valor do estorno deve ser maior que zero e não pode ultrapassar o total pago.");
  }
  const amountLabel = Math.abs(refundAmount - current.total) <= 0.01 ? "integral" : `parcial R$ ${refundAmount.toFixed(2).replace(".", ",")}`;
  const notesWithoutPending = (current.notes ?? "")
    .split("\n")
    .filter((line) => line !== REFUND_PENDING_FLAG)
    .join("\n");
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "refunded",
      notes: appendOrderNote(
        notesWithoutPending,
        `${REFUND_CONFIRMED_PREFIX} ${amountLabel} — ${safeReference}`
      )
    }
  });
  await reply(order.phone, copy.refundConfirmed());
  return order;
}

// Free-text note from the operator to the customer (out-of-stock, item refund,
// delay…) — sent as Lia, logged in the conversation. Substitutions are disabled.
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
    where: { status: { in: OPS_QUEUE_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: { purchaseJobs: { include: { items: true }, orderBy: { createdAt: "asc" } } }
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
