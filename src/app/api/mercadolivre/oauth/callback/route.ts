import { NextResponse } from "next/server";

import { exchangeMercadoLivreAuthorizationCode } from "@/lib/mercadolivre-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const expectedState = request.headers.get("cookie")?.match(/(?:^|;\\s*)lia_ml_oauth_state=([^;]+)/)?.[1];

  if (error) return page("Mercado Livre não autorizou", "A autorização foi cancelada ou recusada. Você pode tentar novamente.", 400);
  if (!code || !state || !expectedState || state !== expectedState) {
    return page("Não foi possível confirmar a autorização", "Volte ao painel e inicie a autorização novamente.", 400);
  }

  try {
    await exchangeMercadoLivreAuthorizationCode(code);
    const response = page("Mercado Livre conectado", "A conta da Lia foi vinculada com segurança. Você já pode fechar esta página.");
    response.cookies.set("lia_ml_oauth_state", "", { httpOnly: true, sameSite: "lax", secure: true, path: "/api/mercadolivre/oauth", maxAge: 0 });
    return response;
  } catch (failure) {
    console.error("[mercado-livre:oauth:callback]", failure instanceof Error ? failure.message : failure);
    return page("Não foi possível conectar o Mercado Livre", "A autorização não foi concluída. Confira as chaves e a URL de redirecionamento e tente de novo.", 502);
  }
}

function page(title: string, message: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main><h1>${title}</h1><p>${message}</p></main><style>body{font-family:system-ui;margin:48px;color:#111827}main{max-width:640px}</style>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
