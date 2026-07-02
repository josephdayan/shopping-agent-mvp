// Pure NLU layer for the Lia WhatsApp conversation: normalization, intent
// detection and reply parsing. NO imports of prisma/adapters so every rule here
// is unit-testable without a database. The delivery-service consumes this and
// decides what each intent means given the conversation step.

export type ParsedLine = { phrase: string; qty: number };

export type Intent =
  | { kind: "thanks" }
  | { kind: "greeting" }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "paid_claim" }
  | { kind: "clear_cart" }
  | { kind: "change_address" }
  | { kind: "cep"; cep: string; bare: boolean }
  | { kind: "repeat_last" }
  | { kind: "swap_item"; from: string; to: string }
  | { kind: "remove_item"; target: string }
  | { kind: "pay"; method?: "pix" | "card" }
  | { kind: "cancel"; explicitOrder?: boolean }
  | { kind: "choose_payment"; method: "pix" | "card" }
  | { kind: "affirm" }
  | { kind: "reject" }
  | { kind: "number"; value: number }
  | { kind: "free_text" };

export function normalizeMsg(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- CEP ----------

export function extractCep(text: string): string | undefined {
  const m = normalizeMsg(text).match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : undefined;
}

// "01310-100", "cep 01310100", "meu cep e 01310-100" — nothing else in the message.
export function isBareCep(text: string): boolean {
  const n = normalizeMsg(text).replace(/\b(meu|o|cep|e|eh|é|:|novo)\b/g, " ").replace(/\s+/g, " ").trim();
  return /^\d{5}-?\d{3}$/.test(n);
}

// ---------- deterministic basket line splitter (fallback when OpenAI is off) ----------

export function parseBasketLines(text: string): ParsedLine[] {
  return text
    .replace(/\bquero\b|\bme manda\b|\bmanda\b|\bpreciso de\b|\bpode ser\b/gi, "")
    .split(/[,\n;]|\s+e\s+/i)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 1)
    .map((raw) => {
      const m = raw.match(/^(\d+)\s*(?:x|un|unidades?)?\s+(.*)$/i);
      if (m) return { phrase: m[2].trim(), qty: Math.max(1, Number(m[1])) };
      return { phrase: raw, qty: 1 };
    });
}

// ---------- medicine guard (deterministic — works even with OpenAI off) ----------

const MEDICINE_WORDS = [
  "remedio",
  "remedios",
  "medicamento",
  "medicamentos",
  "dipirona",
  "paracetamol",
  "tylenol",
  "ibuprofeno",
  "advil",
  "aspirina",
  "aas",
  "dorflex",
  "neosaldina",
  "buscopan",
  "amoxicilina",
  "antibiotico",
  "antibioticos",
  "anticoncepcional",
  "rivotril",
  "clonazepam",
  "fluoxetina",
  "omeprazol",
  "losartana",
  "insulina",
  "antialergico",
  "loratadina",
  "dramin",
  "xarope pra tosse",
  "xarope para tosse",
  "tarja preta"
];

export function looksLikeMedicine(text: string): boolean {
  const n = normalizeMsg(text);
  return MEDICINE_WORDS.some((word) =>
    word.includes(" ") ? n.includes(word) : new RegExp(`\\b${word}\\b`).test(n)
  );
}

// ---------- intent detection ----------

const GREETING_RE =
  /^(oi+|ol[a]+|opa|e ?ai|eai|hey|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|alo+|oi lia|ola lia)[\s!?.]*$/;

// ONLY genuine thanks here. Words like "perfeito"/"show"/"top" are AFFIRMATIONS —
// at the quote step they mean "yes, close the order", so they live in AFFIRM_CORE.
const THANKS_RE =
  /^(muito\s+)?(obrigad\w*|brigad\w*|valeu+|vlw|obg)(\s+(lia|viu|mesmo|demais))?[\s!?.😊💚❤️🙏👍]*$/;

const HELP_RE = /^(ajuda|help|menu|como funciona\??|o que (voce|vc) faz\??|como (te )?uso\??|comandos)[\s!?.]*$/;

// NOTE: no bare "meu pedido"/"minha entrega" here — "adiciona um leite no meu pedido"
// must stay a product request, not a status check.
const STATUS_RE =
  /\b(status|cade|rastreio|rastrear|rastreamento|acompanhar|previsao de entrega|quando chega|chega quando|ja saiu|saiu pra entrega|andamento)\b/;

const PAID_RE =
  /\b(paguei|ja paguei|acabei de pagar|pagamento (feito|realizado|efetuado)|pix (feito|enviado|pago)|fiz o pix|mandei o pix|transferi|ta pago|esta pago|caiu( o pix)?)\b|^pago[\s!.]*$/;
// "ainda não paguei", "não consegui pagar" — the OPPOSITE of a paid claim: they want
// (to retry) the charge, so route to "pay" (which resends the code) instead.
const NOT_PAID_RE = /\b(ainda |^)?nao (paguei|pagou|fiz o pix|mandei o pix|consegui pagar|consigo pagar)\b/;

const CANCEL_RE = /\b(cancelar?|cancela|desisti|desistir|nao quero mais( o pedido)?)\b/;

const CLEAR_CART_RE =
  /\b(zera|zerar|recome[c]ar|come[c]ar de novo|novo pedido|outro pedido)\b|\b(limpa|limpar)\s+(o\s+|a\s+)?(carrinho|cesta|pedido|tudo|lista)\b|\b(tira|tirar|remove|remover|apaga|apagar|esquece|esquecer)\s+(o\s+|os\s+|a\s+|as\s+)?(tudo|anteriores|antigos|de antes|carrinho|cesta)\b/;

const CHANGE_ADDRESS_RE =
  /\b(muda|mudar|troca|trocar|altera|alterar|atualiza|atualizar|corrige|corrigir)\w*\b[^]*\b(endereco|cep)\b|\b(endereco|cep)\s+(novo|errado|mudou|diferente)\b|\bnovo\s+(endereco|cep)\b|\boutro\s+endereco\b/;

const REPEAT_RE =
  /\b(repete|repetir|(o )?de sempre|mesmo pedido|pedido anterior|ultimo pedido|mesma coisa( de sempre)?|manda o mesmo|(igual|mesmo|mesma) (ao?|d[oa]) (ultim[oa]|anterior|sempre)( vez)?)\b|^o mesmo$/;

const PAY_RE =
  /\b(pagar|pagamento|finaliza|finalizar|fecha o pedido|fechar( o pedido)?|fechamos|checkout|manda o pix|me manda o pix|manda o link|gera o pix)\b/;

const AFFIRM_RE =
  /^(sim+|s|ok+|okay|pode( ser)?|pode sim|isso|issa|fechado|fechou|beleza|blz|confirmo|confirmar|confirma|bora|dale|vai|manda|manda ver|perfeito|certo|claro|aham|uhum|yes|👍)[\s!.]*$/;

// Multi-word confirmations ("sim, confirmo", "isso mesmo, fechado", "pode confirmar"):
// every token is an affirmation/filler word AND at least one is a core "yes".
const AFFIRM_CORE = new Set([
  "sim", "ok", "okay", "pode", "isso", "fechado", "fechou", "confirmo", "confirmar", "confirma",
  "beleza", "blz", "bora", "claro", "perfeito", "certo", "aham", "uhum", "yes", "combinado",
  "show", "top", "otimo", "joia", "massa", "legal", "maravilha"
]);
const AFFIRM_FILLER = new Set([
  ...AFFIRM_CORE, "s", "ser", "mesmo", "dale", "vai", "manda", "ver", "entao", "ta", "tá",
  "por", "favor", "pfv", "obrigado", "obrigada", "valeu", "issa", "quero", "sim", "demais"
]);
function isAffirm(n: string): boolean {
  if (AFFIRM_RE.test(n)) return true;
  const tokens = n.replace(/[!.,?👍]/g, " ").split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.length <= 5 && tokens.every((t) => AFFIRM_FILLER.has(t)) && tokens.some((t) => AFFIRM_CORE.has(t));
}

const REJECT_RE =
  /\b(nao era isso|nao e isso|nada a ver|errado|errou|nao gostei|nenhum(a)?( dess[ea]s| del[ea]s)?|outras opcoes|tem outr[ao]s?|acha outr[ao]s?|mostra outr[ao]s?)\b/;

const REMOVE_START_RE = /^(tira|tirar|remove|remover|retira|retirar|exclui|excluir|apaga|apagar|sem|cancela|cancelar)\s+/;

const SWAP_RE =
  /\b(?:troca|trocar|substitui|substituir|muda|mudar)\s+(?:o |a |os |as )?(.+?)\s+(?:por|pelo|pela)\s+(.+)$/;

export function detectIntent(text: string): Intent {
  const n = normalizeMsg(text);
  if (!n) return { kind: "free_text" };

  // Bare number ("1", "2") — the step decides what it selects.
  const bareNumber = n.match(/^(\d{1,2})[\s).]*$/);
  if (bareNumber) return { kind: "number", value: Number(bareNumber[1]) };

  const cep = extractCep(n);
  if (cep && isBareCep(n)) return { kind: "cep", cep, bare: true };

  if (THANKS_RE.test(n)) return { kind: "thanks" };
  if (GREETING_RE.test(n)) return { kind: "greeting" };
  if (HELP_RE.test(n)) return { kind: "help" };
  if (NOT_PAID_RE.test(n)) return { kind: "pay" };
  if (PAID_RE.test(n)) return { kind: "paid_claim" };
  if (CHANGE_ADDRESS_RE.test(n)) return { kind: "change_address" };

  // "troca o arroz por leite" — swap BEFORE remove/cancel so "troca" wins.
  const swap = n.match(SWAP_RE);
  if (swap) {
    const from = cleanItemPhrase(swap[1]);
    let to = cleanItemPhrase(swap[2]);
    if (/^(favor|gentileza)$/.test(to)) to = ""; // "troca o arroz por favor"
    if (from) return { kind: "swap_item", from, to };
  }

  // "tira a esponja" / "cancela o guaraná" — remove of a SPECIFIC item beats order-cancel.
  if (REMOVE_START_RE.test(n)) {
    const target = cleanItemPhrase(n.replace(REMOVE_START_RE, ""));
    const clearAll = !target || /\b(tudo|todos|todas)\b/.test(target);
    if (clearAll) return { kind: "clear_cart" };
    // "cancela o pedido" is an order cancel, not an item removal.
    if (/^(o\s+|a\s+|meu\s+)?(pedido|compra|entrega)$/.test(target)) return { kind: "cancel", explicitOrder: true };
    return { kind: "remove_item", target };
  }

  // "não quero mais o guaraná" / "quero cancelar o arroz" — a remove verb buried
  // mid-sentence still targets ONE item, not the whole cart/order.
  const cancelItem = n.match(/\b(?:nao quero mais|quero (?:cancelar|tirar|remover)|pode (?:tirar|remover))\s+(?:o |a |os |as )?(.+)$/);
  if (cancelItem) {
    const target = cleanItemPhrase(cancelItem[1]);
    if (target && !/^(pedido|compra|entrega|tudo|nada)$/.test(target)) return { kind: "remove_item", target };
  }

  if (CLEAR_CART_RE.test(n)) return { kind: "clear_cart" };
  if (CANCEL_RE.test(n)) {
    return { kind: "cancel", explicitOrder: /\b(pedido|compra|entrega)\b/.test(n) };
  }
  if (REPEAT_RE.test(n)) return { kind: "repeat_last" };
  if (STATUS_RE.test(n)) return { kind: "status" };

  const method = paymentMethodIn(n);
  if (PAY_RE.test(n) && !isQuestion(n)) return { kind: "pay", ...(method ? { method } : {}) };
  // "pix" / "no cartão" as a short reply (not buried inside a shopping list). A
  // QUESTION about a method ("quanto fica no cartão?") is not a decision to charge.
  if (method && n.split(" ").length <= 4 && !isQuestion(n)) return { kind: "choose_payment", method };

  if (isAffirm(n)) return { kind: "affirm" };
  if (REJECT_RE.test(n)) return { kind: "reject" };
  if (cep) return { kind: "cep", cep, bare: false };

  return { kind: "free_text" };
}

function paymentMethodIn(n: string): "pix" | "card" | undefined {
  if (/\bpix\b/.test(n)) return "pix";
  if (/\b(cartao|credito|debito|cred)\b/.test(n)) return "card";
  return undefined;
}

// A pix/card mention ANYWHERE in the message ("pode ser no pix mesmo, obrigada") —
// for use when the conversation step already means "picking how to pay".
export function detectPaymentMethod(text: string): "pix" | "card" | undefined {
  return paymentMethodIn(normalizeMsg(text));
}

// "quanto fica no cartão?", "qual é a desnatada?" — a question, not a decision.
export function isQuestion(text: string): boolean {
  const n = normalizeMsg(text);
  return /\?\s*$/.test(n) || /^(quanto|quanta|qual|quais|como|quando|onde|por que|pq|sera que|tem como|voce tem|vcs tem|tem)\b/.test(n);
}

// Strip articles/politeness from an item phrase ("o arroz da cesta pff" -> "arroz").
function cleanItemPhrase(phrase: string): string {
  return phrase
    .replace(/\b(o|a|os|as|um|uma|uns|umas|da cesta|do pedido|da lista|do carrinho|por favor|pf+v?|pls|esse|essa|esses|essas|ai|dai)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- refinements while choosing ("tem essa em azul?", "tem de 2kg?", "quero uma maior") ----------

const COLOR_ATTRS = new Set([
  "azul", "preta", "preto", "branca", "branco", "rosa", "vermelha", "vermelho", "verde",
  "amarela", "amarelo", "roxa", "roxo", "cinza", "bege", "marrom", "dourada", "dourado",
  "prateada", "prateado", "lilas", "laranja"
]);
const SIZE_ATTRS = new Set(["grande", "pequena", "pequeno", "media", "medio", "gg", "pp", "xg", "mini", "gigante", "familia"]);
// Comparatives map to a searchable size word.
const SIZE_MAP: Record<string, string> = { maior: "grande", maiores: "grande", menor: "pequeno", menores: "pequeno" };
const REFINE_FILLER = new Set(
  "tem essa esse dessa desse de da do dela dele em uma um umas uns a o as os quero queria prefiro pode ser mas e na no cor tamanho versao opcao so que seja por favor pfv vcs voces voce vc ai dai ne la ja tb tambem alguma algum outra outro mesmo mesma tipo dessa vez".split(" ")
);

// "acha outras", "tem mais?", "mostra outras opções" — the customer wants to SEE MORE
// options for the SAME item (not pick, not skip). The tail after "mais/outras" must be
// empty or pure filler: "manda mais 2 cocas" is ADDING an item, "tem mais barato?" is
// picking the cheapest — neither is paging.
export function wantsMoreOptions(text: string): boolean {
  const n = normalizeMsg(text).replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(mais|outras) opcoes\b/.test(n)) return true;
  const m = n.match(/\b(?:tem|acha|ache|mostra|procura|busca|manda|me ve|quero ver|ver)\s+(?:mais|outr[ao]s?)\b(.*)$/);
  if (!m) return false;
  const tail = m[1]
    .replace(/\b(opcoes|opcao|delas|dessas|desses|deles|por|favor|pfv|ai|aqui|pra|mim|um|pouco|entao)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !tail;
}

// Canonical form of a number+unit attribute: "2 litros"/"2 lt"/"2l" -> "2l"; decimals
// survive ("1,5l"). Kept consistent with attrMatchesItem's name normalization.
function canonSize(num: string, unit: string): string {
  const u = unit.replace(/litros?|lts?$/, "l");
  return `${num}${u}`;
}

// If the WHOLE message is just attribute words (color/size/weight) plus filler, it's a
// refinement of the item being chosen — return the searchable attribute tokens.
// "quero fralda azul" is NOT a refinement (a real product word remains) — that's a new item.
export function parseRefinement(text: string): string[] | null {
  // Protect decimal sizes ("1,5l" / "1.5kg") before stripping punctuation.
  const n = normalizeMsg(text)
    .replace(/(\d)[.,](\d)/g, "$1§$2")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  const tokens = n.split(" ");
  const attrs: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const sizeMatch = t.match(/^(\d+(?:§\d+)?)(kg|g|ml|l|lt|litros?)$/);
    if (SIZE_MAP[t]) {
      attrs.push(SIZE_MAP[t]);
    } else if (COLOR_ATTRS.has(t) || SIZE_ATTRS.has(t)) {
      attrs.push(t);
    } else if (sizeMatch) {
      attrs.push(canonSize(sizeMatch[1].replace("§", ","), sizeMatch[2])); // "2kg", "1,5l"
    } else if (/^\d+(?:§\d+)?$/.test(t) && /^(kg|g|ml|l|lt|litros?)$/.test(tokens[i + 1] ?? "")) {
      attrs.push(canonSize(t.replace("§", ","), tokens[i + 1])); // "2 kg" -> "2kg", "2 litros" -> "2l"
      i++;
    } else if (!REFINE_FILLER.has(t)) {
      rest.push(t);
    }
  }
  return attrs.length > 0 && rest.length === 0 ? attrs : null;
}

// ---------- choice reply parsing (customer looking at up to 3 options) ----------

export type ChoiceReply =
  | { type: "pick"; index: number }
  | { type: "any" }
  | { type: "cheapest" }
  | { type: "skip" }
  | null;

export function parseChoiceReply(text: string, options: { name: string; unitPrice: number }[]): ChoiceReply {
  const n = normalizeMsg(text);
  if (!n || !options.length) return null;

  const bare = n.match(/^(?:opcao\s*|op\s*|numero\s*|n[o°º]?\s*|a\s+|o\s+)?([1-9])[\s).!]*$/);
  if (bare) {
    const idx = Number(bare[1]) - 1;
    return idx < options.length ? { type: "pick", index: idx } : null;
  }
  if (/\b(primeir[ao])\b/.test(n)) return { type: "pick", index: 0 };
  if (/\b(segund[ao])\b/.test(n) && options.length > 1) return { type: "pick", index: 1 };
  if (/\b(terceir[ao])\b/.test(n) && options.length > 2) return { type: "pick", index: 2 };

  if (/\b(nenhum[a]?|pula|deixa (pra la|esse|essa)|esquece (esse|essa|ess[ea]s)?|sem esse|nao quero (ess[ea]|nenhum))\b/.test(n)) {
    return { type: "skip" };
  }
  if (/\b(mais barat[ao]|mais em conta|menor preco|baratinh[ao]|economic[ao])\b/.test(n)) return { type: "cheapest" };

  // Digit surrounded only by filler ("quero o 2 por favor", "pode ser a 2") — a pick.
  // A digit next to real words ("2 cocas") is NOT: that's a new item with a quantity.
  const digitAnywhere = n.match(/\b([1-9])\b/);
  if (digitAnywhere) {
    const leftover = n
      .replace(/\b[1-9]\b/, " ")
      .replace(/\b(quero|prefiro|vou|de|do|da|querer|me|ve|manda|pode|ser|opcao|op|numero|n|o|a|esse|essa|essa ai|ai|por|favor|pf+v?|mesmo|entao|acho|que|vai|fico|com)\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const idx = Number(digitAnywhere[1]) - 1;
    if (!leftover && idx < options.length) return { type: "pick", index: idx };
  }

  // Brand/name match BEFORE "qualquer": "pode ser a colgate" names an option, so the
  // "pode ser" must not degrade it to "any". Filler words don't count as name tokens.
  const CHOICE_STOP = new Set(["pode", "ser", "quero", "essa", "esse", "dessa", "desse", "por", "favor", "mais", "com", "sem", "pra", "para", "das", "dos", "vou", "manda", "prefiro", "melhor", "acho", "que", "entao", "aquele", "aquela", "tem", "cor", "versao", "tamanho", "tipo", "ver", "acha", "ache", "mostra", "procura", "busca", "outra", "outro", "outras", "outros", "alguma", "algum", "opcoes", "opcao"]);
  const tokens = n.split(" ").filter((t) => t.length > 2 && !CHOICE_STOP.has(t));
  if (tokens.length) {
    const scores = options.map((o) => {
      const name = normalizeMsg(o.name);
      return tokens.reduce((acc, t) => (name.includes(t) ? acc + 1 : acc), 0);
    });
    const max = Math.max(...scores);
    if (max > 0 && scores.filter((s) => s === max).length === 1) {
      return { type: "pick", index: scores.indexOf(max) };
    }
  }

  // "qualquer"/"pode ser" only means "you pick" when NOTHING meaningful follows —
  // "pode ser a de 2 litros" is a refinement, not a carte blanche (auto-buying option 1
  // when the customer named an attribute would charge them for the wrong product).
  if (/\b(qualquer|qualqer|tanto faz|qq um|pode ser|indiferente|voce escolhe|vc escolhe)\b/.test(n)) {
    const leftover = n
      .replace(/\b(qualquer|qualqer|tanto faz|qq um|pode ser|indiferente|voce escolhe|vc escolhe)\b/g, " ")
      .replace(/\b(um|uma|o|a|os|as|de|do|da|entao|mesmo|mesma|ai|dai|por|favor|pfv|sim|ok|serve|qual|desses|dessas)\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!leftover) return { type: "any" };
  }
  return null;
}
