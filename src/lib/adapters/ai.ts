import type { ProductOption } from "@prisma/client";
import type { ProductFilters, ProductIntent, RankedProduct } from "@/lib/types";

export type TurnContext = {
  options: Array<{ rank: number; title: string; brand: string; price: number }>;
  lastQuery?: string;
};

export type TurnClassification = {
  type: "new_search" | "refine" | "select" | "reject" | "smalltalk" | "other";
  selection?: { ordinal?: number | null; hint?: "cheapest" | "fastest" | "brand" | null };
};

const CATEGORY_SYNONYMS: Array<[string, string[]]> = [
  ["escova de dente", ["escova", "escova dental", "toothbrush"]],
  ["pasta de dente", ["pasta", "creme dental", "toothpaste"]],
  ["shampoo", ["shampoo", "xampu"]],
  ["lenco de papel", ["lenco", "lenço", "kleenex", "papel"]],
  ["lenco umedecido", ["lenco umedecido", "lenço umedecido", "baby wipes", "wipes", "toalha umedecida", "toalhas umedecidas"]],
  ["protetor solar", ["protetor", "protetor solar", "filtro solar"]],
  ["desodorante", ["desodorante", "antitranspirante"]],
  ["carregador", ["carregador", "cabo", "usb-c", "iphone"]],
  ["pilhas", ["pilha", "pilhas", "bateria aa", "bateria aaa"]],
  ["agua", ["agua", "água", "garrafa de agua"]],
  ["chocolate", ["chocolate", "bombom", "barra"]],
  ["livro", ["livro", "book"]],
  ["sapato", ["sapato", "sapatos", "tenis", "tênis", "sneaker", "calcado", "calçado"]],
  ["racao cachorro", ["racao cachorro", "ração cachorro", "racao para cachorro", "ração para cachorro", "racao de cachorro", "ração de cachorro", "dog food"]],
  ["racao gato", ["racao gato", "ração gato", "racao para gato", "ração para gato", "racao de gato", "ração de gato", "cat food"]],
  ["camisa social", ["camisa social", "social branca", "camisa branca social"]],
  ["camiseta", ["camiseta", "blusa", "t-shirt", "tshirt"]],
  ["cinto", ["cinto", "belt"]]
];

const BRANDS = [
  "Colgate",
  "Curaprox",
  "Oral-B",
  "Sorriso",
  "Pantene",
  "Seda",
  "Kleenex",
  "Nivea",
  "Rexona",
  "Anker",
  "Duracell",
  "Crystal",
  "Lacta",
  "Pampers",
  "Huggies",
  "Johnson",
  "Gran Plus",
  "Premier",
  "Royal Canin",
  "Pedigree",
  "Golden",
  "Special Dog",
  "Dog Chow",
  "Whiskas",
  "Special Cat"
];
const FORBIDDEN = ["arma", "cigarro", "remedio controlado", "medicamento controlado", "alcool"];

export const aiAdapter = {
  async parseUserIntent(text: string): Promise<ProductIntent> {
    const openAiIntent = await parseIntentWithOpenAI(text);
    if (openAiIntent) return refineIntentFromText(text, openAiIntent);

    const normalized = normalize(text);
    const intent: ProductIntent = {
      restrictions: []
    };

    if (FORBIDDEN.some((item) => normalized.includes(normalize(item)))) {
      return { unsupported: true };
    }

    if (normalized.includes("mesma") || normalized.includes("ultimo") || normalized.includes("repete")) {
      intent.wantsRepeat = true;
    }

    for (const [category, words] of CATEGORY_SYNONYMS) {
      if (words.some((word) => normalized.includes(normalize(word)))) {
        intent.category = category;
        break;
      }
    }
    // Seed the query from the user's own words first, so refinement enriches a real
    // query instead of collapsing to the bare category ("tênis nike" -> "sapato").
    intent.searchQuery = buildSearchQueryFromText(text, intent.category);
    Object.assign(intent, refineIntentFromText(text, intent));
    intent.searchQuery = intent.searchQuery ?? buildSearchQueryFromText(text, intent.category);

    const brand = BRANDS.find((candidate) => normalized.includes(normalize(candidate)));
    if (brand) intent.preferredBrand = brand;

    if (/(barat|menor preco|mais em conta|econom)/.test(normalized)) {
      intent.priceSensitivity = "cheap";
      intent.productFilters = mergeProductFilters(intent.productFilters, { sort: "cheapest" });
    } else if (/(melhor|premium|qualidade|avaliad)/.test(normalized)) {
      intent.priceSensitivity = "premium";
      intent.productFilters = mergeProductFilters(intent.productFilters, { sort: "best" });
    } else if (!intent.priceSensitivity) {
      intent.priceSensitivity = "balanced";
    }

    if (/(hoje|agora|rapido|rápido|urgente|entrega rapida)/.test(normalized)) {
      intent.urgency = "fast";
      intent.productFilters = mergeProductFilters(intent.productFilters, {
        sort: "fastest",
        maxDeliveryDays: normalized.includes("hoje") || normalized.includes("agora") ? 0 : 1
      });
    } else {
      intent.urgency = "normal";
    }

    // Any concrete product term should be searchable, even if it is not one of the
    // known categories — otherwise the bot dead-ends on "qual produto?".
    if (!intent.category && intent.searchQuery && intent.searchQuery.trim().length >= 2) {
      intent.category = intent.searchQuery.trim();
    }

    intent.ambiguous = !intent.category && !intent.searchQuery && !intent.wantsRepeat;
    return intent;
  },

  interpretSelection(text: string, options: Array<ProductOption & { product: { id: string; brand: string; price: number; deliveryHours: number } }>) {
    const normalized = normalize(text);
    if (/^(1|primeir|uma)\b/.test(normalized)) return options[0]?.productId;
    if (/^(2|segund|duas)\b/.test(normalized)) return options[1]?.productId;
    if (/^(3|terceir|tres|três)\b/.test(normalized)) return options[2]?.productId;
    if (normalized.includes("barat")) {
      return [...options].sort((a, b) => a.product.price - b.product.price)[0]?.productId;
    }
    if (normalized.includes("rapid")) {
      return [...options].sort((a, b) => a.product.deliveryHours - b.product.deliveryHours)[0]?.productId;
    }
    const byBrand = options.find((option) => normalized.includes(normalize(option.product.brand)));
    return byBrand?.productId;
  },

  generateAssistantResponse(kind: "clarify" | "options" | "checkout" | "unsupported" | "paid" | "status") {
    const responses = {
      clarify: "Posso buscar pra você. Prefere o mais barato, o melhor avaliado ou o que chega mais rápido?",
      options: "Achei estas opções. Toque em uma ou responda o número.",
      checkout: "Montei o resumo do pedido. Posso confirmar?",
      unsupported: "Esse tipo de item eu ainda não consigo comprar. Posso ajudar com itens do dia a dia, casa, pet, beleza e mercado.",
      paid: "Pagamento aprovado. Pedido criado e enviado para processamento.",
      status: "Aqui está o status mais recente do seu pedido."
    };
    return responses[kind];
  },

  // Classify a message sent while the user is looking at the 3 options, using the
  // conversation context. Returns null when OpenAI is unavailable or unsure, so the
  // caller can fall back to deterministic heuristics.
  async classifyTurn(text: string, context: TurnContext): Promise<TurnClassification | null> {
    return classifyTurnWithOpenAI(text, context);
  },

  async curateProductOptions(intent: ProductIntent, products: RankedProduct[]) {
    if (!products.length) return products;
    const heuristicProducts = products.filter((product) => looksLikePrimaryProduct(intent, product.title));
    const candidates = heuristicProducts.length >= 3 ? heuristicProducts : products;
    const selectedIds = await curateProductsWithOpenAI(intent, candidates.slice(0, 12));
    const selected = selectedIds
      ? candidates.filter((product) => selectedIds.includes(product.id))
      : heuristicProducts;
    const curated = selected.length ? selected : heuristicProducts.length ? heuristicProducts : products;
    return curated.slice(0, 3).map((product, index) => ({ ...product, rank: index + 1 }));
  }
};

async function parseIntentWithOpenAI(text: string): Promise<ProductIntent | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Você é a Lia, uma assistente de compras brasileira. Leia a mensagem e extraia a intenção de compra em JSON, funcionando para QUALQUER produto. Regras: (1) Preserve exatamente o produto pedido; nunca troque por outro item nem invente. (2) 'searchQuery' é um termo curto e natural para buscar no Mercado Livre Brasil, com 2 a 5 palavras, sem verbos ('quero','preciso'), sem preço e sem prazo. Ex.: 'quero um cinto de couro masculino preto bem barato' -> searchQuery 'cinto couro masculino preto'. (3) 'category' é o substantivo principal do produto, no singular (ex.: 'cinto', 'fone de ouvido', 'cadeira gamer', 'ração cachorro'). (4) Traduza inglês para português quando ajudar a busca: 'baby wipes' -> category 'lenço umedecido', searchQuery 'lenço umedecido bebê'. (5) Extraia filtros quando houver: preferredBrand (marca), productFilters.color (cor), productFilters.size (tamanho ou numeração), petType/petSize/lifeStage (itens de pet), productFilters.maxPrice (número em reais quando disser 'até/menos de/no máximo X'), productFilters.freeShipping (frete grátis), productFilters.maxDeliveryDays (0 = hoje, 1 = amanhã), productFilters.sort ('cheapest' para 'mais barato', 'fastest' para 'mais rápido' ou 'hoje', 'best' para 'melhor/mais vendido/top'). (6) priceSensitivity e urgency conforme o texto. (7) unsupported=true apenas para itens proibidos (armas, drogas, medicamento controlado, cigarro, bebida alcoólica). Responda apenas JSON válido."
          },
          {
            role: "user",
            content: text
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "product_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                category: { type: ["string", "null"] },
                searchQuery: { type: ["string", "null"] },
                urgency: { type: ["string", "null"], enum: ["fast", "normal", null] },
                priceSensitivity: { type: ["string", "null"], enum: ["cheap", "balanced", "premium", null] },
                preferredBrand: { type: ["string", "null"] },
                productFilters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    petType: { type: ["string", "null"], enum: ["dog", "cat", null] },
                    petSize: { type: ["string", "null"], enum: ["small", "medium", "large", null] },
                    lifeStage: { type: ["string", "null"], enum: ["puppy", "adult", "senior", null] },
                    color: { type: ["string", "null"] },
                    size: { type: ["string", "null"] },
                    packageSize: { type: ["string", "null"], enum: ["small", "medium", "large", null] },
                    maxPrice: { type: ["number", "null"] },
                    freeShipping: { type: ["boolean", "null"] },
                    maxDeliveryDays: { type: ["number", "null"] },
                    sort: { type: ["string", "null"], enum: ["best", "cheapest", "fastest", null] }
                  },
                  required: [
                    "petType",
                    "petSize",
                    "lifeStage",
                    "color",
                    "size",
                    "packageSize",
                    "maxPrice",
                    "freeShipping",
                    "maxDeliveryDays",
                    "sort"
                  ]
                },
                restrictions: { type: "array", items: { type: "string" } },
                wantsRepeat: { type: "boolean" },
                unsupported: { type: "boolean" },
                ambiguous: { type: "boolean" }
              },
              required: [
                "category",
                "searchQuery",
                "urgency",
                "priceSensitivity",
                "preferredBrand",
                "productFilters",
                "restrictions",
                "wantsRepeat",
                "unsupported",
                "ambiguous"
              ]
            }
          }
        }
      })
    });

    if (!response.ok) {
      console.warn("[ai:openai:intent:fallback]", response.status, await response.text().catch(() => ""));
      return null;
    }

    const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const jsonText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as ProductIntent;
    const parsedCategory = parsed.category ?? undefined;
    const fallbackSearchQuery = buildSearchQueryFromText(text, parsedCategory);
    const searchQuery = isGenericSearchQuery(parsed.searchQuery, parsedCategory) ? fallbackSearchQuery : parsed.searchQuery;
    // Always keep a searchable category so arbitrary products don't dead-end on "qual produto?".
    const category = parsedCategory ?? (searchQuery ? searchQuery.trim() : undefined);
    return {
      ...parsed,
      category,
      searchQuery,
      preferredBrand: parsed.preferredBrand ?? undefined,
      productFilters: cleanProductFilters(parsed.productFilters),
      urgency: parsed.urgency ?? "normal",
      priceSensitivity: parsed.priceSensitivity ?? "balanced",
      restrictions: parsed.restrictions ?? []
    };
  } catch (error) {
    console.warn("[ai:openai:fallback]", error);
    return null;
  }
}

export type CatalogMatchResult = {
  greetingOnly: boolean;
  containsMedicine: boolean;
  items: { sku: string | null; query: string; qty: number }[];
};

// Robust everyday-delivery matching: given the store catalog + the customer's
// message, map the request to catalog SKUs. The LLM handles synonyms
// ("pasta de dente"=creme dental, "refri"=refrigerante), greetings, typos, qty and
// flags medicine (which we can't sell). Returns null if OpenAI is unavailable so
// the caller can fall back to the deterministic matcher.
export async function matchCatalog(
  text: string,
  catalog: { sku: string; name: string; brand?: string; category?: string }[]
): Promise<CatalogMatchResult | null> {
  if (!process.env.OPENAI_API_KEY || !catalog.length) return null;
  try {
    const compact = catalog.map((item) => ({ sku: item.sku, nome: item.name, marca: item.brand ?? "", cat: item.category ?? "" }));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Você é a Lia, uma assistente de compras do dia a dia no WhatsApp. Recebe um CATÁLOGO (lista de produtos com sku/nome/marca/cat) e a MENSAGEM do cliente. Sua tarefa: identificar quais produtos do catálogo o cliente quer. Regras: (1) Entenda sinônimos e linguagem natural: 'pasta de dente'=creme dental, 'refri'/'refrigerante'=refrigerante, 'sabão em pó'=sabão, 'lenço de bebê'=lenço umedecido, 'ração'=ração pet, 'papel'=papel higiênico, etc. (2) Para CADA produto pedido: se houver item correspondente no catálogo, devolva o 'sku' EXATO daquele item; se não houver, 'sku'=null e 'query'=o nome que o cliente pediu. NUNCA invente um sku que não está na lista. (3) 'qty'=quantidade pedida (padrão 1). (4) Ignore saudações e conversa fiada: se a mensagem não pede nenhum produto (ex.: 'bom dia', 'tudo bem?'), 'greetingOnly'=true e 'items'=[]. (5) Se o cliente pedir REMÉDIO/medicamento (dipirona, tylenol, antibiótico, tarja, controlado, etc.), 'containsMedicine'=true e NÃO inclua esse item (não vendemos remédio). (6) Quando o pedido for vago ('um refrigerante') escolha o item mais comum do catálogo que sirva. Responda apenas JSON válido."
          },
          { role: "user", content: `CATÁLOGO:\n${JSON.stringify(compact)}\n\nMENSAGEM DO CLIENTE:\n${text}` }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "catalog_match",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                greetingOnly: { type: "boolean" },
                containsMedicine: { type: "boolean" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      sku: { type: ["string", "null"] },
                      query: { type: "string" },
                      qty: { type: "number" }
                    },
                    required: ["sku", "query", "qty"]
                  }
                }
              },
              required: ["greetingOnly", "containsMedicine", "items"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      console.warn("[ai:matchCatalog:fallback]", response.status, await response.text().catch(() => ""));
      return null;
    }
    const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const jsonText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as CatalogMatchResult;
    const valid = new Set(catalog.map((item) => item.sku));
    return {
      greetingOnly: Boolean(parsed.greetingOnly),
      containsMedicine: Boolean(parsed.containsMedicine),
      items: (parsed.items ?? []).map((item) => ({
        sku: item.sku && valid.has(item.sku) ? item.sku : null,
        query: item.query ?? "",
        qty: item.qty && item.qty > 0 ? Math.floor(item.qty) : 1
      }))
    };
  } catch (error) {
    console.warn("[ai:matchCatalog:error]", error);
    return null;
  }
}

export type ShoppingExtraction = {
  greetingOnly: boolean;
  containsMedicine: boolean;
  items: { query: string; qty: number }[];
};

// Extract a clean shopping list from the message WITHOUT a catalog (for the live
// store search). Normalizes synonyms into searchable terms, drops greetings, flags
// medicine, and parses quantities. Returns null if OpenAI is off (caller falls back
// to the deterministic line splitter).
export async function extractShoppingList(text: string): Promise<ShoppingExtraction | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Você é a Lia, assistente de compras do dia a dia no WhatsApp. Extraia a LISTA DE COMPRAS da mensagem. Para CADA produto: 'query' = termo curto e buscável para procurar no catálogo do Carrefour (inclua marca e tamanho se a pessoa disse), normalizando sinônimos e linguagem natural — 'pasta de dente'->'creme dental', 'refri'->'refrigerante', 'sabão em pó'->'sabão em pó', 'lenço de bebê'->'lenço umedecido', 'ração do cachorro'->'ração cachorro'. 'qty' = quantidade pedida (padrão 1). Regras: (1) Se a mensagem for só saudação/conversa sem produto ('bom dia', 'tudo bem?'), 'greetingOnly'=true e 'items'=[]. (2) Se pedir REMÉDIO/medicamento (dipirona, tylenol, antibiótico, tarja, controlado), 'containsMedicine'=true e NÃO inclua esse item. (3) Não invente produtos que a pessoa não pediu. Responda apenas JSON válido."
          },
          { role: "user", content: text }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "shopping_list",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                greetingOnly: { type: "boolean" },
                containsMedicine: { type: "boolean" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { query: { type: "string" }, qty: { type: "number" } },
                    required: ["query", "qty"]
                  }
                }
              },
              required: ["greetingOnly", "containsMedicine", "items"]
            }
          }
        }
      })
    });
    if (!response.ok) {
      console.warn("[ai:extractShoppingList:fallback]", response.status, await response.text().catch(() => ""));
      return null;
    }
    const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const jsonText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as ShoppingExtraction;
    return {
      greetingOnly: Boolean(parsed.greetingOnly),
      containsMedicine: Boolean(parsed.containsMedicine),
      items: (parsed.items ?? [])
        .filter((item) => item.query?.trim())
        .map((item) => ({ query: item.query.trim(), qty: item.qty && item.qty > 0 ? Math.floor(item.qty) : 1 }))
    };
  } catch (error) {
    console.warn("[ai:extractShoppingList:error]", error);
    return null;
  }
}

async function classifyTurnWithOpenAI(text: string, context: TurnContext): Promise<TurnClassification | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const normalized = normalize(text).trim();
  // A bare 1/2/3 is unambiguously a selection — never spend a model call on it.
  if (/^[123]$/.test(normalized)) {
    return { type: "select", selection: { ordinal: Number(normalized), hint: null } };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "O usuário está vendo 3 opções de produto que a Lia ofereceu e respondeu algo. Classifique a resposta em 'type': 'select' (escolheu uma das opções: número, 'a primeira', 'a mais barata', o nome da marca de uma opção, 'quero essa'); 'reject' (não gostou de NENHUMA e quer outras opções do MESMO produto: 'não gostei', 'me manda outras', 'tem mais?', 'nenhuma delas'); 'refine' (mantém o MESMO produto mas muda um filtro como preço, cor, marca, tamanho, porte ou prazo: 'tem mais barato?', 'preciso que chegue hoje', 'quero a preta', 'a versão pequena'); 'new_search' (pediu um produto DIFERENTE dos mostrados); 'smalltalk' (saudação ou dúvida sem pedido); ou 'other'. Para 'select', preencha selection.ordinal (1, 2 ou 3) quando indicar a posição, ou selection.hint ('cheapest' para a mais barata, 'fastest' para a mais rápida, 'brand' quando citar a marca). Responda apenas JSON válido."
          },
          {
            role: "user",
            content: JSON.stringify({
              mensagem: text,
              ultimaBusca: context.lastQuery ?? null,
              opcoes: context.options.map((option) => ({
                n: option.rank,
                titulo: option.title,
                marca: option.brand,
                preco: option.price
              }))
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "turn_classification",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["new_search", "refine", "select", "reject", "smalltalk", "other"] },
                selection: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    ordinal: { type: ["number", "null"] },
                    hint: { type: ["string", "null"], enum: ["cheapest", "fastest", "brand", null] }
                  },
                  required: ["ordinal", "hint"]
                }
              },
              required: ["type", "selection"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      console.warn("[ai:openai:turn:fallback]", response.status);
      return null;
    }

    const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const jsonText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as TurnClassification;
    return parsed?.type ? parsed : null;
  } catch (error) {
    console.warn("[ai:openai:turn:error]", error);
    return null;
  }
}

function refineIntentFromText(text: string, intent: ProductIntent): ProductIntent {
  const normalized = normalize(text);
  const refined: ProductIntent = {
    ...intent,
    productFilters: cleanProductFilters(intent.productFilters)
  };

  if (/\b(baby wipes|wipes|lenco umedecido|lenço umedecido|toalha umedecida|toalhas umedecidas)\b/.test(normalized)) {
    refined.category = "lenco umedecido";
    refined.searchQuery = /\b(baby|bebe|bebê)\b/.test(normalized) ? "lenço umedecido bebê" : "lenço umedecido";
  } else if (/\b(racao|ração|dog food|comida de cachorro|cachorro|cao|cão)\b/.test(normalized)) {
    if (/\b(gato|cat|felino)\b/.test(normalized) && !/\b(cachorro|cao|cão|dog)\b/.test(normalized)) {
      refined.category = "racao gato";
      refined.searchQuery = "ração gato";
      refined.productFilters = mergeProductFilters(refined.productFilters, { petType: "cat" });
    } else if (/\b(racao|ração|dog food|comida de cachorro)\b/.test(normalized)) {
      refined.category = "racao cachorro";
      refined.searchQuery = "ração cachorro";
      refined.productFilters = mergeProductFilters(refined.productFilters, { petType: "dog" });
    }
  } else if (/\b(camisa social|social branca|camisa branca social)\b/.test(normalized)) {
    refined.category = "camisa social";
  } else if (/\b(camiseta|tshirt|t shirt|blusa)\b/.test(normalized)) {
    refined.category = "camiseta";
  } else if (/\b(cinto|belt)\b/.test(normalized)) {
    refined.category = "cinto";
  }

  const brand = BRANDS.find((candidate) => normalized.includes(normalize(candidate)));
  if (brand) refined.preferredBrand = brand;

  const mentionsSmallSize =
    /\b(pequeno|pequena|porte pequeno|mini|small|raca pequena|raça pequena|racas pequenas|raças pequenas)\b/.test(normalized) ||
    (/\b(menor|menores)\b/.test(normalized) && !/\bmenor\s+(preco|preço)\b/.test(normalized));
  if (mentionsSmallSize) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { petSize: "small" });
  } else if (/\b(grande|porte grande|large|raca grande|raça grande|racas grandes|raças grandes)\b/.test(normalized)) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { petSize: "large" });
  } else if (/\b(medio|media|médio|média|porte medio|porte médio|medium)\b/.test(normalized)) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { petSize: "medium" });
  }

  if (/\b(filhote|puppy|junior)\b/.test(normalized)) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { lifeStage: "puppy" });
  } else if (/\b(senior|idoso|idosa|velho|velha)\b/.test(normalized)) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { lifeStage: "senior" });
  } else if (/\b(adulto|adult)\b/.test(normalized)) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { lifeStage: "adult" });
  }

  const color = extractColor(normalized);
  if (color) refined.productFilters = mergeProductFilters(refined.productFilters, { color });

  const size = extractSize(normalized);
  if (size) refined.productFilters = mergeProductFilters(refined.productFilters, { size });

  if (/\b(frete gratis|frete grátis|envio gratis|envio grátis|sem frete)\b/.test(normalized)) {
    refined.productFilters = mergeProductFilters(refined.productFilters, { freeShipping: true });
  }

  if (/\b(hoje|agora|mesmo dia|chega hoje|chegue hoje|chegar hoje|pra hoje)\b/.test(normalized)) {
    refined.urgency = "fast";
    refined.productFilters = mergeProductFilters(refined.productFilters, { sort: "fastest", maxDeliveryDays: 0 });
  } else if (/\b(amanha|amanhã|ate amanha|até amanhã)\b/.test(normalized)) {
    refined.urgency = "fast";
    refined.productFilters = mergeProductFilters(refined.productFilters, { sort: "fastest", maxDeliveryDays: 1 });
  } else if (/\b(rapido|rápido|mais rapida|mais rápida|prazo|entrega)\b/.test(normalized)) {
    refined.urgency = "fast";
    refined.productFilters = mergeProductFilters(refined.productFilters, { sort: "fastest" });
  }

  if (/(barat|menor preco|menor preço|mais em conta|econom)/.test(normalized)) {
    refined.priceSensitivity = "cheap";
    refined.productFilters = mergeProductFilters(refined.productFilters, { sort: "cheapest" });
  } else if (/(melhor|premium|qualidade|avaliad|mais vendido|best seller|bestseller)/.test(normalized)) {
    refined.priceSensitivity = "premium";
    refined.productFilters = mergeProductFilters(refined.productFilters, { sort: "best" });
  }

  const maxPrice = extractMaxPrice(normalized);
  if (maxPrice) {
    refined.priceSensitivity = "cheap";
    refined.productFilters = mergeProductFilters(refined.productFilters, { maxPrice, sort: "cheapest" });
  }

  if (/\b(camisa|camiseta|blusa|tshirt|t shirt)\b/.test(normalized) && !refined.searchQuery) {
    refined.searchQuery = buildSearchQueryFromText(text, refined.category);
  }

  refined.searchQuery = enrichSearchQueryWithFilters(refined);

  return refined;
}

function cleanProductFilters(filters?: ProductFilters | null): ProductFilters | undefined {
  if (!filters) return undefined;
  const cleaned: ProductFilters = {};
  for (const [key, value] of Object.entries(filters) as Array<[keyof ProductFilters, ProductFilters[keyof ProductFilters]]>) {
    if (value === null || value === undefined || value === "") continue;
    (cleaned as Record<string, unknown>)[key] = value;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function mergeProductFilters(current: ProductFilters | undefined, next: ProductFilters): ProductFilters {
  return cleanProductFilters({ ...(current ?? {}), ...next }) ?? {};
}

function enrichSearchQueryWithFilters(intent: ProductIntent) {
  const parts = new Set(
    normalize([intent.preferredBrand, intent.searchQuery ?? intent.category].filter(Boolean).join(" "))
      .split(/\s+/)
      .filter(Boolean)
  );
  const filters = intent.productFilters;

  if (intent.preferredBrand) normalize(intent.preferredBrand).split(/\s+/).forEach((part) => parts.add(part));
  if (filters?.petSize === "small") ["porte", "pequeno"].forEach((part) => parts.add(part));
  if (filters?.petSize === "medium") ["porte", "medio"].forEach((part) => parts.add(part));
  if (filters?.petSize === "large") ["porte", "grande"].forEach((part) => parts.add(part));
  if (filters?.lifeStage === "puppy") parts.add("filhote");
  if (filters?.lifeStage === "adult") parts.add("adulto");
  if (filters?.lifeStage === "senior") parts.add("senior");
  if (filters?.color) parts.add(normalize(filters.color));
  if (filters?.size) parts.add(normalize(filters.size));

  const query = Array.from(parts).join(" ").trim();
  return query || intent.searchQuery;
}

function extractColor(normalized: string) {
  const colors = [
    "preto",
    "preta",
    "branco",
    "branca",
    "azul",
    "vermelho",
    "vermelha",
    "verde",
    "amarelo",
    "amarela",
    "rosa",
    "roxo",
    "roxa",
    "cinza",
    "bege",
    "marrom"
  ];
  return colors.find((color) => new RegExp(`\\b${color}\\b`).test(normalized));
}

function extractSize(normalized: string) {
  const letterSize = normalized.match(/\b(pp|p|m|g|gg|xg|xgg|xp|xs|s|xl|xxl)\b/);
  if (letterSize) return letterSize[1].toUpperCase();
  const numericSize = normalized.match(/\b(tam|tamanho|numero|número|num|n)\s*(\d{2})\b/);
  return numericSize?.[2];
}

function extractMaxPrice(normalized: string) {
  const match = normalized.match(/\b(?:menos de|ate|até|abaixo de|max(?:imo)?|no maximo|no máximo)\s*r?\$?\s*(\d+(?:[,.]\d{1,2})?)\b/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function curateProductsWithOpenAI(intent: ProductIntent, products: RankedProduct[]) {
  if (!process.env.OPENAI_API_KEY || !products.length) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Você é curador de resultados de marketplace para um concierge de compras. Selecione somente produtos que sejam o produto principal pedido e obedeçam aos filtros. Não selecione acessórios, enfeites, peças, suportes, capas, chaveiros, adesivos, aromatizadores, miniaturas ou itens apenas relacionados. Se o pedido tiver marca, porte, cor, tamanho, idade do pet, frete ou prazo, descarte resultados conflitantes. Para ração, descarte petiscos, brinquedos e itens para porte errado. Prefira resultados populares/comerciais normais, não itens estranhos. Preserve a ordem de relevância quando houver empate. Responda apenas JSON válido."
          },
          {
            role: "user",
            content: JSON.stringify({
              pedido: {
                categoria: intent.category,
                busca: intent.searchQuery,
                marca: intent.preferredBrand,
                filtros: intent.productFilters
              },
              candidatos: products.map((product) => ({
                id: product.id,
                titulo: product.title,
                marca: product.brand,
                preco: product.price,
                loja: product.store
              }))
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "product_curation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                selectedIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 3
                }
              },
              required: ["selectedIds"]
            }
          }
        }
      })
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const jsonText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as { selectedIds?: string[] };
    const validIds = new Set(products.map((product) => product.id));
    return (parsed.selectedIds ?? []).filter((id) => validIds.has(id));
  } catch (error) {
    console.warn("[ai:product-curation:fallback]", error);
    return null;
  }
}

function looksLikePrimaryProduct(intent: ProductIntent, title: string) {
  const query = normalize([intent.category, intent.searchQuery].filter(Boolean).join(" "));
  const normalizedTitle = normalize(title);
  const accessoryWords = [
    "acessorio",
    "acessorios",
    "adesivo",
    "aromatizador",
    "aroma",
    "buzina",
    "calcadeira",
    "chaveiro",
    "chifre",
    "capa",
    "case",
    "decoracao",
    "enfeite",
    "forma",
    "miniatura",
    "palminha",
    "pendente",
    "pingente",
    "purificador",
    "suporte",
    "sticker"
  ];

  if (accessoryWords.some((word) => containsWord(normalizedTitle, word) && !query.includes(word))) return false;

  if (intent.preferredBrand && !normalizedTitle.includes(normalize(intent.preferredBrand))) {
    return false;
  }

  if (/\b(lenco umedecido|baby wipes|wipes|toalha umedecida)\b/.test(query)) {
    return /\b(lenco|toalha|toalhas|umedecido|umedecida|wipes|baby|bebe)\b/.test(normalizedTitle);
  }

  if (/\b(racao cachorro|racao para cachorro|dog food|cachorro|cao)\b/.test(query)) {
    if (!/\b(racao|ração|alimento|comida|dog food|cao|caes|cachorro|canino)\b/.test(normalizedTitle)) return false;
    if (/\b(petisco|bifinho|brinquedo|coleira|tapete|areia|comedouro|bebedouro)\b/.test(normalizedTitle)) return false;
    if (intent.productFilters?.petSize === "small" && /\b(porte grande|racas grandes|raças grandes|grande porte|large breed|gigante)\b/.test(normalizedTitle)) return false;
    if (intent.productFilters?.petSize === "large" && /\b(porte pequeno|racas pequenas|raças pequenas|pequeno porte|small breed|mini)\b/.test(normalizedTitle)) return false;
    return true;
  }

  if (/\b(racao gato|racao para gato|cat food|gato|felino)\b/.test(query)) {
    if (!/\b(racao|ração|alimento|comida|cat food|gato|felino)\b/.test(normalizedTitle)) return false;
    return !/\b(petisco|brinquedo|coleira|tapete|areia|comedouro|bebedouro)\b/.test(normalizedTitle);
  }

  if (/\b(sapato|sapatos|tenis|sneaker|calcado)\b/.test(query)) {
    return /\b(sapato|sapatos|tenis|sneaker|calcado|calcados|bota|sandalia|chinelo|mocassim|sapatilha)\b/.test(normalizedTitle);
  }

  return true;
}

function isGenericSearchQuery(searchQuery?: string, category?: string) {
  if (!searchQuery) return true;
  if (!category) return false;
  return normalize(searchQuery).trim() === normalize(category).trim();
}

function buildSearchQueryFromText(text: string, category?: string) {
  let query = normalize(text)
    .replace(/\b(eu|vc|voce|voces|por favor|pfv|pls|please|muito|muita|mt)\b/g, " ")
    .replace(/\b(quero|queria|preciso|necessito|procuro|busca|buscar|comprar|compra|compraria|me ve|manda|arruma)\b/g, " ")
    .replace(/\b(um|uma|uns|umas|o|a|os|as|de|do|da|dos|das|para|pra|pro|com|sem)\b/g, " ")
    .replace(/\b(hoje|agora|urgente|rapido|rapida|mais rapido|entrega|entregar|chega|chegue|chegar)\b/g, " ")
    .replace(/\b(barato|barata|baratos|baratas|menor preco|mais em conta|economico|economica|premium|melhor|qualidade)\b/g, " ")
    .replace(/\b(mesma|mesmo|ultimo|ultima|vez|novo|nova)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!query || query.length < 2) return category;
  if (category && isCoveredByCategory(query, category)) return category;
  if (category && category !== "produto" && !query.includes(normalize(category)) && !hasCategoryTokens(query, category)) {
    query = `${category} ${query}`;
  }
  return query;
}

function hasCategoryTokens(query: string, category: string) {
  const queryTokens = new Set(normalize(query).split(/\s+/).filter(Boolean));
  return normalize(category)
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => queryTokens.has(token));
}

function isCoveredByCategory(query: string, category: string) {
  const categoryTokens = new Set(normalize(category).split(/\s+/));
  const queryTokens = normalize(query)
    .split(/\s+/)
    .filter((token) => token.length > 1);
  return queryTokens.length > 0 && queryTokens.every((token) => categoryTokens.has(token));
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Word-boundary match so "forma" doesn't match "informado" nor "case" "casual".
function containsWord(haystack: string, term: string) {
  if (!term) return false;
  if (/\s/.test(term)) return haystack.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystack);
}
