import { NextResponse } from "next/server";

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
