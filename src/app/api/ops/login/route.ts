import { NextResponse } from "next/server";
import { OPS_SESSION_MAX_AGE_S, type OpsRole, opsKeyRole, opsLoginRole, opsSessionCookieValue, opsTokenForRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Duas portas para o mesmo cookie httpOnly (HMAC do OPS_TOKEN, nunca o token):
// - ?key=<OPS_TOKEN>: chamada pelo board quando a URL traz a chave (JSON).
// - ?login=<token de 10 min>: link que a Lia manda no WhatsApp quando o operador escreve
//   "ops" (04/09) — abre, grava o cookie e redireciona para /ops. Sem OPS_TOKEN em deploy
//   ninguém entra (revisão 01/09). Desde 15/09 a chave/link diz o PAPEL (dono ou operador
//   contratado) e o cookie sai com o HMAC do segredo daquele papel.
function withSession(res: NextResponse, expected: string): NextResponse {
  res.cookies.set("ops_session", opsSessionCookieValue(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OPS_SESSION_MAX_AGE_S
  });
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.OPS_TOKEN;
  if (!expected) return NextResponse.json({ ok: false }, { status: 401 });

  const secretFor = (role: OpsRole) => opsTokenForRole(role) ?? expected;

  const login = url.searchParams.get("login");
  if (login) {
    const role = opsLoginRole(login);
    if (!role) {
      return NextResponse.redirect(new URL("/ops?expired=1", url), { status: 302 });
    }
    return withSession(NextResponse.redirect(new URL("/ops", url), { status: 302 }), secretFor(role));
  }

  const key = url.searchParams.get("key");
  const keyRole = opsKeyRole(key);
  if (!keyRole) return NextResponse.json({ ok: false }, { status: 401 });
  return withSession(NextResponse.json({ ok: true }), secretFor(keyRole));
}
