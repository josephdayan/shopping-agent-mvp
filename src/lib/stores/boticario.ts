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
  { id: "boti-paulista", label: "O Boticário Shopping Pátio Paulista", address: "Rua Treze de Maio, 1947, Bela Vista, São Paulo - SP", cep: "01327-001" },
  { id: "boti-ibirapuera", label: "O Boticário Shopping Ibirapuera", address: "Av. Ibirapuera, 3103, Moema, São Paulo - SP", cep: "04029-902" },
  { id: "boti-morumbi", label: "O Boticário Shopping Morumbi", address: "Av. Roque Petroni Jr., 1089, Jardim das Acácias, São Paulo - SP", cep: "04707-900" },
  { id: "boti-eldorado", label: "O Boticário Shopping Eldorado", address: "Av. Rebouças, 3970, Pinheiros, São Paulo - SP", cep: "05402-918" },
  { id: "boti-villa-lobos", label: "O Boticário Shopping Villa-Lobos", address: "Av. das Nações Unidas, 4777, Alto de Pinheiros, São Paulo - SP", cep: "05477-000" },
  { id: "boti-center-norte", label: "O Boticário Shopping Center Norte", address: "Travessa Casalbuono, 120, Vila Guilherme, São Paulo - SP", cep: "02089-900" },
  { id: "boti-analia-franco", label: "O Boticário Shopping Anália Franco", address: "Av. Regente Feijó, 1739, Vila Regente Feijó, São Paulo - SP", cep: "03342-000" },
  { id: "boti-aricanduva", label: "O Boticário Shopping Aricanduva", address: "Av. Aricanduva, 5555, Vila Matilde, São Paulo - SP", cep: "03527-000" },
  { id: "boti-tucuruvi", label: "O Boticário Shopping Tucuruvi", address: "Av. Dr. Antônio Maria Laet, 566, Tucuruvi, São Paulo - SP", cep: "02409-901" },
  { id: "boti-sp-market", label: "O Boticário Shopping SP Market", address: "Av. das Nações Unidas, 22540, Santo Amaro, São Paulo - SP", cep: "04795-100" }
];

// CEP -> comparable 8-digit number (zero-padded). Returns null if unusable.
function cepToNumber(cep?: string | null): number | null {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  return Number(digits.padEnd(8, "0").slice(0, 8));
}

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

  async nearestUnit(cep?: string): Promise<StoreUnit> {
    const target = cepToNumber(cep);
    if (target == null) return UNITS[0];
    let best = UNITS[0];
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const unit of UNITS) {
      const unitNum = cepToNumber(unit.cep);
      if (unitNum == null) continue;
      const diff = Math.abs(unitNum - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = unit;
      }
    }
    return best;
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido "Retire em loja" O Boticário nº ${orderNumber} no balcão — SÓ depois do aviso de "pronto para retirada".`,
      "Levar: documento com foto do entregador + dados do pedido. Confirme a política de retirada por terceiro da unidade antes de despachar o motoboy."
    ].join(" ");
  }
};
