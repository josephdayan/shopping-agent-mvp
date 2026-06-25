import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MercadoLivreTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user_id?: number;
  scope?: string;
  error?: string;
  message?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return htmlResponse(
      "Mercado Livre nao autorizou",
      `<p>Erro: <code>${escapeHtml(error)}</code></p>
       <p>${escapeHtml(errorDescription ?? "Tente autorizar novamente pelo Dev Center.")}</p>`,
      400
    );
  }

  if (!code) {
    return htmlResponse(
      "Callback Mercado Livre ativo",
      "<p>Esta rota esta pronta. Agora autorize o app no Mercado Livre para receber um code aqui.</p>"
    );
  }

  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET;
  const redirectUri = process.env.MERCADO_LIVRE_REDIRECT_URI ?? "https://shopping-agent-mvp.vercel.app/api/mercadolivre/callback";

  if (!clientId || !clientSecret) {
    return htmlResponse(
      "Falta configurar Mercado Livre",
      `<p>Recebi o <code>code</code>, mas ainda falta configurar estas variaveis na Vercel:</p>
       <pre>MERCADO_LIVRE_CLIENT_ID=${escapeHtml(clientId ? "configurado" : "faltando")}
MERCADO_LIVRE_CLIENT_SECRET=${escapeHtml(clientSecret ? "configurado" : "faltando")}
MERCADO_LIVRE_REDIRECT_URI=${escapeHtml(redirectUri)}</pre>
       <p>Depois de salvar as variaveis e fazer redeploy, autorize o app de novo.</p>`,
      400
    );
  }

  const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    }),
    cache: "no-store"
  });

  const payload = (await tokenResponse.json()) as MercadoLivreTokenResponse;

  if (!tokenResponse.ok || !payload.access_token) {
    console.error("[mercado-livre:oauth:error]", payload);
    return htmlResponse(
      "Erro ao gerar token",
      `<p>O Mercado Livre recusou a troca do code por token.</p>
       <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`,
      502
    );
  }

  return htmlResponse(
    "Token Mercado Livre gerado",
    `<p>Copie estes valores para a Vercel. Trate como senha.</p>
     <pre>MERCADO_LIVRE_REAL_SEARCH=true
MERCADO_LIVRE_ACCESS_TOKEN=${escapeHtml(payload.access_token)}
MERCADO_LIVRE_REFRESH_TOKEN=${escapeHtml(payload.refresh_token ?? "")}</pre>
     <p>Depois faca redeploy e teste no WhatsApp.</p>`
  );
}

function htmlResponse(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 48px; color: #111827; line-height: 1.5; }
      main { max-width: 760px; }
      pre { white-space: pre-wrap; background: #111827; color: #f9fafb; padding: 16px; border-radius: 8px; overflow-x: auto; }
      code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
