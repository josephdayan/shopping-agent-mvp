import { NextResponse } from "next/server";
import twilio from "twilio";

export function requireApiToken(request: Request) {
  const expected = process.env.API_TOKEN;
  if (!expected) return null;

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();

  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function requireWebhookSecret(request: Request) {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) return null;

  const secret = request.headers.get("x-webhook-secret");
  if (secret !== expected) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  return null;
}

export function requireTwilioSignature(request: Request, params: Record<string, unknown>) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return null;

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Twilio signature" }, { status: 401 });
  }

  const url = process.env.TWILIO_WEBHOOK_URL || publicRequestUrl(request);
  const normalizedParams = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")])
  );

  if (!twilio.validateRequest(authToken, signature, url, normalizedParams)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 });
  }

  return null;
}

function publicRequestUrl(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (proto) url.protocol = `${proto}:`;
  if (host) url.host = host;

  return url.toString();
}
