import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";
import { BOTICARIO_CATALOG } from "./boticario-catalog";

// O Boticário — beauty vertical (perfumaria, maquiagem, corpo & banho, cabelos). Same
// connector shape as Petz (seed-only, no live scrape). Catalog is REAL data
// (boticario-catalog.ts, 1409 items). Beauty widens the moat with a distinct occasion
// (gift / "acabou minha base") and high margin — no overlap with supermarket/pet.
//
// Boticário does BOTH "Entrega Rápida" and "Retire em loja" (clique-e-retire), so it
// fits the pickup + courier model. Perfume is retail-packaged fragrance (routinely sent
// by motoboy in Brazil) — flag pure aerosol body sprays for a courier check before a
// real dispatch, but they are NOT an ANVISA wall like medicine.
//
// UNITS: major São Paulo shopping malls where Boticário operates (public, stable mall
// CEPs). Medium confidence on the exact in-mall unit — like Petz, CONFIRM the specific
// store + its third-party-pickup policy live before leaning on it for a real order.
const SEED_CATALOG: CatalogItem[] = BOTICARIO_CATALOG;

const UNITS: StoreUnit[] = [
  { id: "boti-paulista", label: "O Boticário Shopping Pátio Paulista", address: "Rua Treze de Maio, 1947, Bela Vista, São Paulo - SP", cep: "01327-001", lat: -23.55433, lng: -46.64683 },
  { id: "boti-ibirapuera", label: "O Boticário Shopping Ibirapuera", address: "Av. Ibirapuera, 3103, Moema, São Paulo - SP", cep: "04029-902", lat: -23.61019, lng: -46.66687 },
  { id: "boti-morumbi", label: "O Boticário Shopping Morumbi", address: "Av. Roque Petroni Jr., 1089, Jardim das Acácias, São Paulo - SP", cep: "04707-900", lat: -23.6228, lng: -46.6997 },
  { id: "boti-eldorado", label: "O Boticário Shopping Eldorado", address: "Av. Rebouças, 3970, Pinheiros, São Paulo - SP", cep: "05402-918", lat: -23.5737, lng: -46.69589 },
  { id: "boti-villa-lobos", label: "O Boticário Shopping Villa-Lobos", address: "Av. das Nações Unidas, 4777, Alto de Pinheiros, São Paulo - SP", cep: "05477-000", lat: -23.55108, lng: -46.72214 },
  { id: "boti-center-norte", label: "O Boticário Shopping Center Norte", address: "Travessa Casalbuono, 120, Vila Guilherme, São Paulo - SP", cep: "02089-900", lat: -23.51581, lng: -46.61822 },
  { id: "boti-analia-franco", label: "O Boticário Shopping Anália Franco", address: "Av. Regente Feijó, 1739, Vila Regente Feijó, São Paulo - SP", cep: "03342-000", lat: -23.56146, lng: -46.56016 },
  { id: "boti-aricanduva", label: "O Boticário Shopping Aricanduva", address: "Av. Aricanduva, 5555, Vila Matilde, São Paulo - SP", cep: "03527-000", lat: -23.56599, lng: -46.50401 },
  { id: "boti-tucuruvi", label: "O Boticário Shopping Tucuruvi", address: "Av. Dr. Antônio Maria Laet, 566, Tucuruvi, São Paulo - SP", cep: "02409-901", lat: -23.47963, lng: -46.6024 },
  { id: "boti-sp-market", label: "O Boticário Shopping SP Market", address: "Av. das Nações Unidas, 22540, Santo Amaro, São Paulo - SP", cep: "04795-100", lat: -23.62045, lng: -46.70063 },
  // — Grande SP (shoppings âncora, 2026-07-02): CONFIRMAR a loja exata no shopping +
  //   política de retirada por terceiro AO VIVO antes do primeiro pedido real.
  { id: "boti-internacional-gru", label: "O Boticário Internacional Shopping", address: "Rod. Presidente Dutra, km 230, Guarulhos - SP", cep: "07034-911", lat: -23.48831, lng: -46.54898 },
  { id: "boti-grand-plaza", label: "O Boticário Grand Plaza Shopping", address: "Av. Industrial, 600, Santo André - SP", cep: "09080-500", lat: -23.64872, lng: -46.53192 },
  { id: "boti-golden-square", label: "O Boticário Golden Square Shopping", address: "Av. Kennedy, 700, São Bernardo do Campo - SP", cep: "09726-263", lat: -23.68363, lng: -46.55717 },
  { id: "boti-uniao-osasco", label: "O Boticário Shopping União de Osasco", address: "Av. dos Autonomistas, 1400, Osasco - SP", cep: "06020-010", lat: -23.53898, lng: -46.76534 }
];

function seedSearch(query: string, limit: number): CatalogItem[] {
  const scored = SEED_CATALOG.map((item) => ({ item, score: scoreCatalogMatch(query, item) })).filter((e) => e.score > 0);
  scored.sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice);
  return scored.slice(0, limit).map((e) => e.item);
}

export const boticarioStore: StoreConnector = {
  key: "boticario",
  label: "O Boticário",
  // Clique-e-retire minimum is unverified — 0 (no enforced minimum) for now.
  minOrder: Number(process.env.LIA_BOTICARIO_MIN_ORDER ?? 0),

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    return seedSearch(query, limit);
  },

  listCatalog(): CatalogItem[] {
    return SEED_CATALOG;
  },

  listUnits(): StoreUnit[] {
    return UNITS;
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido "Retire em loja" O Boticário nº ${orderNumber} no balcão — SÓ depois do aviso de "pronto para retirada".`,
      "Levar: documento com foto do entregador + dados do pedido. Confirme a política de retirada por terceiro da unidade antes de despachar o motoboy."
    ].join(" ");
  }
};
