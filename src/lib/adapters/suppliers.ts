import type { Product } from "@prisma/client";
import { createHash } from "crypto";
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
    if (isSpecificSearch(intent, query)) {
      return process.env.ATLAS_ALLOW_GENERATED_FALLBACKS === "true" ? fallbackGeneratedProducts(intent) : [];
    }

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

type MercadoLivreTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
};

type MercadoLivreCatalogSearchResponse = {
  results?: MercadoLivreCatalogProduct[];
};

type UnwrangleSearchResponse = {
  results?: UnwrangleProduct[];
  search_results?: UnwrangleProduct[];
  items?: UnwrangleProduct[];
  data?: UnwrangleProduct[];
};

type UnwrangleProduct = {
  title?: string;
  name?: string;
  price?: string | number;
  raw_price?: string | number;
  current_price?: string | number;
  url?: string;
  link?: string;
  product_url?: string;
  thumbnail?: string;
  image?: string;
  image_url?: string;
  rating?: string | number;
  seller?: string;
  store?: string;
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
  const token = await getMercadoLivreAccessToken();
  if (process.env.MERCADO_LIVRE_REAL_SEARCH !== "true" && !token) return [];

  try {
    const marketplaceProducts = await searchMercadoLivreMarketplace(query, intent, token);
    if (marketplaceProducts.length) return marketplaceProducts;

    const externalProducts = await searchMercadoLivreViaUnwrangle(query, intent);
    if (externalProducts.length) return externalProducts;

    const catalogToken = await getMercadoLivreAccessToken();
    if (catalogToken) {
      const catalogProducts = await searchMercadoLivreCatalog(query, intent, catalogToken);
      if (catalogProducts.length) return catalogProducts;
    }

    return [];
  } catch (error) {
    console.warn("[mercado-livre:search:error]", error);
    return [];
  }
}

async function searchMercadoLivreMarketplace(query: string, intent: ProductIntent, token?: string) {
  const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", process.env.MERCADO_LIVRE_SEARCH_LIMIT ?? "12");

  let response = await fetch(url, {
    headers: mercadoLivreHeaders(token),
    next: { revalidate: 300 }
  });

  if ((response.status === 401 || response.status === 403) && token) {
    const refreshedToken = response.status === 401 ? await refreshMercadoLivreAccessToken() : null;
    if (refreshedToken) {
      console.warn("[mercado-livre:search:retry-refreshed]", response.status);
      response = await fetch(url, {
        headers: mercadoLivreHeaders(refreshedToken),
        next: { revalidate: 300 }
      });
    } else {
      console.warn("[mercado-livre:search:retry-public]", response.status);
      response = await fetch(url, {
        headers: mercadoLivreHeaders(),
        next: { revalidate: 300 }
      });
    }
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
  const products = await Promise.all(items.map((item) => upsertMercadoLivreProduct(item, intent, query)));
  return products.filter((product): product is Product => Boolean(product));
}

function mercadoLivreHeaders(token?: string) {
  return {
    Accept: "application/json",
    "User-Agent": "atlas/0.1",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

let mercadoLivreTokenCache: { accessToken: string; refreshToken?: string; expiresAt: number } | null = null;

async function getMercadoLivreAccessToken() {
  if (mercadoLivreTokenCache && mercadoLivreTokenCache.expiresAt > Date.now() + 60_000) {
    return mercadoLivreTokenCache.accessToken;
  }

  return process.env.MERCADO_LIVRE_ACCESS_TOKEN;
}

async function refreshMercadoLivreAccessToken() {
  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET;
  const refreshToken = mercadoLivreTokenCache?.refreshToken ?? process.env.MERCADO_LIVRE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      }),
      cache: "no-store"
    });

    const payload = (await response.json()) as MercadoLivreTokenResponse;
    if (!response.ok || !payload.access_token) {
      console.warn("[mercado-livre:token-refresh:fallback]", response.status, payload.error ?? payload.message ?? "unknown");
      return null;
    }

    mercadoLivreTokenCache = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: Date.now() + Math.max((payload.expires_in ?? 3600) - 60, 60) * 1000
    };

    return payload.access_token;
  } catch (error) {
    console.warn("[mercado-livre:token-refresh:error]", error);
    return null;
  }
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

async function searchMercadoLivreViaUnwrangle(query: string, intent: ProductIntent) {
  const apiKey = process.env.UNWRANGLE_API_KEY;
  if (!apiKey) return [];

  try {
    const url = new URL(process.env.UNWRANGLE_MERCADO_LIVRE_URL ?? "https://data.unwrangle.com/api/getter/");
    url.searchParams.set("platform", process.env.UNWRANGLE_MERCADO_LIVRE_PLATFORM ?? "mercado_search");
    url.searchParams.set("search", query);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "atlas/0.1"
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      console.warn("[mercado-livre:unwrangle:fallback]", response.status, await response.text());
      return [];
    }

    const payload = (await response.json()) as UnwrangleSearchResponse;
    const rawItems = payload.results ?? payload.search_results ?? payload.items ?? payload.data ?? [];
    const items = rankMercadoLivreItems(
      rawItems.filter((item) => unwrangleTitle(item) && unwranglePrice(item) > 0),
      query,
      (item) => unwrangleTitle(item)
    );
    const products = await Promise.all(items.map((item) => upsertUnwrangleMercadoLivreProduct(item, intent, query)));
    return products.filter((product): product is Product => Boolean(product));
  } catch (error) {
    console.warn("[mercado-livre:unwrangle:error]", error);
    return [];
  }
}

async function upsertMercadoLivreProduct(item: MercadoLivreItem, intent: ProductIntent, query: string) {
  const shippingPrice = item.shipping?.free_shipping ? 0 : Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 12.9);
  const deliveryHours = Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 48);
  const imageUrl = item.thumbnail?.replace(/^http:/, "https:") ?? "https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.92/mercadolibre/logo__large_plus.png";
  const brand = inferBrand(item.title, intent.preferredBrand);

  return prisma.product.upsert({
    where: { externalId: `mlb-${item.id}` },
    update: {
      title: item.title,
      brand,
      category: intent.category ?? query,
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "marketplace_native",
      automationLevel: "real_search_manual_checkout",
      price: Number(item.price ?? 0),
      shippingPrice,
      store: item.seller?.nickname ? `Mercado Livre: ${item.seller.nickname}` : "Mercado Livre",
      rating: 4.3,
      deliveryEstimate: deliveryHours <= 24 ? "Entrega estimada em até 24h" : "Entrega estimada em 1-2 dias",
      deliveryHours,
      imageUrl,
      productUrl: item.permalink ?? `https://www.mercadolivre.com.br/p/${item.id}`,
      availability: true
    },
    create: {
      externalId: `mlb-${item.id}`,
      title: item.title,
      brand,
      category: intent.category ?? query,
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "marketplace_native",
      automationLevel: "real_search_manual_checkout",
      price: Number(item.price ?? 0),
      shippingPrice,
      store: item.seller?.nickname ? `Mercado Livre: ${item.seller.nickname}` : "Mercado Livre",
      rating: 4.3,
      deliveryEstimate: deliveryHours <= 24 ? "Entrega estimada em até 24h" : "Entrega estimada em 1-2 dias",
      deliveryHours,
      imageUrl,
      productUrl: item.permalink ?? `https://www.mercadolivre.com.br/p/${item.id}`,
      availability: true
    }
  });
}

async function upsertUnwrangleMercadoLivreProduct(item: UnwrangleProduct, intent: ProductIntent, query: string) {
  const title = unwrangleTitle(item);
  const productUrl = absoluteMercadoLivreUrl(item.url ?? item.link ?? item.product_url ?? `https://lista.mercadolivre.com.br/${slugify(query)}`);
  const externalId = `mlb-ext-${hashProductIdentity(productUrl || title)}`;
  const shippingPrice = Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 12.9);
  const deliveryHours = Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 48);
  const imageUrl =
    normalizeImageUrl(item.thumbnail ?? item.image ?? item.image_url) ??
    "https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.92/mercadolibre/logo__large_plus.png";
  const brand = inferBrand(title, intent.preferredBrand);
  const rating = Number(item.rating ?? 4.2);

  return prisma.product.upsert({
    where: { externalId },
    update: {
      title,
      brand,
      category: intent.category ?? query,
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "manual_operator",
      automationLevel: "real_external_search",
      price: unwranglePrice(item),
      shippingPrice,
      store: item.store ?? item.seller ?? "Mercado Livre",
      rating: Number.isFinite(rating) ? rating : 4.2,
      deliveryEstimate: deliveryHours <= 24 ? "Entrega estimada em até 24h" : "Entrega estimada em 1-2 dias",
      deliveryHours,
      imageUrl,
      productUrl,
      availability: true
    },
    create: {
      externalId,
      title,
      brand,
      category: intent.category ?? query,
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "manual_operator",
      automationLevel: "real_external_search",
      price: unwranglePrice(item),
      shippingPrice,
      store: item.store ?? item.seller ?? "Mercado Livre",
      rating: Number.isFinite(rating) ? rating : 4.2,
      deliveryEstimate: deliveryHours <= 24 ? "Entrega estimada em até 24h" : "Entrega estimada em 1-2 dias",
      deliveryHours,
      imageUrl,
      productUrl,
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
      deliveryEstimate: "Entrega estimada em 1-2 dias",
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
      deliveryEstimate: "Entrega estimada em 1-2 dias",
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
    camiseta: 49.9,
    "camisa social": 79.9
  };
  return prices[category ?? ""] ?? 29.9;
}

async function fallbackGeneratedProducts(intent: ProductIntent) {
  const query = normalize([intent.category, intent.searchQuery].filter(Boolean).join(" "));
  if (!/\b(camisa|camiseta|blusa|t shirt|tshirt)\b/.test(query)) return [];

  const isSocial = /\bsocial\b/.test(query);
  const color = /\b(branca|branco|white)\b/.test(query) ? "Branca" : /\b(preta|preto|black)\b/.test(query) ? "Preta" : "";
  const category = isSocial ? "camisa social" : "camiseta";
  const baseTitle = isSocial ? `Camisa Social ${color}`.trim() : `Camiseta ${color}`.trim();

  return Promise.all(
    generatedApparelProducts(baseTitle, category, isSocial).map((product) => upsertGeneratedProduct(product, category))
  );
}

function generatedApparelProducts(baseTitle: string, category: string, isSocial: boolean) {
  const imageUrl = isSocial
    ? "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=700&q=80"
    : "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80";

  return [
    {
      externalId: `atlas-${slugify(baseTitle)}-local`,
      title: `${baseTitle} Regular`,
      brand: "Atlas Curadoria",
      source: "loja_local" as SupplierSource,
      store: "Loja local parceira",
      price: isSocial ? 79.9 : 39.9,
      shippingPrice: 8.9,
      deliveryHours: 3,
      deliveryEstimate: "Hoje, em até 3 horas",
      imageUrl
    },
    {
      externalId: `atlas-${slugify(baseTitle)}-premium`,
      title: `${baseTitle} Premium`,
      brand: "Atlas Curadoria",
      source: "mercado_livre" as SupplierSource,
      store: "Marketplace parceiro",
      price: isSocial ? 119.9 : 59.9,
      shippingPrice: 12.9,
      deliveryHours: 48,
      deliveryEstimate: "Entrega estimada em 1-2 dias",
      imageUrl
    },
    {
      externalId: `atlas-${slugify(baseTitle)}-slim`,
      title: `${baseTitle} Slim`,
      brand: "Atlas Curadoria",
      source: "rappi" as SupplierSource,
      store: "Rappi Mock",
      price: isSocial ? 99.9 : 49.9,
      shippingPrice: 10.9,
      deliveryHours: 2,
      deliveryEstimate: "Hoje, em até 2 horas",
      imageUrl
    },
    {
      externalId: `atlas-${slugify(baseTitle)}-kit`,
      title: `Kit 2 ${pluralizeApparelTitle(baseTitle, isSocial)}`,
      brand: "Atlas Curadoria",
      source: "mercado_livre" as SupplierSource,
      store: "Marketplace parceiro",
      price: isSocial ? 179.9 : 89.9,
      shippingPrice: 12.9,
      deliveryHours: 48,
      deliveryEstimate: "Entrega estimada em 1-2 dias",
      imageUrl
    },
    {
      externalId: `atlas-${slugify(baseTitle)}-confort`,
      title: `${baseTitle} Comfort`,
      brand: "Atlas Curadoria",
      source: "loja_local" as SupplierSource,
      store: "Loja local parceira",
      price: isSocial ? 89.9 : 44.9,
      shippingPrice: 8.9,
      deliveryHours: 4,
      deliveryEstimate: "Hoje, em até 4 horas",
      imageUrl
    },
    {
      externalId: `atlas-${slugify(baseTitle)}-classica`,
      title: `${baseTitle} Clássica`,
      brand: "Atlas Curadoria",
      source: "mercado_livre" as SupplierSource,
      store: "Marketplace parceiro",
      price: isSocial ? 109.9 : 69.9,
      shippingPrice: 12.9,
      deliveryHours: 48,
      deliveryEstimate: "Entrega estimada em 1-2 dias",
      imageUrl
    }
  ];
}

function pluralizeApparelTitle(baseTitle: string, isSocial: boolean) {
  if (isSocial) {
    return baseTitle
      .replace(/^Camisa Social Branca/i, "Camisas Sociais Brancas")
      .replace(/^Camisa Social Preta/i, "Camisas Sociais Pretas")
      .replace(/^Camisa Social/i, "Camisas Sociais");
  }
  return `${baseTitle}s`;
}

function upsertGeneratedProduct(product: ReturnType<typeof generatedApparelProducts>[number], category: string) {
  const data = {
    title: product.title,
    brand: product.brand,
    category,
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
  };

  return prisma.product.upsert({
    where: { externalId: product.externalId },
    update: data,
    create: {
      externalId: product.externalId,
      ...data
    }
  });
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

function unwrangleTitle(item: UnwrangleProduct) {
  return (item.title ?? item.name ?? "").trim();
}

function unwranglePrice(item: UnwrangleProduct) {
  const value = item.raw_price ?? item.current_price ?? item.price;
  if (typeof value === "number") return value;
  if (!value) return 0;

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const price = Number(normalized);
  return Number.isFinite(price) ? price : 0;
}

function normalizeImageUrl(url?: string) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url.replace(/^http:/, "https:");
}

function absoluteMercadoLivreUrl(url?: string) {
  if (!url) return "https://www.mercadolivre.com.br";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return new URL(url, "https://www.mercadolivre.com.br").toString();
}

function hashProductIdentity(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
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
