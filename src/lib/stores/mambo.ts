import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./mambo-catalog";

// Mambo — supermercado de SP (hortifruti, bebidas, mercearia, padaria). Catálogo real colhido
// da API pública VTEX de www.mambo.com.br em 2026-09-25 (1.500 itens). Entra na compra por API
// do servidor (checkout aberto + Pix, sondado no endereço do dono: entrega em 2h).
const ITEMS = catalogWithImages(CATALOG);

export const mamboStore: StoreConnector = {
  key: "mambo",
  label: "Mambo",
  minOrder: Number(process.env.LIA_MAMBO_MIN_ORDER ?? 0),
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
    return `Pedido Mambo nº ${orderNumber}: comprado por API e entregue pela própria loja; sem retirada por courier.`;
  }
};
