import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Login simples de usuário+senha para o /admin (e para as rotas legadas /api/conversations,
// que o /chat de demonstração usa). Decisão do dono em 19/08: o /admin estava aberto na
// internet expondo PII e ações de estorno; token na URL é incômodo, então aqui é sessão por
// cookie httpOnly. FALHA FECHADO: sem ADMIN_USER/ADMIN_PASSWORD no ambiente, ninguém entra.
// O valor do cookie é um HMAC derivado da senha (nunca a senha crua); trocar a senha na
// Vercel invalida todas as sessões, sem precisar de tabela.

export const ADMIN_COOKIE = "admin_session";

function credentials() {
  const user = process.env.ADMIN_USER?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!user || !password) return null;
  return { user, password };
}

export function adminAuthConfigured() {
  return credentials() !== null;
}

export function adminSessionValue() {
  const creds = credentials();
  if (!creds) return null;
  return createHmac("sha256", creds.password).update(`lia-admin:${creds.user}`).digest("hex");
}

export function validateAdminLogin(user: string, password: string) {
  const creds = credentials();
  if (!creds) return false;
  const a = Buffer.from(`${user}\n${password}`);
  const b = Buffer.from(`${creds.user}\n${creds.password}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdminSession(cookieValue: string | undefined | null) {
  const expected = adminSessionValue();
  if (!expected || !cookieValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieFromHeader(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

// Guarda para route handlers: retorna a resposta 401 (ou null quando autorizado).
export function requireAdminSession(request: Request) {
  if (isAdminSession(cookieFromHeader(request))) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
