import { NextResponse } from "next/server";
import { requireOpsKey } from "@/lib/auth";
import { buildPixOrderDetailsPayload } from "@/lib/adapters/whatsapp";

export const dynamic = "force-dynamic";

// Sonda da bolha nativa de Pix (order_details + pix_dynamic_code), 31/08/2026.
// A pergunta que só produção responde: a Graph aceita pix_dynamic_code no NOSSO
// número sem a habilitação que barrou o One-Click? Esta rota manda UMA bolha de
// teste pro WhatsApp do operador usando as credenciais reais e devolve o veredito
// da Graph em JSON. O código Pix é deliberadamente NÃO-pagável (chave de exibição
// e EMV de mentira): a sonda mede aceitação da API, nunca movimenta dinheiro.
// Disparo manual do operador (mesma guarda das outras rotas /ops); sem cron, sem
// efeito no fluxo do cliente.

// Guarda compartilhada (src/lib/auth.ts): fail-closed em deploy, tempo constante,
// cookie HMAC. `?key=` continua aceito só por compatibilidade com scripts do operador.
function authed(request: Request) {
  return requireOpsKey(request, { allowQuery: true }) === null;
}

const PROBE_BODY =
  "\u{1F9EA} Teste técnico da bolha de pagamento — NÃO é uma cobrança. Pode ignorar.";

// EMV de fachada: estrutura plausível, chave inexistente, CRC inválido — se
// alguém tocar em "Pagar com Pix", o banco recusa o código e nada acontece.
const PROBE_PIX_CODE =
  "00020126580014BR.GOV.BCB.PIX0136teste-lia-sonda-nao-pagavel-0000005204000053039865405" +
  "1.005802BR5912Lia Delivery6009SAO PAULO62070503***6304ABCD";

function hintFor(status: number, graph: unknown): string {
  const text = JSON.stringify(graph ?? {});
  if (status >= 200 && status < 300) {
    return "Graph ACEITOU a bolha Pix. Olha teu WhatsApp: se ela aparecer, a porta está aberta sem habilitação (aí é só setar LIA_NATIVE_PIX + LIA_PIX_* e testar um pedido real). Se não chegar em ~1 min, foi descarte assíncrono — procurar [whatsapp:meta:status-failed] nos logs.";
  }
  if (text.includes("131047") || text.includes("Re-engagement")) {
    return "Janela de 24h fechada: manda qualquer 'oi' pra Lia pelo teu WhatsApp e abre esta URL de novo.";
  }
  if (text.includes("\"code\":10") || /permission|not authorized|payments/i.test(text)) {
    return "Sem permissão para payments neste número — mesmo bloqueio do One-Click; caminho vira Solution Partner / GA da Meta.";
  }
  return "Erro não mapeado — ler o objeto graph abaixo.";
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const to = process.env.LIA_OPERATOR_PHONE?.trim();
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (process.env.WHATSAPP_PROVIDER !== "meta" || !to || !token || !phoneNumberId) {
    return NextResponse.json(
      { ok: false, reason: "faltam envs: WHATSAPP_PROVIDER=meta, LIA_OPERATOR_PHONE, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID" },
      { status: 400 }
    );
  }

  const payload = buildPixOrderDetailsPayload(to, {
    referenceId: `probe-${Date.now()}`,
    body: PROBE_BODY,
    itemName: "Sonda técnica (ignorar)",
    total: 1,
    pixCode: PROBE_PIX_CODE,
    merchantName: "Lia Delivery",
    key: "contato@liadelivery.com.br",
    keyType: "EMAIL"
  });

  const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v21.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const graph = await res.json().catch(() => ({}));
  console.log("[whatsapp:native-pix] sonda:", res.status, JSON.stringify(graph).slice(0, 500));

  return NextResponse.json({ ok: res.ok, status: res.status, hint: hintFor(res.status, graph), graph });
}
