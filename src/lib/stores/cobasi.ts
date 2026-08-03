import type { StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";
import { withoutVeterinaryMedicine } from "./anvisa";
import { CATALOG } from "./cobasi-catalog";

// Cobasi — pet (cachorro, gato, pássaros, peixes, jardim, casa). Catálogo real gerado da API
// pública VTEX de cobasi.com.br em 2026-08-02. É redundância deliberada com a Petz: quando
// um item de pet falta numa, o operador cota na outra. A navegação pública Cobasi já havia
// passado no smoke ao vivo de 20/07 (sacola, frete, prazo e total antes do login).
// SEM medicamento/antipulga (MAPA) nem dieta de prescrição — mesma regra da Petz. A colheita
// pela API pública trouxe 65 medicamentos (Simparic, Bravecto, NexGard, Apoquel, Drontal) e 56
// dietas terapêuticas; `withoutVeterinaryMedicine` os remove em runtime, então uma recolheita
// futura não os reintroduz. Regra travada em `tests/anvisa-pharmacy.test.ts`.
const ITEMS = withoutVeterinaryMedicine(catalogWithImages(CATALOG));

export const cobasiStore: StoreConnector = {
  key: "cobasi",
  label: "Cobasi",
  minOrder: Number(process.env.LIA_COBASI_MIN_ORDER ?? 0),
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
    return `Pedido Cobasi nº ${orderNumber}: sem medicamento veterinário de tarja. Fulfillment do concierge; sem retirada por courier no balcão.`;
  }
};
