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
    if (isSpecificSearch(intent, query)) return fallbackGeneratedProducts(intent);

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

type MercadoLivreCatalogSearchResponse = {
  results?: MercadoLivreCatalogProduct[];
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

type MercadoLivreCatalogProduct = {
  id: string;
  name?: string;
  status?: string;
  permalink?: string;
  pictures?: Array<{ url?: string; secure_url?: string }>;
  attributes?: Array<{
    id?: string;
    value_name?: string;
  }>;
};

async function searchMercadoLivre(query: string, intent: ProductIntent) {
  const token = process.env.MERCADO_LIVRE_ACCESS_TOKEN;
  if (process.env.MERCADO_LIVRE_REAL_SEARCH !== "true" && !token) return [];

  if (token) {
    const catalogProducts = await searchMercadoLivreCatalog(query, intent, token);
    if (catalogProducts.length) return catalogProducts;
  }

  try {
    const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", process.env.MERCADO_LIVRE_SEARCH_LIMIT ?? "8");

    let response = await fetch(url, {
      headers: mercadoLivreHeaders(token),
      next: { revalidate: 300 }
    });

    if ((response.status === 401 || response.status === 403) && token) {
      console.warn("[mercado-livre:search:retry-public]", response.status);
      response = await fetch(url, {
        headers: mercadoLivreHeaders(),
        next: { revalidate: 300 }
      });
    }

    if (!response.ok) {
      console.warn("[mercado-livre:search:fallback]", response.status, await response.text());
      return [];
    }

    const payload = (await response.json()) as MercadoLivreSearchResponse;
    const items = rankMercadoLivreItems(
      (payload.results ?? []).filter((item) => item.id && item.title && item.price),
      query,
      (item) => item.title
    );
    const products = await Promise.all(items.map((item) => upsertMercadoLivreProduct(item, intent)));
    return products.filter((product): product is Product => Boolean(product));
  } catch (error) {
    console.warn("[mercado-livre:search:error]", error);
    return [];
  }
}

function mercadoLivreHeaders(token?: string) {
  return {
    Accept: "application/json",
    "User-Agent": "atlas/0.1",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function searchMercadoLivreCatalog(query: string, intent: ProductIntent, token: string) {
  try {
    const url = new URL("https://api.mercadolibre.com/products/search");
    url.searchParams.set("site_id", "MLB");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", process.env.MERCADO_LIVRE_SEARCH_LIMIT ?? "8");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "atlas/0.1"
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      console.warn("[mercado-livre:catalog-search:fallback]", response.status, await response.text());
      return [];
    }

    const payload = (await response.json()) as MercadoLivreCatalogSearchResponse;
    const items = rankMercadoLivreItems(
      (payload.results ?? []).filter((item) => item.id && item.name),
      query,
      (item) => [item.name, ...(item.attributes?.map((attribute) => attribute.value_name) ?? [])].filter(Boolean).join(" ")
    );
    const products = await Promise.all(items.map((item) => upsertMercadoLivreCatalogProduct(item, intent, query)));
    return products.filter((product): product is Product => Boolean(product));
  } catch (error) {
    console.warn("[mercado-livre:catalog-search:error]", error);
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

async function upsertMercadoLivreCatalogProduct(item: MercadoLivreCatalogProduct, intent: ProductIntent, query: string) {
  const shippingPrice = Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 12.9);
  const deliveryHours = Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 48);
  const title = item.name ?? query;
  const imageUrl =
    item.pictures?.find((picture) => picture.secure_url || picture.url)?.secure_url ??
    item.pictures?.find((picture) => picture.secure_url || picture.url)?.url?.replace(/^http:/, "https:") ??
    "https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.92/mercadolibre/logo__large_plus.png";
  const brand = inferBrand(title, intent.preferredBrand) || attributeValue(item, "BRAND") || "Mercado Livre";
  const searchUrl = `https://lista.mercadolivre.com.br/${slugify(query || title)}`;

  return prisma.product.upsert({
    where: { externalId: `mlb-catalog-${item.id}` },
    update: {
      title,
      brand,
      category: intent.category ?? "produto",
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "manual_operator",
      automationLevel: "real_catalog_manual_checkout",
      price: estimatedPriceForCategory(intent.category),
      shippingPrice,
      store: "Mercado Livre Catalogo",
      rating: item.status === "active" ? 4.2 : 4.0,
      deliveryEstimate: "Mercado Livre, produto real encontrado; preco/prazo a confirmar",
      deliveryHours,
      imageUrl,
      productUrl: item.permalink || searchUrl,
      availability: true
    },
    create: {
      externalId: `mlb-catalog-${item.id}`,
      title,
      brand,
      category: intent.category ?? "produto",
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "manual_operator",
      automationLevel: "real_catalog_manual_checkout",
      price: estimatedPriceForCategory(intent.category),
      shippingPrice,
      store: "Mercado Livre Catalogo",
      rating: item.status === "active" ? 4.2 : 4.0,
      deliveryEstimate: "Mercado Livre, produto real encontrado; preco/prazo a confirmar",
      deliveryHours,
      imageUrl,
      productUrl: item.permalink || searchUrl,
      availability: true
    }
  });
}

function fallbackMercadoLivreProducts(intent: ProductIntent) {
  return dbConnector("mercado_livre", "Mercado Livre").searchProducts(intent).then(async (products) => {
    if (products.length) return products;
    return fallbackGeneratedProducts(intent);
  });
}

function isSpecificSearch(intent: ProductIntent, query: string) {
  if (!intent.searchQuery) return false;
  const category = intent.category ? normalize(intent.category) : "";
  const normalizedQuery = normalize(query);
  return normalizedQuery !== category && significantTokens(normalizedQuery).length > 1;
}

function buildSearchQuery(intent: ProductIntent) {
  const explicitQuery = intent.searchQuery?.trim();
  if (explicitQuery) {
    const normalizedQuery = normalize(explicitQuery);
    const normalizedBrand = intent.preferredBrand ? normalize(intent.preferredBrand) : "";
    if (normalizedBrand && !normalizedQuery.includes(normalizedBrand)) {
      return `${intent.preferredBrand} ${explicitQuery}`.trim();
    }
    return explicitQuery;
  }
  return [intent.preferredBrand, intent.category].filter(Boolean).join(" ").trim();
}

function inferBrand(title: string, preferredBrand?: string) {
  if (preferredBrand && title.toLowerCase().includes(preferredBrand.toLowerCase())) return preferredBrand;
  const knownBrands = ["Colgate", "Oral-B", "Curaprox", "Sorriso", "Pantene", "Seda", "Kleenex", "Nivea", "Rexona", "Anker", "Duracell", "Crystal", "Lacta"];
  return knownBrands.find((brand) => title.toLowerCase().includes(brand.toLowerCase())) ?? "Mercado Livre";
}

function attributeValue(item: MercadoLivreCatalogProduct, id: string) {
  return item.attributes?.find((attribute) => attribute.id === id)?.value_name;
}

function estimatedPriceForCategory(category?: string) {
  const prices: Record<string, number> = {
    "escova de dente": 14.9,
    "pasta de dente": 12.9,
    shampoo: 24.9,
    "lenco de papel": 9.9,
    "protetor solar": 49.9,
    desodorante: 18.9,
    carregador: 49.9,
    pilhas: 19.9,
    agua: 6.9,
    chocolate: 8.9,
    livro: 29.9,
    camiseta: 49.9
  };
  return prices[category ?? ""] ?? 29.9;
}

async function fallbackGeneratedProducts(intent: ProductIntent) {
  if (normalize([intent.category, intent.searchQuery].filter(Boolean).join(" ")).includes("camiseta")) {
    return Promise.all(
      [
        {
          externalId: "atlas-camiseta-preta-basica",
          title: "Camiseta Preta Basica Algodao",
          brand: "Atlas Curadoria",
          source: "loja_local",
          store: "Loja local parceira",
          price: 39.9,
          shippingPrice: 8.9,
          deliveryHours: 3,
          deliveryEstimate: "Hoje, em ate 3 horas",
          imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80"
        },
        {
          externalId: "atlas-camiseta-preta-premium",
          title: "Camiseta Preta Premium Lisa",
          brand: "Atlas Curadoria",
          source: "mercado_livre",
          store: "Marketplace parceiro",
          price: 59.9,
          shippingPrice: 12.9,
          deliveryHours: 48,
          deliveryEstimate: "Entrega estimada em 1-2 dias",
          imageUrl: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=700&q=80"
        },
        {
          externalId: "atlas-camiseta-preta-dry",
          title: "Camiseta Preta Dry Fit",
          brand: "Atlas Curadoria",
          source: "rappi",
          store: "Rappi Mock",
          price: 49.9,
          shippingPrice: 10.9,
          deliveryHours: 2,
          deliveryEstimate: "Hoje, em ate 2 horas",
          imageUrl: "https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=700&q=80"
        },
        {
          externalId: "atlas-camiseta-preta-oversized",
          title: "Camiseta Preta Oversized",
          brand: "Atlas Curadoria",
          source: "mercado_livre",
          store: "Marketplace parceiro",
          price: 69.9,
          shippingPrice: 12.9,
          deliveryHours: 48,
          deliveryEstimate: "Entrega estimada em 1-2 dias",
          imageUrl: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=700&q=80"
        },
        {
          externalId: "atlas-camiseta-preta-gola-v",
          title: "Camiseta Preta Gola V",
          brand: "Atlas Curadoria",
          source: "loja_local",
          store: "Loja local parceira",
          price: 44.9,
          shippingPrice: 8.9,
          deliveryHours: 4,
          deliveryEstimate: "Hoje, em ate 4 horas",
          imageUrl: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=700&q=80"
        },
        {
          externalId: "atlas-camiseta-preta-pack",
          title: "Kit 2 Camisetas Pretas",
          brand: "Atlas Curadoria",
          source: "mercado_livre",
          store: "Marketplace parceiro",
          price: 89.9,
          shippingPrice: 12.9,
          deliveryHours: 48,
          deliveryEstimate: "Entrega estimada em 1-2 dias",
          imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=700&q=80"
        }
      ].map((product) =>
        prisma.product.upsert({
          where: { externalId: product.externalId },
          update: {
            title: product.title,
            brand: product.brand,
            category: "camiseta",
            source: product.source,
            sourceType: product.source === "loja_local" ? "local_store" : "marketplace",
            fulfillmentMode: product.source === "loja_local" ? "local_courier" : "manual_operator",
            automationLevel: "mock_manual_checkout",
            price: product.price,
            shippingPrice: product.shippingPrice,
            store: product.store,
            rating: 4.1,
            deliveryEstimate: product.deliveryEstimate,
            deliveryHours: product.deliveryHours,
            imageUrl: product.imageUrl,
            productUrl: `https://lista.mercadolivre.com.br/${slugify(product.title)}`,
            availability: true
          },
          create: {
            externalId: product.externalId,
            title: product.title,
            brand: product.brand,
            category: "camiseta",
            source: product.source,
            sourceType: product.source === "loja_local" ? "local_store" : "marketplace",
            fulfillmentMode: product.source === "loja_local" ? "local_courier" : "manual_operator",
            automationLevel: "mock_manual_checkout",
            price: product.price,
            shippingPrice: product.shippingPrice,
            store: product.store,
            rating: 4.1,
            deliveryEstimate: product.deliveryEstimate,
            deliveryHours: product.deliveryHours,
            imageUrl: product.imageUrl,
            productUrl: `https://lista.mercadolivre.com.br/${slugify(product.title)}`,
            availability: true
          }
        })
      )
    );
  }

  return [];
}

function rankMercadoLivreItems<T>(items: T[], query: string, textFor: (item: T) => string) {
  const tokens = significantTokens(query);
  if (!tokens.length) return items;

  return items
    .map((item) => {
      const text = normalize(textFor(item));
      const matched = tokens.filter((token) => text.includes(token));
      const contiguousBoost = text.includes(normalize(query)) ? 5 : 0;
      return {
        item,
        score: matched.length * 2 + contiguousBoost
      };
    })
    .filter(({ score }) => {
      if (tokens.length <= 1) return score > 0;
      return score >= tokens.length * 2;
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function significantTokens(query: string) {
  const stopwords = new Set([
    "quero",
    "queria",
    "preciso",
    "comprar",
    "compra",
    "produto",
    "mercado",
    "livre",
    "para",
    "pra",
    "com",
    "sem",
    "uma",
    "uns",
    "das",
    "dos",
    "the",
    "and"
  ]);

  const tokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token));

  return Array.from(new Set(tokens));
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
