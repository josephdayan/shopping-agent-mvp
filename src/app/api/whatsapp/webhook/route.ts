import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWebhookSecret } from "@/lib/auth";
import { handleInboundMessage, toChannelResponse } from "@/lib/chat-service";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";

export const dynamic = "force-dynamic";

const genericSchema = z
  .object({
    from: z.string().optional(),
    phone: z.string().optional(),
    body: z.string().optional(),
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
  if (process.env.WHATSAPP_PROVIDER !== "meta") {
    const unauthorized = requireWebhookSecret(request);
    if (unauthorized) return unauthorized;
  }

  const rawPayload = genericSchema.parse(await request.json());
  const inbound = whatsappAdapter.parseInbound(rawPayload);

  if (!inbound.phone || !inbound.text) {
    return NextResponse.json({ error: "Invalid WhatsApp payload" }, { status: 400 });
  }

  const conversation = await handleInboundMessage(inbound);
  const response = toChannelResponse(conversation);
  let outbound;

  try {
    outbound = await whatsappAdapter.sendMessage(inbound.phone, formatWhatsAppReply(response), response);
  } catch (error) {
    console.error("[whatsapp:webhook:send-error]", error);
    return NextResponse.json({ ok: false, error: "Failed to send outbound WhatsApp message" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    provider: outbound.provider,
    outbound: {
      to: inbound.phone,
      text: formatWhatsAppReply(response)
    },
    data: response
  });
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
