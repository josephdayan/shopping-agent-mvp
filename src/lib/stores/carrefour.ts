import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog, normalizeText } from "./types";
import { prisma } from "@/lib/prisma";
import { runApifyActor } from "@/lib/adapters/suppliers";
import { CARREFOUR_CATALOG } from "./carrefour-catalog";
import { CARREFOUR_FRESH_CATALOG } from "./carrefour-fresh-catalog";

// Carrefour (hipermercado) — the broad everyday base. The catalog now lives in
// carrefour-catalog.ts (~1094 REAL items scraped from mercado.carrefour.com.br on
// 2026-06-30). `unitPrice` is the real Carrefour cost; the 10% markup is applied
// downstream in delivery-service. Grow it by regenerating that file — this stays put.
const SEED_CATALOG: CatalogItem[] = catalogWithImages([...CARREFOUR_CATALOG, ...CARREFOUR_FRESH_CATALOG]);

// Real Carrefour Hipermercado units in the São Paulo metro (these are the stores that
// do Clique e Retire). Names/addresses/CEPs from carrefour.com.br/localizador-de-lojas
// (2026-06-30); lat/lng geocoded 2026-07-02 (Grande SP expansion) so pickNearestUnit
// (stores/nearest.ts) uses real distance. Add Grande SP rows here as coverage grows.
const UNITS: StoreUnit[] = [
  { id: "crf-washington-luis", label: "Carrefour Hiper Washington Luís", address: "Av. Washington Luiz, 1415 - São Paulo - SP", cep: "04662-002", lat: -23.6345, lng: -46.66828 },
  { id: "crf-imigrantes", label: "Carrefour Hiper Imigrantes", address: "Rua Ribeiro Lacerda, 940 - São Paulo - SP", cep: "04150-000", lat: -23.62079, lng: -46.61952 },
  { id: "crf-brooklin", label: "Carrefour Hiper Brooklin", address: "Av. Santo Amaro, 4815 - São Paulo - SP", cep: "04702-000", lat: -23.62524, lng: -46.68638 }, // CEP corrigido (o site trazia 47001-000, da BA)
  { id: "crf-pinheiros", label: "Carrefour Hiper Pinheiros", address: "Av. das Nações Unidas, 15187 - São Paulo - SP", cep: "04794-000", lat: -23.62863, lng: -46.71202 },
  { id: "crf-giovanni-gronchi", label: "Carrefour Hiper Giovanni Gronchi", address: "Av. Alberto Augusto Alves, 50 - São Paulo - SP", cep: "05724-030", lat: -23.64202, lng: -46.73446 },
  { id: "crf-butanta", label: "Carrefour Hiper Butantã", address: "Av. Prof. Francisco Morato, 2718 - São Paulo - SP", cep: "05512-300", lat: -23.58662, lng: -46.72499 },
  { id: "crf-raposo-tavares", label: "Carrefour Hiper Raposo Tavares", address: "Rod. Raposo Tavares, s/n - São Paulo - SP", cep: "05577-901", lat: -23.59175, lng: -46.80054 },
  { id: "crf-aricanduva", label: "Carrefour Hiper Aricanduva", address: "Av. Rio das Pedras, 555 - São Paulo - SP", cep: "03453-000", lat: -23.55956, lng: -46.51593 },
  { id: "crf-analia-franco", label: "Carrefour Hiper Anália Franco", address: "Av. Regente Feijó, 1759 - São Paulo - SP", cep: "03550-100", lat: -23.56032, lng: -46.56009 },
  { id: "crf-limao", label: "Carrefour Hiper Limão", address: "Av. Otaviano Alves de Lima, 1824 - São Paulo - SP", cep: "02701-000", lat: -23.50761, lng: -46.71001 },
  { id: "crf-tambore", label: "Carrefour Hiper Tamboré", address: "Av. Piracema, 669 - Barueri - SP", cep: "06460-930", lat: -23.50469, lng: -46.83449 },
  { id: "crf-taboao", label: "Carrefour Hiper Taboão da Serra", address: "Rod. Régis Bittencourt, 1835 - Taboão da Serra - SP", cep: "06768-200", lat: -23.62112, lng: -46.78751 },
  // — Grande SP (pesquisa web 2026-07-02, confiança média): CONFIRMAR clique-e-retire +
  //   retirada por terceiro AO VIVO antes do primeiro pedido real em cada uma.
  { id: "crf-osasco", label: "Carrefour Hiper Osasco", address: "Av. dos Autonomistas, 1542 - Osasco - SP", cep: "06020-015", lat: -23.54686, lng: -46.76091 },
  { id: "crf-guarulhos-dutra", label: "Carrefour Hiper Guarulhos Dutra", address: "Av. Paulo Faccini, 240 - Guarulhos - SP", cep: "07111-000", lat: -23.45406, lng: -46.53432 },
  { id: "crf-guarulhos-vila-rio", label: "Carrefour Hiper Guarulhos Vila Rio", address: "Av. Benjamin Harris Hunnicutt, 361 - Guarulhos - SP", cep: "07124-000", lat: -23.42974, lng: -46.53793 },
  { id: "crf-sbc", label: "Carrefour Hiper São Bernardo", address: "Av. Senador Vergueiro, 2000 - São Bernardo do Campo - SP", cep: "09750-001", lat: -23.67632, lng: -46.55469 },
  { id: "crf-santo-andre", label: "Carrefour Hiper Santo André", address: "Av. Pedro Américo - Santo André - SP", cep: "09110-100", lat: -23.67027, lng: -46.49892 },
  // — Interior SP (pesquisa web 2026-07-02, confiança média): CONFIRMAR que a unidade
  //   segue aberta + clique-e-retire + retirada por terceiro antes do 1º pedido real.
  { id: "crf-campinas-dom-pedro", label: "Carrefour Hiper Campinas Dom Pedro", address: "Rod. Dom Pedro I, km 127, Campinas - SP", cep: "13097-670", lat: -22.85329, lng: -47.02742 },
  { id: "crf-campinas-valinhos", label: "Carrefour Hiper Campinas Valinhos", address: "Av. Eng. Antônio Francisco de Paula Souza, 3900, Jd. Anton von Zuben, Campinas - SP", cep: "13044-370", lat: -22.947, lng: -47.037 },
  { id: "crf-jundiai", label: "Carrefour Hiper Jundiaí", address: "Av. Nove de Julho, 3600, Anhangabaú, Jundiaí - SP", cep: "13208-056", lat: -23.18837, lng: -46.89095 },
  { id: "crf-sorocaba-norte", label: "Carrefour Hiper Sorocaba Norte", address: "Av. Ipanema, 376, Terra Vermelha, Sorocaba - SP", cep: "18065-100", lat: -23.48648, lng: -47.47117 },
  { id: "crf-sorocaba-esplanada", label: "Carrefour Hiper Sorocaba Campolim", address: "Av. Prof. Izoraida Marques Peres, 401, Parque Campolim, Sorocaba - SP", cep: "18052-780", lat: -23.53361, lng: -47.46505 },
  { id: "crf-santos-praiamar", label: "Carrefour Hiper Santos Praiamar", address: "Rua Alexandre Martins, 80, Aparecida, Santos - SP", cep: "11025-905", lat: -23.97746, lng: -46.30933 },
  { id: "crf-sao-vicente", label: "Carrefour Hiper São Vicente", address: "Av. Prefeito José Monteiro, 1045, Jd. Independência, São Vicente - SP", cep: "11380-900", lat: -23.955, lng: -46.385 },
  { id: "crf-sjc-matarazzo", label: "Carrefour Hiper São José dos Campos", address: "Av. Deputado Benedito Matarazzo, 5701, São José dos Campos - SP", cep: "12215-900", lat: -23.22309, lng: -45.90679 },
  { id: "crf-taubate", label: "Carrefour Hiper Taubaté", address: "Av. Charles Schnneider, 1201, Barranco, Taubaté - SP", cep: "12041-078", lat: -23.04943, lng: -45.56675 },
  { id: "crf-ribeirao-shopping", label: "Carrefour Hiper Ribeirão Preto", address: "Av. Cel. Fernando Ferreira Leite, 1540, Jd. Califórnia, Ribeirão Preto - SP", cep: "14026-900", lat: -21.21188, lng: -47.81579 },
  { id: "crf-piracicaba", label: "Carrefour Hiper Piracicaba", address: "Av. Rui Teixeira Mendes, 300, Nova Piracicaba, Piracicaba - SP", cep: "13403-130", lat: -22.72437, lng: -47.67048 },
  { id: "crf-rio-preto-shopping", label: "Carrefour Hiper São José do Rio Preto", address: "Av. Brigadeiro Faria Lima, 6363, São José do Rio Preto - SP", cep: "15090-900", lat: -20.83515, lng: -49.39866 },
  { id: "crf-prudente-prudenshopping", label: "Carrefour Hiper Presidente Prudente", address: "Av. Manoel Goulart, 2400, Jd. das Rosas, Presidente Prudente - SP", cep: "19060-000", lat: -22.11929, lng: -51.41452 }
];

const CARREFOUR_ACTOR = process.env.APIFY_CARREFOUR_ACTOR ?? "gio21~carrefour-br-scraper";
const CACHE_TTL_MS = Number(process.env.LIA_SEARCH_CACHE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
// Hard cap so a slow Carrefour scrape never hangs the WhatsApp turn — past this we
// fall back to the seed and the user always gets a reply.
const CARREFOUR_MAX_WAIT_MS = Number(process.env.LIA_CARREFOUR_TIMEOUT_MS ?? 22000);

function seedSearch(query: string, limit: number): CatalogItem[] {
  return rankCatalog(query, SEED_CATALOG, limit);
}

// The community actor's exact field names vary — pull from the likely candidates.
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return undefined;
}
function toStr(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function toPrice(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = toStr(value).replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function mapCarrefourItem(raw: Record<string, unknown>): CatalogItem | null {
  const name = toStr(pick(raw, ["title", "Title", "name", "productName", "nome"]));
  const unitPrice = toPrice(pick(raw, ["price", "Price", "preco", "preço", "currentPrice", "salePrice"]));
  if (!name || unitPrice <= 0) return null;
  return {
    sku: toStr(pick(raw, ["sku", "id", "productId", "ean", "url", "link"])) || `crf-${name.slice(0, 48)}`,
    name,
    brand: toStr(pick(raw, ["brand", "Brand", "marca"])) || undefined,
    unitPrice,
    unit: "un",
    category: "carrefour",
    imageUrl: toStr(pick(raw, ["image", "Image", "imageUrl", "img", "thumbnail", "imagem"])) || undefined
  };
}

// Live Carrefour catalog via Apify (keyword search), cached per query in SearchCache.
// maxWaitMs: short in the chat turn (don't hang the user); long in the prewarm cron.
async function searchCarrefourLive(query: string, limit: number, maxWaitMs = CARREFOUR_MAX_WAIT_MS): Promise<CatalogItem[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];
  const cacheKey = `carrefour|${normalizeText(query)}`;

  try {
    const row = await prisma.searchCache.findUnique({ where: { queryKey: cacheKey }, select: { items: true, updatedAt: true } });
    if (row && Date.now() - new Date(row.updatedAt).getTime() < CACHE_TTL_MS) {
      const cached = Array.isArray(row.items) ? (row.items as unknown as CatalogItem[]) : [];
      if (cached.length) return cached.slice(0, limit);
    }
  } catch (error) {
    console.warn("[carrefour:cache:read]", error instanceof Error ? error.message : error);
  }

  const raw = await runApifyActor(CARREFOUR_ACTOR, token, { searchTerm: query, maxItems: 20, maxPages: 1 }, maxWaitMs);
  const items = catalogWithImages((raw ?? [])
    .map((entry) => mapCarrefourItem(entry as Record<string, unknown>))
    .filter((item): item is CatalogItem => Boolean(item)));
  const ranked = rankCatalog(query, items, items.length);

  if (ranked.length) {
    try {
      await prisma.searchCache.upsert({
        where: { queryKey: cacheKey },
        create: { queryKey: cacheKey, query, items: ranked as unknown as object },
        update: { query, items: ranked as unknown as object }
      });
    } catch (error) {
      console.warn("[carrefour:cache:write]", error instanceof Error ? error.message : error);
    }
  }
  return ranked.slice(0, limit);
}

// Prewarm the cache for the most common everyday queries so they're INSTANT in chat
// (the long-tail is still scraped on demand, then cached). Run from the cron with a
// long wait since it's background, not a user turn.
export async function prewarmCarrefour(queries: string[], options?: { limit?: number; minAgeMs?: number }) {
  // Off until live scraping actually works — otherwise the cron burns Apify money on
  // an actor that returns nothing.
  if (process.env.LIA_CARREFOUR_LIVE !== "true") {
    return { ok: false, reason: "live_disabled", attempted: 0, warmed: 0, total: queries.length };
  }
  if (!process.env.APIFY_API_TOKEN) {
    return { ok: false, reason: "no_apify_token", attempted: 0, warmed: 0, total: queries.length };
  }
  const limit = Math.max(1, Math.floor(options?.limit ?? 8));
  const minAgeMs = options?.minAgeMs ?? Math.floor(CACHE_TTL_MS * 0.7);

  let rows: { queryKey: string; updatedAt: Date }[] = [];
  try {
    rows = await prisma.searchCache.findMany({
      where: { queryKey: { startsWith: "carrefour|" } },
      select: { queryKey: true, updatedAt: true }
    });
  } catch (error) {
    console.warn("[carrefour:prewarm:status-read]", error instanceof Error ? error.message : error);
  }
  const ageByKey = new Map(rows.map((r) => [r.queryKey, Date.now() - new Date(r.updatedAt).getTime()]));
  const candidates = queries
    .map((query) => ({ query, age: ageByKey.get(`carrefour|${normalizeText(query)}`) ?? Number.POSITIVE_INFINITY }))
    .filter((candidate) => candidate.age >= minAgeMs)
    .sort((a, b) => b.age - a.age)
    .slice(0, limit);

  let warmed = 0;
  for (const candidate of candidates) {
    try {
      const items = await searchCarrefourLive(candidate.query, 8, Number(process.env.LIA_PREWARM_TIMEOUT_MS ?? 90000));
      if (items.length) warmed += 1;
    } catch (error) {
      console.warn("[carrefour:prewarm:item]", candidate.query, error instanceof Error ? error.message : error);
    }
  }
  return { ok: true, attempted: candidates.length, warmed, total: queries.length };
}

export const carrefourStore: StoreConnector = {
  key: "carrefour",
  label: "Carrefour",
  // Carrefour clique-e-retire requires a minimum order (~R$30 of products). Tunable.
  minOrder: Number(process.env.LIA_CARREFOUR_MIN_ORDER ?? 30),

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    // Live Carrefour via Apify is OPT-IN (LIA_CARREFOUR_LIVE=true). The community
    // actor gio21~carrefour-br-scraper currently returns "No items scraped" (its
    // anti-bot bypass is broken), so by default we use the reliable, instant seed.
    // Flip the flag back on once a working Carrefour data source is wired.
    if (process.env.LIA_CARREFOUR_LIVE === "true" && process.env.APIFY_API_TOKEN) {
      try {
        const live = await searchCarrefourLive(query, limit);
        if (live.length) return live;
      } catch (error) {
        console.warn("[carrefour:live:fallback-seed]", error instanceof Error ? error.message : error);
      }
    }
    return seedSearch(query, limit);
  },

  listCatalog(): CatalogItem[] {
    return SEED_CATALOG;
  },

  listUnits(): StoreUnit[] {
    return UNITS;
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido Click&Retire nº ${orderNumber} no balcão.`,
      "Apresentar: documento do entregador + foto do documento do titular (anexo) + e-mail de 'pronto'."
    ].join(" ");
  }
};
