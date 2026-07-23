import type { StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";
import { CATALOG } from "./kopenhagen-catalog";

// Kopenhagen — chocolates premium e presentes. Catálogo real (~248 itens = catálogo
// completo) gerado da API pública VTEX do site em 2026-07-23 (kopenhagen-catalog.ts).
// No concierge o operador confirma o valor real na cotação.
export const kopenhagenStore: StoreConnector = {
  key: "kopenhagen",
  label: "Kopenhagen",
  minOrder: Number(process.env.LIA_KOPENHAGEN_MIN_ORDER ?? 0),
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
    return `Pedido Kopenhagen nº ${orderNumber}: fulfillment é do concierge (operador compra na loja mais próxima e entrega); sem retirada por courier.`;
  }
};
