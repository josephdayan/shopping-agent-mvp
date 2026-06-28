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
      return envFlag("LIA_ALLOW_GENERATED_FALLBACKS", "ATLAS_ALLOW_GENERATED_FALLBACKS") ? fallbackGeneratedProducts(intent) : [];
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

type ApifyProduct = Record<string, unknown>;

type ApifySearchJobMetadata = {
  jobId: string;
  conversationId: string;
  phone: string;
  intent: ProductIntent;
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
  const shouldTryApify = Boolean(process.env.APIFY_API_TOKEN);
  const shouldTryUnwrangle = Boolean(process.env.UNWRANGLE_API_KEY);
  // The official Mercado Livre listings API is blocked/limited for this account
  // (returns 401/403), so we only call it when explicitly opted in. Apify is the
  // authoritative source for real photos and real prices.
  const shouldTryMercadoLivreOfficial = process.env.MERCADO_LIVRE_REAL_SEARCH === "true";

  if (!shouldTryApify && !shouldTryUnwrangle && !shouldTryMercadoLivreOfficial) {
    console.warn("[mercado-livre:search:no-backend] Set APIFY_API_TOKEN to enable real product search.");
    return [];
  }

  try {
    if (shouldTryApify) {
      const apifyProducts = await searchMercadoLivreViaApify(query, intent);
      if (apifyProducts.length) return apifyProducts;
    }

    if (shouldTryUnwrangle) {
      const externalProducts = await searchMercadoLivreViaUnwrangle(query, intent);
      if (externalProducts.length) return externalProducts;
    }

    if (shouldTryMercadoLivreOfficial) {
      const mercadoLivreToken = await getMercadoLivreAccessToken();
      const marketplaceProducts = await searchMercadoLivreMarketplace(query, intent, mercadoLivreToken);
      if (marketplaceProducts.length) return marketplaceProducts;
    }

    return [];
  } catch (error) {
    console.warn("[mercado-livre:search:error]", error);
    return [];
  }
}

async function searchMercadoLivreViaApify(query: string, intent: ProductIntent) {
  const token = process.env.APIFY_API_TOKEN;
  const actor = process.env.APIFY_MERCADO_LIVRE_ACTOR ?? "karamelo/mercadolivre-scraper-brasil-portugues";
  if (!token) {
    console.warn("[mercado-livre:apify:no-token] APIFY_API_TOKEN is not set; cannot run real search.");
    return [];
  }
  if (!actor) return [];

  try {
    const actorId = actor.replace("/", "~");
    const payload = await runApifyActorCached(actorId, token, query, intent);
    if (!payload) return [];

    const usable = payload.filter((item) => apifyTitle(item) && apifyPrice(item) > 0);
    const ranked = rankMercadoLivreItems(usable, query, (item) => apifyTitle(item));
    if (!ranked.length) {
      console.warn("[mercado-livre:apify:empty]", {
        query,
        received: payload.length,
        withTitleAndPrice: usable.length
      });
      return [];
    }
    const items = selectApifyBatch(ranked, intent);
    const products = await Promise.all(items.map((item) => upsertApifyMercadoLivreProduct(item, intent, query)));
    return products.filter((product): product is Product => Boolean(product));
  } catch (error) {
    console.warn("[mercado-livre:apify:error]", error);
    return [];
  }
}

export async function startMercadoLivreApifySearchJob(metadata: ApifySearchJobMetadata) {
  const token = process.env.APIFY_API_TOKEN;
  const actor = process.env.APIFY_MERCADO_LIVRE_ACTOR ?? "karamelo/mercadolivre-scraper-brasil-portugues";
  const query = buildSearchQuery(metadata.intent);
  if (!token || !actor || !query) return null;

  const callbackUrl = mercadoLivreApifyCallbackUrl();
  if (!callbackUrl) return null;

  const actorId = actor.replace("/", "~");
  const webhooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
      requestUrl: callbackUrl,
      payloadTemplate: JSON.stringify({
        eventType: "{{eventType}}",
        resource: "{{resource}}",
        metadata: encodeJobMetadata(metadata)
      }).replace('"{{resource}}"', "{{resource}}")
    }
  ];
  const url = new URL(`https://api.apify.com/v2/acts/${actorId}/runs`);
  url.searchParams.set("token", token);
  url.searchParams.set("webhooks", Buffer.from(JSON.stringify(webhooks)).toString("base64"));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "lia/0.1" },
    body: JSON.stringify(buildApifyMercadoLivreInput(query, metadata.intent)),
    cache: "no-store"
  });

  if (!response.ok) {
    console.warn("[mercado-livre:apify:job-start-failed]", response.status, await response.text().catch(() => ""));
    return null;
  }

  const payload = (await response.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  return {
    runId: payload.data?.id,
    datasetId: payload.data?.defaultDatasetId,
    query
  };
}

export async function getMercadoLivreApifyProductsFromRun(runId: string, intent: ProductIntent) {
  const token = process.env.APIFY_API_TOKEN;
  const query = buildSearchQuery(intent);
  if (!token || !runId || !query) return [];

  const items = await fetchApifyRunDataset(runId, token);
  if (!items?.length) return [];

  const usable = items.filter((item) => apifyTitle(item) && apifyPrice(item) > 0);
  const ranked = rankMercadoLivreItems(usable, query, (item) => apifyTitle(item));
  const selected = selectApifyBatch(ranked, intent);
  const products = await Promise.all(selected.map((item) => upsertApifyMercadoLivreProduct(item, intent, query)));
  return products.filter((product): product is Product => Boolean(product));
}

export function decodeApifySearchJobMetadata(value: unknown): ApifySearchJobMetadata | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ApifySearchJobMetadata;
  } catch {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as ApifySearchJobMetadata;
    } catch {
      return null;
    }
  }
}

// In-memory cache of raw Apify datasets keyed by query, so repeated and refined
// searches (e.g. the user sending "garrafa de agua" three times, or "me manda
// outras") reuse one scrape instead of burning Apify quota on every message.
// The cached dataset is the full page; client-side slicing still varies by offset.
const apifyResultCache = new Map<string, { at: number; items: ApifyProduct[] }>();

async function runApifyActorCached(actorId: string, token: string, query: string, intent: ProductIntent) {
  const ttl = Number(process.env.APIFY_CACHE_TTL_MS ?? 600000);
  const key = `${actorId}|${normalize(query)}`;
  const hit = apifyResultCache.get(key);
  if (hit && Number.isFinite(ttl) && ttl > 0 && Date.now() - hit.at < ttl) {
    return hit.items;
  }

  const items = await runApifyActor(actorId, token, buildApifyMercadoLivreInput(query, intent));
  if (items && items.length) {
    apifyResultCache.set(key, { at: Date.now(), items });
    if (apifyResultCache.size > 200) {
      const oldest = [...apifyResultCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
      if (oldest) apifyResultCache.delete(oldest);
    }
  }
  return items;
}

// Drive the Apify actor run explicitly: start the run, poll until it finishes,
// then read the dataset. The synchronous run-sync-get-dataset-items endpoint is
// unreliable for the Mercado Livre scraper — on a cold start it returns 502 or a
// 200 with an EMPTY dataset (the run is aborted before it scrapes), which is what
// made production return "Não encontrei uma opção boa para essa busca".
async function runApifyActor(actorId: string, token: string, input: unknown): Promise<ApifyProduct[] | null> {
  const startResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "lia/0.1" },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!startResponse.ok) {
    console.warn("[mercado-livre:apify:start-failed]", startResponse.status, await startResponse.text().catch(() => ""));
    return null;
  }

  const startPayload = (await startResponse.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = startPayload.data?.id;
  const datasetId = startPayload.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    console.warn("[mercado-livre:apify:no-run-id]");
    return null;
  }

  const maxWaitMs = Number(process.env.APIFY_MERCADO_LIVRE_MAX_WAIT_MS ?? 90000);
  const pollEveryMs = Number(process.env.APIFY_MERCADO_LIVRE_POLL_MS ?? 2500);
  const deadline = Date.now() + (Number.isFinite(maxWaitMs) ? maxWaitMs : 45000);
  let status = "READY";

  while (Date.now() < deadline) {
    await delay(pollEveryMs);
    const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, { cache: "no-store" });
    if (!runResponse.ok) continue;
    const runPayload = (await runResponse.json()) as { data?: { status?: string } };
    status = runPayload.data?.status ?? status;
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMING-OUT"].includes(status)) break;
  }

  if (status !== "SUCCEEDED") {
    // Still read whatever landed in the dataset — partial real results beat none.
    console.warn("[mercado-livre:apify:run-not-ready]", { runId, status });
  }

  return fetchApifyDatasetItems(datasetId, token);
}

async function fetchApifyRunDataset(runId: string, token: string) {
  const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, { cache: "no-store" });
  if (!runResponse.ok) {
    console.warn("[mercado-livre:apify:run-fetch-failed]", runResponse.status);
    return null;
  }
  const runPayload = (await runResponse.json()) as { data?: { defaultDatasetId?: string } };
  const datasetId = runPayload.data?.defaultDatasetId;
  if (!datasetId) return null;
  return fetchApifyDatasetItems(datasetId, token);
}

async function fetchApifyDatasetItems(datasetId: string, token: string) {
  const itemsResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true`,
    { cache: "no-store" }
  );
  if (!itemsResponse.ok) {
    console.warn("[mercado-livre:apify:dataset-failed]", itemsResponse.status);
    return null;
  }
  const items = (await itemsResponse.json()) as ApifyProduct[];
  return Array.isArray(items) ? items : [];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchMercadoLivreMarketplace(query: string, intent: ProductIntent, token?: string) {
  const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", process.env.MERCADO_LIVRE_SEARCH_LIMIT ?? "12");

  let response = await fetch(url, {
    headers: mercadoLivreHeaders(token),
    next: { revalidate: 300 }
  });

  // The official ML listings API is gated for this account (always 401/403). Don't
  // burn the function budget on token-refresh + public retries — fail fast so the
  // Apify path stays authoritative and slow cold starts still fit in 60s.
  if (response.status === 401 || response.status === 403) {
    console.warn("[mercado-livre:search:gated]", response.status);
    return [];
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
    "User-Agent": "lia/0.1",
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
        "User-Agent": "lia/0.1"
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
        "User-Agent": "lia/0.1"
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

async function upsertApifyMercadoLivreProduct(item: ApifyProduct, intent: ProductIntent, query: string) {
  const title = apifyTitle(item);
  const rawProductUrl = apifyUrl(item);
  const imageUrl = normalizeImageUrl(apifyImageUrl(item));
  const price = apifyPrice(item);
  if (!title || !imageUrl || price <= 0 || isMercadoLivreLogo(imageUrl)) return null;

  const productUrl = absoluteMercadoLivreUrl(rawProductUrl || `https://lista.mercadolivre.com.br/${slugify(title || query)}`);
  const externalId = `mlb-apify-${hashProductIdentity(rawProductUrl || `${canonicalProductKey(title)}|${imageUrl}|${price}`)}`;
  const shippingPrice = apifyShippingPrice(item) ?? Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 0);
  const deliveryEstimate = apifyDeliveryEstimate(item);
  const deliveryHours = deliveryHoursFromEstimate(deliveryEstimate) ?? Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 72);
  const brand = inferBrand(title, intent.preferredBrand, apifyBrand(item));
  const rating = apifyRating(item) ?? 4.2;

  return prisma.product.upsert({
    where: { externalId },
    update: {
      title,
      brand,
      category: intent.category ?? query,
      source: "mercado_livre",
      sourceType: "marketplace",
      fulfillmentMode: "manual_operator",
      automationLevel: "real_apify_search",
      price,
      shippingPrice,
      store: apifyStore(item) ?? "Mercado Livre",
      rating,
      deliveryEstimate: deliveryEstimate ?? "Prazo informado no link",
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
      automationLevel: "real_apify_search",
      price,
      shippingPrice,
      store: apifyStore(item) ?? "Mercado Livre",
      rating,
      deliveryEstimate: deliveryEstimate ?? "Prazo informado no link",
      deliveryHours,
      imageUrl,
      productUrl,
      availability: true
    }
  });
}

async function upsertMercadoLivreProduct(item: MercadoLivreItem, intent: ProductIntent, query: string) {
  const shippingPrice = item.shipping?.free_shipping ? 0 : Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 12.9);
  const deliveryHours = Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 48);
  const imageUrl = normalizeImageUrl(item.thumbnail);
  if (!imageUrl || isMercadoLivreLogo(imageUrl) || !item.price) return null;
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
  const price = unwranglePrice(item);
  const imageUrl = normalizeImageUrl(item.thumbnail ?? item.image ?? item.image_url);
  if (!title || price <= 0 || !imageUrl || isMercadoLivreLogo(imageUrl)) return null;

  const shippingPrice = Number(process.env.MERCADO_LIVRE_DEFAULT_SHIPPING ?? 0);
  const deliveryHours = Number(process.env.MERCADO_LIVRE_DEFAULT_DELIVERY_HOURS ?? 48);
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
      price,
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
      price,
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
  const explicitQuery = enrichSupplierSearchQuery(intent.searchQuery?.trim() ?? "", intent);
  if (explicitQuery) {
    const normalizedQuery = normalize(explicitQuery);
    const normalizedBrand = intent.preferredBrand ? normalize(intent.preferredBrand) : "";
    if (normalizedBrand && !normalizedQuery.includes(normalizedBrand)) {
      return `${intent.preferredBrand} ${explicitQuery}`.trim();
    }
    return explicitQuery;
  }
  return enrichSupplierSearchQuery([intent.preferredBrand, intent.category].filter(Boolean).join(" "), intent);
}

function inferBrand(title: string, preferredBrand?: string, explicitBrand?: string | null) {
  if (preferredBrand && title.toLowerCase().includes(preferredBrand.toLowerCase())) return preferredBrand;
  const knownBrands = [
    "Colgate",
    "Oral-B",
    "Curaprox",
    "Sorriso",
    "Pantene",
    "Seda",
    "Kleenex",
    "Nivea",
    "Rexona",
    "Anker",
    "Duracell",
    "Crystal",
    "Lacta",
    "Pampers",
    "Huggies",
    "Johnson",
    "Gran Plus",
    "Premier",
    "Royal Canin",
    "Pedigree",
    "Golden",
    "Special Dog",
    "Dog Chow",
    "Whiskas",
    "Special Cat"
  ];
  const known = knownBrands.find((brand) => title.toLowerCase().includes(brand.toLowerCase()));
  if (known) return known;
  if (explicitBrand && explicitBrand.toLowerCase() !== "mercado livre") return explicitBrand;
  return "Mercado Livre";
}

function enrichSupplierSearchQuery(query: string, intent: ProductIntent) {
  const parts = new Set(normalize(query).split(/\s+/).filter(Boolean));
  const filters = intent.productFilters;

  if (intent.preferredBrand) normalize(intent.preferredBrand).split(/\s+/).forEach((part) => parts.add(part));
  if (filters?.petType === "dog" || normalize(intent.category ?? "").includes("cachorro")) {
    parts.add("cachorro");
  }
  if (filters?.petType === "cat" || normalize(intent.category ?? "").includes("gato")) {
    parts.add("gato");
  }
  if (filters?.petSize === "small") ["porte", "pequeno"].forEach((part) => parts.add(part));
  if (filters?.petSize === "medium") ["porte", "medio"].forEach((part) => parts.add(part));
  if (filters?.petSize === "large") ["porte", "grande"].forEach((part) => parts.add(part));
  if (filters?.lifeStage === "puppy") parts.add("filhote");
  if (filters?.lifeStage === "adult") parts.add("adulto");
  if (filters?.lifeStage === "senior") parts.add("senior");
  if (filters?.color) parts.add(normalize(filters.color));
  if (filters?.size) parts.add(normalize(filters.size));

  return Array.from(parts).join(" ").trim();
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
    "lenco umedecido": 19.9,
    "protetor solar": 49.9,
    desodorante: 18.9,
    carregador: 49.9,
    pilhas: 19.9,
    agua: 6.9,
    chocolate: 8.9,
    livro: 29.9,
    camiseta: 49.9,
    "camisa social": 79.9,
    "racao cachorro": 89.9,
    "racao gato": 79.9
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
      externalId: `lia-${slugify(baseTitle)}-local`,
      title: `${baseTitle} Regular`,
      brand: "Lia Curadoria",
      source: "loja_local" as SupplierSource,
      store: "Loja local parceira",
      price: isSocial ? 79.9 : 39.9,
      shippingPrice: 8.9,
      deliveryHours: 3,
      deliveryEstimate: "Hoje, em até 3 horas",
      imageUrl
    },
    {
      externalId: `lia-${slugify(baseTitle)}-premium`,
      title: `${baseTitle} Premium`,
      brand: "Lia Curadoria",
      source: "mercado_livre" as SupplierSource,
      store: "Marketplace parceiro",
      price: isSocial ? 119.9 : 59.9,
      shippingPrice: 12.9,
      deliveryHours: 48,
      deliveryEstimate: "Entrega estimada em 1-2 dias",
      imageUrl
    },
    {
      externalId: `lia-${slugify(baseTitle)}-slim`,
      title: `${baseTitle} Slim`,
      brand: "Lia Curadoria",
      source: "rappi" as SupplierSource,
      store: "Rappi Mock",
      price: isSocial ? 99.9 : 49.9,
      shippingPrice: 10.9,
      deliveryHours: 2,
      deliveryEstimate: "Hoje, em até 2 horas",
      imageUrl
    },
    {
      externalId: `lia-${slugify(baseTitle)}-kit`,
      title: `Kit 2 ${pluralizeApparelTitle(baseTitle, isSocial)}`,
      brand: "Lia Curadoria",
      source: "mercado_livre" as SupplierSource,
      store: "Marketplace parceiro",
      price: isSocial ? 179.9 : 89.9,
      shippingPrice: 12.9,
      deliveryHours: 48,
      deliveryEstimate: "Entrega estimada em 1-2 dias",
      imageUrl
    },
    {
      externalId: `lia-${slugify(baseTitle)}-confort`,
      title: `${baseTitle} Comfort`,
      brand: "Lia Curadoria",
      source: "loja_local" as SupplierSource,
      store: "Loja local parceira",
      price: isSocial ? 89.9 : 44.9,
      shippingPrice: 8.9,
      deliveryHours: 4,
      deliveryEstimate: "Hoje, em até 4 horas",
      imageUrl
    },
    {
      externalId: `lia-${slugify(baseTitle)}-classica`,
      title: `${baseTitle} Clássica`,
      brand: "Lia Curadoria",
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
  const normalizedQuery = normalize(query);
  const positiveTerms = queryExpansionTerms(normalizedQuery);
  const unwantedTerms = unwantedModifierTerms(normalizedQuery);

  const scored = items
    .map((item, index) => {
      const text = normalize(textFor(item));
      const matched = tokens.filter((token) => text.includes(token));
      const matchedExpanded = positiveTerms.filter((term) => text.includes(term));
      const unwantedMatches = unwantedTerms.filter((term) => containsWord(text, term));
      const contiguousBoost = text.includes(normalizedQuery) ? 8 : 0;
      const expandedBoost = matchedExpanded.length * 3;
      const unwantedPenalty = unwantedMatches.length * 12;
      const positionPenalty = Math.min(index, 30) * 0.05;
      return {
        item,
        score: matched.length * 4 + contiguousBoost + expandedBoost - unwantedPenalty - positionPenalty,
        unwantedMatches
      };
    })
    .filter(({ unwantedMatches }) => unwantedMatches.length === 0)
    .sort((a, b) => b.score - a.score);

  const passing = scored.filter(({ score }) => (tokens.length <= 1 ? score >= 4 : score >= tokens.length * 3.5));
  // If nothing clears the relevance bar, still surface the best non-junk matches
  // instead of returning nothing — better to show the closest items the scraper
  // found (and let the user refine) than to dead-end on zero.
  const chosen = passing.length ? passing : scored.slice(0, 3);
  return chosen.map(({ item }) => item);
}

function dedupeMercadoLivreItems<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = canonicalProductKey(keyFor(item));
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalProductKey(value: string) {
  return normalize(value)
    .replace(/\b(tamanho|tam|numero|n)\s*\d{1,3}\b/g, " ")
    .replace(/\b\d{2,3}\b/g, " ")
    .replace(/\b(pp|p|m|g|gg|xg|xgg|xp|xs|s|xl|xxl)\b/g, " ")
    .replace(/\b(preto|preta|branco|branca|azul|vermelho|vermelha|verde|rosa|marrom|cinza|bege)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryExpansionTerms(query: string) {
  const terms = new Set(significantTokens(query));

  if (/\b(sapato|sapatos|tenis|sneaker|calcado)\b/.test(query)) {
    ["sapato", "sapatos", "tenis", "sapatilha", "sapatilhas", "sapatênis", "sapatenis", "bota", "botas", "sneaker", "calcado", "calcados", "mocassim", "sandalia", "chinelo"].forEach((term) =>
      terms.add(normalize(term))
    );
  }

  if (/\b(lenco umedecido|baby wipes|wipes|toalha umedecida)\b/.test(query)) {
    ["lenco", "lenço", "toalha", "toalhas", "umedecido", "umedecida", "bebe", "bebê", "baby", "wipes"].forEach((term) => terms.add(normalize(term)));
  }

  if (/\b(racao|ração|dog food|cat food|cachorro|cao|gato|felino)\b/.test(query)) {
    ["racao", "ração", "alimento", "cachorro", "cao", "cão", "caes", "cães", "canino", "gato", "felino", "porte", "pequeno", "medio", "grande", "filhote", "adulto", "senior"].forEach((term) =>
      terms.add(normalize(term))
    );
  }

  if (/\b(violao|guitarra|baixo|ukulele)\b/.test(query)) {
    ["violao", "guitarra", "baixo", "ukulele", "instrumento"].forEach((term) => terms.add(term));
  }

  return Array.from(terms);
}

function unwantedModifierTerms(query: string) {
  const candidates = [
    "adesivo",
    "adesivos",
    "sticker",
    "stickers",
    "chaveiro",
    "keychain",
    "miniatura",
    "miniaturas",
    "boneco",
    "boneca",
    "pelucia",
    "brinquedo",
    "pingente",
    "pendente",
    "enfeite",
    "decoracao",
    "poster",
    "quadro",
    "caneca",
    "calcadeira",
    "chifre",
    "buzina",
    "forma",
    "formas",
    "palminha",
    "horn",
    "shoehorn",
    "shoe horn",
    "metal removivel",
    "cadargo",
    "cadarco",
    "cadarço",
    "capa",
    "case",
    "suporte",
    "apoio",
    "corda",
    "cordas",
    "peca",
    "peça",
    "pecas",
    "peças",
    "aroma",
    "aromas",
    "aromatizador",
    "ambientador",
    "fragrancia",
    "cheiro",
    "perfume",
    "purificador",
    "lavanda",
    "pinho",
    "petisco",
    "bifinho",
    "tapete",
    "comedouro",
    "bebedouro",
    "coleira",
    "guia",
    "areia",
    "suplemento"
  ];

  return candidates.map(normalize).filter((term) => !query.includes(term));
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
    "and",
    "porte",
    "pequeno",
    "pequena",
    "grande",
    "medio",
    "media",
    "mini",
    "adulto",
    "filhote",
    "senior"
  ]);

  const tokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token));

  return Array.from(new Set(tokens));
}

function buildApifyMercadoLivreInput(query: string, intent: ProductIntent) {
  const configuredPages = Number(process.env.APIFY_MERCADO_LIVRE_MAX_PAGES ?? 1);
  const displayLimit = batchSize(intent);
  const offset = batchOffset(intent);
  const candidateLimit = batchCandidateSize(intent);
  const maxItems = Math.max(candidateLimit + offset, candidateLimit);
  // The actor paginates by page (~48 items/page). Scrape enough pages to cover the
  // requested offset window so "me manda outras" can surface genuinely new results.
  const maxPages = Math.min(Math.max(Number.isFinite(configuredPages) ? configuredPages : 1, Math.ceil(maxItems / 40)), 3);
  return {
    // Primary param expected by karamelo/mercadolivre-scraper; aliases kept so the
    // search keeps working if APIFY_MERCADO_LIVRE_ACTOR points to a different actor.
    keyword: query,
    search: query,
    query,
    productName: query,
    nomeProduto: query,
    product: query,
    // Keyword search, never the daily-deals feed.
    scrapeOfertas: false,
    modoOfertasDoDia: false,
    ofertasFilter: "all",
    // Drop sponsored/"patrocinado" items so ads and accessories stop polluting results.
    promoted: false,
    sponsoredProducts: false,
    produtosPatrocinados: false,
    maxPages,
    maxPaginas: maxPages,
    maxPagesOfertas: 1,
    limit: candidateLimit,
    displayLimit,
    maxItems,
    max_items: maxItems,
    maxResults: maxItems,
    resultsLimit: maxItems,
    offset,
    start: offset,
    skip: offset
  };
}

function envFlag(liaKey: string, atlasKey: string) {
  return (process.env[liaKey] ?? process.env[atlasKey]) === "true";
}

function mercadoLivreApifyCallbackUrl() {
  const secret = process.env.APIFY_WEBHOOK_SECRET ?? process.env.WHATSAPP_WEBHOOK_SECRET ?? process.env.API_TOKEN;

  // When APIFY_MERCADO_LIVRE_CALLBACK_URL is set, STILL append the secret. The
  // callback validates it, so a URL without ?secret= is rejected with 401 and the
  // scraped results are silently dropped — the bug that broke WhatsApp delivery.
  const explicit = process.env.APIFY_MERCADO_LIVRE_CALLBACK_URL;
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (secret) url.searchParams.set("secret", secret);
      return url.toString();
    } catch {
      return explicit;
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!baseUrl) {
    console.warn("[mercado-livre:apify:no-callback-url] Set NEXT_PUBLIC_APP_URL or APIFY_MERCADO_LIVRE_CALLBACK_URL.");
    return null;
  }

  const url = new URL("/api/apify/mercadolivre/callback", baseUrl);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}

function encodeJobMetadata(metadata: ApifySearchJobMetadata) {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

function batchSize(intent: ProductIntent) {
  const value = Number(intent.searchBatchSize ?? process.env.LIA_SEARCH_BATCH_SIZE ?? process.env.ATLAS_SEARCH_BATCH_SIZE ?? 3);
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.min(Math.floor(value), 6);
}

function batchOffset(intent: ProductIntent) {
  const value = Number(intent.searchOffset ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function selectApifyBatch<T>(items: T[], intent: ProductIntent) {
  const limit = batchCandidateSize(intent);
  const offset = batchOffset(intent);
  const deduped = dedupeMercadoLivreItems(items, (item) => apifyTitle(item as ApifyProduct));
  if (offset <= 0) return deduped.slice(0, limit);
  if (deduped.length <= limit) return deduped;
  return deduped.slice(offset, offset + limit);
}

function batchCandidateSize(intent: ProductIntent) {
  const configured = Number(process.env.LIA_SEARCH_CANDIDATE_SIZE ?? process.env.ATLAS_SEARCH_CANDIDATE_SIZE);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 15);
  // Keep a bigger pool than we show (3): backfill if filtering over-cuts, and serve
  // "me manda outras" from the same scrape instead of hitting Apify again.
  return Math.min(Math.max(batchSize(intent) * 3, 9), 12);
}

function apifyTitle(item: ApifyProduct) {
  return stringFromUnknown(
    firstPresent(item, [
      "title",
      "name",
      "nome",
      "productName",
      "product_name",
      "titulo",
      "tituloProduto",
      "títuloProduto",
      "eTituloProduto",
      "titulo_do_produto"
    ])
  ).trim();
}

function apifyPrice(item: ApifyProduct) {
  return priceFromUnknown(
    firstPresent(item, [
      "price",
      "preco",
      "preço",
      "Preço",
      "currentPrice",
      "current_price",
      "rawPrice",
      "raw_price",
      "amount",
      "valor",
      "novoPreco",
      "Preço Novo",
      "preço novo",
      "precoNovo",
      "preçoNovo",
      "precoAtual",
      "preçoAtual",
      "current_price_text"
    ])
  );
}

function apifyShippingPrice(item: ApifyProduct) {
  const raw = firstPresent(item, [
    "shippingPrice",
    "shipping_price",
    "frete",
    "shipping",
    "deliveryPrice",
    "envio",
    "Informações de Envio",
    "informacoesEnvio",
    "informaçõesEnvio"
  ]);
  const text = stringFromUnknown(raw).toLowerCase();
  if (text.includes("gratis") || text.includes("grátis") || text.includes("free")) return 0;
  const price = priceFromUnknown(raw);
  return price > 0 ? price : null;
}

function apifyImageUrl(item: ApifyProduct) {
  const value = firstPresent(item, [
    "image",
    "imageUrl",
    "image_url",
    "thumbnail",
    "thumbnailUrl",
    "picture",
      "pictureUrl",
      "img",
      "foto",
      "imagem",
      "Link da imagem",
      "link da imagem",
      "link_da_imagem",
      "linkDaImagem",
      "imagemLink",
      "linkImagem",
      "imageLink",
      "src"
    ]);

  if (Array.isArray(value)) return stringFromUnknown(value[0]);
  return stringFromUnknown(value);
}

function apifyUrl(item: ApifyProduct) {
  return stringFromUnknown(
    firstPresent(item, [
      "zProdutoLink",
      "url",
      "link",
      "Link",
      "productUrl",
      "product_url",
      "permalink",
      "href",
      "produtoLink",
      "linkProduto",
      "Link do produto"
    ])
  );
}

function apifyStore(item: ApifyProduct) {
  return stringFromUnknown(firstPresent(item, ["Vendedor", "vendedor", "seller", "sellerName", "seller_name", "store", "loja", "shop"])).trim() || null;
}

function apifyBrand(item: ApifyProduct) {
  return stringFromUnknown(firstPresent(item, ["produtoMarca", "brand", "marca", "fabricante"])).trim() || null;
}

function apifyRating(item: ApifyProduct) {
  const value = Number(firstPresent(item, ["rating", "avaliacao", "avaliação", "stars", "score", "produtoReviews", "nota"]));
  // Some actors expose a review count rather than a star rating; only trust a 1–5 star value.
  return Number.isFinite(value) && value > 0 && value <= 5 ? value : null;
}

function apifyDeliveryEstimate(item: ApifyProduct) {
  const candidateKeys = [
    "envio",
    "Informações de Envio",
    "informacoes de envio",
    "informacoesEnvio",
    "informaçõesEnvio",
    "delivery",
    "deliveryEstimate",
    "delivery_estimate",
    "prazo",
    "shippingText",
    "shipping_text",
    "disponivelEm",
    "disponívelEm"
  ];
  for (const key of candidateKeys) {
    const value = stringFromUnknown(firstPresent(item, [key])).trim();
    // Skip variant noise like "Disponível em 2 cores" — that is not delivery info.
    if (value && looksLikeDeliveryText(value)) return value;
  }
  return null;
}

function looksLikeDeliveryText(value: string) {
  const normalized = normalize(value);
  if (/\b(cores?|cor|tamanhos?|voltagem|volts?|unidades?|modelos?)\b/.test(normalized)) return false;
  return /\b(chega|chegara|hoje|amanha|dias?|horas?|frete|gratis|envio|entrega|full|flex|imediata|estoque)\b/.test(normalized);
}

function unwrangleTitle(item: UnwrangleProduct) {
  return (item.title ?? item.name ?? "").trim();
}

function unwranglePrice(item: UnwrangleProduct) {
  const value = item.raw_price ?? item.current_price ?? item.price;
  return priceFromUnknown(value);
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

function firstPresent(item: ApifyProduct, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  const normalizedEntries = Object.entries(item).map(([key, value]) => [normalizeKey(key), value] as const);
  for (const key of keys) {
    const normalizedKey = normalizeKey(key);
    const entry = normalizedEntries.find(([candidateKey, value]) => candidateKey === normalizedKey && value !== undefined && value !== null && value !== "");
    if (entry) return entry[1];
  }
  return undefined;
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringFromUnknown).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    const direct = firstPresent(value as ApifyProduct, ["url", "link", "text", "value", "amount", "price", "preco", "preço"]);
    if (direct !== undefined) return stringFromUnknown(direct);
  }
  return "";
}

function priceFromUnknown(value: unknown): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = priceFromUnknown(item);
      if (price > 0) return price;
    }
    return 0;
  }
  if (value && typeof value === "object") {
    const direct = firstPresent(value as ApifyProduct, ["price", "preco", "preço", "value", "amount", "text"]);
    if (direct !== undefined && direct !== value) return priceFromUnknown(direct);
  }
  if (!value) return 0;

  const normalized = stringFromUnknown(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const price = Number(normalized);
  return Number.isFinite(price) ? price : 0;
}

function deliveryHoursFromEstimate(estimate?: string | null) {
  if (!estimate) return null;
  const normalized = normalize(estimate);
  if (/\b(hoje|same day|mesmo dia)\b/.test(normalized)) return 12;
  const hourMatch = normalized.match(/(\d+)\s*(h|hora|horas)/);
  if (hourMatch) return Number(hourMatch[1]);
  const dayRange = normalized.match(/(\d+)\s*[-a]\s*(\d+)\s*dias?/);
  if (dayRange) return Number(dayRange[2]) * 24;
  const dayMatch = normalized.match(/(\d+)\s*dias?/);
  if (dayMatch) return Number(dayMatch[1]) * 24;
  if (/\bamanha\b/.test(normalized)) return 24;
  return null;
}

function isMercadoLivreLogo(url: string) {
  return /mercadolibre\/logo|mlstatic\.com\/frontend-assets\/ml-web-navigation/i.test(url);
}

function normalizeKey(input: string) {
  return normalize(input).replace(/[^a-z0-9]/g, "");
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Word-boundary match so an accessory term like "capa" doesn't reject "capacete".
function containsWord(haystack: string, term: string) {
  if (!term) return false;
  if (/\s/.test(term)) return haystack.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystack);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
