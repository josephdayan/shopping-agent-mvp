import type { StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";
import { CATALOG } from "./rihappy-catalog";

// Ri Happy — brinquedos (presente de última hora). Catálogo real (~1.196 itens) gerado
// da API pública VTEX do site em 2026-07-23 (rihappy-catalog.ts). No concierge o operador
// compra e o preço-autoridade é a cotação dele; o preço aqui é referência de vitrine.
export const rihappyStore: StoreConnector = {
  key: "rihappy",
  label: "Ri Happy",
  minOrder: Number(process.env.LIA_RIHAPPY_MIN_ORDER ?? 0),
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
    return `Pedido Ri Happy nº ${orderNumber}: fulfillment é do concierge (operador compra e entrega); sem retirada por courier no balcão.`;
  }
};
