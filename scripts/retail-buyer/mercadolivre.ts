// Mercado Livre, degrau C (11/09): monta o carrinho NA CONTA da Lia e para. Nunca clica em
// "Comprar"/"Continuar a compra": o dono confirma no app do celular (saldo Mercado Pago) e
// responde o número do pedido. O ML não é VTEX (sem orderForm): tudo é DOM, guiado por
// seletores configuráveis na receita e homologados na sondagem (gate E8). Nada aqui
// mascara o navegador nem contorna desafio: sessão pedida = erro legível para o operador.
import type { Page } from "playwright-core";
import type { CheckoutEvidence } from "../../src/lib/purchase-execution";
import type { BuyerJob } from "./browser";

export type MercadoLivreRecipe = {
  kind: "mercadolivre";
  origin: string; // https://www.mercadolivre.com.br
  cartPath?: string; // /gz/cart
  selectors?: Partial<typeof DEFAULT_SELECTORS>;
};
export const DEFAULT_SELECTORS = {
  addToCart: /adicionar ao carrinho/i,
  loginWall: /iniciar sess[aã]o|acesse sua conta|digite seu e-mail ou telefone/i,
  cartItem: '[data-testid="cart-item"], .cart-item, li[class*="cart-item"], div[class*="item-row"]',
  cartItemTitle: '[data-testid="cart-item-title"], .cart-item__title, a[class*="title"], [class*="item-title"]',
  cartItemPrice: '[data-testid="price"], .andes-money-amount, [class*="price"]',
  cartItemQty: 'input[type="number"], [data-testid="quantity"] input, select[name*="quantity"]',
  removeItem: /excluir|remover/i,
};
export const ML_RECIPE: MercadoLivreRecipe = { kind: "mercadolivre", origin: "https://www.mercadolivre.com.br", cartPath: "/gz/cart" };

const MLB_RE = /MLB-?(\d{6,})/i;
export function mlItemIdFrom(url: string): string | null {
  const m = url.match(MLB_RE);
  return m ? `MLB${m[1]}` : null;
}
export function parseBrlCents(text: string): number | null {
  const m = text.replace(/\s+/g, " ").match(/R\$\s*([\d.]+)(?:,(\d{2}))?/);
  if (!m) return null;
  const reais = Number(m[1].replace(/\./g, ""));
  const cents = m[2] ? Number(m[2]) : 0;
  return Number.isFinite(reais) ? reais * 100 + cents : null;
}

export type MlCartLine = { itemId: string; title: string; qty: number; unitPriceCents: number };

export class MercadoLivreBuyer {
  private readonly sel: typeof DEFAULT_SELECTORS;
  constructor(readonly page: Page, readonly recipe: MercadoLivreRecipe) {
    this.sel = { ...DEFAULT_SELECTORS, ...(recipe.selectors ?? {}) };
  }
  private cartUrl() {
    return `${this.recipe.origin}${this.recipe.cartPath ?? "/gz/cart"}`;
  }
  private assertOrigin() {
    const host = new URL(this.page.url()).hostname;
    if (!/(^|\.)mercadolivre\.com\.br$|(^|\.)mercadolibre\.com$|(^|\.)mercadopago\.com\.br$/.test(host))
      throw new Error("Navegador saiu do Mercado Livre.");
  }
  private async loginWallVisible() {
    const text = (await this.page.locator("body").innerText().catch(() => "")).normalize("NFD");
    return this.sel.loginWall.test(text) || /\/login|\/registration|\/gz\/account-verification/i.test(this.page.url());
  }
  async ensureSession() {
    await this.page.goto(this.cartUrl(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
    if (await this.loginWallVisible())
      throw new Error("Entre na conta do Mercado Livre nesta janela (setup mercadolivre); a sessão venceu ou pediu verificação.");
    this.assertOrigin();
  }
  // Lê o carrinho como está (para sondagem, conferência e limpeza).
  async readCart(): Promise<MlCartLine[]> {
    await this.page.goto(this.cartUrl(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
    if (await this.loginWallVisible()) throw new Error("Sessão do Mercado Livre pedida no carrinho.");
    const rows = this.page.locator(this.sel.cartItem);
    const lines: MlCartLine[] = [];
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const link = row.locator("a[href*='MLB']").first();
      const href = (await link.getAttribute("href").catch(() => null)) ?? "";
      const itemId = mlItemIdFrom(href) ?? mlItemIdFrom((await row.innerText().catch(() => "")) ?? "");
      if (!itemId) continue;
      const title = ((await row.locator(this.sel.cartItemTitle).first().innerText().catch(() => "")) || (await link.innerText().catch(() => ""))).trim();
      const qtyRaw = await row.locator(this.sel.cartItemQty).first().inputValue().catch(() => "1");
      const qty = Math.max(1, Number.parseInt(qtyRaw || "1", 10) || 1);
      const priceText = await row.locator(this.sel.cartItemPrice).first().innerText().catch(() => "");
      const cents = parseBrlCents(priceText);
      if (cents == null) throw new Error("Preço do carrinho ilegível; homologar seletor.");
      lines.push({ itemId, title, qty, unitPriceCents: Math.round(cents / qty) });
    }
    return lines;
  }
  private async addItem(item: BuyerJob["items"][number]) {
    const itemId = mlItemIdFrom(item.productUrl);
    if (!itemId) throw new Error("Anúncio sem id MLB reconhecível.");
    await this.page.goto(item.productUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
    this.assertOrigin();
    if (await this.loginWallVisible()) throw new Error("Sessão do Mercado Livre pedida no anúncio.");
    const button = this.page.getByRole("button", { name: this.sel.addToCart });
    if ((await button.count()) < 1) throw new Error("Botão 'Adicionar ao carrinho' não encontrado; anúncio pode exigir variação.");
    // Quantidade: o ML pede a quantidade antes de adicionar; uma unidade por clique é o
    // caminho mais estável — clica N vezes e confere no carrinho.
    for (let n = 0; n < item.quantity; n += 1) {
      await button.first().click({ timeout: 15_000 });
      await this.page.waitForTimeout(1_200);
      if (await this.loginWallVisible()) throw new Error("Sessão do Mercado Livre pedida ao adicionar.");
      if (n + 1 < item.quantity) {
        await this.page.goto(item.productUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await this.page.waitForTimeout(1_000);
      }
    }
    return itemId;
  }
  // Carrinho precisa estar vazio: a conta é uma só e o dono confirma o carrinho inteiro.
  async prepareCart(job: BuyerJob) {
    await this.ensureSession();
    const before = await this.readCart();
    if (before.length) throw new Error("Há itens no carrinho do Mercado Livre. Reconciliar antes de preparar outro pedido.");
    for (const item of job.items) await this.addItem(item);
    const after = await this.readCart();
    this.matchCart(job, after);
    return after;
  }
  private matchCart(job: BuyerJob, lines: MlCartLine[]) {
    if (lines.length !== job.items.length) throw new Error("Carrinho do Mercado Livre não corresponde à cesta.");
    for (const item of job.items) {
      const id = mlItemIdFrom(item.productUrl);
      const line = lines.find((l) => l.itemId === id);
      if (!line || line.qty !== item.quantity) throw new Error("Item ou quantidade divergente no carrinho do Mercado Livre.");
    }
  }
  async snapshot(job: BuyerJob): Promise<CheckoutEvidence> {
    const lines = await this.readCart();
    this.matchCart(job, lines);
    if (!job.accountEmail) throw new Error("Conta operacional do Mercado Livre sem e-mail configurado.");
    if (!job.customer.name) throw new Error("Nome do destinatário não está disponível.");
    const items = job.items.map((item) => {
      const line = lines.find((l) => l.itemId === mlItemIdFrom(item.productUrl))!;
      return {
        sku: item.sku, retailerSku: line.itemId, seller: "mercadolivre", name: line.title || item.name,
        qty: line.qty, unitPriceCents: line.unitPriceCents, lineTotalCents: line.unitPriceCents * line.qty,
      };
    });
    const freightCents = job.deliveryFeeCents ?? 0;
    return {
      recipientName: job.customer.name,
      accountEmail: job.accountEmail,
      checkoutUrl: this.cartUrl(),
      cartHash: job.cartHash,
      destination: job.customer.address,
      postalCode: job.customer.cep,
      deliveryOption: "Mercado Envios (confirmado pelo dono no app)",
      deliveryPromise: job.deliveryPromise ?? "",
      payment: { kind: "ml_balance" },
      observedAt: new Date().toISOString(),
      items,
      freightCents,
      totalCents: items.reduce((a, i) => a + i.lineTotalCents, 0) + freightCents,
    };
  }
  // Só esvazia se o carrinho for exatamente a cesta preparada.
  async clearPreparedCart(job: BuyerJob) {
    const lines = await this.readCart();
    if (!lines.length) return;
    this.matchCart(job, lines);
    for (let round = 0; round < lines.length + 2; round += 1) {
      const remove = this.page.getByRole("button", { name: this.sel.removeItem });
      if ((await remove.count()) < 1) break;
      await remove.first().click({ timeout: 15_000 });
      await this.page.waitForTimeout(1_200);
    }
    if ((await this.readCart()).length) throw new Error("O Mercado Livre não confirmou carrinho vazio.");
  }
}
