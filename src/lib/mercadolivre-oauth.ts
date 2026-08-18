import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

const CREDENTIAL_ID = "lia-operator";
export const MERCADO_LIVRE_REDIRECT_URI = "https://liadelivery.com.br/api/mercadolivre/oauth/callback";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
  scope?: string;
  error?: string;
  message?: string;
};

export function mercadoLivreClientConfig() {
  // ML_* is the current, concise name. The old names are deliberately accepted
  // during the transition so an existing local setup does not suddenly break.
  const clientId = process.env.ML_CLIENT_ID ?? process.env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET ?? process.env.MERCADO_LIVRE_CLIENT_SECRET;
  return { clientId, clientSecret, redirectUri: process.env.ML_REDIRECT_URI ?? MERCADO_LIVRE_REDIRECT_URI };
}

export function mercadoLivreAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = mercadoLivreClientConfig();
  if (!clientId) return null;
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export function newMercadoLivreOAuthState() {
  return randomBytes(32).toString("base64url");
}

function encryptionKey() {
  const { clientSecret } = mercadoLivreClientConfig();
  if (!clientSecret) throw new Error("ML_CLIENT_SECRET is not configured");
  return createHash("sha256").update(`lia:mercadolivre-oauth:v1:${clientSecret}`).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("invalid encrypted Mercado Livre token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

async function exchange(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error ?? payload.message ?? `Mercado Livre OAuth failed (${response.status})`);
  }
  return payload;
}

async function saveTokens(payload: TokenResponse, refreshToken?: string) {
  if (!payload.access_token) throw new Error("Mercado Livre did not return an access token");
  const actualRefreshToken = payload.refresh_token ?? refreshToken;
  if (!actualRefreshToken) throw new Error("Mercado Livre did not return a refresh token");
  const expiresAt = new Date(Date.now() + Math.max(payload.expires_in ?? 3600, 60) * 1000);
  await prisma.mercadoLivreOAuthCredential.upsert({
    where: { id: CREDENTIAL_ID },
    create: {
      id: CREDENTIAL_ID,
      mercadoLivreUserId: payload.user_id?.toString(),
      accessTokenEncrypted: encrypt(payload.access_token),
      refreshTokenEncrypted: encrypt(actualRefreshToken),
      expiresAt,
      scope: payload.scope
    },
    update: {
      mercadoLivreUserId: payload.user_id?.toString(),
      accessTokenEncrypted: encrypt(payload.access_token),
      refreshTokenEncrypted: encrypt(actualRefreshToken),
      expiresAt,
      scope: payload.scope
    }
  });
}

export async function exchangeMercadoLivreAuthorizationCode(code: string) {
  const { clientId, clientSecret, redirectUri } = mercadoLivreClientConfig();
  if (!clientId || !clientSecret) throw new Error("ML_CLIENT_ID and ML_CLIENT_SECRET must be configured");
  const payload = await exchange(
    new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri })
  );
  await saveTokens(payload);
}

export async function getMercadoLivreAccessToken(): Promise<string | null> {
  // Temporary compatibility only. New installations use the encrypted credential.
  const legacyToken = process.env.MERCADO_LIVRE_ACCESS_TOKEN;
  try {
    const credential = await prisma.mercadoLivreOAuthCredential.findUnique({ where: { id: CREDENTIAL_ID } });
    if (!credential) return legacyToken ?? null;
    if (credential.expiresAt.getTime() > Date.now() + 60_000) return decrypt(credential.accessTokenEncrypted);

    const { clientId, clientSecret } = mercadoLivreClientConfig();
    if (!clientId || !clientSecret) return null;
    const refreshToken = decrypt(credential.refreshTokenEncrypted);
    const payload = await exchange(
      new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken })
    );
    await saveTokens(payload, refreshToken);
    return payload.access_token ?? null;
  } catch (error) {
    console.warn("[mercado-livre:oauth:token-unavailable]", error instanceof Error ? error.message : error);
    return legacyToken ?? null;
  }
}
