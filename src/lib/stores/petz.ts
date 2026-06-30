import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";
import { PETZ_CATALOG } from "./petz-catalog";

// Petz — pet niche (ração, petisco, areia, higiene, brinquedo). Same shape as Carrefour
// but seed-only (no live scrape). Catalog is REAL data (petz-catalog.ts). The breadth of
// a dedicated pet store is the point: deeper than the supermarket pet aisle.
//
// TODO before a REAL Petz order (not needed for routing/discovery): add real Petz SP
// store units (scrape petz.com.br/encontre-uma-petz), verify the clique-e-retire minimum
// and the third-party pickup policy. Until then nearestUnit returns a placeholder unit
// (the courier quote for a Petz order would use it — flagged).
const SEED_CATALOG: CatalogItem[] = PETZ_CATALOG;

const UNITS: StoreUnit[] = [
  // PLACEHOLDER — replace with real Petz SP units before fulfilling a Petz order.
  { id: "petz-sp", label: "Petz (unidade SP)", address: "São Paulo - SP", cep: "01310-100" }
];

function seedSearch(query: string, limit: number): CatalogItem[] {
  const scored = SEED_CATALOG.map((item) => ({ item, score: scoreCatalogMatch(query, item) })).filter((e) => e.score > 0);
  scored.sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice);
  return scored.slice(0, limit).map((e) => e.item);
}

export const petzStore: StoreConnector = {
  key: "petz",
  label: "Petz",
  // Petz clique-e-retire minimum is unverified — set 0 (no enforced minimum) for now.
  minOrder: Number(process.env.LIA_PETZ_MIN_ORDER ?? 0),

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    return seedSearch(query, limit);
  },

  listCatalog(): CatalogItem[] {
    return SEED_CATALOG;
  },

  async nearestUnit(): Promise<StoreUnit> {
    return UNITS[0];
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido Retire na Loja Petz nº ${orderNumber} no balcão.`,
      "Apresentar: documento do entregador + foto do documento do titular (anexo) + e-mail de 'pronto'."
    ].join(" ");
  }
};
