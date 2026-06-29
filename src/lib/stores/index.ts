import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { carrefourStore } from "./carrefour";

// Store registry. Adding a supply source = write one connector file and register it
// here (e.g. farmácia for higiene/beleza depth, Petz/Cobasi for pet). Nothing else
// in the system needs to change — the chat flow and operator dashboard are
// store-agnostic.
const STORES: Record<string, StoreConnector> = {
  [carrefourStore.key]: carrefourStore
  // [farmaciaStore.key]: farmaciaStore,
  // [petzStore.key]: petzStore,
};

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
