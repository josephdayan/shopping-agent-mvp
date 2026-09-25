import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./epocacosmeticos-catalog";

// Época Cosméticos — beleza (perfumes, skincare, cabelos). Catálogo real colhido da API pública
// VTEX em 2026-09-25 (459 itens). Compra por API do servidor; marketplace: o seller do SKU é
// resolvido na hora. Entrega por Sedex (1 dia útil) no endereço do dono — não é "hoje".
const ITEMS = catalogWithImages(CATALOG);

export const epocacosmeticosStore: StoreConnector = {
  key: "epocacosmeticos",
  label: "Época Cosméticos",
  minOrder: Number(process.env.LIA_EPOCACOSMETICOS_MIN_ORDER ?? 0),
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
    return `Pedido Época Cosméticos nº ${orderNumber}: comprado por API e entregue pela própria loja; sem retirada por courier.`;
  }
};
