import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";

// Carrefour (hipermercado) — the broad everyday base: comidinha, higiene, pet,
// limpeza, bebida. Catalog below is a SEED for the MVP/sandbox; swap this for the
// real Carrefour catalog (scrape/feed/API) without touching the rest of the system.
// Non-perishable / packaged only for now (courier has no refrigeration).
const SEED_CATALOG: CatalogItem[] = [
  // Higiene
  { sku: "CRF-HIG-001", name: "Creme Dental Colgate Total 12 90g", brand: "Colgate", unitPrice: 6.49, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-002", name: "Creme Dental Sorriso Dentes Brancos 90g", brand: "Sorriso", unitPrice: 3.29, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-003", name: "Escova de Dente Oral-B Indicator", brand: "Oral-B", unitPrice: 9.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-004", name: "Shampoo Seda Bomba de Vitaminas 325ml", brand: "Seda", unitPrice: 12.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-005", name: "Condicionador Pantene Restauração 175ml", brand: "Pantene", unitPrice: 14.5, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-006", name: "Sabonete Dove Original 90g", brand: "Dove", unitPrice: 3.99, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-007", name: "Desodorante Rexona Aerosol 150ml", brand: "Rexona", unitPrice: 13.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-008", name: "Papel Higiênico Neve Folha Dupla 12 rolos", brand: "Neve", unitPrice: 19.9, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-009", name: "Absorvente Always Seca 8 un", brand: "Always", unitPrice: 7.49, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-010", name: "Lâmina de Barbear Gillette Prestobarba3", brand: "Gillette", unitPrice: 16.9, unit: "pacote", category: "higiene" },
  // Bebê
  { sku: "CRF-BEB-001", name: "Fralda Pampers Confort Sec M 30 un", brand: "Pampers", unitPrice: 39.9, unit: "pacote", category: "bebe" },
  { sku: "CRF-BEB-002", name: "Fralda Huggies Tripla Proteção G 28 un", brand: "Huggies", unitPrice: 42.9, unit: "pacote", category: "bebe" },
  { sku: "CRF-BEB-003", name: "Lenço Umedecido Huggies 48 un", brand: "Huggies", unitPrice: 9.9, unit: "pacote", category: "bebe" },
  // Limpeza
  { sku: "CRF-LMP-001", name: "Detergente Ypê Neutro 500ml", brand: "Ypê", unitPrice: 2.79, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-002", name: "Sabão em Pó Omo Lavagem Perfeita 1,6kg", brand: "Omo", unitPrice: 24.9, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-003", name: "Amaciante Comfort Concentrado 1L", brand: "Comfort", unitPrice: 13.9, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-004", name: "Água Sanitária Qboa 2L", brand: "Qboa", unitPrice: 7.49, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-005", name: "Papel Toalha Snob 2 rolos", brand: "Snob", unitPrice: 8.9, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-006", name: "Esponja de Aço Bombril 8 un", brand: "Bombril", unitPrice: 3.49, unit: "pacote", category: "limpeza" },
  // Mercearia
  { sku: "CRF-MER-001", name: "Café Pilão Torrado e Moído 500g", brand: "Pilão", unitPrice: 15.9, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-002", name: "Açúcar União Refinado 1kg", brand: "União", unitPrice: 4.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-003", name: "Arroz Tio João Tipo 1 5kg", brand: "Tio João", unitPrice: 27.9, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-004", name: "Feijão Carioca Camil 1kg", brand: "Camil", unitPrice: 8.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-005", name: "Óleo de Soja Soya 900ml", brand: "Soya", unitPrice: 7.29, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-006", name: "Macarrão Espaguete Renata 500g", brand: "Renata", unitPrice: 4.39, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-007", name: "Leite UHT Integral Italac 1L", brand: "Italac", unitPrice: 4.99, unit: "un", category: "mercearia" },
  // Snacks / comidinha (não-perecível)
  { sku: "CRF-SNK-001", name: "Biscoito Recheado Oreo 90g", brand: "Oreo", unitPrice: 4.99, unit: "un", category: "snack" },
  { sku: "CRF-SNK-002", name: "Salgadinho Doritos Queijo Nacho 84g", brand: "Doritos", unitPrice: 8.9, unit: "un", category: "snack" },
  { sku: "CRF-SNK-003", name: "Chocolate Lacta Ao Leite 90g", brand: "Lacta", unitPrice: 7.49, unit: "un", category: "snack" },
  { sku: "CRF-SNK-004", name: "Bolacha Maizena Bauducco 170g", brand: "Bauducco", unitPrice: 3.29, unit: "un", category: "snack" },
  { sku: "CRF-SNK-005", name: "Amendoim Japonês Dori 150g", brand: "Dori", unitPrice: 5.49, unit: "un", category: "snack" },
  // Bebidas (não-alcoólica e embalada)
  { sku: "CRF-BEB-101", name: "Refrigerante Coca-Cola 2L", brand: "Coca-Cola", unitPrice: 9.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-105", name: "Refrigerante Guaraná Antarctica 2L", brand: "Antarctica", unitPrice: 8.49, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-106", name: "Energético Red Bull 250ml", brand: "Red Bull", unitPrice: 9.9, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-102", name: "Água Mineral Crystal sem Gás 1,5L", brand: "Crystal", unitPrice: 2.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-103", name: "Suco Del Valle Uva 1L", brand: "Del Valle", unitPrice: 7.9, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-104", name: "Cerveja Heineken Long Neck 330ml", brand: "Heineken", unitPrice: 6.49, unit: "un", category: "bebida" },
  // Pet
  { sku: "CRF-PET-001", name: "Ração Pedigree Cães Adultos Carne 1kg", brand: "Pedigree", unitPrice: 19.9, unit: "un", category: "pet" },
  { sku: "CRF-PET-002", name: "Ração Whiskas Gatos Adultos Carne 1kg", brand: "Whiskas", unitPrice: 22.9, unit: "un", category: "pet" },
  { sku: "CRF-PET-003", name: "Areia Higiênica Pipicat 4kg", brand: "Pipicat", unitPrice: 14.9, unit: "un", category: "pet" },
  // Conveniência / pilhas etc.
  { sku: "CRF-CNV-001", name: "Pilha Alcalina Duracell AA 4 un", brand: "Duracell", unitPrice: 24.9, unit: "pacote", category: "conveniencia" },
  { sku: "CRF-CNV-002", name: "Isqueiro BIC Maxi", brand: "BIC", unitPrice: 6.9, unit: "un", category: "conveniencia" }
];

// A few São Paulo capital units. Mock CEP->unit: just returns the first for now;
// the real impl would geocode the CEP and pick the closest open store.
const UNITS: StoreUnit[] = [
  { id: "crf-pinheiros", label: "Carrefour Pinheiros", address: "R. dos Pinheiros, 1000 - Pinheiros, São Paulo - SP", cep: "05422-001" },
  { id: "crf-paulista", label: "Carrefour Paulista", address: "Av. Paulista, 1800 - Bela Vista, São Paulo - SP", cep: "01310-100" },
  { id: "crf-tatuape", label: "Carrefour Tatuapé", address: "R. Tuiuti, 2100 - Tatuapé, São Paulo - SP", cep: "03081-000" }
];

export const carrefourStore: StoreConnector = {
  key: "carrefour",
  label: "Carrefour",

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    const scored = SEED_CATALOG.map((item) => ({ item, score: scoreCatalogMatch(query, item) })).filter(
      (entry) => entry.score > 0
    );
    scored.sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice);
    return scored.slice(0, limit).map((entry) => entry.item);
  },

  async nearestUnit(cep?: string): Promise<StoreUnit> {
    if (cep) {
      const digits = cep.replace(/\D/g, "");
      const exact = UNITS.find((unit) => unit.cep?.replace(/\D/g, "") === digits);
      if (exact) return exact;
    }
    return UNITS[0];
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido Click&Retire nº ${orderNumber} no balcão.`,
      "Apresentar: documento do entregador + foto do documento do titular (anexo) + e-mail de 'pronto'."
    ].join(" ");
  }
};
