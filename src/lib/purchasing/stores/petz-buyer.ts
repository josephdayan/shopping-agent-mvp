import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";
import { getPurchasePolicy, money } from "../policy";
import type { BuyerConnector, BuyerInput, CartSnapshot, ResolvedPurchaseItem, StoreOrderResult } from "../types";
import { PurchaseError } from "../types";
import { clickCookieConsent, isVisible, parseBrl, parseLabelledTotal, retailMatch, safeRetailerUrl } from "./browser-store-utils";

const PETZ_ORIGIN = "https://www.petz.com.br";

function petzSessionOptions() {
  const country = (process.env.PETZ_BROWSER_PROXY_COUNTRY ?? process.env.BROWSERBASE_PROXY_COUNTRY ?? "BR").trim().toUpperCase();
  return {
    keepAlive: true,
    browserSettings: { context: { id: process.env.PETZ_BROWSER_CONTEXT_ID as string, persist: true }, allowedDomains: ["petz.com.br"], recordSession: true },
    ...(country && /^[A-Z]{2}$/.test(country) ? { proxies: [{ type: "browserbase" as const, geolocation: { country } }] } : {})
  };
}

function petzProductId(url: string): string | undefined { return url.match(/-(\d+)(?:[/?#]|$)/)?.[1]; }
async function bodyText(page: Page): Promise<string> { return page.locator("body").innerText({ timeout: 15_000 }).catch(() => ""); }

async function openBag(page: Page): Promise<string> {
  const drawer = page.locator("[data-testid=ecom-product-card-modal-bag-dialog]");
  if (await isVisible(drawer)) return drawer.innerText();
  let bag = page.locator("[data-testid=bag-notification]");
  await bag.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (!(await isVisible(bag))) {
    await page.goto(PETZ_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
    bag = page.locator("[data-testid=bag-notification]");
    await bag.first().waitFor({ state: "visible", timeout: 7_500 }).catch(() => undefined);
  }
  if (!(await isVisible(bag))) bag = page.getByRole("button", { name: /^sacola$/i });
  if (!(await isVisible(bag))) throw new PurchaseError("MANUAL_ACTION_REQUIRED", "A Petz não exibiu o botão da sacola.");
  await bag.first().click({ timeout: 10_000 });
  await page.waitForTimeout(500);
  return drawer.innerText().catch(() => bodyText(page));
}

export class PetzBuyer implements BuyerConnector {
  key = "petz";

  async preflight(input: BuyerInput): Promise<CartSnapshot> {
    this.assertConfigured();
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create(petzSessionOptions());
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());
    try {
      await this.emptyCart(page, input.items.map((item) => safeRetailerUrl(item.productUrl, "petz.com.br")).find(Boolean) ?? PETZ_ORIGIN);
      const items: ResolvedPurchaseItem[] = [];
      for (const item of input.items) {
        const url = safeRetailerUrl(item.productUrl, "petz.com.br");
        if (!url) { items.push({ ...item, status: "ambiguous", raw: { reason: "missing_exact_product_url" } }); continue; }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(700);
        await clickCookieConsent(page);
        const productText = await bodyText(page);
        if (retailMatch(item.requestedName, `${await page.title()} ${productText}`) < 0.7) {
          items.push({ ...item, status: "ambiguous", raw: { reason: "page_does_not_match_requested_product", url } }); continue;
        }
        const add = page.locator("[data-testid=add-to-cart-button]");
        if (!(await isVisible(add))) { items.push({ ...item, status: "unavailable", raw: { reason: "add_button_not_available", url } }); continue; }
        const plus = page.locator("[data-testid=plus-button]");
        for (let quantity = 1; quantity < item.requestedQty; quantity += 1) {
          if (!(await isVisible(plus))) break;
          await plus.first().click({ timeout: 5_000 }); await page.waitForTimeout(150);
        }
        await add.first().click({ timeout: 10_000 });
        const drawer = page.locator("[data-testid=ecom-product-card-modal-bag-dialog]");
        let drawerText = "";
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await page.waitForTimeout(250);
          drawerText = await drawer.innerText().catch(() => "");
          if ((parseLabelledTotal(drawerText, "subtotal") ?? 0) > 0 && retailMatch(item.requestedName, drawerText) >= 0.7) break;
        }
        const accepted = (parseLabelledTotal(drawerText, "subtotal") ?? 0) > 0 && retailMatch(item.requestedName, drawerText) >= 0.7;
        items.push({ ...item, status: accepted ? "resolved" : "ambiguous", retailerSku: petzProductId(url), retailerProductId: petzProductId(url), resolvedName: item.requestedName, actualUnitPrice: parseBrl(productText) ?? item.requestedUnitPrice ?? undefined, matchConfidence: retailMatch(item.requestedName, productText), raw: { url, quantity: item.requestedQty, accepted } });
      }
      const cartText = await openBag(page);
      return this.snapshot(input, session.id, items, cartText);
    } finally { await browser.close(); }
  }

  async revalidate(input: BuyerInput): Promise<CartSnapshot> {
    this.assertConfigured();
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    if (!input.browserSessionId) return this.preflight(input);
    const session = await bb.sessions.retrieve(input.browserSessionId).catch(() => null);
    if (!session?.connectUrl || session.status !== "RUNNING") return this.preflight({ ...input, browserSessionId: null });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());
    try {
      // Stay on the live product page restored by Browserbase. Navigating to Petz's
      // home swaps frontend shells and can temporarily hide the in-memory cart.
      const cartText = await openBag(page);
      const items: ResolvedPurchaseItem[] = input.items.map((item) => ({ ...item, status: retailMatch(item.requestedName, cartText) >= 0.7 ? "resolved" : "ambiguous", retailerSku: petzProductId(item.productUrl ?? ""), retailerProductId: petzProductId(item.productUrl ?? ""), resolvedName: item.requestedName, actualUnitPrice: item.expectedUnitPrice ?? item.requestedUnitPrice ?? undefined, matchConfidence: retailMatch(item.requestedName, cartText), raw: { revalidated: true } }));
      return this.snapshot(input, session.id, items, cartText);
    } finally { await browser.close(); }
  }

  async placeOrder(_input: BuyerInput, _snapshot: CartSnapshot, _idempotencyKey: string): Promise<StoreOrderResult> {
    const policy = getPurchasePolicy();
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", !policy.enabled || policy.mode === "off" || policy.mode === "cart_only" ? "A Petz está em cart_only: a sacola foi preparada, mas a compra não será finalizada." : "A finalização financeira da Petz ainda exige ação humana na sessão gravada.");
  }

  private snapshot(input: BuyerInput, sessionId: string, items: ResolvedPurchaseItem[], cartText: string): CartSnapshot {
    const total = parseLabelledTotal(cartText, "subtotal");
    const itemsSubtotal = money(items.reduce((sum, item) => sum + (item.actualUnitPrice ?? 0) * item.requestedQty, 0));
    const priceMatches = total !== undefined && Math.abs(total - itemsSubtotal) <= Math.max(5, itemsSubtotal * 0.05);
    const ready = total !== undefined && (input.items.length === 0 ? total === 0 : total > 0) && priceMatches && items.length === input.items.length && items.every((item) => item.status === "resolved");
    return { storeKey: input.storeKey, storeLabel: input.storeLabel, storeUnitId: input.storeUnitId, storeUnitLabel: input.storeUnitLabel, browserSessionId: sessionId, items, itemsSubtotal, total: total ?? itemsSubtotal, currency: "BRL", capturedAt: new Date().toISOString(), status: ready ? "ready" : "needs_human", reason: ready ? undefined : "A sacola Petz não confirmou todos os itens, quantidades e subtotal." };
  }

  private assertConfigured(): void {
    if (!process.env.BROWSERBASE_API_KEY || !process.env.PETZ_BROWSER_CONTEXT_ID) throw new PurchaseError("CONFIGURATION_REQUIRED", "Faltam BROWSERBASE_API_KEY e PETZ_BROWSER_CONTEXT_ID para preparar a sacola Petz.");
  }

  private async emptyCart(page: Page, seedUrl: string): Promise<void> {
    // Petz only hydrates the persisted cart reliably on a product page; its home
    // drawer can briefly report R$ 0,00 even while the backend cart still has items.
    await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(800);
    // A no-op-looking add is intentional: it forces Petz to hydrate the backend
    // cart associated with this browser before we inspect and clear it.
    const warmupAdd = page.locator("[data-testid=add-to-cart-button]:visible");
    if (!(await isVisible(warmupAdd))) throw new PurchaseError("MANUAL_ACTION_REQUIRED", "A Petz não conseguiu carregar o carrinho existente para limpeza.");
    await warmupAdd.click({ timeout: 10_000 });
    await page.waitForTimeout(1_200);
    let text = await openBag(page);
    for (let removed = 0; removed < 100; removed += 1) {
      const drawer = page.locator("[data-testid=ecom-product-card-modal-bag-dialog]:visible");
      const card = drawer.locator(".bag-card-wrapper").first();
      if (!(await isVisible(card))) {
        // After the last DELETE the card disappears before the subtotal animation
        // reaches zero. The later exact subtotal guard still prevents a stale item
        // from ever turning this snapshot into cart_ready.
        return;
      }
      await card.locator("button.bag-card-icon").click({ timeout: 5_000 });
      const confirm = card.locator("button.bag-card-delete");
      if (!(await isVisible(confirm)) || !(await confirm.isEnabled())) throw new PurchaseError("MANUAL_ACTION_REQUIRED", "A Petz não habilitou a confirmação para limpar um item antigo da sacola.");
      await confirm.click({ timeout: 10_000 });
      await page.waitForTimeout(900);
      text = await drawer.innerText().catch(() => bodyText(page));
    }
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", "A sacola Petz tem itens demais para limpar automaticamente.");
  }
}
