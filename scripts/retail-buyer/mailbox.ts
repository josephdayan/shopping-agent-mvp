type FetchLike = typeof fetch;

export type GmailMailboxCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type AccessCodeRequest = {
  storeKey: string;
  requestedAt: number;
  timeoutMs?: number;
  pollMs?: number;
};
// Regra de e-mail por loja: nome que precisa aparecer no texto e domínios remetentes aceitos.
export type StoreMailRule = { label: string; domains: readonly string[] };

type GmailPart = {
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name?: string; value?: string }[];
};

type GmailMessage = {
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

// Padrões conhecidos; o config.json do comprador pode registrar outras lojas (registerStoreMail).
const STORE_MAIL: Record<string, StoreMailRule> = {
  cobasi: { label: "cobasi", domains: ["cobasi.com.br"] },
  swift: { label: "swift", domains: ["swift.com.br"] },
};
const MAIL_KEY = /^[a-z0-9_-]+$/;
const MAIL_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;
export function registerStoreMail(storeKey: string, rule: StoreMailRule) {
  if (!MAIL_KEY.test(storeKey)) throw new Error("Chave de loja inválida.");
  const label = rule.label.trim();
  const domains = rule.domains.map((d) => d.trim().toLowerCase());
  if (!/^[a-z0-9 ]{2,40}$/i.test(label) || !domains.length || !domains.every((d) => MAIL_DOMAIN.test(d)))
    throw new Error("Regra de e-mail da loja inválida.");
  STORE_MAIL[storeKey] = { label, domains };
}
export function storeMailRule(storeKey: string): StoreMailRule | undefined {
  return STORE_MAIL[storeKey];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function messageText(part?: GmailPart): string {
  if (!part) return "";
  const own = part.body?.data ? decodeBase64Url(part.body.data) : "";
  const children = (part.parts ?? []).map(messageText).join("\n");
  return `${own}\n${children}`
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function header(message: GmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (entry) => entry.name?.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function senderAllowed(from: string, domains: readonly string[]) {
  const addresses = from.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+/g) ?? [];
  return addresses.some((address) => {
    const domain = address.split("@")[1];
    return domains.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
    );
  });
}

export function extractStoreAccessCode(
  storeKey: AccessCodeRequest["storeKey"],
  message: GmailMessage,
) {
  const rule = STORE_MAIL[storeKey];
  if (!rule || !senderAllowed(header(message, "from"), rule.domains)) return null;
  const text = `${header(message, "subject")} ${message.snippet ?? ""} ${messageText(message.payload)}`;
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const label = rule.label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${label}\\b`, "i").test(normalized)) return null;
  if (!/\b(codigo|chave|acesso|validacao|verificacao|verification|access)\b/i.test(normalized))
    return null;
  const candidates = new Set<string>();
  for (const match of normalized.matchAll(
    /\b(?:codigo|chave)(?:\s+(?:de|para))?(?:\s+(?:acesso|validacao|verificacao))?[^A-Z0-9]{0,24}((?=[A-Z0-9]{4,8}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+)\b/gi,
  ))
    candidates.add(match[1].toUpperCase());
  if (!candidates.size) {
    for (const match of normalized.matchAll(
      /\b(?=[A-Z0-9]{4,8}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+\b/gi,
    ))
      candidates.add(match[0]);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

export class GmailCodeMailbox {
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    private readonly credentials: GmailMailboxCredentials,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (
      !credentials.clientId.trim() ||
      !credentials.clientSecret.trim() ||
      !credentials.refreshToken.trim()
    )
      throw new Error("Credencial OAuth da caixa operacional incompleta.");
  }

  private async token(force = false) {
    if (!force && this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000)
      return this.accessToken.value;
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: this.credentials.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !body.access_token)
      throw new Error("Não foi possível autenticar a caixa operacional.");
    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }

  private async gmail(path: string, retry = true): Promise<unknown> {
    const response = await this.fetcher(`https://gmail.googleapis.com${path}`, {
      headers: { authorization: `Bearer ${await this.token(!retry)}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 && retry) {
      this.accessToken = undefined;
      return this.gmail(path, false);
    }
    if (!response.ok) throw new Error("Leitura da caixa operacional indisponível.");
    return response.json();
  }

  async check() {
    await this.gmail("/gmail/v1/users/me/profile");
    return true;
  }

  private async newestCode(request: AccessCodeRequest) {
    const rule = STORE_MAIL[request.storeKey];
    if (!rule) throw new Error("Loja sem regra de e-mail configurada.");
    const query = encodeURIComponent(
      `newer_than:1d (${rule.domains.map((domain) => `from:${domain}`).join(" OR ")})`,
    );
    const listed = (await this.gmail(
      `/gmail/v1/users/me/messages?maxResults=10&q=${query}`,
    )) as { messages?: { id?: string }[] };
    for (const item of listed.messages ?? []) {
      if (!item.id) continue;
      const message = (await this.gmail(
        `/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
      )) as GmailMessage;
      const receivedAt = Number(message.internalDate);
      if (
        !Number.isFinite(receivedAt) ||
        receivedAt < request.requestedAt - 15_000 ||
        receivedAt > Date.now() + 60_000
      )
        continue;
      const code = extractStoreAccessCode(request.storeKey, message);
      if (code) return code;
    }
    return null;
  }

  // E-mails transacionais da loja (Fase 4): lista os recentes dos domínios da loja e devolve
  // remetente/assunto/texto/data. O chamador classifica (mailbox-policy) e descarta o corpo.
  async listStoreMessages(storeKey: string, sinceMs: number, maxResults = 20) {
    const rule = STORE_MAIL[storeKey];
    if (!rule) return [];
    const days = Math.max(1, Math.ceil((Date.now() - sinceMs) / 86_400_000));
    const query = encodeURIComponent(`newer_than:${days}d (${rule.domains.map((domain) => `from:${domain}`).join(" OR ")})`);
    const listed = (await this.gmail(`/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${query}`)) as { messages?: { id?: string }[] };
    const out: { id: string; from: string; subject: string; text: string; receivedAt: number }[] = [];
    for (const item of listed.messages ?? []) {
      if (!item.id) continue;
      const message = (await this.gmail(`/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`)) as GmailMessage;
      const receivedAt = Number(message.internalDate);
      if (!Number.isFinite(receivedAt) || receivedAt < sinceMs) continue;
      out.push({ id: item.id, from: header(message, "from"), subject: header(message, "subject"), text: messageText(message.payload).slice(0, 20_000), receivedAt });
    }
    return out;
  }

  async waitForCode(request: AccessCodeRequest) {
    const timeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? 90_000, 180_000));
    const pollMs = Math.max(250, Math.min(request.pollMs ?? 2_000, 10_000));
    const deadline = Date.now() + timeoutMs;
    do {
      const code = await this.newestCode(request);
      if (code) return code;
      if (Date.now() >= deadline) break;
      await wait(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    } while (Date.now() <= deadline);
    throw new Error("Código de acesso da loja não chegou no prazo.");
  }
}
