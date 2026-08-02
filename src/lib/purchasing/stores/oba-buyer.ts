import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";
import { getPurchasePolicy, money } from "../policy";
import type { BuyerConnector, BuyerInput, CartSnapshot, ResolvedPurchaseItem, StoreOrderResult } from "../types";
import { PurchaseError } from "../types";
import { retailMatch } from "./browser-store-utils";

const OBA_ORIGIN = "https://secure.obahortifruti.com.br";

type ObaLine = { id: string; seller: string; quantity: number; name?: string; sellingPrice?: number; availability?: string };
type ObaSla = { id?: string; deliveryChannel?: string; price?: number; shippingEstimate?: string; availableDeliveryWindows?: Array<{ startDateUtc?: string; endDateUtc?: string }> };
type ObaSimulation = { items?: ObaLine[]; logisticsInfo?: Array<{ itemIndex?: number; slas?: ObaSla[] }>; messages?: Array<{ text?: string }> };
type ObaOrderForm = { orderFormId?: string; items?: ObaLine[]; value?: number };

function obaSessionOptions() {
  const country = (process.env.OBA_BROWSER_PROXY_COUNTRY ?? process.env.BROWSERBASE_PROXY_COUNTRY ?? "BR").trim().toUpperCase();
  return {
    keepAlive: true,
    browserSettings: { context: { id: process.env.OBA_BROWSER_CONTEXT_ID as string, persist: true }, allowedDomains: ["obahortifruti.com.br"], recordSession: true },
    ...(country && /^[A-Z]{2}$/.test(country) ? { proxies: [{ type: "browserbase" as const, geolocation: { country } }] } : {})
  };
}

function obaSku(value: string): { id: string; seller: string } | null {
  const match = value.match(/^oba-live-(\d+)-seller-([\w-]+)$/i);
  return match ? { id: match[1], seller: match[2] } : null;
}

function cents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? money(value / 100) : undefined;
}

function deliveryWindow(sla: ObaSla): string | undefined {
  const window = sla.availableDeliveryWindows?.[0];
  if (!window?.startDateUtc || !window.endDateUtc) return undefined;
  const start = new Date(window.startDateUtc);
  const end = new Date(window.endDateUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(start);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time.format(start)}–${time.format(end)}`;
}

function commonDeliveryOption(simulation: ObaSimulation, itemCount: number): { id: string; fee: number; promise: string } | null {
  const byId = new Map<string, ObaSla[]>();
  for (const info of simulation.logisticsInfo ?? []) {
    const seen = new Set<string>();
    for (const sla of info.slas ?? []) {
      if (sla.deliveryChannel !== "delivery" || !sla.id || seen.has(sla.id)) continue;
      seen.add(sla.id);
      byId.set(sla.id, [...(byId.get(sla.id) ?? []), sla]);
    }
  }
  const candidates = [...byId.entries()]
    .filter(([, slas]) => slas.length === itemCount && slas.every((sla) => cents(sla.price) !== undefined))
    .map(([id, slas]) => ({ id, slas, fee: money(slas.reduce((sum, sla) => sum + (cents(sla.price) ?? 0), 0)) }))
    // An actual delivery window is safer than an unbookable SLA returned after cutoff.
    .sort((a, b) => Number(Boolean(deliveryWindow(b.slas[0]))) - Number(Boolean(deliveryWindow(a.slas[0]))) || a.fee - b.fee);
  const selected = candidates[0];
  if (!selected) return null;
  const sla = selected.slas[0];
  const promise = deliveryWindow(sla) ?? (sla.shippingEstimate ? `${selected.id} · prazo informado pela loja: ${sla.shippingEstimate}` : undefined);
  return promise ? { id: selected.id, fee: selected.fee, promise } : null;
}

async function vtex<T>(page: Page, path: string, options: { method?: "POST"; body?: unknown } = {}): Promise<T> {
  return page.evaluate(async ({ path: requestPath, method, body }) => {
    const response = await fetch(requestPath, {
      method: method ?? "GET",
      headers: body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text.slice(0, 300); }
    if (!response.ok) throw new Error(`VTEX ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    return payload;
  }, { path, method: options.method, body: options.body }) as Promise<T>;
}

export class ObaBuyer implements BuyerConnector {
  key = "oba";

  async preflight(input: BuyerInput): Promise<CartSnapshot> {
    this.assertConfigured();
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create(obaSessionOptions());
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());
    try {
      await page.goto(OBA_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const orderForm = await vtex<ObaOrderForm>(page, "/api/checkout/pub/orderForm");
      if (!orderForm.orderFormId) throw new PurchaseError("RETAILER_UNAVAILABLE", "O Oba não retornou um carrinho para cotação.");
      await vtex(page, `/api/checkout/pub/orderForm/${encodeURIComponent(orderForm.orderFormId)}/items/removeAll`, { method: "POST", body: {} });
      // Await before closing the CDP connection in finally. Returning the promise directly
      // would close the page while its VTEX fetches are still in flight.
      return await this.buildSnapshot(page, session.id, input, orderForm.orderFormId, true);
    } finally { await browser.close(); }
  }

  async revalidate(input: BuyerInput): Promise<CartSnapshot> {
    this.assertConfigured();
    if (!input.browserSessionId) return this.preflight(input);
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.retrieve(input.browserSessionId).catch(() => null);
    if (!session?.connectUrl || session.status !== "RUNNING") return this.preflight({ ...input, browserSessionId: null });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());
    try {
      await page.goto(OBA_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const orderForm = await vtex<ObaOrderForm>(page, "/api/checkout/pub/orderForm");
      if (!orderForm.orderFormId) throw new PurchaseError("RETAILER_UNAVAILABLE", "O Oba não retornou o carrinho para revalidação.");
      // See preflight: snapshot capture still needs the page until every checkout request ends.
      return await this.buildSnapshot(page, session.id, input, orderForm.orderFormId, false);
    } finally { await browser.close(); }
  }

  async placeOrder(_input: BuyerInput, _snapshot: CartSnapshot, _idempotencyKey: string): Promise<StoreOrderResult> {
    const policy = getPurchasePolicy();
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", !policy.enabled || policy.mode === "off" || policy.mode === "cart_only" ? "O Oba está em cart_only: a sacola e a cotação foram preparadas, mas a compra não será finalizada." : "A finalização financeira do Oba exige ação humana na sessão gravada.");
  }

  private async buildSnapshot(page: Page, sessionId: string, input: BuyerInput, orderFormId: string, addItems: boolean): Promise<CartSnapshot> {
    const requested = input.items.map((item) => ({ item, oba: obaSku(item.requestedSku) }));
    const valid = requested.filter((entry): entry is { item: BuyerInput["items"][number]; oba: { id: string; seller: string } } => Boolean(entry.oba));
    const failed: ResolvedPurchaseItem[] = requested.filter((entry) => !entry.oba).map(({ item }) => ({ ...item, status: "ambiguous", raw: { reason: "missing_oba_sku" } }));
    if (addItems && valid.length) {
      await vtex(page, `/api/checkout/pub/orderForm/${encodeURIComponent(orderFormId)}/items?allowedOutdatedData=paymentData`, {
        method: "POST",
        body: { orderItems: valid.map(({ item, oba }) => ({ id: oba.id, seller: oba.seller, quantity: item.requestedQty })) }
      });
    }
    const cart = await vtex<ObaOrderForm>(page, "/api/checkout/pub/orderForm");
    const cep = input.deliveryCep?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) throw new PurchaseError("CONFIGURATION_REQUIRED", "Falta o CEP de entrega para cotar a sacola Oba.");
    const simulation = await vtex<ObaSimulation>(page, "/api/checkout/pub/orderForms/simulation?sc=1", {
      method: "POST",
      body: { items: valid.map(({ item, oba }) => ({ id: oba.id, seller: oba.seller, quantity: item.requestedQty })), postalCode: cep, country: "BRA" }
    });
    const byId = new Map((cart.items ?? []).map((line) => [line.id, line]));
    const availability = new Map((simulation.items ?? []).map((line) => [line.id, line]));
    const resolved = valid.map(({ item, oba }): ResolvedPurchaseItem => {
      const cartLine = byId.get(oba.id);
      const simulated = availability.get(oba.id);
      const quantity = cartLine?.quantity ?? 0;
      const confidence = retailMatch(item.requestedName, cartLine?.name ?? item.requestedName);
      const available = simulated?.availability === "available";
      const accepted = quantity === item.requestedQty && available && confidence >= 0.7;
      return { ...item, status: accepted ? "resolved" : available ? "ambiguous" : "unavailable", retailerSku: oba.id, retailerProductId: oba.id, retailerSellerId: oba.seller, resolvedName: cartLine?.name ?? item.requestedName, actualUnitPrice: cents(cartLine?.sellingPrice) ?? item.requestedUnitPrice ?? undefined, matchConfidence: confidence, raw: { cartQty: quantity, availability: simulated?.availability ?? "missing" } };
    });
    const items = [...resolved, ...failed];
    const option = commonDeliveryOption(simulation, valid.length);
    const itemsSubtotal = money(items.reduce((sum, item) => sum + (item.actualUnitPrice ?? 0) * item.requestedQty, 0));
    const ready = valid.length === input.items.length && items.every((item) => item.status === "resolved") && Boolean(option);
    return {
      storeKey: input.storeKey,
      storeLabel: input.storeLabel,
      retailerCartId: cart.orderFormId ?? orderFormId,
      browserSessionId: sessionId,
      items,
      itemsSubtotal,
      deliveryFee: option?.fee,
      deliveryPromise: option?.promise,
      total: money(itemsSubtotal + (option?.fee ?? 0)),
      currency: "BRL",
      capturedAt: new Date().toISOString(),
      status: ready ? "ready" : "needs_human",
      reason: ready ? undefined : `A sacola Oba não confirmou itens, estoque regional e uma modalidade domiciliar comum (mensagens=${(simulation.messages ?? []).map((message) => message.text).filter(Boolean).join(" | ") || "nenhuma"}).`
    };
  }

  private assertConfigured(): void {
    if (!process.env.BROWSERBASE_API_KEY || !process.env.OBA_BROWSER_CONTEXT_ID) {
      throw new PurchaseError("CONFIGURATION_REQUIRED", "Faltam BROWSERBASE_API_KEY e OBA_BROWSER_CONTEXT_ID para preparar a sacola Oba.");
    }
  }
}
