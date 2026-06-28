import type { ProductOption } from "@prisma/client";
import type { ProductIntent, RankedProduct } from "@/lib/types";

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
  ["camisa social", ["camisa social", "social branca", "camisa branca social"]],
  ["camiseta", ["camiseta", "blusa", "t-shirt", "tshirt"]]
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
  "Johnson"
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
    Object.assign(intent, refineIntentFromText(text, intent));
    intent.searchQuery = intent.searchQuery ?? buildSearchQueryFromText(text, intent.category);

    const brand = BRANDS.find((candidate) => normalized.includes(normalize(candidate)));
    if (brand) intent.preferredBrand = brand;

    if (/(barat|menor preco|mais em conta|econom)/.test(normalized)) {
      intent.priceSensitivity = "cheap";
    } else if (/(melhor|premium|qualidade|avaliad)/.test(normalized)) {
      intent.priceSensitivity = "premium";
    } else {
      intent.priceSensitivity = "balanced";
    }

    if (/(hoje|agora|rapido|rápido|urgente|entrega rapida)/.test(normalized)) {
      intent.urgency = "fast";
    } else {
      intent.urgency = "normal";
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
      clarify: "Posso buscar. Você prefere menor preço, melhor qualidade ou entrega mais rápida?",
      options: "Separei algumas opções. Toque em uma ou responda o número.",
      checkout: "Separei o resumo do pedido. Confirmo esse pedido?",
      unsupported: "Ainda não consigo comprar esse tipo de item pelo Atlas. Posso ajudar com higiene, beleza e mercado básico.",
      paid: "Pagamento aprovado. Pedido criado e enviado para processamento.",
      status: "Aqui está o status mais recente do seu pedido."
    };
    return responses[kind];
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
              "Você extrai intenção de compra em português do Brasil para o Atlas, um concierge de compras. Preserve exatamente o produto pedido: não substitua por outro item, não use histórico e não invente categoria. Se o usuário escrever em inglês, traduza para um termo comum no Mercado Livre Brasil apenas quando isso melhorar a busca. Exemplos: 'baby wipes' vira category 'lenco umedecido' e searchQuery 'lenço umedecido bebê'; 'quero uma camisa branca social' vira category 'camisa social' e searchQuery 'camisa branca social'. Preserve títulos de livros, modelos, marcas, cores e estilos em searchQuery. Responda apenas JSON válido."
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

    if (!response.ok) return null;

    const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const jsonText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as ProductIntent;
    const category = parsed.category ?? undefined;
    const fallbackSearchQuery = buildSearchQueryFromText(text, category);
    const searchQuery = isGenericSearchQuery(parsed.searchQuery, category) ? fallbackSearchQuery : parsed.searchQuery;
    return {
      ...parsed,
      category,
      searchQuery,
      preferredBrand: parsed.preferredBrand ?? undefined,
      urgency: parsed.urgency ?? "normal",
      priceSensitivity: parsed.priceSensitivity ?? "balanced",
      restrictions: parsed.restrictions ?? []
    };
  } catch (error) {
    console.warn("[ai:openai:fallback]", error);
    return null;
  }
}

function refineIntentFromText(text: string, intent: ProductIntent): ProductIntent {
  const normalized = normalize(text);
  const refined: ProductIntent = { ...intent };

  if (/\b(baby wipes|wipes|lenco umedecido|lenço umedecido|toalha umedecida|toalhas umedecidas)\b/.test(normalized)) {
    refined.category = "lenco umedecido";
    refined.searchQuery = /\b(baby|bebe|bebê)\b/.test(normalized) ? "lenço umedecido bebê" : "lenço umedecido";
  } else if (/\b(camisa social|social branca|camisa branca social)\b/.test(normalized)) {
    refined.category = "camisa social";
  } else if (/\b(camiseta|tshirt|t shirt|blusa)\b/.test(normalized)) {
    refined.category = "camiseta";
  }

  if (/\b(camisa|camiseta|blusa|tshirt|t shirt)\b/.test(normalized) && !refined.searchQuery) {
    refined.searchQuery = buildSearchQueryFromText(text, refined.category);
  }

  return refined;
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
              "Você é curador de resultados de marketplace para um concierge de compras. Selecione somente produtos que sejam o produto principal pedido, não acessórios, enfeites, peças, suportes, capas, chaveiros, adesivos, aromatizadores, miniaturas ou itens apenas relacionados. Prefira resultados populares/comerciais normais, não itens estranhos. Preserve a ordem de relevância quando houver empate. Responda apenas JSON válido."
          },
          {
            role: "user",
            content: JSON.stringify({
              pedido: {
                categoria: intent.category,
                busca: intent.searchQuery,
                marca: intent.preferredBrand
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

  if (accessoryWords.some((word) => normalizedTitle.includes(word) && !query.includes(word))) return false;

  if (/\b(lenco umedecido|baby wipes|wipes|toalha umedecida)\b/.test(query)) {
    return /\b(lenco|toalha|toalhas|umedecido|umedecida|wipes|baby|bebe)\b/.test(normalizedTitle);
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
    .replace(/\b(hoje|agora|urgente|rapido|rapida|mais rapido|entrega|entregar)\b/g, " ")
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
