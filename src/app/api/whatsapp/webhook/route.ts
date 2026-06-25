import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTwilioSignature, requireWebhookSecret } from "@/lib/auth";
import { handleInboundMessage, toChannelResponse } from "@/lib/chat-service";
import { whatsappAdapter, type WhatsAppRichReply } from "@/lib/adapters/whatsapp";

export const dynamic = "force-dynamic";

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

  const conversation = await handleInboundMessage(inbound);
  const response = toChannelResponse(conversation);
  const richReply = formatWhatsAppReply(response);
  let outbound;

  if (inbound.provider === "twilio") {
    try {
      const interactive = await whatsappAdapter.sendInteractiveProductOptions(inbound.phone, richReply);
      if (interactive) {
        return new Response(toTwilioXml({ text: "" }), {
          status: 200,
          headers: { "Content-Type": "text/xml" }
        });
      }
    } catch (error) {
      console.warn("[whatsapp:twilio:quick-reply:fallback]", error);
    }

    return new Response(toTwilioXml(richReply), {
      status: 200,
      headers: { "Content-Type": "text/xml" }
    });
  }

  try {
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

  const intro = reply.options?.length ? shortIntro(reply.text) : reply.text;
  const messages = reply.options?.length
    ? [
        `<Message>${messageBody(intro)}</Message>`,
        ...reply.options.slice(0, 3).map((option) => {
          const total = option.product.price + option.product.shippingPrice;
          const body = [
            `${option.rank}) ${option.reason}`,
            option.product.title,
            `Total aprox: R$ ${total.toFixed(2)}`,
            option.product.deliveryEstimate,
            `Fonte: ${sourceLabel(option.product.source)}`,
            option.product.source === "mercado_livre" && option.product.automationLevel.startsWith("real_")
              ? `Link: ${option.product.productUrl}`
              : null,
            `Para escolher, responda ${option.rank}.`
          ]
            .filter(Boolean)
            .join("\n");

          return `<Message>${messageBody(body)}${mediaTag(option.product.imageUrl)}</Message>`;
        }),
        `<Message>${messageBody("Responda 1, 2 ou 3. Se aparecerem botoes no seu WhatsApp, pode tocar direto neles.")}</Message>`
      ]
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

function shortIntro(text: string) {
  return text.split(/\n\n1\)/)[0] || text;
}

function formatWhatsAppReply(response: ReturnType<typeof toChannelResponse>): WhatsAppRichReply {
  if (response.products.length) {
    const options = response.products
      .map((option) => {
        const total = option.product.price + option.product.shippingPrice;
        return [
          `${option.rank}) ${option.reason}`,
          option.product.title,
          `Total aprox: R$ ${total.toFixed(2)} · ${option.product.deliveryEstimate}`,
          `Fonte: ${sourceLabel(option.product.source)}`,
          option.product.source === "mercado_livre" && option.product.automationLevel.startsWith("real_")
            ? `Link: ${option.product.productUrl}`
            : null
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    return {
      text: `${response.reply}\n\n${options}\n\nResponda 1, 2 ou 3.`,
      options: response.products
    };
  }

  return { text: response.reply };
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    mercado_livre: "Mercado Livre",
    rappi: "Rappi",
    farmacia: "Farmacia",
    loja_local: "Loja local"
  };
  return labels[source] ?? source;
}
