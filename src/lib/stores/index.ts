import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";
import { carrefourStore } from "./carrefour";
import { petzStore } from "./petz";

// Store registry. Adding a supply source = write one connector file and register it
// here (e.g. farmácia for higiene/beleza depth, Petz/Cobasi for pet). Nothing else
// in the system needs to change — the chat flow and operator dashboard are
// store-agnostic.
const STORES: Record<string, StoreConnector> = {
  [carrefourStore.key]: carrefourStore,
  [petzStore.key]: petzStore
  // [cobasiStore.key]: cobasiStore,  // same recipe — one file
};

// Pick the single store for an order (one order = one store, one pickup). For each
// item query, the store whose best match scores highest "wins" that query (so a
// pet-specific item like "ração premier" goes to Petz even though Carrefour has a
// generic ração); the store winning the most queries gets the order. Ties go to the
// default (broadest) store, which is listed first.
export async function pickStoreForQueries(queries: string[]): Promise<StoreConnector> {
  const stores = listStores();
  if (stores.length <= 1 || queries.length === 0) return stores[0] ?? getStore();
  const wins = new Map<string, number>(stores.map((s) => [s.key, 0]));
  for (const q of queries) {
    let winner: StoreConnector | null = null;
    let bestScore = 0;
    for (const store of stores) {
      const top = (await store.searchItems(q, 1))[0];
      const score = top ? scoreCatalogMatch(q, top) : 0;
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

export const DEFAULT_STORE_KEY = carrefourStore.key;

export function getStore(key?: string | null): StoreConnector {
  return STORES[key ?? DEFAULT_STORE_KEY] ?? STORES[DEFAULT_STORE_KEY];
}

export function listStores(): StoreConnector[] {
  return Object.values(STORES);
}

// Search EVERY registered store and tag each hit with the store that carries it.
// This is the foundation of the "qualquer coisa, de qualquer loja, num WhatsApp só"
// moat — today it's just Carrefour; as stores are added it spreads automatically.
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
