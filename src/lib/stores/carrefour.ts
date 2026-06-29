import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch, normalizeText } from "./types";
import { prisma } from "@/lib/prisma";
import { runApifyActor } from "@/lib/adapters/suppliers";

// Carrefour (hipermercado) — the broad everyday base: comidinha, higiene, pet,
// limpeza, bebida. Catalog below is a SEED for the MVP/sandbox; swap this for the
// real Carrefour catalog (scrape/feed/API) without touching the rest of the system.
// Non-perishable / packaged only for now (courier has no refrigeration).
const SEED_CATALOG: CatalogItem[] = [
  // Higiene
  { sku: "CRF-HIG-001", name: "Creme Dental Colgate Total 12 90g", brand: "Colgate", unitPrice: 6.49, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-002", name: "Creme Dental Sorriso Dentes Brancos 90g", brand: "Sorriso", unitPrice: 3.29, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-003", name: "Escova de Dente Oral-B Indicator", brand: "Oral-B", unitPrice: 9.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-004", name: "Shampoo Seda Bomba de Vitaminas 325ml", brand: "Seda", unitPrice: 12.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-005", name: "Condicionador Pantene Restauração 175ml", brand: "Pantene", unitPrice: 14.5, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-006", name: "Sabonete Dove Original 90g", brand: "Dove", unitPrice: 3.99, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-007", name: "Desodorante Rexona Aerosol 150ml", brand: "Rexona", unitPrice: 13.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-008", name: "Papel Higiênico Neve Folha Dupla 12 rolos", brand: "Neve", unitPrice: 19.9, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-009", name: "Absorvente Always Seca 8 un", brand: "Always", unitPrice: 7.49, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-010", name: "Lâmina de Barbear Gillette Prestobarba3", brand: "Gillette", unitPrice: 16.9, unit: "pacote", category: "higiene" },
  // Bebê
  { sku: "CRF-BEB-001", name: "Fralda Pampers Confort Sec M 30 un", brand: "Pampers", unitPrice: 39.9, unit: "pacote", category: "bebe" },
  { sku: "CRF-BEB-002", name: "Fralda Huggies Tripla Proteção G 28 un", brand: "Huggies", unitPrice: 42.9, unit: "pacote", category: "bebe" },
  { sku: "CRF-BEB-003", name: "Lenço Umedecido Huggies 48 un", brand: "Huggies", unitPrice: 9.9, unit: "pacote", category: "bebe" },
  // Limpeza
  { sku: "CRF-LMP-001", name: "Detergente Ypê Neutro 500ml", brand: "Ypê", unitPrice: 2.79, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-002", name: "Sabão em Pó Omo Lavagem Perfeita 1,6kg", brand: "Omo", unitPrice: 24.9, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-003", name: "Amaciante Comfort Concentrado 1L", brand: "Comfort", unitPrice: 13.9, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-004", name: "Água Sanitária Qboa 2L", brand: "Qboa", unitPrice: 7.49, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-005", name: "Papel Toalha Snob 2 rolos", brand: "Snob", unitPrice: 8.9, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-006", name: "Esponja de Aço Bombril 8 un", brand: "Bombril", unitPrice: 3.49, unit: "pacote", category: "limpeza" },
  // Mercearia
  { sku: "CRF-MER-001", name: "Café Pilão Torrado e Moído 500g", brand: "Pilão", unitPrice: 15.9, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-002", name: "Açúcar União Refinado 1kg", brand: "União", unitPrice: 4.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-003", name: "Arroz Tio João Tipo 1 5kg", brand: "Tio João", unitPrice: 27.9, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-004", name: "Feijão Carioca Camil 1kg", brand: "Camil", unitPrice: 8.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-005", name: "Óleo de Soja Soya 900ml", brand: "Soya", unitPrice: 7.29, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-006", name: "Macarrão Espaguete Renata 500g", brand: "Renata", unitPrice: 4.39, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-007", name: "Leite UHT Integral Italac 1L", brand: "Italac", unitPrice: 4.99, unit: "un", category: "mercearia" },
  // Snacks / comidinha (não-perecível)
  { sku: "CRF-SNK-001", name: "Biscoito Recheado Oreo 90g", brand: "Oreo", unitPrice: 4.99, unit: "un", category: "snack" },
  { sku: "CRF-SNK-002", name: "Salgadinho Doritos Queijo Nacho 84g", brand: "Doritos", unitPrice: 8.9, unit: "un", category: "snack" },
  { sku: "CRF-SNK-003", name: "Chocolate Lacta Ao Leite 90g", brand: "Lacta", unitPrice: 7.49, unit: "un", category: "snack" },
  { sku: "CRF-SNK-004", name: "Bolacha Maizena Bauducco 170g", brand: "Bauducco", unitPrice: 3.29, unit: "un", category: "snack" },
  { sku: "CRF-SNK-005", name: "Amendoim Japonês Dori 150g", brand: "Dori", unitPrice: 5.49, unit: "un", category: "snack" },
  // Bebidas (não-alcoólica e embalada)
  { sku: "CRF-BEB-101", name: "Refrigerante Coca-Cola 2L", brand: "Coca-Cola", unitPrice: 9.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-105", name: "Refrigerante Guaraná Antarctica 2L", brand: "Antarctica", unitPrice: 8.49, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-106", name: "Energético Red Bull 250ml", brand: "Red Bull", unitPrice: 9.9, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-102", name: "Água Mineral Crystal sem Gás 1,5L", brand: "Crystal", unitPrice: 2.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-103", name: "Suco Del Valle Uva 1L", brand: "Del Valle", unitPrice: 7.9, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-104", name: "Cerveja Heineken Long Neck 330ml", brand: "Heineken", unitPrice: 6.49, unit: "un", category: "bebida" },
  // Pet
  { sku: "CRF-PET-001", name: "Ração Pedigree Cães Adultos Carne 1kg", brand: "Pedigree", unitPrice: 19.9, unit: "un", category: "pet" },
  { sku: "CRF-PET-002", name: "Ração Whiskas Gatos Adultos Carne 1kg", brand: "Whiskas", unitPrice: 22.9, unit: "un", category: "pet" },
  { sku: "CRF-PET-003", name: "Areia Higiênica Pipicat 4kg", brand: "Pipicat", unitPrice: 14.9, unit: "un", category: "pet" },
  // Conveniência / pilhas etc.
  { sku: "CRF-CNV-001", name: "Pilha Alcalina Duracell AA 4 un", brand: "Duracell", unitPrice: 24.9, unit: "pacote", category: "conveniencia" },
  { sku: "CRF-CNV-002", name: "Isqueiro BIC Maxi", brand: "BIC", unitPrice: 6.9, unit: "un", category: "conveniencia" }
];

// A few São Paulo capital units. Mock CEP->unit: just returns the first for now;
// the real impl would geocode the CEP and pick the closest open store.
const UNITS: StoreUnit[] = [
  { id: "crf-pinheiros", label: "Carrefour Pinheiros", address: "R. dos Pinheiros, 1000 - Pinheiros, São Paulo - SP", cep: "05422-001" },
  { id: "crf-paulista", label: "Carrefour Paulista", address: "Av. Paulista, 1800 - Bela Vista, São Paulo - SP", cep: "01310-100" },
  { id: "crf-tatuape", label: "Carrefour Tatuapé", address: "R. Tuiuti, 2100 - Tatuapé, São Paulo - SP", cep: "03081-000" }
];

const CARREFOUR_ACTOR = process.env.APIFY_CARREFOUR_ACTOR ?? "gio21~carrefour-br-scraper";
const CACHE_TTL_MS = Number(process.env.LIA_SEARCH_CACHE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
// Hard cap so a slow Carrefour scrape never hangs the WhatsApp turn — past this we
// fall back to the seed and the user always gets a reply.
const CARREFOUR_MAX_WAIT_MS = Number(process.env.LIA_CARREFOUR_TIMEOUT_MS ?? 22000);

function seedSearch(query: string, limit: number): CatalogItem[] {
  const scored = SEED_CATALOG.map((item) => ({ item, score: scoreCatalogMatch(query, item) })).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice);
  return scored.slice(0, limit).map((entry) => entry.item);
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
async function searchCarrefourLive(query: string, limit: number): Promise<CatalogItem[]> {
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

  const raw = await runApifyActor(CARREFOUR_ACTOR, token, { searchTerm: query, maxItems: 20, maxPages: 1 }, CARREFOUR_MAX_WAIT_MS);
  const items = (raw ?? [])
    .map((entry) => mapCarrefourItem(entry as Record<string, unknown>))
    .filter((item): item is CatalogItem => Boolean(item));
  const ranked = items
    .map((item) => ({ item, score: scoreCatalogMatch(query, item) }))
    .sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice)
    .map((entry) => entry.item);

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

export const carrefourStore: StoreConnector = {
  key: "carrefour",
  label: "Carrefour",

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    // Live Carrefour catalog (Apify) when a token is set; the seed is the safety net
    // so the flow never breaks if the actor is down or returns nothing.
    if (process.env.APIFY_API_TOKEN) {
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

  async nearestUnit(cep?: string): Promise<StoreUnit> {
    if (cep) {
      const digits = cep.replace(/\D/g, "");
      const exact = UNITS.find((unit) => unit.cep?.replace(/\D/g, "") === digits);
      if (exact) return exact;
    }
    return UNITS[0];
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido Click&Retire nº ${orderNumber} no balcão.`,
      "Apresentar: documento do entregador + foto do documento do titular (anexo) + e-mail de 'pronto'."
    ].join(" ");
  }
};
