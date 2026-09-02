import { NextResponse } from "next/server";
import { opsKeyMatches, opsSessionCookieValue } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Exchange the ops key (from ?key=) for a long-lived httpOnly cookie, so the operator
// can bookmark a plain /ops with no token in the URL. Called once by the board when it
// sees a ?key=; after that the cookie authorizes /api/ops/* automatically.
// Revisão 01/09: o cookie guarda um HMAC do token, não o token — e sem OPS_TOKEN
// configurado em deploy ninguém entra (antes caía em API_TOKEN).
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  const expected = process.env.OPS_TOKEN;
  if (!expected || !opsKeyMatches(key)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ops_session", opsSessionCookieValue(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90 // 90 days
  });
  return res;
}
