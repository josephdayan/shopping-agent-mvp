import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTwilioSignature, requireWebhookSecret } from "@/lib/auth";
import { handleInboundMessage, toChannelResponse } from "@/lib/chat-service";
import { handleDeliveryMessage } from "@/lib/delivery-service";
import { genericError } from "@/lib/lia-copy";
import { whatsappAdapter, type WhatsAppRichReply } from "@/lib/adapters/whatsapp";

export const dynamic = "force-dynamic";
// Real Mercado Livre search via Apify can take up to ~55s on a cold start, so the
// function needs a longer budget than the default. Replies go out over the Twilio
// REST API, so the user still gets results even if Twilio's 15s HTTP timeout fires.
export const maxDuration = 300;

const genericSchema = z
  .object({
    from: z.string().optional(),
    From: z.string().optional(),
    phone: z.string().optional(),
    body: z.string().optional(),
    Body: z.string().optional(),
    text: z.string().optional(),
    name: z.string().optional(),
    profileName: z.string().optional()
  })
  .passthrough();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }

  return NextResponse.json({ error: "Invalid verify token" }, { status: 403 });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const rawPayload = contentType.includes("application/x-www-form-urlencoded")
    ? Object.fromEntries(await request.formData())
    : genericSchema.parse(await request.json());
  const inbound = whatsappAdapter.parseInbound(rawPayload);

  if (process.env.WHATSAPP_PROVIDER !== "meta" && inbound.provider !== "twilio") {
    const unauthorized = requireWebhookSecret(request);
    if (unauthorized) return unauthorized;
  }

  if (inbound.provider === "twilio") {
    const unauthorized = requireTwilioSignature(request, rawPayload);
    if (unauthorized) return unauthorized;
  }

  if (!inbound.phone || !inbound.text) {
    return NextResponse.json({ error: "Invalid WhatsApp payload" }, { status: 400 });
  }

  if (inbound.provider === "twilio") {
    // The remodelled Lia: every inbound message drives the everyday-delivery flow
    // (basket -> CEP -> courier quote -> Pix -> operator queue). handleDeliveryMessage
    // owns the conversation and sends all replies over the Twilio REST API itself.
    try {
      await handleDeliveryMessage(inbound);
    } catch (error) {
      console.error("[whatsapp:twilio:delivery-error]", error);
      try {
        await whatsappAdapter.sendMessage(inbound.phone, genericError());
      } catch (sendError) {
        console.error("[whatsapp:twilio:fallback-error]", sendError);
      }
    }

    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { "Content-Type": "text/xml" }
    });
  }

  const conversation = await handleInboundMessage(inbound);
  const response = toChannelResponse(conversation);
  const richReply = formatWhatsAppReply(response);
  let outbound;

  try {
    const interactive = await whatsappAdapter.sendInteractiveProductOptions(inbound.phone, richReply);
    if (interactive) {
      return NextResponse.json({
        ok: true,
        provider: interactive.provider,
        outbound: {
          to: inbound.phone,
          text: richReply.text,
          mode: "interactive_product_options"
        },
        data: response
      });
    }

    outbound = await whatsappAdapter.sendMessage(inbound.phone, richReply.text, response);
  } catch (error) {
    console.error("[whatsapp:webhook:send-error]", error);
    return NextResponse.json({ ok: false, error: "Failed to send outbound WhatsApp message" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    provider: outbound.provider,
    outbound: {
      to: inbound.phone,
      text: richReply.text
    },
    data: response
  });
}

function toTwilioXml(reply: WhatsAppRichReply) {
  if (!reply.text && !reply.options?.length) return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  const messages = reply.options?.length
    ? reply.options.slice(0, 3).map((option) => {
          const total = option.product.price + option.product.shippingPrice;
          const body = [
            `${option.rank}) ${option.product.title}`,
            `Total: R$ ${total.toFixed(2)}`,
            `Entrega: ${option.product.deliveryEstimate}`,
            option.product.source === "mercado_livre" && option.product.automationLevel.startsWith("real_")
              ? `Link: ${option.product.productUrl}`
              : null,
            `Escolher este: responda ${option.rank}.`
          ]
            .filter(Boolean)
            .join("\n");

          return `<Message>${messageBody(body)}${mediaTag(option.product.imageUrl)}</Message>`;
        })
    : [`<Message>${messageBody(reply.text)}</Message>`];

  return `<?xml version="1.0" encoding="UTF-8"?><Response>${messages.join("")}</Response>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function messageBody(message: string) {
  return message ? `<Body>${escapeXml(message)}</Body>` : "";
}

function mediaTag(url: string) {
  if (!isPublicMediaUrl(url)) return "";
  return `<Media>${escapeXml(url)}</Media>`;
}

function isPublicMediaUrl(url: string) {
  return /^https:\/\/.+/i.test(url);
}

function shouldSendProcessingAck(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/^(1|2|3)\b/.test(normalized)) return false;
  if (/\b(primeira|primeiro|segunda|segundo|terceira|terceiro|essa|esse|esta|este)\b/.test(normalized)) return false;
  if (/\b(status|rastreio|paguei|pago|novo|cancelar|ajuda|help|confirmar pedido|alterar endereco|alterar pagamento|forma de pagamento)\b/.test(normalized)) {
    return false;
  }

  return /\b(quero|queria|preciso|necessito|procuro|buscar|busca|comprar|compra|outra|outras|mais opcoes|mais opções|nao gostei|não gostei|nenhuma|mais barato|mais barata|menor preco|mais rapido|mais rapida|frete gratis|sem frete|porte pequeno|porte grande|pequeno|pequena|menor|menores|grande|medio|media|filhote|adulto|senior|huggies|pampers|royal canin|gran plus|pedigree|golden)\b/.test(normalized);
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
