import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductIntent, RankedProduct } from "@/lib/types";
import { supplierConnectors } from "@/lib/adapters/suppliers";
import { aiAdapter } from "@/lib/adapters/ai";

export const productSearchAdapter = {
  async searchProducts(intent: ProductIntent, userId: string) {
    const preference = intent.category
      ? await prisma.preference.findUnique({
          where: { userId_category: { userId, category: intent.category } }
        })
      : null;

    const category = intent.category ?? preference?.category;
    const productsBySource = await Promise.all(
      supplierConnectors.map((connector) => connector.searchProducts({ ...intent, category }))
    );
    const excludedProductIds = new Set(intent.excludedProductIds ?? []);
    const excludedProductKeys = new Set((intent.excludedProductKeys ?? []).map(normalize));
    const products = productsBySource.flat().filter((product) => {
      if (excludedProductIds.has(product.id)) return false;
      const keys = [product.externalId, product.productUrl, product.title].map(normalize);
      return !keys.some((key) => excludedProductKeys.has(key));
    });
    const rankingIntent = {
      ...intent,
      preferredBrand: intent.preferredBrand ?? preference?.preferredBrand ?? undefined,
      priceSensitivity: intent.priceSensitivity ?? (preference?.priceSensitivity as ProductIntent["priceSensitivity"]),
      urgency: intent.urgency ?? (preference?.deliverySensitivity === "fast" ? "fast" : "normal")
    };

    const liveMercadoLivreProducts = products.filter(
      (product) => product.source === "mercado_livre" && product.automationLevel.startsWith("real_")
    );
    const rankedLiveProducts = this.rankProducts(liveMercadoLivreProducts, rankingIntent);
    const requiresLiveSearch =
      Boolean(intent.searchQuery?.trim()) && process.env.ATLAS_ALLOW_MOCK_RESULTS_FOR_SEARCH !== "true";
    if (requiresLiveSearch) return aiAdapter.curateProductOptions(rankingIntent, rankedLiveProducts);
    if (rankedLiveProducts.length >= 3) return aiAdapter.curateProductOptions(rankingIntent, rankedLiveProducts);

    const ranked = this.rankProducts(products, rankingIntent);

    return aiAdapter.curateProductOptions(rankingIntent, ensureLiveSupplierResult(ranked));
  },

  rankProducts(products: Product[], intent: ProductIntent): RankedProduct[] {
    const relevantProducts = filterRelevantProducts(products, intent);
    if (!relevantProducts.length) return [];

    const maxPrice = Math.max(...relevantProducts.map((product) => product.price + product.shippingPrice));
    const maxHours = Math.max(...relevantProducts.map((product) => product.deliveryHours));

    return relevantProducts
      .map((product) => {
        const total = product.price + product.shippingPrice;
        const priceScore = 1 - total / Math.max(maxPrice, 1);
        const deliveryScore = 1 - product.deliveryHours / Math.max(maxHours, 1);
        const ratingScore = product.rating / 5;
        const brandScore = brandMatches(product, intent.preferredBrand) ? 0.35 : intent.preferredBrand ? -0.2 : 0;
        const cheapWeight = intent.priceSensitivity === "cheap" || intent.productFilters?.sort === "cheapest" ? 0.58 : 0.28;
        const deliveryWeight = intent.urgency === "fast" || intent.productFilters?.sort === "fastest" ? 0.52 : 0.26;
        const sourceScore = sourceReliability(product.source, product.fulfillmentMode);
        const score =
          priceScore * cheapWeight +
          deliveryScore * deliveryWeight +
          ratingScore * 0.22 +
          sourceScore +
          brandScore +
          filterPreferenceScore(product, intent);
        return {
          ...product,
          score,
          rank: 0,
          reason: reasonFor(product, intent)
        };
      })
      .sort((a, b) => compareRankedProducts(a, b, intent))
      .reduce<RankedProduct[]>((ranked, product) => {
        if (ranked.some((item) => item.id === product.id)) return ranked;
        const productKey = canonicalProductKey(product.title);
        if (productKey && ranked.some((item) => canonicalProductKey(item.title) === productKey)) return ranked;
        ranked.push(product);
        return ranked;
      }, [])
      .slice(0, 8)
      .map((product, index, list) => {
        const cheapest = [...list].sort((a, b) => a.price + a.shippingPrice - (b.price + b.shippingPrice))[0];
        const fastest = [...list].sort((a, b) => a.deliveryHours - b.deliveryHours)[0];
        const reason =
          product.id === fastest?.id
            ? "Entrega mais rápida"
            : product.id === cheapest?.id
              ? "Mais em conta"
              : product.reason;
        return { ...product, rank: index + 1, reason };
      });
  },

  getProductById(productId: string) {
    return prisma.product.findUnique({ where: { id: productId } });
  }
};

function ensureLiveSupplierResult(ranked: RankedProduct[]) {
  const topThree = ranked.slice(0, 3);
  if (topThree.some(isLiveSupplierResult)) return topThree;

  const liveResult = ranked.find(isLiveSupplierResult);
  if (!liveResult) return topThree;

  const selected = topThree.length < 3 ? [...topThree, liveResult] : [topThree[0], topThree[1], liveResult];
  return selected.map((product, index) => ({ ...product, rank: index + 1 }));
}

function isLiveSupplierResult(product: RankedProduct) {
  return product.automationLevel.startsWith("real_");
}

function reasonFor(product: Product, intent: ProductIntent) {
  if (brandMatches(product, intent.preferredBrand)) return intent.preferredBrand ?? product.brand;
  if (intent.productFilters?.freeShipping && product.shippingPrice === 0) return "Frete grátis";
  if (intent.urgency === "fast") return product.deliveryEstimate;
  if (intent.priceSensitivity === "cheap") return `R$ ${product.price.toFixed(2)}`;
  return sourceLabel(product.source);
}

function filterRelevantProducts(products: Product[], intent: ProductIntent) {
  const query = normalize([intent.category, intent.searchQuery].filter(Boolean).join(" "));
  const terms = requiredTermsFor(query);
  const tokens = significantTokens(query);
  const blockedTerms = blockedTermsFor(query);
  const baseProducts = !terms.length && !tokens.length
    ? products
    : products.filter((product) => {
        const haystack = productText(product);
        if (blockedTerms.some((term) => haystack.includes(term))) return false;
        const passesRequiredGroups = terms.every((group) => group.some((term) => haystack.includes(term)));
        if (!passesRequiredGroups) return false;

        if (!tokens.length) return true;
        const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
        const minimumMatches = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.75);
        return matchedTokens >= minimumMatches;
      });

  return applyStrongFilters(baseProducts, intent);
}

function requiredTermsFor(query: string) {
  const groups: string[][] = [];

  if (/\b(camiseta|camisa|blusa|t shirt|tshirt)\b/.test(query)) {
    groups.push(["camiseta", "camisa", "blusa", "t shirt", "tshirt"]);
  }

  if (/\b(sapato|sapatos|tenis|sneaker|calcado)\b/.test(query)) {
    groups.push(["sapato", "sapatos", "tenis", "sneaker", "calcado"]);
  }

  if (/\b(lenco umedecido|baby wipes|wipes|toalha umedecida)\b/.test(query)) {
    groups.push(["lenco", "lenço", "toalha", "toalhas", "umedecido", "umedecida", "wipes"]);
  }

  if (/\b(racao cachorro|racao para cachorro|dog food|cachorro|cao)\b/.test(query)) {
    groups.push(["racao", "ração", "alimento", "dog food"]);
    groups.push(["cachorro", "cao", "cão", "caes", "cães", "canino", "dog"]);
  }

  if (/\b(racao gato|racao para gato|cat food|gato|felino)\b/.test(query)) {
    groups.push(["racao", "ração", "alimento", "cat food"]);
    groups.push(["gato", "felino", "cat"]);
  }

  if (/\b(preta|preto|black)\b/.test(query)) {
    groups.push(["preta", "preto", "black"]);
  }

  if (/\b(branca|branco|white)\b/.test(query)) {
    groups.push(["branca", "branco", "white"]);
  }

  if (/\b(social|dress shirt)\b/.test(query)) {
    groups.push(["social", "dress shirt"]);
  }

  return groups;
}

function blockedTermsFor(query: string) {
  const genericAccessoryBlocks = [
    "chaveiro",
    "keychain",
    "miniatura",
    "boneco",
    "boneca",
    "pelucia",
    "brinquedo",
    "adesivo",
    "poster",
    "quadro",
    "caneca",
    "pingente",
    "pendente",
    "enfeite",
    "decoracao",
    "calcadeira",
    "chifre",
    "buzina",
    "forma",
    "palminha",
    "horn",
    "shoehorn",
    "shoe horn",
    "metal removivel",
    "cadargo",
    "cadarco",
    "cadarço",
    "adesivos",
    "sticker",
    "stickers",
    "pelucia",
    "miniaturas",
    "capa",
    "case",
    "suporte",
    "apoio",
    "corda",
    "cordas",
    "peca",
    "peça",
    "pecas",
    "peças"
  ];
  let blockedTerms = isAccessoryLikeRequest(query) ? [] : [...genericAccessoryBlocks];

  if (/\b(camiseta|camisa|blusa|t shirt|tshirt)\b/.test(query)) {
    blockedTerms = [...blockedTerms, "infantil", "boneca", "boneco", "fantasia"];
  }

  if (/\b(sapato|sapatos|tenis|sneaker|calcado)\b/.test(query)) {
    blockedTerms = [
      ...blockedTerms,
      "aroma",
      "aromas",
      "aromatizador",
      "ambientador",
      "cheiro",
      "fragrancia",
      "lavanda",
      "pinho",
      "purificador",
      "carro",
      "concept car",
      "casa",
      "escritorio",
      "esportivo para carro"
    ];
  }

  if (/\b(lenco umedecido|baby wipes|wipes|toalha umedecida)\b/.test(query)) {
    blockedTerms = [
      ...blockedTerms,
      "escova",
      "escovas",
      "dente",
      "dental",
      "pasta",
      "creme dental",
      "toothbrush",
      "toothpaste"
    ];
  }

  if (/\b(racao|ração|dog food|cat food|cachorro|cao|gato|felino)\b/.test(query)) {
    blockedTerms = [
      ...blockedTerms,
      "petisco",
      "bifinho",
      "tapete",
      "comedouro",
      "bebedouro",
      "coleira",
      "guia",
      "areia",
      "shampoo",
      "suplemento"
    ];
  }

  return Array.from(new Set(blockedTerms.map(normalize))).filter((term) => !query.includes(term));
}

function isAccessoryLikeRequest(query: string) {
  return /\b(chaveiro|keychain|adesivo|adesivos|sticker|stickers|capa|case|suporte|apoio|miniatura|boneco|boneca|pelucia|brinquedo|pingente|pendente|poster|quadro|caneca|forma|palminha|cadarco|cadarço)\b/.test(query);
}

function applyStrongFilters(products: Product[], intent: ProductIntent) {
  let filtered = products;
  if (!filtered.length) return filtered;

  if (intent.preferredBrand) {
    const brandFiltered = filtered.filter((product) => brandMatches(product, intent.preferredBrand));
    if (brandFiltered.length) filtered = brandFiltered;
  }

  const petSize = intent.productFilters?.petSize;
  if (petSize) {
    filtered = filtered.filter((product) => !conflictsWithPetSize(product, petSize));
    const preferred = filtered.filter((product) => matchesPetSize(product, petSize));
    if (preferred.length >= Math.min(3, filtered.length)) filtered = preferred;
  }

  const lifeStage = intent.productFilters?.lifeStage;
  if (lifeStage) {
    filtered = filtered.filter((product) => !conflictsWithLifeStage(product, lifeStage));
    const preferred = filtered.filter((product) => matchesLifeStage(product, lifeStage));
    if (preferred.length >= Math.min(3, filtered.length)) filtered = preferred;
  }

  if (intent.productFilters?.color) {
    const colorFiltered = filtered.filter((product) => productText(product).includes(normalize(intent.productFilters!.color!)));
    if (colorFiltered.length) filtered = colorFiltered;
  }

  if (intent.productFilters?.size) {
    const size = normalize(intent.productFilters.size);
    const sizeFiltered = filtered.filter((product) => productText(product).includes(size));
    if (sizeFiltered.length) filtered = sizeFiltered;
  }

  if (intent.productFilters?.freeShipping) {
    const freeShipping = filtered.filter((product) => product.shippingPrice === 0);
    if (freeShipping.length) filtered = freeShipping;
  }

  if (typeof intent.productFilters?.maxPrice === "number") {
    const underBudget = filtered.filter((product) => product.price + product.shippingPrice <= intent.productFilters!.maxPrice!);
    if (underBudget.length) filtered = underBudget;
  }

  if (typeof intent.productFilters?.maxDeliveryDays === "number") {
    const maxHours = intent.productFilters.maxDeliveryDays <= 0 ? 24 : intent.productFilters.maxDeliveryDays * 24;
    const fastEnough = filtered.filter((product) => product.deliveryHours <= maxHours);
    if (fastEnough.length) filtered = fastEnough;
  }

  return filtered;
}

function filterPreferenceScore(product: Product, intent: ProductIntent) {
  let score = 0;
  const filters = intent.productFilters;
  if (!filters) return score;

  if (filters.petSize && matchesPetSize(product, filters.petSize)) score += 0.24;
  if (filters.lifeStage && matchesLifeStage(product, filters.lifeStage)) score += 0.16;
  if (filters.color && productText(product).includes(normalize(filters.color))) score += 0.12;
  if (filters.size && productText(product).includes(normalize(filters.size))) score += 0.1;
  if (filters.freeShipping && product.shippingPrice === 0) score += 0.18;
  if (typeof filters.maxPrice === "number") {
    const total = product.price + product.shippingPrice;
    score += total <= filters.maxPrice ? 0.24 : -0.35;
  }
  if (typeof filters.maxDeliveryDays === "number") {
    const maxHours = filters.maxDeliveryDays <= 0 ? 24 : filters.maxDeliveryDays * 24;
    score += product.deliveryHours <= maxHours ? 0.18 : -0.08;
  }

  return score;
}

function compareRankedProducts(a: RankedProduct, b: RankedProduct, intent: ProductIntent) {
  const aTotal = a.price + a.shippingPrice;
  const bTotal = b.price + b.shippingPrice;

  if (intent.productFilters?.sort === "cheapest" || intent.priceSensitivity === "cheap") {
    const scoreDelta = Math.abs(b.score - a.score);
    if (scoreDelta < 0.5) return aTotal - bTotal;
  }

  if (intent.productFilters?.sort === "fastest" || intent.urgency === "fast") {
    const scoreDelta = Math.abs(b.score - a.score);
    if (scoreDelta < 0.45) return a.deliveryHours - b.deliveryHours;
  }

  return b.score - a.score;
}

function brandMatches(product: Product, brand?: string) {
  if (!brand) return false;
  const normalizedBrand = normalize(brand);
  return productText(product).includes(normalizedBrand);
}

function matchesPetSize(product: Product, size: NonNullable<ProductIntent["productFilters"]>["petSize"]) {
  const text = productText(product);
  if (size === "small") return /\b(porte pequeno|racas pequenas|raças pequenas|pequeno porte|small breed|mini|pequeno adulto)\b/.test(text);
  if (size === "large") return /\b(porte grande|racas grandes|raças grandes|grande porte|large breed|gigante)\b/.test(text);
  if (size === "medium") return /\b(porte medio|porte médio|racas medias|raças médias|medio porte|medium breed)\b/.test(text);
  return false;
}

function conflictsWithPetSize(product: Product, size: NonNullable<ProductIntent["productFilters"]>["petSize"]) {
  const text = productText(product);
  if (size === "small") return /\b(porte grande|racas grandes|raças grandes|grande porte|large breed|gigante)\b/.test(text);
  if (size === "large") return /\b(porte pequeno|racas pequenas|raças pequenas|pequeno porte|small breed|mini)\b/.test(text);
  return false;
}

function matchesLifeStage(product: Product, lifeStage: NonNullable<ProductIntent["productFilters"]>["lifeStage"]) {
  const text = productText(product);
  if (lifeStage === "puppy") return /\b(filhote|puppy|junior)\b/.test(text);
  if (lifeStage === "senior") return /\b(senior|idoso|idosa|7\+|10\+)\b/.test(text);
  if (lifeStage === "adult") return /\b(adulto|adult)\b/.test(text);
  return false;
}

function conflictsWithLifeStage(product: Product, lifeStage: NonNullable<ProductIntent["productFilters"]>["lifeStage"]) {
  const text = productText(product);
  if (lifeStage === "puppy") return /\b(senior|idoso|idosa)\b/.test(text);
  if (lifeStage === "senior") return /\b(filhote|puppy|junior)\b/.test(text);
  return false;
}

function productText(product: Product) {
  return normalize([product.title, product.brand, product.category, product.store, product.deliveryEstimate].join(" "));
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
    "pro",
    "com",
    "sem",
    "uma",
    "umas",
    "uns",
    "das",
    "dos",
    "hoje",
    "agora",
    "urgente",
    "rapido",
    "rapida",
    "entrega",
    "barato",
    "barata",
    "melhor",
    "porte",
    "pequeno",
    "pequena",
    "grande",
    "medio",
    "media",
    "mini",
    "adulto",
    "filhote",
    "senior",
    "muito",
    "muita",
    "the",
    "and"
  ]);

  return Array.from(
    new Set(
      normalize(query)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3 && !stopwords.has(token))
    )
  );
}

function sourceReliability(source: string, fulfillmentMode: string) {
  if (source === "farmacia") return 0.08;
  if (source === "rappi") return 0.07;
  if (source === "mercado_livre") return 0.05;
  if (fulfillmentMode === "local_courier") return 0.04;
  return 0.01;
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    mercado_livre: "Mercado Livre",
    rappi: "Rappi",
    farmacia: "Farmacia",
    loja_local: "Loja local"
  };
  return labels[source] ?? source;
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
