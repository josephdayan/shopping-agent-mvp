// Pluggable store layer. A StoreConnector is one supply source the operator can
// buy from via clique-e-retire (Carrefour first; add farmácia/Petz/etc. by writing
// one more file and registering it). The chat flow and the operator dashboard only
// ever talk to this interface, never to a specific store.

export type CatalogItem = {
  sku: string;
  name: string;
  brand?: string;
  unitPrice: number;
  unit?: string; // "un", "kg", "pacote", "L"
  category?: string;
  imageUrl?: string;
};

export type StoreUnit = {
  id: string;
  label: string; // e.g. "Carrefour Pinheiros"
  address: string;
  cep?: string;
};

export type StoreConnector = {
  key: string; // "carrefour"
  label: string; // "Carrefour"
  // Best catalog matches for one free-text basket line ("pasta de dente colgate").
  searchItems(query: string, limit?: number): Promise<CatalogItem[]>;
  // Store unit nearest to the buyer's CEP (mock returns a sensible default).
  nearestUnit(cep?: string): Promise<StoreUnit>;
  // Counter-pickup instructions for the click-e-retire order (operator + courier).
  pickupInstructions(orderNumber: string): string;
};

// Shared helper: accent-insensitive, lowercase token match scoring so a store's
// searchItems can rank a free-text request against its catalog.
export function normalizeText(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreCatalogMatch(query: string, item: CatalogItem): number {
  const brand = normalizeText(item.brand ?? "");
  const haystack = normalizeText([item.name, item.brand, item.category].filter(Boolean).join(" "));
  const tokens = normalizeText(query).split(" ").filter((t) => t.length > 1);
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    // An explicit brand match ("colgate") is a strong signal — outweighs a generic
    // word that happens to appear in another product's name.
    if (brand && brand.includes(token)) score += 4;
    else if (haystack.includes(token)) score += token.length >= 4 ? 2 : 1;
  }
  return score;
}
