import type { StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";
import { CATALOG } from "./swift-catalog";

// Swift — carnes e congelados (entrega própria em SP). Catálogo real (~925 itens) gerado
// da API pública VTEX de loja.swift.com.br em 2026-07-23 (swift-catalog.ts). Cortes de peso
// variável têm preço por kg no site; o operador confirma o valor real na cotação.
export const swiftStore: StoreConnector = {
  key: "swift",
  label: "Swift",
  minOrder: Number(process.env.LIA_SWIFT_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4) {
    return rankCatalog(query, CATALOG, limit);
  },
  listCatalog() {
    return CATALOG;
  },
  listUnits(): StoreUnit[] {
    return [];
  },
  pickupInstructions(orderNumber: string) {
    return `Pedido Swift nº ${orderNumber}: fulfillment é do concierge (operador compra e entrega) ou entrega própria da Swift; sem retirada por courier no balcão.`;
  }
};
