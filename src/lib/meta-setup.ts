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

export type MetaSetupAction = "status" | "profile" | "picture" | "welcome" | "flow" | "flow_update" | "flow_errors";

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

export async function runMetaSetup(action: MetaSetupAction, opts: { flowId?: string } = {}): Promise<Record<string, unknown>> {
  const { token, phoneId } = creds();
  if (action === "flow_errors" || action === "flow_update") {
    const flowId = (opts.flowId ?? process.env.LIA_FLOW_ADDRESS_ID ?? "").trim();
    if (!/^\d{6,}$/.test(flowId)) throw new Error("flow_id ausente (?flow_id=<id do Flow>)");
    return action === "flow_errors" ? flowErrors(token, flowId) : flowUpdateAndPublish(token, flowId);
  }
  if (action === "status") {
    const profile = await graph(token, `${phoneId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`);
    const automation = await graph(token, `${phoneId}/conversational_automation`).catch((e) => ({ error: String(e).slice(0, 300) }));
    const { appId, waba } = await ids(token);
    let flows: unknown = null;
    if (waba) flows = await graph(token, `${waba}/flows?fields=id,name,status`).catch((e) => ({ error: String(e).slice(0, 300) }));
    return { profile, automation, hasAppId: Boolean(appId), hasWaba: Boolean(waba), flows, flowEnv: process.env.LIA_FLOW_ADDRESS_ID ?? null };
  }
  if (action === "profile") {
    return graph(token, `${phoneId}/whatsapp_business_profile`, { method: "POST", body: JSON.stringify(META_PROFILE) });
  }
  if (action === "picture") {
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
    return graph(token, `${phoneId}/whatsapp_business_profile`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: upload.h })
    });
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
