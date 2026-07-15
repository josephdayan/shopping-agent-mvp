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

export async function isVisible(locator: Locator): Promise<boolean> {
  try { return (await locator.count()) > 0 && (await locator.first().isVisible()); } catch { return false; }
}

export async function clickCookieConsent(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /aceitar todos|aceitar todos os cookies|prosseguir com todos|aceitar|entendi|concordo/i });
  if (await isVisible(accept)) await accept.first().click({ timeout: 2_000 }).catch(() => undefined);
}

export function safeRetailerUrl(value: string | null | undefined, domain: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(domain) ? url.toString() : null;
  } catch { return null; }
}
