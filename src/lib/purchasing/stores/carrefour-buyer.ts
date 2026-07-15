import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Locator, type Page } from "playwright-core";
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

function parseBrl(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/R\$\s*([\d.]+,\d{2})/);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? money(parsed) : undefined;
}

function parseFirstBrl(text: string): number | undefined {
  return parseBrl(text);
}

export function parseCarrefourCartTotal(text: string): number | undefined {
  // Product cards contain many prices. Prefer a monetary value near the checkout
  // total label and only fall back to the final displayed price.
  const labelled = [...text.matchAll(/(?:total(?:\s+(?:do\s+)?(?:pedido|carrinho|a\s+pagar))?|valor\s+total)[^R$]{0,100}(R\$\s*[\d.]+,\d{2})/gi)];
  const fromLabel = parseBrl(labelled.at(-1)?.[1]);
  if (fromLabel !== undefined) return fromLabel;
  const values = [...text.matchAll(/R\$\s*[\d.]+,\d{2}/g)].map((match) => parseBrl(match[0])).filter((value): value is number => value !== undefined);
  return values.at(-1);
}

async function firstVisible(locator: Locator): Promise<boolean> {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible());
  } catch {
    return false;
  }
}

async function firstButton(page: Page, names: RegExp[]): Promise<Locator | null> {
  for (const name of names) {
    for (const candidate of [page.getByRole("button", { name }), page.getByRole("link", { name })]) {
      if (await firstVisible(candidate)) return candidate;
    }
  }
  return null;
}

export function detectCarrefourHumanAction(text: string): PurchaseError | null {
  const normalized = normalize(text);
  if (/captcha|verifique que voce e humano|nao sou um robo/.test(normalized)) {
    return new PurchaseError("CAPTCHA_REQUIRED", "O Carrefour pediu CAPTCHA; conclua na sessão da loja e tente novamente.");
  }
  if (/codigo de seguranca|3d secure|3ds|autenticacao do banco|confirmar no aplicativo|confirme no aplicativo/.test(normalized)) {
    return new PurchaseError("PAYMENT_ACTION_REQUIRED", "O cartão pediu confirmação/3DS. Conclua a autenticação na sessão da loja.");
  }
  if (/entrar na conta|faca login|acesse sua conta/.test(normalized)) {
    return new PurchaseError("LOGIN_REQUIRED", "A sessão Carrefour perdeu o login. Entre novamente no Context persistente.");
  }
  return null;
}

async function readCarrefourCartText(page: Page): Promise<string> {
  const read = () => page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
  let text = await read();

  // Mercado Carrefour can briefly render its anonymous shell after navigation,
  // then restore the persisted account. Retrying only this transient state keeps
  // a real expired login visible while avoiding a false LOGIN_REQUIRED result.
  if (detectCarrefourHumanAction(text)?.code === "LOGIN_REQUIRED") {
    await page.waitForTimeout(2_000);
    text = await read();
  }
  return text;
}

async function openCarrefourCart(page: Page, navigateToStorefront = false): Promise<string> {
  if (navigateToStorefront) {
    await page.goto(CARREFOUR_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }
  let cartButton = page.locator("[data-testid=mini-cart-button]");
  if (!(await firstVisible(cartButton))) {
    await page.goto(CARREFOUR_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
    cartButton = page.locator("[data-testid=mini-cart-button]");
  }
  if (!(await firstVisible(cartButton))) {
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O Carrefour não exibiu o botão do carrinho na loja.");
  }
  await cartButton.scrollIntoViewIfNeeded().catch(() => undefined);
  // Carrefour can leave an animation layer over this header icon. This click only
  // opens the cart drawer; forcing it cannot submit or change an order.
  await cartButton.click({ timeout: 10_000, force: true });
  await page.waitForTimeout(500);
  return readCarrefourCartText(page);
}

async function ensureCarrefourRegion(page: Page, deliveryCep?: string | null): Promise<void> {
  await page.goto(CARREFOUR_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const text = await readCarrefourCartText(page);
  if (!/insira seu cep/.test(normalize(text))) return;

  const cep = deliveryCep?.replace(/\D/g, "");
  if (!cep || cep.length !== 8) {
    throw new PurchaseError("CONFIGURATION_REQUIRED", "Falta o CEP de entrega para preparar o carrinho Carrefour.");
  }
  const regionButton = page.getByText(/insira seu cep/i).locator("xpath=ancestor::button");
  if (!(await firstVisible(regionButton))) {
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O Carrefour pediu o CEP, mas não expôs o seletor de região.");
  }
  await regionButton.click({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const cepField = page.locator("input[name=CEP]");
  if (!(await firstVisible(cepField))) {
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O Carrefour não exibiu o campo de CEP para selecionar a região.");
  }
  await cepField.fill(cep);
  // This component uses a native submit button but omits the accessible button
  // role on some renders. The visible label is stable across those renders.
  const submit = page.getByText(/^enviar$/i);
  await submit.click({ timeout: 10_000 }).catch(async () => {
    const fallback = await firstButton(page, [/^continuar$/i, /^confirmar$/i]);
    if (!fallback) throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O Carrefour não exibiu o botão para confirmar o CEP.");
    await fallback.click({ timeout: 10_000 });
  });
  await page.waitForTimeout(1_000);
  await page.goto(CARREFOUR_ORIGIN, { waitUntil: "domcontentloaded", timeout: 45_000 });
}

export function parseCarrefourOrderNumber(text: string): string | undefined {
  const match = text.match(/(?:pedido|compra)\s*(?:n[ºo.]*)?\s*[:#-]?\s*([A-Z0-9-]{5,})/i);
  return match?.[1];
}

function browserSessionOptions() {
  const country = process.env.CARREFOUR_BROWSER_PROXY_COUNTRY?.trim().toUpperCase();
  return {
    keepAlive: true,
    browserSettings: {
      context: { id: process.env.CARREFOUR_BROWSER_CONTEXT_ID as string, persist: true },
      allowedDomains: ["carrefour.com.br"],
      recordSession: true
    },
    ...(country && /^[A-Z]{2}$/.test(country)
      ? { proxies: [{ type: "browserbase" as const, geolocation: { country } }] }
      : {})
  };
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
    const session = await bb.sessions.create(browserSessionOptions());
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());

    try {
      await ensureCarrefourRegion(page, input.deliveryCep);
      await this.emptyCart(page);
      const items: ResolvedPurchaseItem[] = [];
      for (const item of input.items) {
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

        const addButton = await firstButton(page, [/adicionar( ao carrinho)?/i, /adicionar mais/i]);
        if (!addButton) {
          items.push({ ...item, status: "unavailable", raw: { reason: "add_button_not_available", title } });
          continue;
        }
        for (let count = 0; count < item.requestedQty; count += 1) {
          const currentAdd = count === 0 ? addButton : await firstButton(page, [/adicionar( ao carrinho)?/i, /adicionar mais/i]);
          if (!currentAdd) {
            items.push({ ...item, status: "ambiguous", raw: { reason: "quantity_control_unavailable", title, requestedQty: item.requestedQty, addedQty: count } });
            break;
          }
          await currentAdd.first().click({ timeout: 10_000 });
          await page.waitForTimeout(350);
        }
        if (items.some((resolved) => resolved.requestedSku === item.requestedSku)) continue;
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
      const cartText = await openCarrefourCart(page);
      const human = detectCarrefourHumanAction(cartText);
      if (human) throw human;
      const total = parseCarrefourCartTotal(cartText);
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
    if (!process.env.BROWSERBASE_API_KEY || !process.env.CARREFOUR_BROWSER_CONTEXT_ID) {
      throw new PurchaseError("CONFIGURATION_REQUIRED", "Faltam BROWSERBASE_API_KEY e CARREFOUR_BROWSER_CONTEXT_ID para revalidar o carrinho.");
    }
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create(browserSessionOptions());
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    try {
      await ensureCarrefourRegion(page, input.deliveryCep);
      const cartText = await openCarrefourCart(page);
      const human = detectCarrefourHumanAction(cartText);
      if (human) throw human;
      const total = parseCarrefourCartTotal(cartText);
      const items = input.items.map((item) => {
        const words = significantWords(item.requestedName);
        const matches = words.filter((word) => normalize(cartText).includes(word));
        return {
          ...item,
          status: words.length && matches.length / words.length >= 0.8 ? ("resolved" as const) : ("ambiguous" as const),
          retailerSku: this.readProductId(item.productUrl ?? ""),
          retailerProductId: this.readProductId(item.productUrl ?? ""),
          resolvedName: item.requestedName,
          // The checkout total is the authoritative revalidation signal. Preserve the
          // price captured in the first pass when it is present, so a stable cart hash
          // does not change merely because Carrefour hides per-line price in the cart.
          actualUnitPrice: item.expectedUnitPrice ?? item.requestedUnitPrice ?? undefined,
          matchConfidence: words.length ? matches.length / words.length : 0,
          raw: { revalidated: true }
        };
      });
      const ready = total !== undefined && items.every((item) => item.status === "resolved");
      const itemsSubtotal = items.reduce((sum, item) => sum + (item.actualUnitPrice ?? 0) * item.requestedQty, 0);
      return {
        storeKey: input.storeKey,
        storeLabel: input.storeLabel,
        storeUnitId: input.storeUnitId,
        storeUnitLabel: input.storeUnitLabel,
        browserSessionId: session.id,
        items,
        itemsSubtotal: money(itemsSubtotal),
        total: total ?? money(itemsSubtotal),
        currency: "BRL",
        capturedAt: new Date().toISOString(),
        status: ready ? "ready" : "needs_human",
        reason: ready ? undefined : "O carrinho Carrefour mudou ou não expôs todos os itens para validação."
      };
    } finally {
      await browser.close();
    }
  }

  async placeOrder(input: BuyerInput, snapshot: CartSnapshot, _idempotencyKey: string): Promise<StoreOrderResult> {
    const policy = getPurchasePolicy();
    if (!policy.enabled || policy.mode === "off" || policy.mode === "cart_only") {
      throw new PurchaseError("MANUAL_ACTION_REQUIRED", "Carrefour está com finalização automática desativada; o carrinho foi preparado, mas a compra não será finalizada.");
    }
    if (!process.env.BROWSERBASE_API_KEY || !process.env.CARREFOUR_BROWSER_CONTEXT_ID) {
      throw new PurchaseError("CONFIGURATION_REQUIRED", "Faltam as credenciais do navegador remoto para finalizar a compra Carrefour.");
    }

    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create(browserSessionOptions());
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    try {
      await ensureCarrefourRegion(page, input.deliveryCep);
      const cartText = await openCarrefourCart(page);
      const human = detectCarrefourHumanAction(cartText);
      if (human) throw human;
      const liveTotal = parseCarrefourCartTotal(cartText);
      if (liveTotal === undefined || Math.abs(liveTotal - snapshot.total) > 0.01) {
        throw new PurchaseError("PRICE_CHANGED", "O total Carrefour mudou desde a aprovação. Revalide o carrinho antes de finalizar.");
      }
      for (const item of snapshot.items) {
        const words = significantWords(item.resolvedName ?? item.requestedName);
        if (words.length && words.filter((word) => normalize(cartText).includes(word)).length / words.length < 0.8) {
          throw new PurchaseError("AMBIGUOUS_ITEM", `O carrinho Carrefour não confirmou o item '${item.requestedName}'.`);
        }
      }

      const continueButton = await firstButton(page, [/continuar/i, /ir para pagamento/i, /finalizar compra/i]);
      if (!continueButton) throw new PurchaseError("MANUAL_ACTION_REQUIRED", "Não encontrei o botão para continuar o checkout Carrefour na sessão gravada.");
      await continueButton.first().click({ timeout: 10_000 });
      await page.waitForTimeout(1_000);

      let checkoutText = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
      const checkoutHuman = detectCarrefourHumanAction(checkoutText);
      if (checkoutHuman) throw checkoutHuman;
      // A stored corporate card normally remains selected. If Carrefour renders a
      // payment-method choice, selecting the card category only exposes that saved
      // instrument; this code never types or reads card data.
      const cardButton = await firstButton(page, [/cartao de credito/i, /^cartao$/i]);
      if (cardButton) {
        await cardButton.first().click({ timeout: 5_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
      }
      const finishButton = await firstButton(page, [/finalizar pedido/i, /confirmar pedido/i, /concluir compra/i, /fazer pedido/i, /comprar agora/i]);
      if (!finishButton) {
        throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O checkout Carrefour não expôs o botão final. Confira a sessão gravada; pode haver retirada ou cartão pendente.");
      }
      // This is the only click with financial effect. It is reachable only after a
      // fresh cart hash and the explicit /ops confirmation (or a bounded policy).
      await finishButton.first().click({ timeout: 10_000 });
      await page.waitForTimeout(2_000);
      checkoutText = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
      const postPurchaseHuman = detectCarrefourHumanAction(checkoutText);
      if (postPurchaseHuman) throw postPurchaseHuman;
      const orderNumber = parseCarrefourOrderNumber(checkoutText);
      if (!orderNumber) {
        throw new PurchaseError(
          "ORDER_STATUS_UNKNOWN",
          "O botão final foi acionado, mas a confirmação/número do pedido não apareceu. Não tente de novo: confira a sessão Carrefour."
        );
      }
      return { storeOrderNumber: orderNumber, status: "ordered", browserSessionId: session.id };
    } finally {
      await browser.close();
    }
  }

  private readProductId(url: string): string | undefined {
    return url.match(/-(\d+)(?:[/?#]|$)/)?.[1];
  }

  private async emptyCart(page: Page): Promise<void> {
    let text = await openCarrefourCart(page);
    for (let removed = 0; removed < 100; removed += 1) {
      const human = detectCarrefourHumanAction(text);
      if (human) throw human;
      const normalized = normalize(text);
      if (/seu carrinho esta vazio|carrinho vazio|nenhum produto no carrinho/.test(normalized)) return;
      const remove = await firstButton(page, [/remover/i, /excluir/i]);
      if (!remove) {
        throw new PurchaseError(
          "MANUAL_ACTION_REQUIRED",
          "O carrinho Carrefour já tinha itens e a automação não encontrou como removê-los com segurança. Limpe a sessão e tente de novo."
        );
      }
      await remove.first().click({ timeout: 10_000 });
      await page.waitForTimeout(350);
      text = await readCarrefourCartText(page);
    }
    throw new PurchaseError("MANUAL_ACTION_REQUIRED", "O carrinho Carrefour tem itens demais para limpar automaticamente. Confira a sessão.");
  }

  private async dismissCookieBanner(page: Page): Promise<void> {
    const accept = page.getByRole("button", { name: /aceitar|entendi|concordo/i });
    if (await firstVisible(accept)) await accept.first().click({ timeout: 2_000 }).catch(() => undefined);
  }
}
