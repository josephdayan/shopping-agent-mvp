import { NextResponse } from "next/server";
import {
  completeWhatsAppProductSearchJob,
  failWhatsAppProductSearchJob,
  toChannelResponse
} from "@/lib/chat-service";
import { decodeApifySearchJobMetadata } from "@/lib/adapters/suppliers";
import { whatsappAdapter, type WhatsAppRichReply } from "@/lib/adapters/whatsapp";
import { prisma } from "@/lib/prisma";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ApifyCallbackPayload = {
  eventType?: string;
  resource?: {
    id?: string;
    status?: string;
    defaultDatasetId?: string;
  };
  metadata?: string;
};

export async function POST(request: Request) {
  const unauthorized = requireApifyWebhookSecret(request);
  if (unauthorized) return unauthorized;

  const payload = (await request.json()) as ApifyCallbackPayload;
  const metadata = decodeApifySearchJobMetadata(payload.metadata);
  const runId = payload.resource?.id;
  const status = payload.resource?.status;

  if (!metadata || !runId) {
    console.warn("[apify:mercadolivre:callback:invalid]", {
      hasMetadata: Boolean(metadata),
      runId,
      status
    });
    return NextResponse.json({ ok: false, error: "Invalid callback payload" }, { status: 400 });
  }
  // Revisão 01/09: `metadata` é base64 controlado por quem chama e `phone` virava
  // destinatário de um envio pelo número oficial da Meta. O telefone tem que ser o
  // dono da conversa referida — senão a rota era um oráculo de spam.
  const owner = await prisma.conversation.findUnique({
    where: { id: metadata.conversationId },
    select: { user: { select: { phone: true } } }
  });
  if (!owner || owner.user.phone.replace(/\D/g, "") !== metadata.phone.replace(/\D/g, "")) {
    console.warn("[apify:mercadolivre:callback:phone-mismatch]", { conversationId: metadata.conversationId });
    return NextResponse.json({ ok: false, error: "Conversation/phone mismatch" }, { status: 403 });
  }

  try {
    const finalStatus = (status ?? "").toUpperCase();
    const conversation = finalStatus === "SUCCEEDED"
      ? await completeWhatsAppProductSearchJob({
          conversationId: metadata.conversationId,
          phone: metadata.phone,
          runId,
          jobId: metadata.jobId,
          intent: metadata.intent
        })
      : await failWhatsAppProductSearchJob({
          conversationId: metadata.conversationId,
          runId,
          error: finalStatus || payload.eventType || "apify_failed"
        });

    if (conversation) {
      const reply = formatWhatsAppReply(toChannelResponse(conversation));
      await whatsappAdapter.sendRichReplyMessages(metadata.phone, reply);
    }

    return NextResponse.json({ ok: true, runId, status: finalStatus });
  } catch (error) {
    console.error("[apify:mercadolivre:callback:error]", error);
    try {
      await whatsappAdapter.sendMessage(
        metadata.phone,
        "Não consegui concluir essa busca agora. Pode tentar de novo em instantes?"
      );
    } catch (sendError) {
      console.error("[apify:mercadolivre:callback:fallback-error]", sendError);
    }
    return NextResponse.json({ ok: false, error: "Callback processing failed" }, { status: 500 });
  }
}

// Revisão 01/09: falhava ABERTO sem segredo (em deploy, nega) e comparava com `!==`.
function requireApifyWebhookSecret(request: Request) {
  const expected = process.env.APIFY_WEBHOOK_SECRET ?? process.env.WHATSAPP_WEBHOOK_SECRET ?? process.env.API_TOKEN;
  if (!expected) {
    if (!process.env.VERCEL) return null;
    console.error("[auth:missing-secret] APIFY_WEBHOOK_SECRET não configurado — negando por segurança");
    return NextResponse.json({ error: "Server auth not configured" }, { status: 401 });
  }
  const url = new URL(request.url);
  const received = url.searchParams.get("secret") ?? request.headers.get("x-apify-webhook-secret") ?? "";
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid Apify webhook secret" }, { status: 401 });
  }
  return null;
}

function formatWhatsAppReply(response: ReturnType<typeof toChannelResponse>): WhatsAppRichReply {
  if (response.products.length) {
    return {
      text: "Escolha uma opção:",
      options: response.products
    };
  }

  return { text: response.reply, actions: response.actions };
}
