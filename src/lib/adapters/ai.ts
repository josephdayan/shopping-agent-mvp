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
  ["chocolate", ["chocolate", "bombom", "barra"]]
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
    if (openAiIntent) return openAiIntent;

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

    intent.ambiguous = !intent.category && !intent.wantsRepeat;
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
      clarify: "Posso buscar. Voce prefere menor preco, melhor avaliada ou entrega mais rapida?",
      options: "Encontrei estas opcoes. Pode tocar em uma delas ou responder 1, 2, 3, mais barata, mais rapida ou a marca.",
      checkout: "Separei o resumo do pedido. Confirmo esse pedido?",
      unsupported: "Ainda nao consigo comprar esse tipo de item no MVP. Posso ajudar com higiene, beleza e mercado basico.",
      paid: "Pagamento aprovado. Pedido criado e enviado para processamento.",
      status: "Aqui esta o status mais recente do seu pedido."
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
              "Voce extrai intencao de compra em portugues do Brasil para um agente de compras. Responda apenas JSON valido."
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
    return {
      ...parsed,
      category: parsed.category ?? undefined,
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

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
