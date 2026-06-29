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

// Greetings / fillers / articles that must NOT drive product matching, otherwise
// "Bom dia" matches "Bombril" and "quero um X" leaks "um".
const STOPWORDS = new Set(
  "bom boa dia tarde noite oi ola ei eai opa quero queria gostaria manda me te lhe por favor pf um uma uns umas de do da dos das e o a os as pra para preciso pode poderia ser com sem no na nos nas ai hoje agora la aqui isso esse essa esses essas algum alguma tem voce vc obrigado obrigada".split(
    " "
  )
);

function words(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

// Word-boundary match: avoids "bom"(3) hitting "bombril". Short tokens must match a
// whole word; tokens >=4 may match as a substring of a word ("colgate" in "colgate").
function tokenMatchesWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (token.length >= 4 && word.includes(token)) return true;
  if (word.length >= 4 && token.includes(word)) return true;
  return false;
}

// The meaningful product tokens in a request (greetings/fillers removed).
export function queryTokens(query: string): string[] {
  return words(query).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function scoreCatalogMatch(query: string, item: CatalogItem): number {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const nameWords = words(item.name);
  const brandWords = words(item.brand ?? "");
  const categoryWords = words(item.category ?? "");
  let score = 0;
  for (const token of tokens) {
    if (brandWords.some((word) => tokenMatchesWord(token, word))) {
      score += 4; // explicit brand match is the strongest signal
    } else if (nameWords.some((word) => tokenMatchesWord(token, word))) {
      score += token.length >= 4 ? 2 : 1;
    } else if (categoryWords.some((word) => tokenMatchesWord(token, word))) {
      score += 1;
    }
  }
  return score;
}
