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

export const supplierConnectors: SupplierConnector[] = [
  dbConnector("mercado_livre", "Mercado Livre"),
  dbConnector("rappi", "Rappi"),
  dbConnector("farmacia", "Farmacia"),
  dbConnector("loja_local", "Loja local")
];
