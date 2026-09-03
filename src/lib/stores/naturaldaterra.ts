import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./naturaldaterra-catalog";

// Natural da Terra — hortifruti, empório, açougue, padaria e mercearia em SP. Catálogo real
// gerado da API pública VTEX de naturaldaterra.com.br em 2026-08-02. Complementa o Oba (que
// roda busca ao vivo e tem apenas seed de 2 itens) na vertical de fresco/mercado.
const ITEMS = catalogWithImages(CATALOG);

export const naturalDaTerraStore: StoreConnector = {
  key: "naturaldaterra",
  label: "Natural da Terra",
  // Site exige mínimo de R$50 (verificado pelo operador em 02/09 num pedido de R$4,49).
  minOrder: Number(process.env.LIA_NATURALDATERRA_MIN_ORDER ?? 50),
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
    return `Pedido Natural da Terra nº ${orderNumber}: hortifruti/perecível — conferir cadeia fria e peso variável na cotação. Fulfillment do concierge; sem retirada por courier no balcão.`;
  }
};
