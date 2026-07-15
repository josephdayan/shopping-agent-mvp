import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, scoreCatalogMatch, rankCatalog } from "./types";
import { PETZ_CATALOG } from "./petz-catalog";
import { browserbaseLiveSearch } from "./browserbase-live-search";

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
const SEED_CATALOG: CatalogItem[] = catalogWithImages(PETZ_CATALOG);

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
  { id: "petz-sbc", label: "Petz São Bernardo", address: "Av. Rotary, 825, Centro, São Bernardo do Campo - SP", cep: "09721-000", lat: -23.72139, lng: -46.5406 },
  { id: "petz-alphaville", label: "Petz Alphaville", address: "Av. Alphaville, 580, Alphaville, Barueri - SP", cep: "06472-010", lat: -23.48985, lng: -46.85399 },
  { id: "petz-tambore", label: "Petz Tamboré", address: "Alameda Araguaia, 2179, Tamboré, Barueri - SP", cep: "06455-000", lat: -23.49981, lng: -46.84096 },
  // — Interior SP (petz.com.br/loja/*, 2026-07-02): CONFIRMAR "Retire na Loja" +
  //   retirada por terceiro antes do 1º pedido real.
  { id: "petz-campinas-dom-pedro", label: "Petz Campinas Dom Pedro", address: "Av. Guilherme Campos, 500, Shopping Parque Dom Pedro, Campinas, SP", cep: "13087-901", lat: -22.90112, lng: -47.02863 },
  { id: "petz-campinas-cambui", label: "Petz Campinas Cambuí", address: "Av. Doutor Moraes Sales, 2326, Nova Campinas, Campinas, SP", cep: "13100-201", lat: -22.90704, lng: -47.04254 },
  { id: "petz-jundiai", label: "Petz Jundiaí", address: "Av. Antonio Frederico Ozanan, 3003, Vila de Vito, Jundiaí, SP", cep: "13215-010", lat: -23.19036, lng: -46.87506 },
  { id: "petz-sorocaba", label: "Petz Sorocaba", address: "Av. Dom Aguirre, 2121, Santa Rosália, Sorocaba, SP", cep: "18035-095", lat: -23.49227, lng: -47.44565 },
  { id: "petz-santos-ana-costa", label: "Petz Santos Gonzaga", address: "Av. Ana Costa, 215, Gonzaga, Santos, SP", cep: "11060-001", lat: -23.95908, lng: -46.33177 },
  { id: "petz-praia-grande-litoral-plaza", label: "Petz Praia Grande Litoral Plaza", address: "Av. Ayrton Senna da Silva, 1511, Litoral Plaza, Tude Bastos, Praia Grande, SP", cep: "11726-000", lat: -23.9983, lng: -46.40646 },
  { id: "petz-sjc-centervale", label: "Petz São José dos Campos CenterVale", address: "Av. Deputado Benedito Matarazzo, 9403, Jardim Oswaldo Cruz, São José dos Campos, SP", cep: "12215-900", lat: -23.1991, lng: -45.88307 },
  { id: "petz-ribeirao-independencia", label: "Petz Ribeirão Preto Independência", address: "Av. Independência, 1810, Jardim Sumaré, Ribeirão Preto, SP", cep: "14025-393", lat: -21.19226, lng: -47.81077 },
  { id: "petz-ribeirao-shopping", label: "Petz Ribeirão Preto RibeirãoShopping", address: "Av. Coronel Fernando Ferreira Leite, 1540, Jardim Califórnia, Ribeirão Preto, SP", cep: "14026-020", lat: -21.21239, lng: -47.81677 },
  { id: "petz-piracicaba", label: "Petz Piracicaba", address: "Av. Centenário, 780, São Dimas, Piracicaba, SP", cep: "13416-000", lat: -22.71043, lng: -47.64057 },
  { id: "petz-bauru", label: "Petz Bauru", address: "Rua Rubens Pagani, 444, Jardim Estoril, Bauru, SP", cep: "17016-210", lat: -22.33811, lng: -49.07104 },
  { id: "petz-sao-jose-do-rio-preto", label: "Petz São José do Rio Preto", address: "Av. Pres. Juscelino K. Oliveira, 400, Jardim Maracanã, São José do Rio Preto, SP", cep: "15092-175", lat: -20.82756, lng: -49.40493 },
  { id: "petz-americana", label: "Petz Americana", address: "Av. Paulista, 985, Vila Nossa Sra. de Fátima, Americana, SP", cep: "13478-580", lat: -22.71679, lng: -47.29414 },
  { id: "petz-araraquara", label: "Petz Araraquara", address: "Av. Padre Francisco Salles Culturato, 1272, Centro, Araraquara, SP", cep: "14802-000", lat: -21.78036, lng: -48.18586 },
  { id: "petz-sao-carlos", label: "Petz São Carlos", address: "Av. Francisco Pereira Lopes, 1701, Parque Santa Mônica, São Carlos, SP", cep: "13561-250", lat: -22.00475, lng: -47.90513 },
  { id: "petz-franca", label: "Petz Franca", address: "Av. Dr. Ismael Alonso Y Alonso, 450, Jardim Veneza, Franca, SP", cep: "14400-190", lat: -20.54367, lng: -47.39695 },
  { id: "petz-presidente-prudente", label: "Petz Presidente Prudente", address: "Av. Manoel Goulart, 2671, Centro Educacional, Presidente Prudente, SP", cep: "19010-000", lat: -22.12554, lng: -51.38398 },
  { id: "petz-aracatuba", label: "Petz Araçatuba", address: "Av. Brasília, 2737, Vila São Paulo, Araçatuba, SP", cep: "16018-000", lat: -21.21846, lng: -50.43775 },
  { id: "petz-indaiatuba", label: "Petz Indaiatuba", address: "Alameda Filtros Mann, 670, Polo Shopping Indaiatuba, Jardim Tropical, Indaiatuba, SP", cep: "13344-580", lat: -23.11691, lng: -47.21964 },
  { id: "petz-rio-claro", label: "Petz Rio Claro", address: "Av. Presidente Kennedy, 414, Estádio, Rio Claro, SP", cep: "13501-270", lat: -22.42558, lng: -47.5627 },
  { id: "petz-mogi-guacu", label: "Petz Mogi Guaçu", address: "Av. Mogi Mirim, 970, Areião, Mogi Guaçu, SP", cep: "13844-110", lat: -22.36936, lng: -46.97044 }
];

function seedSearch(query: string, limit: number): CatalogItem[] {
  return rankCatalog(query, SEED_CATALOG, limit);
}

type PetzSearchCard = { href: string; text: string; imageUrl?: string; imageAlt?: string };

function parsePetzPrice(text: string): number | null {
  const match = text.replace(/\u00a0/g, " ").match(/R\$\s*([\d.]+,\d{2})/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parsePetzSearchCards(cards: PetzSearchCard[]): CatalogItem[] {
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const card of cards) {
    let url: URL;
    try {
      url = new URL(card.href);
    } catch {
      continue;
    }
    if (!url.hostname.endsWith("petz.com.br") || !url.pathname.startsWith("/produto/") || seen.has(url.toString())) continue;
    const id = url.pathname.match(/-(\d+)(?:\/|$)/)?.[1];
    const price = parsePetzPrice(card.text);
    const fallbackName = card.text.replace(/\u00a0/g, " ").split(/R\$\s*/i)[0].replace(/\s+/g, " ").trim();
    const name = card.imageAlt?.trim() || fallbackName;
    if (!id || !price || !name) continue;
    seen.add(url.toString());
    items.push({
      sku: `petz-live-${id}`,
      name,
      unitPrice: price,
      unit: "un",
      category: "petz",
      imageUrl: card.imageUrl,
      productUrl: url.toString()
    });
  }
  return items;
}

async function liveSearch(query: string, limit: number): Promise<CatalogItem[]> {
  return browserbaseLiveSearch({
    cacheNamespace: "petz-browserbase-v1",
    query,
    limit,
    domain: "petz.com.br",
    contextId: process.env.PETZ_BROWSER_CONTEXT_ID,
    searchUrl: (value) => `https://www.petz.com.br/busca?q=${encodeURIComponent(value)}`,
    extract: async (page) => {
      const cards = await page.locator('a[href*="/produto/"]').evaluateAll((anchors) =>
        anchors.map((anchor) => {
          const image = anchor.querySelector("img");
          return {
            href: (anchor as HTMLAnchorElement).href,
            text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
            imageUrl: image?.getAttribute("src") ?? undefined,
            imageAlt: image?.getAttribute("alt") ?? undefined
          };
        })
      );
      return rankCatalog(query, parsePetzSearchCards(cards), 40).filter((item) => scoreCatalogMatch(query, item) > 0);
    }
  });
}

export const petzStore: StoreConnector = {
  key: "petz",
  label: "Petz",
  // Petz clique-e-retire minimum is unverified — set 0 (no enforced minimum) for now.
  minOrder: Number(process.env.LIA_PETZ_MIN_ORDER ?? 0),

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    if (process.env.LIA_RETAILER_TEST_SEED === "true") return seedSearch(query, limit);
    try {
      const live = await liveSearch(query, limit);
      return live;
    } catch (error) {
      console.warn("[petz:browserbase-search]", error instanceof Error ? error.message : error);
      return [];
    }
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
