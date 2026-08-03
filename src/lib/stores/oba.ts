import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { CATALOG } from "./oba-catalog";

// Oba Hortifruti — mercado e essenciais. Catálogo real gerado da API pública VTEX de
// secure.obahortifruti.com.br (oba-catalog.ts).
//
// Até 03/08 esta loja fazia busca ao vivo por Browserbase. O navegador remoto saiu do
// produto: no concierge quem cota é o operador, e a API pública da Oba responde direto
// (206 + JSON), então o wrapper de navegador não trazia nada que a colheita não dê.
const ITEMS = catalogWithImages(CATALOG);

export const obaStore: StoreConnector = {
  key: "oba",
  label: "Oba Hortifruti",
  minOrder: Number(process.env.LIA_OBA_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    return rankCatalog(query, ITEMS, limit);
  },
  listCatalog(): CatalogItem[] {
    return ITEMS;
  },
  listUnits(): StoreUnit[] {
    return [];
  },
  pickupInstructions(orderNumber: string): string {
    return `Pedido Oba nº ${orderNumber}: a Lia opera somente entrega do varejista; não despachar courier para retirada sem autorização formal.`;
  }
};
