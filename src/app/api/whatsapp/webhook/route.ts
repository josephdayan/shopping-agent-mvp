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

export async function GET() {
  return NextResponse.json({ ok: true, channel: "whatsapp", mode: "mock-webhook" });
}

export async function POST(request: Request) {
  const unauthorized = requireWebhookSecret(request);
  if (unauthorized) return unauthorized;

  const rawPayload = genericSchema.parse(await request.json());
  const inbound = whatsappAdapter.parseInbound(rawPayload);

  if (!inbound.phone || !inbound.text) {
    return NextResponse.json({ error: "Invalid WhatsApp payload" }, { status: 400 });
  }

  const conversation = await handleInboundMessage(inbound);
  const response = toChannelResponse(conversation);
  await whatsappAdapter.sendMessage(inbound.phone, response.reply, response);

  return NextResponse.json({
    ok: true,
    provider: "mock",
    outbound: {
      to: inbound.phone,
      text: response.reply
    },
    data: response
  });
}
