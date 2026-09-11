import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url;
}

export async function exchangeGoogleAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}) {
  const response = await (input.fetcher ?? fetch)(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    refresh_token?: string;
    scope?: string;
  };
  if (
    !response.ok ||
    !body.refresh_token ||
    !body.scope?.split(/\s+/).includes(GMAIL_READONLY)
  )
    throw new Error("O Google não devolveu acesso offline somente leitura.");
  return body.refresh_token;
}

export function storeRefreshTokenInKeychain(refreshToken: string) {
  if (process.platform !== "darwin")
    throw new Error("Este fluxo exige o Chaves do macOS.");
  const helper = fileURLToPath(new URL("./keychain-helper.swift", import.meta.url));
  execFileSync(
    "/usr/bin/swift",
    [helper, "lia-purchase-worker", "Lia Gmail Refresh Token"],
    {
      input: refreshToken,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 30_000,
    },
  );
}

export async function authorizeGmailMailbox(input: {
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  announce(url: URL): void;
}) {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  let finish: ((value: string) => void) | undefined;
  let fail: ((reason?: unknown) => void) | undefined;
  const callback = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/oauth/google/callback") {
        response.writeHead(404).end("Não encontrado");
        return;
      }
      if (url.searchParams.get("state") !== state)
        throw new Error("Estado OAuth inválido.");
      const code = url.searchParams.get("code");
      if (!code) throw new Error("Autorização não concedida.");
      response
        .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
        .end("Autorização concluída. Você pode fechar esta página.");
      finish?.(code);
    } catch (error) {
      response
        .writeHead(400, { "content-type": "text/plain; charset=utf-8" })
        .end("Não foi possível concluir a autorização.");
      fail?.(error);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Callback local indisponível.");
    const redirectUri = `http://127.0.0.1:${address.port}/oauth/google/callback`;
    input.announce(
      googleAuthorizationUrl({
        clientId: input.clientId,
        redirectUri,
        state,
        codeChallenge,
      }),
    );
    const timeoutMs = Math.max(30_000, Math.min(input.timeoutMs ?? 300_000, 600_000));
    const code = await Promise.race([
      callback,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Autorização OAuth expirou.")), timeoutMs),
      ),
    ]);
    const refreshToken = await exchangeGoogleAuthorizationCode({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      code,
      codeVerifier,
      redirectUri,
    });
    storeRefreshTokenInKeychain(refreshToken);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
