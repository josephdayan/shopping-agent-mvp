import type { ProductOption } from "@prisma/client";
import type { ProductIntent } from "@/lib/types";

const CATEGORY_SYNONYMS: Array<[string, string[]]> = [
  ["escova de dente", ["escova", "escova dental", "toothbrush"]],
  ["pasta de dente", ["pasta", "creme dental", "toothpaste"]],
  ["shampoo", ["shampoo", "xampu"]],
  ["lenco de papel", ["lenco", "lenço", "kleenex", "papel"]],
  ["protetor solar", ["protetor", "protetor solar", "filtro solar"]],
  ["desodorante", ["desodorante", "antitranspirante"]],
  ["carregador", ["carregador", "cabo", "usb-c", "iphone"]],
  ["pilhas", ["pilha", "pilhas", "bateria aa", "bateria aaa"]],
  ["agua", ["agua", "água", "garrafa de agua"]],
  ["chocolate", ["chocolate", "bombom", "barra"]],
  ["livro", ["livro", "book"]],
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
  "Lacta"
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
    intent.searchQuery = buildSearchQueryFromText(text, intent.category);

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
              "Você extrai intenção de compra em português do Brasil para o Atlas, um concierge de compras. Preserve nomes específicos, títulos de livros, modelos, marcas, cores e estilos em searchQuery. Exemplo: 'quero uma camisa branca social' vira category 'camisa social' e searchQuery 'camisa branca social'. Responda apenas JSON válido."
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

  if (/\b(camisa social|social branca|camisa branca social)\b/.test(normalized)) {
    refined.category = "camisa social";
  } else if (/\b(camiseta|tshirt|t shirt|blusa)\b/.test(normalized)) {
    refined.category = "camiseta";
  }

  if (/\b(camisa|camiseta|blusa|tshirt|t shirt)\b/.test(normalized)) {
    refined.searchQuery = buildSearchQueryFromText(text, refined.category);
  }

  return refined;
}

function isGenericSearchQuery(searchQuery?: string, category?: string) {
  if (!searchQuery) return true;
  if (!category) return false;
  return normalize(searchQuery).trim() === normalize(category).trim();
}

function buildSearchQueryFromText(text: string, category?: string) {
  let query = normalize(text)
    .replace(/\b(eu|vc|voce|voces|por favor|pfv|pls|please)\b/g, " ")
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
