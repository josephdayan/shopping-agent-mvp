import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";
import { petzStore } from "./petz";
import { boticarioStore } from "./boticario";
import { obaStore } from "./oba";
import { carrefourStore } from "./carrefour";
import { decathlonStore } from "./decathlon";
import { swiftStore } from "./swift";
import { kalungaStore } from "./kalunga";
import { rihappyStore } from "./rihappy";
import { cacauShowStore } from "./cacaushow";
import { kopenhagenStore } from "./kopenhagen";
import { drogaRaiaStore } from "./drogaraia";

// Store registry. Adding a supply source = write one connector file and register it
// here (e.g. farmácia for higiene/beleza depth, Petz/Cobasi for pet). Nothing else
// in the system needs to change — the chat flow and operator dashboard are
// store-agnostic.
const STORES: Record<string, StoreConnector> = {
  // Carrefour is the broadest vitrine (hipermercado, 1.094 seed items with real deep
  // links). Checkout automation stays OFF (the retailer blocked it on 19/07); in the
  // concierge product the operator buys by hand and the operator quote is the price
  // authority, so the seed serves as reference vitrine only.
  ...(process.env.LIA_ENABLE_CARREFOUR !== "false" ? { [carrefourStore.key]: carrefourStore } : {}),
  // Oba is the groceries/essentials source with a working Browserbase buyer that
  // validates regional inventory, freight and delivery promise before payment.
  ...(process.env.LIA_ENABLE_OBA !== "false" ? { [obaStore.key]: obaStore } : {}),
  // Petz is the pet vertical. Delivery is by the retailer; no courier pickup is used.
  ...(process.env.LIA_ENABLE_PETZ !== "false" ? { [petzStore.key]: petzStore } : {}),
  // Boticário is the beauty vertical. Its Browserbase buyer now fails closed unless
  // the live cart exposes freight and delivery promise as well as the subtotal.
  ...(process.env.LIA_ENABLE_BOTICARIO !== "false" ? { [boticarioStore.key]: boticarioStore } : {}),
  // Decathlon: sports vitrine (small real seed; concierge/operator fulfills).
  ...(process.env.LIA_ENABLE_DECATHLON !== "false" ? { [decathlonStore.key]: decathlonStore } : {}),
  // Concierge vitrines added 2026-07-23 (real seeds harvested from each store's public
  // site; the operator buys by hand and the quote is the price authority).
  ...(process.env.LIA_ENABLE_SWIFT !== "false" ? { [swiftStore.key]: swiftStore } : {}),
  ...(process.env.LIA_ENABLE_KALUNGA !== "false" ? { [kalungaStore.key]: kalungaStore } : {}),
  ...(process.env.LIA_ENABLE_RIHAPPY !== "false" ? { [rihappyStore.key]: rihappyStore } : {}),
  ...(process.env.LIA_ENABLE_CACAUSHOW !== "false" ? { [cacauShowStore.key]: cacauShowStore } : {}),
  ...(process.env.LIA_ENABLE_KOPENHAGEN !== "false" ? { [kopenhagenStore.key]: kopenhagenStore } : {}),
  ...(process.env.LIA_ENABLE_DROGARAIA !== "false" ? { [drogaRaiaStore.key]: drogaRaiaStore } : {})
};

// Pick the single store for an order (one order = one store, one retailer delivery). For each
// item query, the store whose best match scores highest "wins" that query (so a
// pet-specific item like "ração premier" goes to Petz instead of the broader Oba);
// the store winning the most queries gets the order. Ties go to the default grocery store.
// Dicas de vertical pra desempate do roteador: "base"/"perfume" empatando entre
// Oba e Boticário devem ir pra loja de beleza; "ração" empatada vai pra Petz.
const BEAUTY_HINT_RE = /\b(perfume|colonia|maquiagem|batom|base|rimel|gloss|hidratante|corretivo|blush|serum)\b/;
const PET_HINT_RE = /\b(racao|petisco|cachorro|gato|caes|pet|aquario|areia (de|pro|para) gato)\b/;

export async function pickStoreForQueries(queries: string[]): Promise<StoreConnector> {
  const stores = listStores();
  if (stores.length <= 1 || queries.length === 0) return stores[0] ?? getStore();
  const wins = new Map<string, number>(stores.map((s) => [s.key, 0]));
  for (const q of queries) {
    // Accent-stripped so the vocation hints match "ração"/"coração de gato" etc.; the
    // regexes are written without accents. Without this, a broad store (Carrefour) wins
    // pet/beauty ties because the +hint never fired.
    const qHint = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let winner: StoreConnector | null = null;
    let bestScore = 0;
    for (const store of stores) {
      const top = (await store.searchItems(q, 1))[0];
      let score = top ? scoreCatalogMatch(q, top) : 0;
      if (score > 0) {
        // desempate por vocação da loja (peso 2 para vencer o empate com folga)
        if (store.key === "boticario" && BEAUTY_HINT_RE.test(qHint)) score += 2;
        if (store.key === "petz" && PET_HINT_RE.test(qHint)) score += 2;
      }
      if (score > bestScore) {
        bestScore = score;
        winner = store;
      }
    }
    if (winner) wins.set(winner.key, (wins.get(winner.key) ?? 0) + 1);
  }
  let best = stores[0];
  let bestWins = -1;
  for (const store of stores) {
    const w = wins.get(store.key) ?? 0;
    if (w > bestWins) {
      bestWins = w;
      best = store;
    }
  }
  return best;
}

// Broadest vitrine wins ties and fallbacks. (The DeliveryOrder DB column default is
// "oba" from the 19/07 migration; code paths always set storeKey explicitly, so the
// two defaults never conflict in practice.)
export const DEFAULT_STORE_KEY = carrefourStore.key;

export function getStore(key?: string | null): StoreConnector {
  // Fall back through the requested key → configured default → first enabled store, so a
  // disabled default (e.g. LIA_ENABLE_CARREFOUR=false) never yields undefined.
  return STORES[key ?? DEFAULT_STORE_KEY] ?? STORES[DEFAULT_STORE_KEY] ?? Object.values(STORES)[0];
}

export function listStores(): StoreConnector[] {
  return Object.values(STORES);
}

// Todas as unidades de todas as lojas habilitadas. A guarda de frete usa isto para
// perguntar "existe QUALQUER loja perto o suficiente deste CEP?" independente da loja
// que vai atender a cesta.
export function allUnits(): StoreUnit[] {
  return listStores().flatMap((s) => s.listUnits());
}

// Search EVERY registered store and tag each hit with the store that carries it.
// This is the foundation of the "qualquer coisa, de qualquer loja, num WhatsApp só"
// moat — the three active verticals spread automatically through this registry.
export async function searchAcrossStores(query: string, limitPerStore = 4) {
  const perStore = await Promise.all(
    listStores().map(async (store) => {
      const items = await store.searchItems(query, limitPerStore);
      return items.map((item) => ({ store, item }));
    })
  );
  return perStore.flat();
}

export type { CatalogItem, StoreConnector, StoreUnit };
