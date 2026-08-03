import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { withoutMedicine } from "./anvisa";
import { CATALOG } from "./paguemenos-catalog";

// Pague Menos — farmácia SEM MEDICAMENTO (ANVISA). Catálogo real gerado da API pública VTEX
// de paguemenos.com.br em 2026-08-02, restrito às categorias seguras (200 Higiene Pessoal,
// 300 Dermo e Beleza, 400 Mamães e Bebês, 600 Conveniência) e passado por um deny-regex de
// medicamento como segunda guarda independente. As categorias 100 (Medicamentos e Saúde),
// 500 (Vida Saudável/vitaminas), 641 (Manipulação) e 665 (Serviços de Saúde) NUNCA entram.
// Ao regenerar, manter as duas guardas: allowlist de categoria E deny-regex.
// `withoutMedicine` é a terceira guarda, em runtime: a loja classifica medicamento dentro de
// categorias cosméticas (ex.: shampoo com cetoconazol, gel Rozex com metronidazol).
const ITEMS = withoutMedicine(catalogWithImages(CATALOG));

export const pagueMenosStore: StoreConnector = {
  key: "paguemenos",
  label: "Pague Menos",
  minOrder: Number(process.env.LIA_PAGUEMENOS_MIN_ORDER ?? 0),
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
    return `Pedido Pague Menos nº ${orderNumber}: SEM medicamento (ANVISA). Fulfillment do concierge; sem retirada por courier no balcão.`;
  }
};
