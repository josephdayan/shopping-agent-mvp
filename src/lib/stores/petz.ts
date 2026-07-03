import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";
import { PETZ_CATALOG } from "./petz-catalog";

// Petz — pet niche (ração, petisco, areia, higiene, brinquedo). Same shape as Carrefour
// but seed-only (no live scrape). Catalog is REAL data (petz-catalog.ts). The breadth of
// a dedicated pet store is the point: deeper than the supermarket pet aisle.
//
// Real Petz stores in the city of São Paulo (sourced from petz.com.br store pages,
// 2026-06-30; CEPs from search snippets — medium confidence, verify a store live before
// leaning on it). nearestUnit picks the CEP-closest one (same heuristic as Carrefour).
// Confirmed: Petz does "Retire na Loja" + third-party (motoboy) pickup — but the counter
// enforces the TITULAR's document + (often) a signed authorization and only releases
// after a "liberado para retirada" notice; the operator buys online and picks the store.
const SEED_CATALOG: CatalogItem[] = PETZ_CATALOG;

const UNITS: StoreUnit[] = [
  { id: "petz-augusta", label: "Petz Augusta", address: "Rua Augusta, 215, Bela Vista, São Paulo - SP", cep: "01305-000", lat: -23.5528, lng: -46.6605 },
  { id: "petz-higienopolis", label: "Petz Higienópolis", address: "Av. Angélica, 2011, Higienópolis, São Paulo - SP", cep: "01227-200", lat: -23.54497, lng: -46.65733 },
  { id: "petz-santa-cecilia", label: "Petz Santa Cecília", address: "Av. General Olímpio da Silveira, 68, Santa Cecília, São Paulo - SP", cep: "01150-000", lat: -23.53237, lng: -46.65726 },
  { id: "petz-pinheiros", label: "Petz Pinheiros", address: "Rua Teodoro Sampaio, 1424, Pinheiros, São Paulo - SP", cep: "05406-100", lat: -23.56085, lng: -46.68359 },
  { id: "petz-morumbi", label: "Petz Morumbi", address: "Rua Aureliano Guimarães, 201, Vila Andrade, São Paulo - SP", cep: "05727-160", lat: -23.63191, lng: -46.73984 },
  { id: "petz-nacoes-unidas", label: "Petz Nações Unidas", address: "Av. das Nações Unidas, 20727, Vila Almeida, São Paulo - SP", cep: "04795-100", lat: -23.62045, lng: -46.70063 },
  { id: "petz-vila-olimpia", label: "Petz Vila Olímpia", address: "Av. dos Bandeirantes, 2040, Vila Olímpia, São Paulo - SP", cep: "04553-902", lat: -23.60157, lng: -46.68276 },
  { id: "petz-itaim", label: "Petz Itaim", address: "Rua Bandeira Paulista, 982, Itaim Bibi, São Paulo - SP", cep: "04532-003", lat: -23.58153, lng: -46.67664 },
  { id: "petz-vila-mariana", label: "Petz Vila Mariana", address: "Rua Vergueiro, 2604, Vila Mariana, São Paulo - SP", cep: "04102-000", lat: -23.58457, lng: -46.63664 },
  { id: "petz-ipiranga", label: "Petz Ipiranga", address: "Av. Presidente Tancredo Neves, 600, Ipiranga, São Paulo - SP", cep: "04287-010", lat: -23.60916, lng: -46.60771 },
  { id: "petz-center-norte", label: "Petz Center Norte", address: "Shopping Center Norte, Travessa Casalbuono, 120, Vila Guilherme, São Paulo - SP", cep: "02029-010", lat: -23.51581, lng: -46.61822 },
  { id: "petz-mooca", label: "Petz Mooca", address: "Av. Paes de Barros, 1654, Mooca, São Paulo - SP", cep: "03114-001", lat: -23.56721, lng: -46.59189 },
  { id: "petz-belenzinho", label: "Petz Radial Leste (Belenzinho)", address: "Av. Radial Leste, 3300, Belenzinho, São Paulo - SP", cep: "03101-005", lat: -23.5405, lng: -46.582 },
  { id: "petz-tatuape", label: "Petz Tatuapé", address: "Av. Conde de Frontin, 2416, Tatuapé, São Paulo - SP", cep: "03501-000", lat: -23.53668, lng: -46.5573 },
  { id: "petz-analia-franco", label: "Petz Anália Franco", address: "Av. Regente Feijó, 677, Vila Regente Feijó, São Paulo - SP", cep: "03342-000", lat: -23.56032, lng: -46.56009 },
  // — Grande SP (petz.com.br/nossas-lojas, 2026-07-02): CONFIRMAR "Retire na Loja" +
  //   retirada por terceiro AO VIVO antes do primeiro pedido real em cada uma.
  { id: "petz-guarulhos", label: "Petz Guarulhos", address: "Av. Paulo Faccini, 1385, Macedo, Guarulhos - SP", cep: "07111-000", lat: -23.45406, lng: -46.53432 },
  { id: "petz-osasco", label: "Petz Osasco", address: "Av. dos Autonomistas, 1473, Vila Yara, Osasco - SP", cep: "06090-010", lat: -23.54147, lng: -46.76773 },
  { id: "petz-santo-andre", label: "Petz Santo André", address: "Av. Dom Pedro II, 933, Jardim, Santo André - SP", cep: "09080-110", lat: -23.6477, lng: -46.53695 },
  { id: "petz-sbc", label: "Petz São Bernardo", address: "Av. Rotary, 825, Centro, São Bernardo do Campo - SP", cep: "09721-000", lat: -23.72139, lng: -46.5406 }
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

  listUnits(): StoreUnit[] {
    return UNITS;
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido "Retire na Loja" Petz nº ${orderNumber} no balcão — SÓ depois do aviso de "liberado para retirada".`,
      "Levar: documento com foto do entregador + foto/cópia do documento do titular + autorização assinada. A Petz cobra o documento do titular no balcão — confirme antes de despachar o motoboy."
    ].join(" ");
  }
};
