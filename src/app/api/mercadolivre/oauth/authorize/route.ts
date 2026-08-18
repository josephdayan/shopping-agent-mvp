import { NextResponse } from "next/server";

import { mercadoLivreAuthorizeUrl, newMercadoLivreOAuthState } from "@/lib/mercadolivre-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
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
