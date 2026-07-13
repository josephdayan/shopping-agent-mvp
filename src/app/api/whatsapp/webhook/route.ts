import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { requireMetaSignature, requireTwilioSignature, requireWebhookSecret } from "@/lib/auth";
import { handleDeliveryMessage } from "@/lib/delivery-service";
import { genericError } from "@/lib/lia-copy";
import { whatsappAdapter } from "@/lib/adapters/whatsapp";

export const dynamic = "force-dynamic";
// Real Mercado Livre search via Apify can take up to ~55s on a cold start, so the
// function needs a longer budget than the default. Replies go out through the
// WhatsApp provider API, so the user still gets results even if the inbound HTTP
// request times out.
export const maxDuration = 300;

async function processDeliveryMessage(inbound: ReturnType<typeof whatsappAdapter.parseInbound>) {
  try {
    await handleDeliveryMessage(inbound);
  } catch (error) {
    console.error(`[whatsapp:${inbound.provider}:delivery-error]`, error);
    try {
      await whatsappAdapter.sendMessage(inbound.phone, genericError());
    } catch (sendError) {
      console.error(`[whatsapp:${inbound.provider}:fallback-error]`, sendError);
    }
  }
}

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
  const rawBody = contentType.includes("application/x-www-form-urlencoded") ? null : await request.text();
  const rawPayload = rawBody === null
    ? Object.fromEntries(await request.formData())
    : genericSchema.parse(JSON.parse(rawBody));
  const inbound = whatsappAdapter.parseInbound(rawPayload);

  if (inbound.provider !== "meta" && inbound.provider !== "twilio") {
    const unauthorized = requireWebhookSecret(request);
    if (unauthorized) return unauthorized;
  }

  if (inbound.provider === "twilio") {
    const unauthorized = requireTwilioSignature(request, rawPayload);
    if (unauthorized) return unauthorized;
  }

  if (inbound.provider === "meta" && rawBody !== null) {
    const unauthorized = requireMetaSignature(request, rawBody);
    if (unauthorized) return unauthorized;
  }

  // Meta sends delivery/read receipts to the same webhook. They are not customer
  // messages, but must be acknowledged with 200 or Meta retries them in bursts.
  if (inbound.provider === "meta" && inbound.eventType !== "message") {
    return NextResponse.json({ ok: true, provider: "meta", ignored: inbound.eventType });
  }

  if (!inbound.phone || !inbound.text) {
    return NextResponse.json({ error: "Invalid WhatsApp payload" }, { status: 400 });
  }

  if (inbound.provider === "twilio" || inbound.provider === "meta") {
    // A product lookup can take tens of seconds. Acknowledge provider webhooks first
    // so Meta/Twilio do not retry the same message while the conversation runs.
    waitUntil(processDeliveryMessage(inbound));

    if (inbound.provider === "meta") {
      return NextResponse.json({ ok: true, provider: "meta" });
    }

    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { "Content-Type": "text/xml" }
    });
  }

  return NextResponse.json({ error: "Unsupported WhatsApp provider" }, { status: 400 });
}
