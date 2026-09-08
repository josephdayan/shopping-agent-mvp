// Configuração do número da Lia na Meta via Graph API (04/09/2026): perfil comercial,
// boas-vindas + perguntas sugeridas ("ice breakers") e o Flow de endereço. Roda DENTRO
// da Vercel (rota /api/ops/meta-setup, protegida pela sessão do /ops) porque o token da
// Meta é sensível e não sai da Vercel. Cada ação é idempotente: repetir só regrava.
import { readFile } from "node:fs/promises";
import path from "node:path";

const GRAPH = "https://graph.facebook.com/v22.0";

export const META_PROFILE = {
  messaging_product: "whatsapp",
  about: "Compras do dia a dia pelo WhatsApp",
  description:
    "Lia é sua concierge de compras: peça qualquer item por mensagem, veja opções reais com preço e prazo, pague por Pix ou cartão aqui mesmo, e a loja entrega na sua casa.",
  email: "contato@liadelivery.com.br",
  websites: ["https://liadelivery.com.br"],
  vertical: "RETAIL"
};

// Até 4 perguntas sugeridas, ≤ 80 caracteres cada. Aparecem quando alguém abre o chat
// pela primeira vez; o toque chega como mensagem de texto normal.
export const META_PROMPTS = ["Quero um chá", "Ração pro meu cachorro", "Papel higiênico e sabão", "Um presente da Boticário"];

// Flow de endereço: CEP/rua/bairro/cidade pré-preenchidos (ViaCEP); o cliente completa
// número e complemento com validação. Terminal: o "complete" volta como nfm_reply.
export const ADDRESS_FLOW_JSON = {
  version: "7.0",
  screens: [
    {
      id: "ADDRESS",
      title: "Endereço de entrega",
      terminal: true,
      data: {
        cep: { type: "string", __example__: "01229-000" },
        rua: { type: "string", __example__: "Rua das Flores" },
        bairro: { type: "string", __example__: "Bela Vista" },
        cidade: { type: "string", __example__: "São Paulo" }
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          // O que já sabemos pelo CEP aparece como texto (TextInput não aceita valor
          // inicial na Meta — 2º publish falhou por isso); o cliente só digita o que falta.
          { type: "TextSubheading", text: "Confira seu endereço" },
          { type: "TextBody", text: "${data.rua}" },
          { type: "TextCaption", text: "${data.bairro}" },
          { type: "TextCaption", text: "${data.cidade}" },
          { type: "TextCaption", text: "${data.cep}" },
          {
            type: "Form",
            name: "form",
            children: [
              { type: "TextInput", name: "numero", label: "Número", required: true, "input-type": "number" },
              { type: "TextInput", name: "complemento", label: "Complemento", required: false },
              {
                type: "Footer",
                label: "Confirmar endereço",
                "on-click-action": {
                  name: "complete",
                  payload: {
                    cep: "${data.cep}",
                    rua: "${data.rua}",
                    bairro: "${data.bairro}",
                    cidade: "${data.cidade}",
                    numero: "${form.numero}",
                    complemento: "${form.complemento}"
                  }
                }
              }
            ]
          }
        ]
      }
    }
  ]
};

// Carrossel da vitrine (dono, 07/09: "eu quero fazer carrossel"). Na Meta, carrossel só
// existe como TEMPLATE de MARKETING (não há carrossel livre na janela de 24h): cada envio
// é cobrado (~R$0,33 no Brasil) e o número de cards é FIXO por template — por isso um
// template por tamanho (2 e 3 cards; 1 opção continua no card simples). O texto do card
// e o payload do botão são variáveis: nome, preço, prazo e `optsku:<sku>` entram na hora
// do envio; a foto vem por link. O toque em "Escolher este" volta como `button.payload`,
// que o parseInbound já lê. Limites: body do card ≤ 160, botão ≤ 25, corpo ≤ 1024, e o
// corpo não pode terminar em variável.
export const CAROUSEL_TEMPLATE_PREFIX = process.env.LIA_CAROUSEL_TEMPLATE?.trim() || "vitrine_carrossel";
export const CAROUSEL_CARD_COUNTS = [2, 3] as const;
export const CAROUSEL_BODY = "{{1}} Toca em *Escolher este* no card que preferir 👇";
export const CAROUSEL_CARD_BODY = "{{1}}\n*{{2}}*\n{{3}}";
export const CAROUSEL_BUTTONS = [
  { type: "quick_reply", text: "Escolher este" },
  { type: "quick_reply", text: "Ver detalhes" }
] as const;

export function carouselTemplateName(cards: number): string {
  return `${CAROUSEL_TEMPLATE_PREFIX}_${cards}`;
}

export function buildCarouselTemplate(cards: number, headerHandle: string) {
  const card = {
    components: [
      { type: "header", format: "image", example: { header_handle: [headerHandle] } },
      { type: "body", text: CAROUSEL_CARD_BODY, example: { body_text: [["Ração Golden Adulto 15kg", "R$ 189,90", "Petz · prazo da loja: 1 dia útil"]] } },
      { type: "buttons", buttons: CAROUSEL_BUTTONS.map((b) => ({ ...b })) }
    ]
  };
  return {
    name: carouselTemplateName(cards),
    language: "pt_BR",
    category: "marketing",
    components: [
      { type: "body", text: CAROUSEL_BODY, example: { body_text: [["Opções de *ração pra cachorro*:"]] } },
      { type: "carousel", cards: Array.from({ length: cards }, () => JSON.parse(JSON.stringify(card))) }
    ]
  };
}

function creds() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID não configurados");
  return { token, phoneId };
}

async function graph(token: string, pathname: string, init: RequestInit & { raw?: boolean } = {}) {
  const res = await fetch(`${GRAPH}/${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !init.raw ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(20_000)
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${pathname} → ${res.status}: ${JSON.stringify(json).slice(0, 600)}`);
  return json as Record<string, unknown>;
}

async function ids(token: string) {
  const dbg = (await graph(token, `debug_token?input_token=${encodeURIComponent(token)}`)) as {
    data?: { app_id?: string; granular_scopes?: Array<{ scope: string; target_ids?: string[] }> };
  };
  const appId = dbg.data?.app_id;
  // Tokens permanentes de System User podem ter a permissão correta sem expor
  // `target_ids` no debug_token. Nesse caso usamos o WABA explícito do número.
  const waba =
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ||
    dbg.data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_management")?.target_ids?.[0];
  return { appId, waba };
}

export type MetaSetupAction = "status" | "profile" | "picture" | "welcome" | "flow" | "flow_update" | "flow_errors" | "carousel" | "templates";

// Erros de validação de um Flow (a Meta cria o rascunho mesmo inválido e recusa publicar).
async function flowErrors(token: string, flowId: string) {
  return graph(token, `${flowId}?fields=id,name,status,validation_errors`);
}

// Atualiza o JSON de um Flow existente (multipart, asset FLOW_JSON) e tenta publicar.
async function flowUpdateAndPublish(token: string, flowId: string) {
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append("file", new Blob([JSON.stringify(ADDRESS_FLOW_JSON)], { type: "application/json" }), "flow.json");
  const updated = await graph(token, `${flowId}/assets`, { method: "POST", raw: true, body: form });
  const errors = await flowErrors(token, flowId);
  const list = (errors as { validation_errors?: unknown[] }).validation_errors ?? [];
  if (list.length) return { updated, published: false, validation_errors: list };
  const published = await graph(token, `${flowId}/publish`, { method: "POST" });
  return { updated, published, status: await flowErrors(token, flowId) };
}

// Upload resumable da imagem da marca → handle usável em perfil e em exemplo de template.
async function uploadBrandImage(token: string): Promise<string> {
  const { appId } = await ids(token);
  if (!appId) throw new Error("app_id não veio do debug_token");
  const file = path.join(process.cwd(), "public/brand/lia-whatsapp-profile-hd.png");
  const bytes = await readFile(file);
  const session = (await graph(token, `${appId}/uploads?file_length=${bytes.length}&file_type=image/png`, { method: "POST" })) as { id: string };
  const upload = (await graph(token, session.id, {
    method: "POST",
    raw: true,
    headers: { file_offset: "0", "Content-Type": "application/octet-stream" },
    body: new Uint8Array(bytes)
  })) as { h: string };
  return upload.h;
}

export async function runMetaSetup(action: MetaSetupAction, opts: { flowId?: string } = {}): Promise<Record<string, unknown>> {
  const { token, phoneId } = creds();
  if (action === "flow_errors" || action === "flow_update") {
    const flowId = (opts.flowId ?? process.env.LIA_FLOW_ADDRESS_ID ?? "").trim();
    if (!/^\d{6,}$/.test(flowId)) throw new Error("flow_id ausente (?flow_id=<id do Flow>)");
    return action === "flow_errors" ? flowErrors(token, flowId) : flowUpdateAndPublish(token, flowId);
  }
  if (action === "status") {
    const profile = await graph(token, `${phoneId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`);
    // Leitura é como CAMPO do número (o POST é na sub-rota; o GET na sub-rota dá "#100
    // nonexisting field" — visto em 04/09).
    const automation = await graph(token, `${phoneId}?fields=conversational_automation`).catch((e) => ({ error: String(e).slice(0, 300) }));
    const { appId, waba } = await ids(token);
    let flows: unknown = null;
    if (waba) flows = await graph(token, `${waba}/flows?fields=id,name,status`).catch((e) => ({ error: String(e).slice(0, 300) }));
    return { profile, automation, hasAppId: Boolean(appId), hasWaba: Boolean(waba), flows, flowEnv: process.env.LIA_FLOW_ADDRESS_ID ?? null };
  }
  if (action === "profile") {
    return graph(token, `${phoneId}/whatsapp_business_profile`, { method: "POST", body: JSON.stringify(META_PROFILE) });
  }
  if (action === "picture") {
    const handle = await uploadBrandImage(token);
    return graph(token, `${phoneId}/whatsapp_business_profile`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: handle })
    });
  }
  if (action === "templates") {
    const { waba } = await ids(token);
    if (!waba) throw new Error("WABA id não veio do debug_token");
    const names = CAROUSEL_CARD_COUNTS.map(carouselTemplateName);
    const list = (await graph(token, `${waba}/message_templates?fields=name,status,category,rejected_reason,quality_score&limit=100`)) as { data?: Array<{ name: string }> };
    return { carousel: (list.data ?? []).filter((t) => names.includes(t.name)), expected: names, enabled: process.env.LIA_CAROUSEL === "true" };
  }
  if (action === "carousel") {
    const { waba } = await ids(token);
    if (!waba) throw new Error("WABA id não veio do debug_token");
    // A imagem de exemplo do header é só para a revisão da Meta; na hora do envio cada
    // card recebe a foto do produto por link.
    const handle = await uploadBrandImage(token);
    const results: Record<string, unknown> = {};
    for (const cards of CAROUSEL_CARD_COUNTS) {
      const body = buildCarouselTemplate(cards, handle);
      results[body.name] = await graph(token, `${waba}/message_templates`, { method: "POST", body: JSON.stringify(body) }).catch((e) => ({ error: String(e).slice(0, 600) }));
    }
    return results;
  }
  if (action === "welcome") {
    return graph(token, `${phoneId}/conversational_automation`, {
      method: "POST",
      body: JSON.stringify({ enable_welcome_message: true, prompts: META_PROMPTS })
    });
  }
  if (action === "flow") {
    const { waba } = await ids(token);
    if (!waba) throw new Error("WABA id não veio do debug_token");
    try {
      return await graph(token, `${waba}/flows`, {
        method: "POST",
        body: JSON.stringify({
          name: `endereco_entrega_${Date.now().toString(36)}`,
          categories: ["OTHER"],
          flow_json: JSON.stringify(ADDRESS_FLOW_JSON),
          publish: true
        })
      });
    } catch (error) {
      // "Flow was created, but publishing failed": devolve os erros de validação do
      // rascunho que ficou, em vez de deixar o operador sem saber o quê consertar.
      const message = error instanceof Error ? error.message : String(error);
      const created = message.match(/Flow ID: (\d+)/)?.[1];
      if (!created) throw error;
      return { created_id: created, published: false, ...(await flowErrors(token, created)) };
    }
  }
  throw new Error(`ação desconhecida: ${String(action)}`);
}
