import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductIntent, SupplierSource } from "@/lib/types";

export type SupplierConnector = {
  source: SupplierSource;
  label: string;
  searchProducts(intent: ProductIntent): Promise<Product[]>;
};

function dbConnector(source: SupplierSource, label: string): SupplierConnector {
  return {
    source,
    label,
    async searchProducts(intent) {
      return prisma.product.findMany({
        where: {
          source,
          availability: true,
          ...(intent.category ? { category: intent.category } : {})
        }
      });
    }
  };
}

const mercadoLivreConnector: SupplierConnector = {
  source: "mercado_livre",
  label: "Mercado Livre",
  async searchProducts(intent) {
    const query = buildSearchQuery(intent);
    if (!query) return fallbackMercadoLivreProducts(intent);

    const liveProducts = await searchMercadoLivre(query, intent);
    if (liveProducts.length) return liveProducts;

    return fallbackMercadoLivreProducts(intent);
  }
};

export const supplierConnectors: SupplierConnector[] = [
  mercadoLivreConnector,
  dbConnector("rappi", "Rappi"),
  dbConnector("farmacia", "Farmacia"),
  dbConnector("loja_local", "Loja local")
];

type MercadoLivreSearchResponse = {
  results?: MercadoLivreItem[];
};

type MercadoLivreItem = {
  id: string;
  title: string;
  price?: number;
  permalink?: string;
  thumbnail?: string;
  condition?: string;
  seller?: {
    id?: number;
    nickname?: string;
  };
  shipping?: {
    free_shipping?: boolean;
  };
};

async function searchMercadoLivre(query: string, intent: ProductIntent) {
  const token = process.env.MERCADO_LIVRE_ACCESS_TOKEN;
  if (process.env.MERCADO_LIVRE_REAL_SEARCH !== "true" && !token) return [];

  try {
    const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", process.env.MERCADO_LIVRE_SEARCH_LIMIT ?? "8");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "atlas/0.1",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      console.warn("[mercado-livre:search:fallback]", response.status, await response.text());
      return [];
    }

    const payload = (await response.json()) as MercadoLivreSearchResponse;
    const items = (payload.results ?? []).filter((item) => item.id && item.title && item.price);
    const products = await Promise.all(items.map((item) => upsertMercadoLivreProduct(item, intent)));
    return products.filter((product): product is Product => Boolean(product));
  } catch (error) {
    console.warn("[mercado-livre:search:error]", error);
    return [];
  }
}

async function upsertMercadoLivreProduct(item: MercadoLivreItem, intent: ProductIntent) {
  const shippingPrice = item.shipping?.free_shipping ? 0 : Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 12.9);
  const deliveryHours = Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 48);
  const imageUrl = item.thumbnail?.replace(/^http:/, "https:") ?? "https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.92/mercadolibre/logo__large_plus.png";
  const brand = inferBrand(item.title, intent.preferredBrand);

  return prisma.product.upsert({
    where: { externalId: `mlb-${item.id}` },
    update: {
      title: item.title,
      brand,
      category: intent.category ?? "produto",
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "marketplace_native",
      automationLevel: "real_search_manual_checkout",
      price: Number(item.price ?? 0),
      shippingPrice,
      store: item.seller?.nickname ? `Mercado Livre: ${item.seller.nickname}` : "Mercado Livre",
      rating: 4.3,
      deliveryEstimate: deliveryHours <= 24 ? "Mercado Livre, entrega estimada em ate 24h" : "Mercado Livre, entrega estimada em 1-2 dias",
      deliveryHours,
      imageUrl,
      productUrl: item.permalink ?? `https://www.mercadolivre.com.br/p/${item.id}`,
      availability: true
    },
    create: {
      externalId: `mlb-${item.id}`,
      title: item.title,
      brand,
      category: intent.category ?? "produto",
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "marketplace_native",
      automationLevel: "real_search_manual_checkout",
      price: Number(item.price ?? 0),
      shippingPrice,
      store: item.seller?.nickname ? `Mercado Livre: ${item.seller.nickname}` : "Mercado Livre",
      rating: 4.3,
      deliveryEstimate: deliveryHours <= 24 ? "Mercado Livre, entrega estimada em ate 24h" : "Mercado Livre, entrega estimada em 1-2 dias",
      deliveryHours,
      imageUrl,
      productUrl: item.permalink ?? `https://www.mercadolivre.com.br/p/${item.id}`,
      availability: true
    }
  });
}

function fallbackMercadoLivreProducts(intent: ProductIntent) {
  return dbConnector("mercado_livre", "Mercado Livre").searchProducts(intent);
}

function buildSearchQuery(intent: ProductIntent) {
  return [intent.preferredBrand, intent.category].filter(Boolean).join(" ").trim();
}

function inferBrand(title: string, preferredBrand?: string) {
  if (preferredBrand && title.toLowerCase().includes(preferredBrand.toLowerCase())) return preferredBrand;
  const knownBrands = ["Colgate", "Oral-B", "Curaprox", "Sorriso", "Pantene", "Seda", "Kleenex", "Nivea", "Rexona", "Anker", "Duracell", "Crystal", "Lacta"];
  return knownBrands.find((brand) => title.toLowerCase().includes(brand.toLowerCase())) ?? "Mercado Livre";
}
