import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductIntent, RankedProduct } from "@/lib/types";

export const productSearchAdapter = {
  async searchProducts(intent: ProductIntent, userId: string) {
    const preference = intent.category
      ? await prisma.preference.findUnique({
          where: { userId_category: { userId, category: intent.category } }
        })
      : null;

    const category = intent.category ?? preference?.category;
    const products = await prisma.product.findMany({
      where: {
        availability: true,
        ...(category ? { category } : {})
      }
    });

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
        const cheapWeight = intent.priceSensitivity === "cheap" ? 0.45 : 0.3;
        const deliveryWeight = intent.urgency === "fast" ? 0.45 : 0.25;
        const score = priceScore * cheapWeight + deliveryScore * deliveryWeight + ratingScore * 0.3 + brandScore;
        return {
          ...product,
          score,
          rank: 0,
          reason: reasonFor(product, intent)
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((product, index) => ({
        ...product,
        rank: index + 1,
        reason: index === 0 ? "Melhor custo-beneficio" : index === 1 ? "Entrega mais rapida" : "Melhor qualidade"
      }));
  },

  getProductById(productId: string) {
    return prisma.product.findUnique({ where: { id: productId } });
  }
};

function reasonFor(product: Product, intent: ProductIntent) {
  if (intent.preferredBrand?.toLowerCase() === product.brand.toLowerCase()) return `Combina com sua preferencia por ${product.brand}`;
  if (intent.urgency === "fast") return `Entrega em ${product.deliveryEstimate}`;
  if (intent.priceSensitivity === "cheap") return `Boa opcao por R$ ${product.price.toFixed(2)}`;
  return `Avaliacao ${product.rating.toFixed(1)} na ${product.store}`;
}
