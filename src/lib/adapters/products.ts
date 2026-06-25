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
    const products = productsBySource.flat();

    return this.rankProducts(products, {
      ...intent,
      preferredBrand: intent.preferredBrand ?? preference?.preferredBrand ?? undefined,
      priceSensitivity: intent.priceSensitivity ?? (preference?.priceSensitivity as ProductIntent["priceSensitivity"]),
      urgency: intent.urgency ?? (preference?.deliverySensitivity === "fast" ? "fast" : "normal")
    }).slice(0, 3);
  },

  rankProducts(products: Product[], intent: ProductIntent): RankedProduct[] {
    if (!products.length) return [];

    const maxPrice = Math.max(...products.map((product) => product.price + product.shippingPrice));
    const maxHours = Math.max(...products.map((product) => product.deliveryHours));

    return products
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
          index === 0
            ? "Melhor geral"
            : product.id === fastest?.id
              ? "Entrega mais rapida"
              : product.id === cheapest?.id
                ? "Mais barata aceitavel"
                : product.reason;
        return { ...product, rank: index + 1, reason };
      });
  },

  getProductById(productId: string) {
    return prisma.product.findUnique({ where: { id: productId } });
  }
};

function reasonFor(product: Product, intent: ProductIntent) {
  if (intent.preferredBrand?.toLowerCase() === product.brand.toLowerCase()) return `Combina com sua preferencia por ${product.brand}`;
  if (intent.urgency === "fast") return `Entrega em ${product.deliveryEstimate}`;
  if (intent.priceSensitivity === "cheap") return `Boa opcao por R$ ${product.price.toFixed(2)}`;
  return `${sourceLabel(product.source)} · avaliacao ${product.rating.toFixed(1)}`;
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
