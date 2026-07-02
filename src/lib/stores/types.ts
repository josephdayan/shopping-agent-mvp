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
  // Real deep link to the product page on the store, when the scrape captured it
  // (Boticário has these; Carrefour SKUs are synthetic). Lets /ops open the exact
  // item instead of a name search.
  productUrl?: string;
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
  // Minimum order this store requires, in REAL cost (R$ of products we pay the store).
  // Store-specific (e.g. Carrefour clique-e-retire ≈ 30); 0/undefined = no minimum.
  minOrder?: number;
  // Best catalog matches for one free-text basket line ("pasta de dente colgate").
  searchItems(query: string, limit?: number): Promise<CatalogItem[]>;
  // Store unit nearest to the buyer's CEP (mock returns a sensible default).
  nearestUnit(cep?: string): Promise<StoreUnit>;
  // Counter-pickup instructions for the click-e-retire order (operator + courier).
  pickupInstructions(orderNumber: string): string;
  // Full catalog (used by the AI matcher; real stores return a fetched/cached list).
  listCatalog(): CatalogItem[];
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

// Pet vocabulary. Customers say "cachorro"/"gato"; catalogs say "Cães"/"Gatos"
// (accent-stripped to "caes"). Without treating these as synonyms, a wet sachê that
// literally says "Cachorro" outranks the dry-food bag that says "Cães", and cat food
// leaks into dog results. Words here are already normalized (no accents).
const DOG_WORDS = new Set(["cachorro", "cachorros", "cao", "caes", "canino", "canina", "dog"]);
const CAT_WORDS = new Set(["gato", "gatos", "felino", "felina", "cat"]);
// Wet-food markers ("Ração Úmida ... Sachê / Lata / Patê"). When the customer didn't
// ask for wet food we de-prioritize these so the staple dry pack — what people mean by
// "ração" — ranks first.
const WET_WORDS = new Set(["umida", "umido", "sache", "lata", "pate"]);

// Which species a set of words is ABOUT, or null if neither or BOTH (e.g. a shampoo
// "para Cães e Gatos" serves both, so it shouldn't be excluded from either).
function animalOf(wordList: string[]): "dog" | "cat" | null {
  const dog = wordList.some((w) => DOG_WORDS.has(w));
  const cat = wordList.some((w) => CAT_WORDS.has(w));
  if (dog === cat) return null;
  return dog ? "dog" : "cat";
}

// tokenMatchesWord plus pet-synonym equivalence (cachorro≈cães≈cão, gato≈felino).
function tokenMatchesWordSyn(token: string, word: string): boolean {
  if (tokenMatchesWord(token, word)) return true;
  if (DOG_WORDS.has(token) && DOG_WORDS.has(word)) return true;
  if (CAT_WORDS.has(token) && CAT_WORDS.has(word)) return true;
  return false;
}

// Word-boundary match: avoids "bom"(3) hitting "bombril". Short tokens must match a
// whole word; tokens >=4 may match as a substring of a word ("colgate" in "colgate").
function tokenMatchesWord(token: string, word: string): boolean {
  if (token === word) return true;
  // Prefix match only — "refrigerante" matches "refri", but "restauração" must NOT
  // match "ração" (it's a suffix), and "bombril" must NOT match "bom" (too short).
  if (token.length >= 4 && word.startsWith(token)) return true;
  // Reverse prefix covers inflections ("refrigerantes" ~ "refrigerante"), so cap the
  // length gap — otherwise "galactica" matches the name word "Gala" and gibberish
  // requests surface random products instead of an honest "não achei".
  if (word.length >= 4 && token.startsWith(word) && token.length - word.length <= 3) return true;
  return false;
}

// The meaningful product tokens in a request (greetings/fillers removed).
export function queryTokens(query: string): string[] {
  return words(query).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

// Size-normalized form of a name/attr so "2 Litros", "2L", "2 lt" and "2l" all compare
// equal, and decimals survive ("1,5L" -> "1,5l"). Used by attrMatchesItem only.
function normSize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/litros?|\blts?\b/g, "l")
    .replace(/(\d)\s+(?=(kg|g|ml|l)\b)/g, "$1");
}

// Does a refinement attribute ("azul", "grande", "2kg", "1,5l") ACTUALLY apply to this
// item? Sizes/weights use a digit-boundary substring on the size-normalized name (so
// "5l" does NOT match "1,5l"); word attributes use the normal catalog scorer.
export function attrMatchesItem(attr: string, item: CatalogItem): boolean {
  const a = normSize(attr);
  if (/\d/.test(a)) {
    const hay = normSize(`${item.name} ${item.brand ?? ""}`);
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^0-9,.])${esc}($|[^0-9a-z])`).test(hay);
  }
  return scoreCatalogMatch(a, item) > 0;
}

export function scoreCatalogMatch(query: string, item: CatalogItem): number {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const nameWords = words(item.name);
  const brandWords = words(item.brand ?? "");
  const categoryWords = words(item.category ?? "");

  // Species guard: a dog request must NEVER surface cat food (or vice versa). Both
  // exist in the catalog and "ração" matches both, so without this Whiskas leaks into
  // "ração pro cachorro". Items for both species (animal=null) pass.
  const queryAnimal = animalOf(tokens);
  const itemAnimal = animalOf(nameWords);
  if (queryAnimal && itemAnimal && queryAnimal !== itemAnimal) return 0;

  let score = 0;
  for (const token of tokens) {
    if (brandWords.some((word) => tokenMatchesWord(token, word))) {
      score += 4; // explicit brand match is the strongest signal
    } else if (nameWords.some((word) => tokenMatchesWordSyn(token, word))) {
      score += token.length >= 4 ? 2 : 1;
    } else if (categoryWords.some((word) => tokenMatchesWord(token, word))) {
      score += 1;
    }
  }
  // Head-noun bonus: the product whose name STARTS with what was asked is the literal
  // match. Without this, "leite" ties "Leite Integral" with "Creme de Leite" / "Leite
  // Condensado" (all contain "leite") and price alone breaks the tie — surfacing the
  // wrong product. Rewarding the head word makes "Leite ..." win for "leite".
  const headWord = nameWords[0];
  if (score > 0 && headWord && tokens.some((token) => tokenMatchesWordSyn(token, headWord))) {
    score += 2;
  }
  // Staple-first: when the request didn't ask for wet food, de-prioritize "Ração Úmida
  // ... Sachê 100g" so the dry pack (what "ração" means to most people) outranks it.
  // The seedSearch tie-breaker is cheapest-first, which otherwise floats the tiny
  // sachês to the top. Only applies to pet-food items.
  if (score > 0 && itemAnimal) {
    const wantsWet = tokens.some((token) => WET_WORDS.has(token));
    const itemIsWet = nameWords.some((word) => WET_WORDS.has(word));
    if (itemIsWet && !wantsWet) score -= 2;
  }
  return score;
}
