import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, scoreCatalogMatch, rankCatalog } from "./types";
import { BOTICARIO_CATALOG } from "./boticario-catalog";
import { browserbaseLiveSearch } from "./browserbase-live-search";

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
const SEED_CATALOG: CatalogItem[] = catalogWithImages(BOTICARIO_CATALOG);

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
  { id: "boti-uniao-osasco", label: "O Boticário Shopping União de Osasco", address: "Av. dos Autonomistas, 1400, Osasco - SP", cep: "06020-010", lat: -23.53898, lng: -46.76534 },
  { id: "boti-iguatemi-alphaville", label: "O Boticário Iguatemi Alphaville", address: "Alameda Rio Negro, 111, Alphaville, Barueri - SP", cep: "06454-000", lat: -23.50457, lng: -46.84823 },
  // — Interior SP (shoppings-âncora, 2026-07-02): 6 com loja verificada no diretório;
  //   nos demais CONFIRMAR a loja + política de retirada antes do 1º pedido real.
  { id: "boti-iguatemi-campinas", label: "O Boticário Iguatemi Campinas", address: "Av. Iguatemi, 777, Vila Brandina, Campinas - SP", cep: "13092-902", lat: -22.8924, lng: -47.02721 },
  { id: "boti-maxi-jundiai", label: "O Boticário Maxi Shopping Jundiaí", address: "Av. Antônio Frederico Ozanam, 6000, Vila Rio Branco, Jundiaí - SP", cep: "13215-900", lat: -23.16946, lng: -46.89209 },
  { id: "boti-iguatemi-esplanada", label: "O Boticário Iguatemi Esplanada", address: "Av. Izoraida Marques Peres, 401, Parque Campolim, Sorocaba - SP", cep: "18047-900", lat: -23.53361, lng: -47.46505 },
  { id: "boti-praiamar-santos", label: "O Boticário Praiamar Shopping", address: "Rua Alexandre Martins, 80, Aparecida, Santos - SP", cep: "11025-905", lat: -23.97746, lng: -46.30933 },
  { id: "boti-centervale-sjc", label: "O Boticário CenterVale Shopping", address: "Av. Deputado Benedito Matarazzo, 9403, Jardim Oswaldo Cruz, São José dos Campos - SP", cep: "12215-900", lat: -23.1991, lng: -45.88307 },
  { id: "boti-viavale-taubate", label: "O Boticário Via Vale Garden Shopping", address: "Av. Dom Pedro I, 7181, Jardim Baronesa, Taubaté - SP", cep: "12091-000", lat: -23.04093, lng: -45.56679 },
  { id: "boti-ribeirao-shopping", label: "O Boticário RibeirãoShopping", address: "Av. Coronel Fernando Ferreira Leite, 1540, Jardim Califórnia, Ribeirão Preto - SP", cep: "14026-900", lat: -21.21239, lng: -47.81677 },
  { id: "boti-shopping-piracicaba", label: "O Boticário Shopping Piracicaba", address: "Av. Limeira, 722, Areião, Piracicaba - SP", cep: "13414-900", lat: -22.7036, lng: -47.64911 },
  { id: "boti-boulevard-bauru", label: "O Boticário Boulevard Shopping Bauru", address: "Rua General Marcondes Salgado, 11-39, Chácara das Flores, Bauru - SP", cep: "17013-904", lat: -22.31396, lng: -49.05874 },
  { id: "boti-riopreto-shopping", label: "O Boticário Riopreto Shopping", address: "Av. Brigadeiro Faria Lima, 6363, Jardim Morumbi, São José do Rio Preto - SP", cep: "15090-900", lat: -20.83505, lng: -49.39788 },
  { id: "boti-patio-limeira", label: "O Boticário Pátio Limeira Shopping", address: "Rua Carlos Gomes, 1321, Centro, Limeira - SP", cep: "13480-013", lat: -22.56864, lng: -47.40625 },
  { id: "boti-tivoli-sbo", label: "O Boticário Tivoli Shopping", address: "Av. Santa Bárbara, 777, Vila Mollon IV, Santa Bárbara d'Oeste - SP", cep: "13456-080", lat: -22.74603, lng: -47.41544 },
  { id: "boti-jaragua-araraquara", label: "O Boticário Shopping Jaraguá", address: "Av. Alberto Benassi, 2270, Jardim dos Manacás, Araraquara - SP", cep: "14804-300", lat: -21.7825, lng: -48.20148 },
  { id: "boti-iguatemi-sao-carlos", label: "O Boticário Iguatemi São Carlos", address: "Passeio dos Flamboyants, 200, Parque Faber Castell II, São Carlos - SP", cep: "13561-352", lat: -22.01804, lng: -47.91556 },
  { id: "boti-franca-shopping", label: "O Boticário Franca Shopping", address: "Av. Rio Negro, 1100, Estação, Franca - SP", cep: "14406-901", lat: -20.54721, lng: -47.416 },
  { id: "boti-esmeralda-marilia", label: "O Boticário Esmeralda Shopping", address: "Av. das Esmeraldas, 701, Jardim Tangará, Marília - SP", cep: "17516-000", lat: -22.22434, lng: -49.93276 },
  { id: "boti-prudenshopping", label: "O Boticário Prudenshopping", address: "Av. Manoel Goulart, 2400, Jardim das Rosas, Presidente Prudente - SP", cep: "19060-000", lat: -22.11835, lng: -51.40387 },
  { id: "boti-praca-nova-aracatuba", label: "O Boticário Shopping Praça Nova", address: "Rua Carlos Pereira da Silva, 6000, Jardim Guanabara, Araçatuba - SP", cep: "16026-037", lat: -21.19863, lng: -50.45485 },
  { id: "boti-polo-indaiatuba", label: "O Boticário Polo Shopping Indaiatuba", address: "Alameda Filtros Mann, 670, Jardim Tropical, Indaiatuba - SP", cep: "13344-580", lat: -23.11691, lng: -47.21964 },
  { id: "boti-shopping-rio-claro", label: "O Boticário Shopping Rio Claro", address: "Av. Conde Francisco Matarazzo Jr., 205, Vila Paulista, Rio Claro - SP", cep: "13506-845", lat: -22.4132, lng: -47.55359 }
];

function seedSearch(query: string, limit: number): CatalogItem[] {
  return rankCatalog(query, SEED_CATALOG, limit);
}

type BoticarioSearchCard = { href: string; text: string; imageUrl?: string; sku?: string };

function parseBoticarioPrice(text: string): number | null {
  const sale = [...text.matchAll(/\bpor\s+R\$\s*([\d.]+,\d{2})/gi)].at(-1)?.[1];
  const fallback = text.match(/R\$\s*([\d.]+,\d{2})/i)?.[1];
  const raw = sale ?? fallback;
  if (!raw) return null;
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseBoticarioSearchCards(cards: BoticarioSearchCard[]): CatalogItem[] {
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const card of cards) {
    let url: URL;
    try {
      url = new URL(card.href);
    } catch {
      continue;
    }
    if (!url.hostname.endsWith("boticario.com.br") || /\/(busca|sacola|minha-conta|categoria)(?:\/|$)/.test(url.pathname) || seen.has(url.toString())) continue;
    const price = parseBoticarioPrice(card.text);
    const beforePrice = card.text.split(/(?:,\s*)?(?:BOTI PROMO|🚨|de R\$|por R\$)/i)[0];
    const name = beforePrice.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
    const sku = card.sku?.trim() || `url-${Buffer.from(url.pathname).toString("base64url").slice(0, 24)}`;
    if (!price || !name) continue;
    seen.add(url.toString());
    items.push({
      sku,
      name,
      unitPrice: price,
      unit: "un",
      category: "boticario",
      imageUrl: card.imageUrl,
      productUrl: url.toString()
    });
  }
  return items;
}

async function liveSearch(query: string, limit: number): Promise<CatalogItem[]> {
  return browserbaseLiveSearch({
    cacheNamespace: "boticario-browserbase-v1",
    query,
    limit,
    domain: "boticario.com.br",
    contextId: process.env.BOTICARIO_BROWSER_CONTEXT_ID,
    searchUrl: (value) => `https://www.boticario.com.br/busca?q=${encodeURIComponent(value)}`,
    extract: async (page) => {
      const cards = await page.locator("a[href]").evaluateAll((anchors) =>
        anchors
          .filter((anchor) => /R\$\s*[\d.]+,\d{2}/i.test(anchor.textContent ?? ""))
          .map((anchor) => {
            let root: Element | null = anchor;
            let bag: HTMLAnchorElement | null = null;
            let image: HTMLImageElement | null = anchor.querySelector("img");
            for (let depth = 0; depth < 7 && root; depth += 1, root = root.parentElement) {
              bag = root.querySelector('a[href*="/sacola/?skus="]');
              image = image ?? root.querySelector("img");
              if (bag) break;
            }
            const bagUrl = bag ? new URL(bag.href) : null;
            return {
              href: (anchor as HTMLAnchorElement).href,
              text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
              imageUrl: image?.getAttribute("src") ?? undefined,
              sku: bagUrl?.searchParams.get("skus") ?? undefined
            };
          })
      );
      return rankCatalog(query, parseBoticarioSearchCards(cards), 40).filter((item) => scoreCatalogMatch(query, item) > 0);
    }
  });
}

export const boticarioStore: StoreConnector = {
  key: "boticario",
  label: "O Boticário",
  // Clique-e-retire minimum is unverified — 0 (no enforced minimum) for now.
  minOrder: Number(process.env.LIA_BOTICARIO_MIN_ORDER ?? 0),

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    if (process.env.LIA_RETAILER_TEST_SEED === "true") return seedSearch(query, limit);
    try {
      const live = await liveSearch(query, limit);
      return live;
    } catch (error) {
      console.warn("[boticario:browserbase-search]", error instanceof Error ? error.message : error);
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
      `Retirar pedido "Retire em loja" O Boticário nº ${orderNumber} no balcão — SÓ depois do aviso de "pronto para retirada".`,
      "Levar: documento com foto do entregador + dados do pedido. Confirme a política de retirada por terceiro da unidade antes de despachar o motoboy."
    ].join(" ");
  }
};
