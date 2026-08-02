import type { Locator, Page } from "playwright-core";

export function normalizeRetailText(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function retailWords(input: string): string[] {
  const ignored = new Set(["de", "da", "do", "das", "dos", "para", "com", "sem", "em", "e", "a", "o", "um", "uma", "un"]);
  return normalizeRetailText(input).split(" ").filter((word) => word.length >= 3 && !ignored.has(word));
}

export function retailMatch(input: string, haystack: string): number {
  const words = retailWords(input);
  if (!words.length) return 0;
  const normalized = normalizeRetailText(haystack);
  return words.filter((word) => normalized.includes(word)).length / words.length;
}

export function parseBrl(value: string | undefined): number | undefined {
  const match = value?.replace(/\u00a0/g, " ").match(/R\$\s*([\d.]+,\d{2})/i);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
}

export function parseLabelledTotal(text: string, labels = "subtotal|total(?: do pedido| da sacola| do carrinho)?"): number | undefined {
  const matches = [...text.replace(/\u00a0/g, " ").matchAll(new RegExp(`(?:${labels})[^R$]{0,100}(R\\$\\s*[\\d.]+,\\d{2})`, "gi"))];
  return parseBrl(matches.at(-1)?.[1]);
}

export function parseDeliveryFee(text: string): number | undefined {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!/^(?:frete|taxa de entrega)\b/i.test(line) && !/^entrega\b.*R\$/i.test(line)) continue;
    const nearby = [line, ...lines.slice(index + 1, index + 3)].join(" · ");
    // Threshold promotions are not a delivery quote. Only accept free shipping
    // when the retailer is quoting the current cart, not advertising a future
    // basket value (e.g. "Com mais R$ X, ganhe frete grátis").
    const priorIsFreeShippingPromotion = /(?:com mais|acima de|a partir de)\s*R\$/i.test(lines[index - 1] ?? "") && /frete\s+(?:gr[aá]tis|free)/i.test(line);
    if (priorIsFreeShippingPromotion || (/(?:com mais|acima de|a partir de)\s*R\$/i.test(nearby) && /frete\s+(?:gr[aá]tis|free)/i.test(nearby))) continue;
    if (/gr[aá]tis|free/i.test(nearby)) return 0;
    const value = parseBrl(nearby);
    if (value !== undefined) return value;
  }
  const labelled = [...text.matchAll(/(?:frete|taxa de entrega)[^\nR$]{0,100}(R\$\s*[\d.]+,\d{2})/gi)]
    .filter((match) => !/(?:com mais|acima de|a partir de)\s*R\$/i.test(match[0]));
  return parseBrl(labelled.at(-1)?.[1]);
}

export function parseDeliveryPromise(text: string): string | undefined {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\b(?:entrega|receba|chega|prazo|agendada|expressa|express)\b/i.test(lines[index])) continue;
    const candidates = [lines[index]];
    for (const next of lines.slice(index + 1, index + 3)) {
      if (/^(?:total|subtotal|frete|taxa de entrega|pagamento|cupom)\b/i.test(next)) break;
      candidates.push(next);
    }
    const value = candidates.join(" · ");
    // A delivery calculator invitation and store-pickup marketing are not a
    // delivery promise, even when the pickup copy contains a duration.
    if (/consulte\s+o\s+frete|n[aã]o\s+sei\s+meu\s+cep|retire\s+na\s+loja/i.test(value)) continue;
    if (/(?:hoje|amanh[ãa]|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|\d+\s*(?:min|hora|dia)|\d{1,2}[/-]\d{1,2}|entre\s+\d{1,2}:\d{2})/i.test(value)) {
      return value.slice(0, 180);
    }
  }
  return undefined;
}

export async function isVisible(locator: Locator): Promise<boolean> {
  try { return (await locator.count()) > 0 && (await locator.first().isVisible()); } catch { return false; }
}

export async function clickCookieConsent(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /aceitar todos|aceitar todos os cookies|prosseguir com todos|aceitar|entendi|concordo/i });
  if (await isVisible(accept)) await accept.first().click({ timeout: 2_000 }).catch(() => undefined);
}

export async function deliveryDiagnostics(page: Page): Promise<string[]> {
  // Keep failures actionable without persisting the account's address or broader
  // page text. Only delivery-related visible controls are retained.
  const controls = await page.locator('button:visible, a:visible, [role="button"]:visible').evaluateAll((elements) =>
    elements
      .map((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!/\b(?:frete|prazo|entrega|cep|sacola|checkout|continuar|calcular|confirmar)\b/i.test(text)) return null;
        const testId = element.getAttribute("data-testid") ?? "";
        const label = element.getAttribute("aria-label") ?? "";
        return [element.tagName.toLowerCase(), testId, label, text].filter(Boolean).join(" · ").slice(0, 220);
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, 20)
  );
  // Some retailer carts render delivery status as plain text rather than as an
  // interactive control. Keep only those lines, redact postal codes, and never
  // retain the surrounding page (which could include an address or account data).
  const deliveryLines = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""))
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && /\b(?:frete|prazo|entrega|receba|cep|retirada)\b/i.test(line))
    .map((line) => line.replace(/\b\d{5}-?\d{3}\b/g, "[CEP]").slice(0, 220))
    .slice(0, 12);
  const deliveryInputs = await page.locator("input:visible").evaluateAll((elements) =>
    elements
      .map((element) => {
        const name = element.getAttribute("name") ?? "";
        const placeholder = element.getAttribute("placeholder") ?? "";
        const testId = element.getAttribute("data-testid") ?? "";
        const signal = [name, placeholder, testId].join(" ");
        return /(?:cep|postal|endereco|endere[cç]o)/i.test(signal)
          ? ["input", name, placeholder, testId].filter(Boolean).join(" · ").slice(0, 220)
          : null;
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, 6)
  ).catch(() => [] as string[]);
  const deliveryInputAncestors = await page.locator('[data-testid="postal-code-input"]:visible').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rows: string[] = [];
      let parent = element.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        const tag = parent.tagName.toLowerCase();
        const role = parent.getAttribute("role") ?? "";
        const testId = parent.getAttribute("data-testid") ?? "";
        const disabled = parent.getAttribute("data-disabled") ?? "";
        const expanded = parent.getAttribute("aria-expanded") ?? "";
        const signature = [tag, role && `role=${role}`, testId && `testid=${testId}`, disabled && `disabled=${disabled}`, expanded && `expanded=${expanded}`].filter(Boolean).join(" · ");
        if (signature) rows.push(`cep-container · ${signature}`.slice(0, 220));
      }
      return rows;
    }).slice(0, 12)
  ).catch(() => [] as string[]);
  let path = "";
  try { path = new URL(page.url()).pathname; } catch { /* keep diagnostics empty */ }
  return [...(path ? [`path · ${path}`] : []), ...controls, ...deliveryInputs, ...deliveryInputAncestors, ...deliveryLines].slice(0, 24);
}

export function safeRetailerUrl(value: string | null | undefined, domain: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(domain) ? url.toString() : null;
  } catch { return null; }
}
