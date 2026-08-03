import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./divvino-catalog";

// Divvino — adega (vinhos, cervejas, destilados, gourmet). Catálogo real gerado da API
// pública VTEX de divvino.com.br em 2026-08-02. Fecha a lacuna de bebidas/adega, que o
// Carrefour só cobria de raspão. Entrega própria por CEP; no concierge o operador compra
// e a cotação dele é a autoridade de preço.
const ITEMS = catalogWithImages(CATALOG);

export const divvinoStore: StoreConnector = {
  key: "divvino",
  label: "Divvino",
  minOrder: Number(process.env.LIA_DIVVINO_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4) {
    return rankCatalog(query, ITEMS, limit);
  },
  listCatalog() {
    return ITEMS;
  },
  listUnits(): StoreUnit[] {
    return [];
  },
  pickupInstructions(orderNumber: string) {
    return `Pedido Divvino nº ${orderNumber}: bebida alcoólica — confirmar maioridade do recebedor na entrega. Fulfillment do concierge; sem retirada por courier no balcão.`;
  }
};
