import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Em deploy (Vercel), segredo ausente é erro de configuração, nunca porta aberta: a
// checagem FALHA FECHADO. Localmente (dev/demo/testes) a ausência continua liberando,
// que é o que o dev:demo e a suíte esperam.
function missingSecret(name: string) {
  if (!process.env.VERCEL) return null;
  console.error(`[auth:missing-secret] ${name} não configurado — negando por segurança`);
  return NextResponse.json({ error: "Server auth not configured" }, { status: 401 });
}

export function requireApiToken(request: Request) {
  const expected = process.env.API_TOKEN;
  if (!expected) return missingSecret("API_TOKEN");

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();

  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function requireWebhookSecret(request: Request) {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) return missingSecret("WHATSAPP_WEBHOOK_SECRET");

  const secret = request.headers.get("x-webhook-secret");
  if (secret !== expected) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  return null;
}

export function requireMetaSignature(request: Request, rawBody: string) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return missingSecret("WHATSAPP_APP_SECRET");

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) {
    return NextResponse.json({ error: "Missing Meta signature" }, { status: 401 });
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Invalid Meta signature" }, { status: 401 });
  }

  return null;
}

// ---------- painel /ops ----------
// Revisão 01/09: sete cópias de `authed()` (5 rotas /api/ops + 2 petz-image) falhavam
// ABERTO sem OPS_TOKEN (um Preview da Vercel sem a env expunha a fila inteira, com
// telefone/endereço, e as ações de cancelar/estornar/despachar), comparavam com `===`
// (tempo variável), caíam em API_TOKEN e gravavam o PRÓPRIO token no cookie de 90 dias.
// Agora: fail-closed em deploy (mesma regra dos outros guards), comparação em tempo
// constante, sem fallback, e cookie = HMAC do token — quem rouba o cookie não leva a
// chave, e trocar OPS_TOKEN derruba todas as sessões.
function opsToken(): string | null {
  return process.env.OPS_TOKEN || null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function opsSessionCookieValue(token: string): string {
  return createHmac("sha256", `lia-ops-session:${token}`).update("ops_session").digest("hex");
}

// `true`/`false` quando há token configurado; sem token, vale a regra local/deploy de
// `missingSecret` (libera em dev, nega na Vercel).
export function opsKeyMatches(value: string | null | undefined): boolean {
  const expected = opsToken();
  if (!expected) return !process.env.VERCEL;
  return value != null && safeEqual(value, expected);
}

export function requireOpsKey(request: Request, options: { allowQuery?: boolean } = {}) {
  const expected = opsToken();
  if (!expected) return missingSecret("OPS_TOKEN");
  const header = request.headers.get("x-ops-key");
  const query = options.allowQuery ? new URL(request.url).searchParams.get("key") : null;
  const rawCookie = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)ops_session=([^;]+)/)?.[1];
  let cookie: string | null = null;
  if (rawCookie) {
    try {
      cookie = decodeURIComponent(rawCookie);
    } catch {
      cookie = rawCookie;
    }
  }
  const ok =
    (header != null && safeEqual(header, expected)) ||
    (query != null && safeEqual(query, expected)) ||
    (cookie != null && safeEqual(cookie, opsSessionCookieValue(expected)));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
