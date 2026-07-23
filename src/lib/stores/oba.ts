import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { rankCatalog, scoreCatalogMatch } from "./types";
import { browserbaseLiveSearch } from "./browserbase-live-search";

const OBA_ORIGIN = "https://secure.obahortifruti.com.br";

type ObaSeller = { sellerId?: string; commertialOffer?: { Price?: number; AvailableQuantity?: number } };
type ObaSku = { itemId?: string; nameComplete?: string; name?: string; images?: Array<{ imageUrl?: string }>; sellers?: ObaSeller[] };
type ObaProduct = { productName?: string; link?: string; items?: ObaSku[] };

// Deterministic seed used ONLY under LIA_RETAILER_TEST_SEED=true (tests/evals). It is
// NOT shown to customers; production always uses the live Browserbase search. Every seed
// item carries a real Oba CDN photo so it satisfies the "every card has a photo" contract.
const TEST_CATALOG: CatalogItem[] = [
  { sku: "oba-live-100004793-seller-1", name: "Arroz Camil 1 Kg", unitPrice: 5.99, unit: "un", category: "mercado arroz", imageUrl: `${OBA_ORIGIN}/arquivos/ids/100004793-1000-1000/arroz-camil-1-kg.jpg`, productUrl: `${OBA_ORIGIN}/arroz-camil-1kg-100004793/p` },
  { sku: "oba-live-9839-seller-1", name: "Detergente Bioz Green Neutro 470ml", unitPrice: 12.99, unit: "un", category: "mercado limpeza", imageUrl: `${OBA_ORIGIN}/arquivos/ids/9839-1000-1000/detergente-bioz-green-neutro-470ml.jpg`, productUrl: `${OBA_ORIGIN}/detergente-bioz-green-neutro-470ml/p` }
];

export function parseObaCatalog(products: ObaProduct[]): CatalogItem[] {
  const output: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    for (const item of product.items ?? []) {
      for (const seller of item.sellers ?? []) {
        const price = Number(seller.commertialOffer?.Price);
        const available = Number(seller.commertialOffer?.AvailableQuantity);
        const id = item.itemId?.trim();
        const sellerId = seller.sellerId?.trim();
        if (!id || !sellerId || !Number.isFinite(price) || price <= 0 || available <= 0) continue;
        const url = product.link ? new URL(product.link, OBA_ORIGIN).toString() : null;
        const key = `${id}:${sellerId}`;
        if (!url || seen.has(key)) continue;
        seen.add(key);
        output.push({
          sku: `oba-live-${id}-seller-${sellerId}`,
          name: item.nameComplete || item.name || product.productName || `Produto Oba ${id}`,
          unitPrice: Math.round(price * 100) / 100,
          unit: "un",
          category: "oba mercado",
          imageUrl: item.images?.[0]?.imageUrl,
          productUrl: url
        });
      }
    }
  }
  return output;
}

async function liveSearch(query: string, limit: number): Promise<CatalogItem[]> {
  return browserbaseLiveSearch({
    cacheNamespace: "oba-browserbase-v1",
    query,
    limit,
    domain: "obahortifruti.com.br",
    contextId: process.env.OBA_BROWSER_CONTEXT_ID,
    searchUrl: () => OBA_ORIGIN,
    extract: async (page) => {
      const products = await page.evaluate(async (value) => {
        const response = await fetch(`/api/catalog_system/pub/products/search/?ft=${encodeURIComponent(value)}&_from=0&_to=29`);
        if (!response.ok) return [];
        return response.json();
      }, query) as ObaProduct[];
      return rankCatalog(query, parseObaCatalog(products), 40).filter((item) => scoreCatalogMatch(query, item) > 0);
    }
  });
}

export const obaStore: StoreConnector = {
  key: "oba",
  label: "Oba Hortifruti",
  minOrder: Number(process.env.LIA_OBA_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    if (process.env.LIA_RETAILER_TEST_SEED === "true") return rankCatalog(query, TEST_CATALOG, limit);
    try {
      return await liveSearch(query, limit);
    } catch (error) {
      console.warn("[oba:browserbase-search]", error instanceof Error ? error.message : error);
      return [];
    }
  },
  listCatalog(): CatalogItem[] { return TEST_CATALOG; },
  listUnits(): StoreUnit[] { return []; },
  pickupInstructions(orderNumber: string): string {
    return `Pedido Oba nº ${orderNumber}: a Lia opera somente entrega do varejista; não despachar courier para retirada sem autorização formal.`;
  }
};
