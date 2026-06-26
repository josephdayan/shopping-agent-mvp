import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductIntent, RankedProduct } from "@/lib/types";
import { supplierConnectors } from "@/lib/adapters/suppliers";

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
    const products = productsBySource.flat().filter((product) => !excludedProductIds.has(product.id));

    const ranked = this.rankProducts(products, {
      ...intent,
      preferredBrand: intent.preferredBrand ?? preference?.preferredBrand ?? undefined,
      priceSensitivity: intent.priceSensitivity ?? (preference?.priceSensitivity as ProductIntent["priceSensitivity"]),
      urgency: intent.urgency ?? (preference?.deliverySensitivity === "fast" ? "fast" : "normal")
    });

    return ensureLiveSupplierResult(ranked).slice(0, 3);
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
        const brandScore = intent.preferredBrand && product.brand.toLowerCase() === intent.preferredBrand.toLowerCase() ? 0.2 : 0;
        const cheapWeight = intent.priceSensitivity === "cheap" ? 0.45 : 0.28;
        const deliveryWeight = intent.urgency === "fast" ? 0.48 : 0.26;
        const sourceScore = sourceReliability(product.source, product.fulfillmentMode);
        const score = priceScore * cheapWeight + deliveryScore * deliveryWeight + ratingScore * 0.22 + sourceScore + brandScore;
        return {
          ...product,
          score,
          rank: 0,
          reason: reasonFor(product, intent)
        };
      })
      .sort((a, b) => b.score - a.score)
      .reduce<RankedProduct[]>((ranked, product) => {
        if (ranked.some((item) => item.id === product.id)) return ranked;
        ranked.push(product);
        return ranked;
      }, [])
      .slice(0, 8)
      .map((product, index, list) => {
        const cheapest = [...list].sort((a, b) => a.price + a.shippingPrice - (b.price + b.shippingPrice))[0];
        const fastest = [...list].sort((a, b) => a.deliveryHours - b.deliveryHours)[0];
        const reason =
          product.id === fastest?.id
            ? "Entrega mais rapida"
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
  if (intent.preferredBrand?.toLowerCase() === product.brand.toLowerCase()) return product.brand;
  if (intent.urgency === "fast") return product.deliveryEstimate;
  if (intent.priceSensitivity === "cheap") return `R$ ${product.price.toFixed(2)}`;
  return sourceLabel(product.source);
}

function filterRelevantProducts(products: Product[], intent: ProductIntent) {
  const query = normalize([intent.category, intent.searchQuery].filter(Boolean).join(" "));
  const terms = requiredTermsFor(query);
  if (!terms.length) return products;

  return products.filter((product) => {
    const haystack = normalize([product.title, product.brand, product.category].join(" "));
    return terms.every((group) => group.some((term) => haystack.includes(term)));
  });
}

function requiredTermsFor(query: string) {
  const groups: string[][] = [];

  if (/\b(camiseta|camisa|blusa|t shirt|tshirt)\b/.test(query)) {
    groups.push(["camiseta", "camisa", "blusa", "t shirt", "tshirt"]);
  }

  if (/\b(preta|preto|black)\b/.test(query)) {
    groups.push(["preta", "preto", "black"]);
  }

  return groups;
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
