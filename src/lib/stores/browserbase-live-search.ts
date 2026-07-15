import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";
import { prisma } from "@/lib/prisma";
import type { CatalogItem } from "./types";
import { normalizeText } from "./types";

type LiveSearchOptions = {
  cacheNamespace: string;
  query: string;
  limit: number;
  domain: string;
  contextId?: string;
  searchUrl: (query: string) => string;
  extract: (page: Page) => Promise<CatalogItem[]>;
};

const CACHE_TTL_MS = Number(process.env.LIA_RETAILER_LIVE_CACHE_TTL_MS ?? 15 * 60 * 1000);

function sellable(items: CatalogItem[]): CatalogItem[] {
  return items.filter((item) => Boolean(item.productUrl && /^https:\/\//i.test(item.productUrl) && item.unitPrice > 0));
}

export async function browserbaseLiveSearch(options: LiveSearchOptions): Promise<CatalogItem[]> {
  const queryKey = `${options.cacheNamespace}|${normalizeText(options.query)}`;
  try {
    const row = await prisma.searchCache.findUnique({ where: { queryKey }, select: { items: true, updatedAt: true } });
    if (row && Date.now() - row.updatedAt.getTime() < CACHE_TTL_MS) {
      const cached = Array.isArray(row.items) ? (row.items as unknown as CatalogItem[]) : [];
      const valid = sellable(cached);
      if (valid.length) return valid.slice(0, options.limit);
    }
  } catch (error) {
    console.warn(`[${options.cacheNamespace}:cache:read]`, error instanceof Error ? error.message : error);
  }

  if (!process.env.BROWSERBASE_API_KEY) return [];
  const country = (process.env.BROWSERBASE_PROXY_COUNTRY ?? process.env.CARREFOUR_BROWSER_PROXY_COUNTRY)?.trim().toUpperCase();
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
  const session = await bb.sessions.create({
    browserSettings: {
      ...(options.contextId ? { context: { id: options.contextId, persist: true } } : {}),
      allowedDomains: [options.domain],
      recordSession: true
    },
    ...(country && /^[A-Z]{2}$/.test(country)
      ? { proxies: [{ type: "browserbase" as const, geolocation: { country } }] }
      : {})
  });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(options.searchUrl(options.query), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_500);
    const items = sellable(await options.extract(page));
    if (items.length) {
      try {
        await prisma.searchCache.upsert({
          where: { queryKey },
          create: { queryKey, query: options.query, items: items as unknown as object },
          update: { query: options.query, items: items as unknown as object }
        });
      } catch (error) {
        console.warn(`[${options.cacheNamespace}:cache:write]`, error instanceof Error ? error.message : error);
      }
    }
    return items.slice(0, options.limit);
  } finally {
    await browser.close();
  }
}
