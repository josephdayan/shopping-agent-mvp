import { NextResponse } from "next/server";

import { mercadoLivreAuthorizeUrl, newMercadoLivreOAuthState } from "@/lib/mercadolivre-oauth";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Revisão 01/09: sem login, qualquer pessoa podia vincular a PRÓPRIA conta ML no lugar
// da credencial do operador (upsert fixo em "lia-operator").
export async function GET(request: Request) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const state = newMercadoLivreOAuthState();
  const authorizationUrl = mercadoLivreAuthorizeUrl(state);
  if (!authorizationUrl) {
    return NextResponse.json({ error: "ML_CLIENT_ID is not configured" }, { status: 503 });
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("lia_ml_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/mercadolivre/oauth",
    maxAge: 10 * 60
  });
  return response;
}
