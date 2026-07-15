import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";
import { getPurchasePolicy, money } from "../policy";
import type { BuyerConnector, BuyerInput, CartSnapshot, ResolvedPurchaseItem, StoreOrderResult } from "../types";
import { PurchaseError } from "../types";
import { clickCookieConsent, isVisible, parseLabelledTotal, retailMatch, safeRetailerUrl } from "./browser-store-utils";

const BOTICARIO_ORIGIN = "https://www.boticario.com.br";

function boticarioSessionOptions() {
  const country = process.env.BOTICARIO_BROWSER_PROXY_COUNTRY?.trim().toUpperCase();
  return {
    keepAlive: true,
    browserSettings: { context: { id: process.env.BOTICARIO_BROWSER_CONTEXT_ID as string, persist: true }, allowedDomains: ["boticario.com.br"], recordSession: true },
    // The cart currently renders its complete app without Browserbase's BR proxy and
    // falls into an offline shell through that proxy, so this proxy is opt-in.
    ...(country && /^[A-Z]{2}$/.test(country) ? { proxies: [{ type: "browserbase" as const, geolocation: { country } }] } : {})
  };
}

async function bodyText(page: Page): Promise<string> { return page.locator("body").innerText({ timeout: 15_000 }).catch(() => ""); }

async function waitForCartQuantity(page: Page, sku: string, expected: number): Promise<number> {
  const quantity = page.locator(`[data-testid=ProductQuantity][title="${sku}"] [data-testid=product-quantity]`).first();
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const value = Number((await quantity.innerText().catch(() => "0")).replace(/\D/g, ""));
    if (value >= expected) return value;
    await page.waitForTimeout(250);
  }
  return Number((await quantity.innerText().catch(() => "0")).replace(/\D/g, ""));
}

function boticarioSku(value: string): string | null {
  const sku = value.replace(/^boticario-live-/i, "").trim();
  return /^B[A-Z0-9]+$/i.test(sku) ? sku.toUpperCase() : null;
}

export class BoticarioBuyer implements BuyerConnector {
  key = "boticario";

  async preflight(input: BuyerInput): Promise<CartSnapshot> {
    this.assertConfigured();
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create(boticarioSessionOptions());
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());
    try {
      await this.emptyCart(page);
      const candidateItems: Array<{ input: BuyerInput["items"][number]; sku: string }> = [];
      const failed: ResolvedPurchaseItem[] = [];
      for (const item of input.items) {
        const sku = boticarioSku(item.requestedSku);
        const url = safeRetailerUrl(item.productUrl, "boticario.com.br");
        if (!sku || !url) { failed.push({ ...item, status: "ambiguous", raw: { reason: "missing_exact_sku_or_product_url" } }); continue; }
        candidateItems.push({ input: item, sku });
        for (let quantity = 0; quantity < item.requestedQty; quantity += 1) {
          await page.goto(`${BOTICARIO_ORIGIN}/sacola/?skus=${encodeURIComponent(sku)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await waitForCartQuantity(page, sku, quantity + 1);
        }
      }
      await clickCookieConsent(page);
      await this.ensureCep(page, input.deliveryCep);
      const cartText = await bodyText(page);
      const resolved = await Promise.all(candidateItems.map(async ({ input: item, sku }): Promise<ResolvedPurchaseItem> => {
        const quantityRoot = page.locator(`[data-testid=ProductQuantity][title="${sku}"]`).first();
        const quantity = Number((await quantityRoot.locator("[data-testid=product-quantity]").innerText().catch(() => "0")).replace(/\D/g, ""));
        const itemText = await page.locator('[data-cy="ProductSku"]').filter({ hasText: sku }).first()
          .locator('xpath=ancestor::*[.//*[@data-testid="ProductQuantity"]][1]').innerText().catch(() => "");
        const confidence = retailMatch(item.requestedName, itemText || cartText);
        const accepted = quantity === item.requestedQty && confidence >= 0.7;
        return { ...item, status: accepted ? "resolved" : "ambiguous", retailerSku: sku, retailerProductId: sku, resolvedName: item.requestedName, actualUnitPrice: item.requestedUnitPrice ?? undefined, matchConfidence: confidence, raw: { sku, requestedQty: item.requestedQty, cartQty: quantity } };
      }));
      return this.snapshot(input, session.id, [...resolved, ...failed], cartText);
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
      await page.goto(`${BOTICARIO_ORIGIN}/sacola`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await Promise.all(input.items.map((item) => {
        const sku = boticarioSku(item.requestedSku);
        return sku ? waitForCartQuantity(page, sku, item.requestedQty) : Promise.resolve(0);
      }));
      await this.ensureCep(page, input.deliveryCep);
      const cartText = await bodyText(page);
      const items: ResolvedPurchaseItem[] = await Promise.all(input.items.map(async (item) => {
        const sku = boticarioSku(item.requestedSku);
        const quantityRoot = sku ? page.locator(`[data-testid=ProductQuantity][title="${sku}"]`).first() : page.locator(".__missing__");
        const quantity = Number((await quantityRoot.locator("[data-testid=product-quantity]").innerText().catch(() => "0")).replace(/\D/g, ""));
        const itemText = sku ? await page.locator('[data-cy="ProductSku"]').filter({ hasText: sku }).first()
          .locator('xpath=ancestor::*[.//*[@data-testid="ProductQuantity"]][1]').innerText().catch(() => "") : "";
        const confidence = retailMatch(item.requestedName, itemText || cartText);
        return { ...item, status: sku && quantity === item.requestedQty && confidence >= 0.7 ? "resolved" : "ambiguous", retailerSku: sku ?? undefined, retailerProductId: sku ?? undefined, resolvedName: item.requestedName, actualUnitPrice: item.expectedUnitPrice ?? item.requestedUnitPrice ?? undefined, matchConfidence: confidence, raw: { revalidated: true, cartQty: quantity } };
      }));
      return this.snapshot(input, session.id, items, cartText);
    } finally { await browser.close(); }
  }

  async placeOrder(_input: BuyerInput, _snapshot: CartSnapshot, _idempotencyKey: string): Promise<StoreOrderResult> {
    const policy = getPurchasePolicy();
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", !policy.enabled || policy.mode === "off" || policy.mode === "cart_only" ? "O Boticário está em cart_only: a sacola foi preparada, mas a compra não será finalizada." : "A finalização financeira do Boticário ainda exige ação humana na sessão gravada.");
  }

  private snapshot(input: BuyerInput, sessionId: string, items: ResolvedPurchaseItem[], cartText: string): CartSnapshot {
    const total = parseLabelledTotal(cartText, "subtotal");
    const itemsSubtotal = money(items.reduce((sum, item) => sum + (item.actualUnitPrice ?? 0) * item.requestedQty, 0));
    const priceMatches = total !== undefined && Math.abs(total - itemsSubtotal) <= Math.max(5, itemsSubtotal * 0.05);
    const ready = total !== undefined && priceMatches && items.length === input.items.length && items.every((item) => item.status === "resolved");
    return { storeKey: input.storeKey, storeLabel: input.storeLabel, storeUnitId: input.storeUnitId, storeUnitLabel: input.storeUnitLabel, browserSessionId: sessionId, items, itemsSubtotal, total: total ?? itemsSubtotal, currency: "BRL", capturedAt: new Date().toISOString(), status: ready ? "ready" : "needs_human", reason: ready ? undefined : `A sacola do Boticário falhou na validação (total=${String(total)}, esperado=${itemsSubtotal}, preço=${priceMatches}, itens=${items.length}/${input.items.length}, status=${items.map((item) => item.status).join(",")}).` };
  }

  private assertConfigured(): void {
    if (!process.env.BROWSERBASE_API_KEY || !process.env.BOTICARIO_BROWSER_CONTEXT_ID) throw new PurchaseError("CONFIGURATION_REQUIRED", "Faltam BROWSERBASE_API_KEY e BOTICARIO_BROWSER_CONTEXT_ID para preparar a sacola do Boticário.");
  }

  private async ensureCep(page: Page, deliveryCep?: string | null): Promise<void> {
    const field = page.locator('input[name="postalCode"]:visible');
    if (!(await isVisible(field))) return;
    const cep = deliveryCep?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) throw new PurchaseError("CONFIGURATION_REQUIRED", "Falta o CEP de entrega para validar a sacola do Boticário.");
    await field.first().fill(cep);
    let submit = page.locator("[data-testid=submit-postalcode-button]:visible");
    if (!(await isVisible(submit))) submit = page.locator("button:visible").filter({ hasText: /^\s*(?:ok|confirmar|calcular)\s*$/i });
    // The responsive header sometimes renders a detached CEP field with no submit.
    // It does not affect SKU/price validation, so leave the saved customer CEP as
    // the source of truth and continue instead of creating a false exception.
    if (!(await isVisible(submit))) return;
    await submit.first().click({ timeout: 10_000 }); await page.waitForTimeout(800);
  }

  private async emptyCart(page: Page): Promise<void> {
    await page.goto(`${BOTICARIO_ORIGIN}/sacola`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const text = await bodyText(page);
      if ((await page.locator("[data-testid=ProductQuantity]").count()) > 0 || /sua sacola est[aá] vazia|nenhum produto/i.test(text)) break;
      await page.waitForTimeout(250);
    }
    for (let removed = 0; removed < 100; removed += 1) {
      const quantityCount = await page.locator("[data-testid=ProductQuantity]").count();
      if (quantityCount === 0) return;
      const remove = page.locator("button:has([data-testid=remove-product]):visible").first();
      if (!(await isVisible(remove))) throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O Boticário carregou uma sacola antiga, mas não expôs o controle de remoção.");
      // Boticário sometimes leaves a responsive cart layer over the duplicate
      // desktop card. This control only removes a cart line, so a forced click is
      // safe and avoids treating that presentation layer as a human exception.
      await remove.click({ timeout: 10_000, force: true });
      const confirmation = page.locator('[role="dialog"]:visible').filter({ hasText: /remover produto/i });
      await confirmation.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
      const confirmRemove = confirmation.getByRole("button", { name: /^remover$/i });
      if (await isVisible(confirmRemove)) await confirmRemove.first().click({ timeout: 5_000 });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if ((await page.locator("[data-testid=ProductQuantity]").count()) < quantityCount) break;
        await page.waitForTimeout(200);
      }
    }
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", "A sacola do Boticário tem itens demais para limpar automaticamente.");
  }
}
