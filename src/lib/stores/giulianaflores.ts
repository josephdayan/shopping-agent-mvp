import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./giulianaflores-catalog";

// Giuliana Flores — flores, cestas e presentes (líder de floricultura online no Brasil, com
// entrega no mesmo dia em São Paulo). Catálogo real colhido em 2026-08-02 do DOM renderizado
// (a loja é client-rendered e não expõe API pública), com URL e preço conferidos item a item.
// Fecha a lacuna de flores/presente, que nenhuma outra vitrine cobria.
const ITEMS = catalogWithImages(CATALOG);

export const giulianaFloresStore: StoreConnector = {
  key: "giulianaflores",
  label: "Giuliana Flores",
  minOrder: Number(process.env.LIA_GIULIANAFLORES_MIN_ORDER ?? 0),
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
    return `Pedido Giuliana Flores nº ${orderNumber}: presente perecível — confirmar data/janela de entrega e mensagem do cartão na cotação. Fulfillment do concierge ou entrega da própria loja.`;
  }
};
