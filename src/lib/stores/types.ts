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
  // Coordenadas reais da loja (pino do Google Maps). Quando presentes, a escolha da
  // unidade mais próxima usa distância geográfica de verdade (haversine) em vez da
  // proximidade numérica de CEP. Opcional: sem elas, cai no proxy de CEP (nearest.ts).
  lat?: number;
  lng?: number;
};

export type StoreConnector = {
  key: string; // "carrefour"
  label: string; // "Carrefour"
  // Minimum order this store requires, in REAL cost (R$ of products we pay the store).
  // Store-specific (e.g. Carrefour clique-e-retire ≈ 30); 0/undefined = no minimum.
  minOrder?: number;
  // Best catalog matches for one free-text basket line ("pasta de dente colgate").
  searchItems(query: string, limit?: number): Promise<CatalogItem[]>;
  // All clique-e-retire units of this store. Choosing the nearest to a CEP is done by
  // the shared pickNearestUnit() helper (stores/nearest.ts), not per-connector.
  listUnits(): StoreUnit[];
  // Counter-pickup instructions for the click-e-retire order (operator + courier).
  pickupInstructions(orderNumber: string): string;
  // Full catalog (used by the AI matcher; real stores return a fetched/cached list).
  listCatalog(): CatalogItem[];
};

// WhatsApp product cards require an https image. Incomplete scrape rows remain in
// their generated source files for later enrichment, but they are quarantined from
// the active/sellable catalog so the conversation can never degrade to a text-only
// option. Store-specific blocked-CDN checks are covered by the global catalog test.
export function catalogWithImages(items: CatalogItem[]): CatalogItem[] {
  return items.filter((item) => Boolean(item.imageUrl && /^https:\/\//i.test(item.imageUrl)));
}

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
  "bom boa dia tarde noite oi ola ei eai opa quero queria qro qr qero qria gostaria manda me te lhe por favor pf pff pfv um uma uns umas de do da dos das e o a os as pra para pro pros preciso pode poderia ser com sem no na nos nas ai hoje agora la aqui isso esse essa esses essas outro outra outros outras algum alguma tem voce vc obrigado obrigada nao ne ta cade onde quando quanto custa vou meu minha seu sua pelo pela mim ainda ja so nada mais tambem tb tbm tmb que sei entao".split(
    " "
  )
);

// Tamanhos de vestuário/fralda de 1-2 letras que DEVEM sobreviver ao filtro de tokens
// ("fralda pampers G" — o G é a informação mais importante da mensagem).
const SIZE_LETTER_RE = /^(p|m|g|gg|xg|xxg|rn)$/;

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

// tokenMatchesWord plus synonym equivalences: pet (cachorro≈cães≈cão, gato≈felino) e
// beleza (perfume≈colônia — no Boticário os perfumes se chamam "Desodorante Colônia").
function tokenMatchesWordSyn(token: string, word: string): boolean {
  if (tokenMatchesWord(token, word)) return true;
  if (DOG_WORDS.has(token) && DOG_WORDS.has(word)) return true;
  if (CAT_WORDS.has(token) && CAT_WORDS.has(word)) return true;
  if ((token === "perfume" || token === "perfumes") && (word === "colonia" || word === "colonias")) return true;
  // "miojo" ≈ "lámen": o cliente fala miojo; o catálogo esconde "Miojo"/"Lámen" no
  // meio do nome ("Pack Macarrão Instantâneo Lámen … Nissin Miojo 510g").
  if ((token === "miojo" || token === "miojos" || token === "lamen") && (word === "lamen" || word === "miojo")) return true;
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
  // Um erro de digitação em palavras específicas é muito comum no celular
  // ("detergnte", "bananna", "escva"). Só habilitamos para palavras de 5+
  // letras e mesma faixa de tamanho, para não transformar ruído curto em produto.
  // A 1ª letra tem que bater: typo raramente erra ela, e sem essa trava "vinho"
  // vira "Ninho" (distância 1, produto completamente diferente).
  if (token.length >= 5 && word.length >= 5 && Math.abs(token.length - word.length) <= 1 && token[0] === word[0]) {
    let previous = Array.from({ length: word.length + 1 }, (_, i) => i);
    for (let i = 1; i <= token.length; i++) {
      const current = [i];
      let rowMin = current[0];
      for (let j = 1; j <= word.length; j++) {
        const value = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (token[i - 1] === word[j - 1] ? 0 : 1)
        );
        current[j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > 1) return false;
      previous = current;
    }
    if (previous[word.length] <= 1) return true;
  }
  return false;
}

// The meaningful product tokens in a request (greetings/fillers removed).
export function queryTokens(query: string): string[] {
  return words(query).filter((token) => (token.length > 1 || SIZE_LETTER_RE.test(token)) && !STOPWORDS.has(token));
}

// "café SEM açúcar", "água SEM gás" — o que vem depois do "sem" é EXCLUSÃO, não busca.
function negatedWords(query: string): string[] {
  return [...normalizeText(query).matchAll(/\bsem\s+(\w{3,})\b/g)].map((m) => m[1]);
}

// Produtos de higiene/beleza HUMANOS que também existem em versão pet — quando o
// cliente não falou de bicho, a versão pet não pode nem pontuar ("shampoo" não é
// shampoo de cachorro; "perfume" não é colônia de gato).
const HUMAN_PRODUCT_WORDS = new Set(["shampoo", "xampu", "condicionador", "perfume", "colonia", "sabonete", "desodorante", "escova"]);
// Qualquer marca de "é produto pet" no nome (inclui itens "para Cães E Gatos", que o
// species-guard deixa passar por servirem as duas espécies).
const PET_ANY_RE = /\b(caes|cao|cachorros?|gatos?|felinos?|caninos?|pet|aquario|peixes?|roedores?|passaros?)\b/;

// Variantes "processadas" que só devem vencer quando pedidas ("café" = torrado/moído,
// não sachê; "leite" nunca é condensado/fermentado/vegetal).
const PROCESSED_VARIANTS = new Set(["condensado", "condensada", "soluvel", "sache", "saches", "capsula", "capsulas", "fermentado", "fermentada", "vegetal", "sanitaria", "oxigenada"]);
const PROCESSED_BIGRAM_RE = /\bem po\b|\bde soja\b|\bde amendoas\b/;
// Produto infantil/baby é variante: só rankeia bem se a query pedir criança.
// Vale pra fase de vida pet também: "ração" sem falar idade = adulto (não filhote/sênior).
// Exceção: categorias inerentemente infantis (fralda tem "Baby" no nome de fábrica).
const CHILD_VARIANT_RE = /\b(infantil|infantis|baby|boti baby|kids|junior|crianca|criancas|menino|menina|bebe|bebes|filhote|filhotes|senior)\b/;
const CHILD_NATIVE_RE = /\b(fraldas?|papinhas?|chupetas?|mamadeiras?|lenco(s)? umedecido(s)?)\b/;
// Substantivos de categoria que valem como "head" em qualquer posição do nome —
// beleza/higiene escondem o produto no meio do nome comercial.
const CATEGORY_NOUNS = new Set([
  "colonia", "perfume", "desodorante", "shampoo", "condicionador", "sabonete",
  "hidratante", "batom", "gloss", "rimel", "corretivo", "blush", "serum",
  "esmalte", "locao", "balm", "mascara", "protetor", "demaquilante", "esfoliante",
  // mercearia: substantivos que DEFINEM o produto mesmo enterrados no meio do nome
  // ("Pack Macarrão Instantâneo Lámen … Nissin MIOJO 510g" é um miojo)
  "miojo", "lamen",
  // apelidos de refrigerante ("Refrigerante GUARANÁ Antarctica 2L", "Refrigerante
  // FANTA Laranja") — o apelido identifica o produto em qualquer posição do nome
  "coca", "guarana", "fanta", "sprite", "pepsi", "tonica"
]);
function isChildVariant(nameNorm: string): boolean {
  return CHILD_VARIANT_RE.test(nameNorm) && !CHILD_NATIVE_RE.test(nameNorm);
}
// Fardo/pack de BEBIDA só quando pedido ("coca 2l" = 1 garrafa, não 6un) — a regra exige
// marcador de volume no nome pra não punir fraldas/papel ("60 Unidades" é o normal lá).
const PACK_ASK_RE = /\b(fardo|pack|caixa|kit|engradado)\b/;
function isDrinkPack(nameNorm: string): boolean {
  // Só é fardo de BEBIDA com marcador de volume no nome — "Pack Macarrão Instantâneo
  // Lámen … Miojo 510g 6 Unidades" é o produto normal, não um engradado de refri.
  const drinkVolume = /\b(ml|l|litros?)\b|\d(l|ml)\b/.test(nameNorm);
  if (/\b(fardo|pack|engradado)\b/.test(nameNorm)) return drinkVolume;
  return /\b\d+\s+(un|unidades|garrafas|latas)\b/.test(nameNorm) && drinkVolume;
}
// Variantes "de dieta/estilo" usadas só como DESEMPATE (quem pede "arroz" quer o comum;
// quem pede "leite" aceita integral/desnatado — ambos são leite). Termos veterinários
// entram aqui: "ração" genérica não deve dar Veterinary Diets/Hipoalergênica primeiro.
const TIEBREAK_VARIANTS = new Set(["integral", "desnatado", "desnatada", "semidesnatado", "zero", "diet", "light", "organico", "organica", "vegano", "vegana", "hipoalergenica", "hipoalergenico", "veterinary", "vet", "terapeutica", "terapeutico", "castrados", "castrado", "castradas"]);

// Nº de palavras de variante no nome que o cliente NÃO pediu — usado como desempate
// (menos variantes = mais "produto básico"). O que vem depois de "sabor" é descrição
// de sabor, não variante ("Sabor Frango e Arroz Integral" não é ração integral).
export function variantCount(query: string, item: CatalogItem): number {
  const qTokens = new Set(queryTokens(query));
  const beforeSabor = normalizeText(item.name).split(/\bsabor\b/)[0];
  let count = words(beforeSabor).filter((w) => TIEBREAK_VARIANTS.has(w) && !qTokens.has(w)).length;
  // "Sem Açúcar"/"Sem Lactose" no NOME é variante não pedida — "coca" genérica prefere
  // a original. Pedir "sem açúcar" (ou o equivalente "zero"/"diet"/"light") desliga.
  for (const m of beforeSabor.matchAll(/\bsem\s+([a-z]\S*)/g)) {
    const negated = m[1];
    const asked =
      qTokens.has(negated) ||
      (negated === "acucar" && ["zero", "diet", "light"].some((t) => qTokens.has(t)));
    if (!asked) count += 1;
  }
  return count;
}

// A bare "coca" means a normal individual drink or a familiar family bottle, not
// the cheapest 200 ml mini bottle. Explicit sizes still win through scoreCatalogMatch.
// This is a tie-break only, so brand/relevance guards remain authoritative.
export function commonPackageRank(query: string, item: CatalogItem): number {
  const queryNorm = normalizeText(query);
  if (!/\bcocas?(?: colas?)?\b/.test(queryNorm) || /\d+(?:[.,]\d+)?\s*(?:ml|l|lt|litros?)\b/.test(queryNorm)) return 0;
  const name = normalizeText(item.name);
  if (/\b(?:310|350)\s*ml\b/.test(name)) return 0;
  if (/\b600\s*ml\b/.test(name)) return 1;
  if (/\b2\s*(?:l|litros?)\b/.test(name)) return 2;
  if (/\b1[,.]5\s*(?:l|litros?)\b/.test(name)) return 3;
  if (/\b1\s*(?:l|litros?)\b/.test(name)) return 4;
  if (/\b(?:200|220)\s*ml\b/.test(name)) return 9;
  return 5;
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
  // Atributo-palavra ("azul", "grande", "desnatado", "sem lactose"): match direto nas
  // palavras do nome — atributos vivem no MEIO do nome, então o funil de busca
  // (piso/head) não se aplica aqui.
  const nameWords = words(`${item.name} ${item.brand ?? ""}`);
  return words(a).every((t) => nameWords.some((w) => tokenMatchesWordSyn(t, w)));
}

// Descobre refinamentos diretamente no catálogo, sem uma lista específica por produto.
// "sabor morango", "cor azul", "tamanho 42", "lavanda" e uma marca nova funcionam
// desde que a característica exista em algum candidato da busca que já está na tela.
export function inferCatalogRefinement(text: string, candidates: CatalogItem[]): string[] | null {
  const labels = new Set(["cor", "tamanho", "sabor", "gosto", "cheiro", "aroma", "fragrancia", "modelo", "versao", "marca", "tipo"]);
  const attrs = queryTokens(text).filter((token) => !labels.has(token));
  if (!attrs.length || attrs.length > 4) return null;
  return candidates.some((item) => attrs.every((attr) => attrMatchesItem(attr, item))) ? attrs : null;
}

export function scoreCatalogMatch(query: string, item: CatalogItem): number {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const nameNorm = normalizeText(item.name);
  // "Sem Perfume"/"Zero Açúcar" no NOME: a palavra negada não é o produto — pedir
  // "perfume" jamais deve trazer "Antitranspirante Sem Perfume". Ela sai do match
  // de score (attrMatchesItem continua vendo o nome inteiro pra "sem lactose").
  // ("zero 2 litros" não nega o "2" — só palavra, nunca número/tamanho)
  const nameNegated = new Set([...nameNorm.matchAll(/\b(?:sem|zero)\s+([a-z]\S*)/g)].map((m) => m[1]));
  const nameWords = words(item.name).filter((w) => !nameNegated.has(w));
  const brandWords = words(item.brand ?? "");
  const categoryWords = words(item.category ?? "");

  // "café SEM açúcar": açúcar é exclusão. Item cujo nome carrega a palavra negada só
  // sobrevive se for a versão "sem X" de verdade.
  const negs = negatedWords(query);
  const negTokens = new Set(negs);
  const effTokens = tokens.filter((t) => !negTokens.has(t));
  if (!effTokens.length) return 0;
  for (const neg of negs) {
    if (new RegExp(`\\b${neg}\\b`).test(nameNorm) && !new RegExp(`\\b(sem|zero)\\s+${neg}\\b`).test(nameNorm)) {
      return 0;
    }
  }

  // Species guard: a dog request must NEVER surface cat food (or vice versa).
  const queryAnimal = animalOf(effTokens);
  const itemAnimal = animalOf(nameWords);
  if (queryAnimal && itemAnimal && queryAnimal !== itemAnimal) return 0;
  // Produto humano vs versão pet: quem pede "shampoo"/"perfume" sem falar de bicho
  // NUNCA quer a versão de cachorro/gato/aquário (nem a "para Cães e Gatos").
  if (!queryAnimal && PET_ANY_RE.test(nameNorm) && effTokens.some((t) => HUMAN_PRODUCT_WORDS.has(t))) return 0;

  let score = 0;
  let strongHit = false;
  for (const token of effTokens) {
    // Token de TAMANHO ("2kg", "350ml") nunca segura a relevância sozinho — senão
    // "arroz 2kg" traz "Areia Higiênica 2Kg" (só o peso em comum). Ele soma score,
    // mas o produto precisa de um token de PALAVRA forte pra passar do piso.
    const isSizeToken = /^\d+(?:[.,]\d+)?(?:kg|g|ml|l|lt|un)$/.test(token);
    if (brandWords.some((word) => tokenMatchesWord(token, word))) {
      score += 4; // explicit brand match is the strongest signal
      if (!isSizeToken) strongHit = true;
    } else if (nameWords.some((word) => tokenMatchesWordSyn(token, word))) {
      score += token.length >= 4 ? 2 : 1;
      // Forte = token de 4+ letras, OU palavra curta que casa EXATA ("pão", "sal", "chá").
      if (!isSizeToken && (token.length >= 4 || (token.length >= 3 && nameWords.includes(token)))) strongHit = true;
    } else if (categoryWords.some((word) => tokenMatchesWord(token, word))) {
      // Categoria é sinal legítimo pra tokens específicos ("perfume" → "perfumaria").
      score += 1;
      if (token.length >= 5) strongHit = true;
    }
  }
  // Piso de relevância: sem pelo menos UM token forte, é ruído conversacional —
  // devolver vazio honesto em vez de "Esponja Não Risca".
  if (!strongHit) return 0;

  // Tamanho pedido ("coca 2 litros", "arroz 5kg") é sinal forte: item com o tamanho
  // certo sobe; item com OUTRO tamanho explícito perde força.
  const sizeAsks = [...normalizeText(query).matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|lt|litros?)\b/g)];
  for (const m of sizeAsks) {
    const attr = `${m[1]}${m[2].replace(/litros?|lts?$/, "l")}`;
    if (attrMatchesItem(attr, item)) score += 3;
    else score -= 1;
  }

  // Head-noun bonus: o head EFETIVO pula as palavras da marca ("Quem Disse, Berenice?
  // BASE Líquida" → head = "base"), senão nome com marca na frente nunca ganha o bônus.
  const brandSet = new Set(brandWords);
  const headWord = nameWords.find((w) => !brandSet.has(w)) ?? nameWords[0];
  const headHit = Boolean(headWord && effTokens.some((token) => tokenMatchesWordSyn(token, headWord)));
  if (score > 0 && headHit) score += 2;
  // Pedido de UMA palavra ("ovos", "frango"): se ela não é o head nem a marca, o item é
  // outra coisa que só CONTÉM a palavra (Macarrão com Ovos, Petisco de Frango) — zera.
  // Exceção: substantivo de categoria vale em qualquer posição, porque beleza enterra
  // o nome no meio ("Celebre Agora Feminino Desodorante COLÔNIA 100ml" é um perfume).
  const categoryHit = effTokens.some((token) =>
    nameWords.some((w) => CATEGORY_NOUNS.has(w) && tokenMatchesWordSyn(token, w))
  );
  if (
    effTokens.length === 1 &&
    !headHit &&
    !categoryHit &&
    !brandWords.some((w) => tokenMatchesWord(effTokens[0], w))
  ) {
    return 0;
  }

  if (score > 0) {
    // Staple-first: quem não pediu sachê/úmida/cápsula/fardo quer o produto básico.
    const wantsWet = effTokens.some((token) => WET_WORDS.has(token));
    // (PET_ANY_RE cobre "para Cães e Gatos", que deixa itemAnimal ambíguo)
    if ((itemAnimal || PET_ANY_RE.test(nameNorm)) && nameWords.some((word) => WET_WORDS.has(word)) && !wantsWet) score -= 2;
    const queryNorm = normalizeText(query);
    const wantsProcessed = effTokens.some((t) => PROCESSED_VARIANTS.has(t)) || PROCESSED_BIGRAM_RE.test(queryNorm);
    // "em pó" é a forma BÁSICA do achocolatado (Nescau/Toddy) — só é variante
    // processada nos outros produtos ("leite em pó" continua perdendo pro leite).
    const processedHay = /\bachocolatado\b/.test(nameNorm) ? nameNorm.replace(/\bem po\b/g, " ") : nameNorm;
    if (!wantsProcessed && (nameWords.some((w) => PROCESSED_VARIANTS.has(w)) || PROCESSED_BIGRAM_RE.test(processedHay))) score -= 2;
    if (!PACK_ASK_RE.test(queryNorm) && isDrinkPack(nameNorm)) score -= 2;
    // Versão infantil/baby só quando pedida ("perfume" pra adulto não pode virar
    // Boti Baby; "shampoo" não pode virar Johnson's Baby). Pedir "infantil" inverte.
    if (!CHILD_VARIANT_RE.test(queryNorm) && isChildVariant(nameNorm)) score -= 2;
  }
  return score;
}

// Ranking compartilhado dos catálogos-seed (os 3 conectores usam): score desc →
// adulto antes de infantil (quando não pedido) → menos variantes não pedidas
// (integral/diet/zero…) → mais barato. O desempate infantil existe porque nomes de
// perfumaria escondem o substantivo no meio ("Celebre Agora Feminino … Colônia") e
// o empate de score cairia no preço — onde o baby, mais barato, venceria.
export function rankCatalog(query: string, items: CatalogItem[], limit: number): CatalogItem[] {
  const childAsked = CHILD_VARIANT_RE.test(normalizeText(query));
  const childRank = (item: CatalogItem) => (!childAsked && isChildVariant(normalizeText(item.name)) ? 1 : 0);
  return items
    .map((item) => ({ item, score: scoreCatalogMatch(query, item) }))
    .filter((e) => e.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        childRank(a.item) - childRank(b.item) ||
        commonPackageRank(query, a.item) - commonPackageRank(query, b.item) ||
        variantCount(query, a.item) - variantCount(query, b.item) ||
        a.item.unitPrice - b.item.unitPrice
    )
    .slice(0, limit)
    .map((e) => e.item);
}
