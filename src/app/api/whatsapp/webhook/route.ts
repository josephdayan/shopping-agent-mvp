import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTwilioSignature, requireWebhookSecret } from "@/lib/auth";
import { handleInboundMessage, toChannelResponse } from "@/lib/chat-service";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";

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
  const replyText = formatWhatsAppReply(response);
  let outbound;

  if (inbound.provider === "twilio") {
    return new Response(toTwilioXml(replyText), {
      status: 200,
      headers: { "Content-Type": "text/xml" }
    });
  }

  try {
    outbound = await whatsappAdapter.sendMessage(inbound.phone, replyText, response);
  } catch (error) {
    console.error("[whatsapp:webhook:send-error]", error);
    return NextResponse.json({ ok: false, error: "Failed to send outbound WhatsApp message" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    provider: outbound.provider,
    outbound: {
      to: inbound.phone,
      text: replyText
    },
    data: response
  });
}

function toTwilioXml(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatWhatsAppReply(response: ReturnType<typeof toChannelResponse>) {
  if (response.products.length) {
    const options = response.products
      .map(
        (option) =>
          `${option.rank}. ${option.reason}\n${option.product.title}\nR$ ${option.product.price.toFixed(2)} + frete R$ ${option.product.shippingPrice.toFixed(2)}\n${option.product.deliveryEstimate}`
      )
      .join("\n\n");

    return `${response.reply}\n\n${options}`;
  }

  return response.reply;
}
