import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./imigrantes-catalog";

// Imigrantes Bebidas — adega/distribuidora (cervejas, vinhos, destilados, não alcoólicas).
// Catálogo real gerado em 2026-08-02 pelas páginas públicas server-rendered
// (scripts/harvest-imigrantes-catalog.mts — não é VTEX, mas dispensa Chrome). Complementa o
// Divvino: aqui está a cerveja/whisky do dia a dia; lá, a curadoria de vinho.
const ITEMS = catalogWithImages(CATALOG);

export const imigrantesStore: StoreConnector = {
  key: "imigrantes",
  label: "Imigrantes Bebidas",
  minOrder: Number(process.env.LIA_IMIGRANTES_MIN_ORDER ?? 0),
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
    return `Pedido Imigrantes Bebidas nº ${orderNumber}: bebida alcoólica — confirmar maioridade do recebedor na entrega. Fulfillment do concierge; sem retirada por courier no balcão.`;
  }
};
