import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { withoutMedicine } from "./anvisa";
import { CATALOG } from "./drogal-catalog";

// Drogal — farmácia SEM MEDICAMENTO (ANVISA), interior + capital de SP. Catálogo real colhido da
// API pública VTEX de www.drogal.com.br em 2026-09-25 com allowlist de categorias (barbear,
// bebidas, brinquedos, dermocosméticos, beleza, cabelo, pele, higiene, infantil, oral, papelaria,
// primeiros socorros, conveniência, diabético, eletrônicos) E deny-regex de remédio na colheita.
// `withoutMedicine` é a terceira guarda, em runtime. Compra por API do servidor; sondagem no
// endereço do dono: Expressa em 30 min (R$6,90), Econômica 3h (R$4,90).
const ITEMS = withoutMedicine(catalogWithImages(CATALOG));

export const drogalStore: StoreConnector = {
  key: "drogal",
  label: "Drogal",
  minOrder: Number(process.env.LIA_DROGAL_MIN_ORDER ?? 0),
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
    return `Pedido Drogal nº ${orderNumber}: SEM medicamento (ANVISA). Comprado por API e entregue pela própria loja.`;
  }
};
