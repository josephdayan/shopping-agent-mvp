import { Browserbase } from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { getPurchasePolicy, money } from "../policy";
import type { BuyerConnector, BuyerInput, CartSnapshot, ResolvedPurchaseItem, StoreOrderResult } from "../types";
import { PurchaseError } from "../types";

const CARREFOUR_ORIGIN = "https://mercado.carrefour.com.br";

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(input: string): string[] {
  const ignored = new Set(["de", "da", "do", "para", "com", "sem", "em", "e", "a", "o", "un", "pacote", "unidade"]);
  return normalize(input)
    .split(" ")
    .filter((word) => word.length >= 3 && !ignored.has(word));
}

function productUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.hostname.endsWith("carrefour.com.br") ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseFirstBrl(text: string): number | undefined {
  const match = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (!match) return undefined;
  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? money(value) : undefined;
}

async function firstVisible(locator: ReturnType<import("playwright-core").Page["getByRole"]>): Promise<boolean> {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible());
  } catch {
    return false;
  }
}

export class CarrefourBuyer implements BuyerConnector {
  key = "carrefour";

  async preflight(input: BuyerInput): Promise<CartSnapshot> {
    if (!input.storeUnitId) {
      throw new PurchaseError("CONFIGURATION_REQUIRED", "Selecione uma unidade Carrefour de retirada antes de automatizar a compra.");
    }
    if (!process.env.BROWSERBASE_API_KEY || !process.env.CARREFOUR_BROWSER_CONTEXT_ID) {
      throw new PurchaseError(
        "CONFIGURATION_REQUIRED",
        "Faltam BROWSERBASE_API_KEY e CARREFOUR_BROWSER_CONTEXT_ID. O modo cart_only não abre uma conta nova automaticamente."
      );
    }

    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create({
      browserSettings: {
        context: { id: process.env.CARREFOUR_BROWSER_CONTEXT_ID, persist: true }
      }
    });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());

    try {
      const items: ResolvedPurchaseItem[] = [];
      for (const item of input.items) {
        // Quantity controls and variable-weight products are intentionally excluded from
        // the first pilot. It is safer to hand off than to add a wrong amount.
        if (item.requestedQty !== 1) {
          items.push({ ...item, status: "ambiguous", raw: { reason: "quantity_requires_validation" } });
          continue;
        }
        const url = productUrl(item.productUrl);
        if (!url) {
          items.push({ ...item, status: "ambiguous", raw: { reason: "missing_exact_product_url" } });
          continue;
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await this.dismissCookieBanner(page);
        const title = await page.title();
        const body = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
        const words = significantWords(item.requestedName);
        const matchedWords = words.filter((word) => normalize(`${title} ${body}`).includes(word));
        if (words.length === 0 || matchedWords.length / words.length < 0.8) {
          items.push({ ...item, status: "ambiguous", raw: { reason: "page_does_not_match_requested_product", title } });
          continue;
        }

        const addButton = page.getByRole("button", { name: /adicionar( ao carrinho)?/i });
        if (!(await firstVisible(addButton))) {
          items.push({ ...item, status: "unavailable", raw: { reason: "add_button_not_available", title } });
          continue;
        }

        await addButton.first().click({ timeout: 10_000 });
        await page.waitForTimeout(500);
        const actualUnitPrice = parseFirstBrl(body);
        items.push({
          ...item,
          status: "resolved",
          retailerSku: this.readProductId(url),
          retailerProductId: this.readProductId(url),
          resolvedName: title,
          actualUnitPrice,
          matchConfidence: 1,
          raw: { url }
        });
      }

      const unresolved = items.some((item) => item.status !== "resolved");
      // The cart view is used only to confirm that the adds were accepted. Do not infer
      // a total when Carrefour's UI did not expose one; that must become an exception.
      await page.goto(`${CARREFOUR_ORIGIN}/checkout/#/cart`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const cartText = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
      const total = parseFirstBrl(cartText);
      const itemsSubtotal = items.reduce((sum, item) => sum + (item.actualUnitPrice ?? 0) * item.requestedQty, 0);
      const ready = !unresolved && total !== undefined;
      return {
        storeKey: input.storeKey,
        storeLabel: input.storeLabel,
        storeUnitId: input.storeUnitId,
        storeUnitLabel: input.storeUnitLabel,
        retailerCartId: undefined,
        browserSessionId: session.id,
        items,
        itemsSubtotal: money(itemsSubtotal),
        total: total ?? money(itemsSubtotal),
        currency: "BRL",
        capturedAt: new Date().toISOString(),
        status: ready ? "ready" : "needs_human",
        reason: ready ? undefined : "Não foi possível validar todos os itens e o total do carrinho Carrefour."
      };
    } finally {
      await browser.close();
    }
  }

  async revalidate(input: BuyerInput): Promise<CartSnapshot> {
    return this.preflight(input);
  }

  async placeOrder(_input: BuyerInput, _snapshot: CartSnapshot, _idempotencyKey: string): Promise<StoreOrderResult> {
    const policy = getPurchasePolicy();
    // This hard stop is intentional. It makes the first deployment incapable of
    // charging the corporate card until the real account/3DS/pickup path is tested.
    if (policy.mode === "off" || policy.mode === "cart_only") {
      throw new PurchaseError("MANUAL_ACTION_REQUIRED", "Carrefour está em modo cart_only; o carrinho foi preparado, mas a compra não será finalizada.");
    }
    throw new PurchaseError(
      "MANUAL_ACTION_REQUIRED",
      "A finalização Carrefour exige validação ao vivo da conta, cartão e retirada. Use a sessão do Browserbase pelo /ops para concluir o primeiro piloto."
    );
  }

  private readProductId(url: string): string | undefined {
    return url.match(/-(\d+)(?:[/?#]|$)/)?.[1];
  }

  private async dismissCookieBanner(page: import("playwright-core").Page): Promise<void> {
    const accept = page.getByRole("button", { name: /aceitar|entendi|concordo/i });
    if (await firstVisible(accept)) await accept.first().click({ timeout: 2_000 }).catch(() => undefined);
  }
}
