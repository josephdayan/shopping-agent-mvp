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
// `senders`: remetente de plataforma compartilhada (a VTEX manda de vtexcommerce.com.br para
// todas as lojas) — só vale com o nome de exibição EXATO da loja, nunca o domínio sozinho.
export type StoreMailSender = { domain: string; name: string };
export type StoreMailRule = { label: string; domains: readonly string[]; senders?: readonly StoreMailSender[] };

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
  cobasi: { label: "cobasi", domains: ["cobasi.com.br"], senders: [{ domain: "vtexcommerce.com.br", name: "no reply" }] },
  // Conferido ao vivo em 13/09: a chave de acesso da Swift chega de noreply@vtexcommerce.com.br.
  swift: { label: "swift", domains: ["swift.com.br"], senders: [{ domain: "vtexcommerce.com.br", name: "Loja Online Swift" }] },
};
const MAIL_KEY = /^[a-z0-9_-]+$/;
const MAIL_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;
export function registerStoreMail(storeKey: string, rule: StoreMailRule) {
  if (!MAIL_KEY.test(storeKey)) throw new Error("Chave de loja inválida.");
  const label = rule.label.trim();
  const domains = rule.domains.map((d) => d.trim().toLowerCase());
  const senders = (rule.senders ?? []).map((s) => ({ domain: s.domain.trim().toLowerCase(), name: s.name.trim() }));
  if (
    !/^[a-z0-9 ]{2,40}$/i.test(label) || !domains.length || !domains.every((d) => MAIL_DOMAIN.test(d)) ||
    !senders.every((s) => MAIL_DOMAIN.test(s.domain) && /^[a-z0-9 .&'-]{2,60}$/i.test(s.name))
  )
    throw new Error("Regra de e-mail da loja inválida.");
  STORE_MAIL[storeKey] = { label, domains, senders };
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

const domainHit = (domain: string, allowed: string) => domain === allowed || domain.endsWith(`.${allowed}`);
function senderDomains(from: string) {
  return (from.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+/g) ?? []).map((a) => a.split("@")[1]);
}
function senderDisplayName(from: string) {
  return from.split("<")[0].replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").toLowerCase();
}
function senderAllowed(from: string, rule: StoreMailRule) {
  const domains = senderDomains(from);
  if (domains.some((d) => rule.domains.some((allowed) => domainHit(d, allowed)))) return true;
  const name = senderDisplayName(from);
  return (rule.senders ?? []).some((s) => name === s.name.toLowerCase() && domains.some((d) => domainHit(d, s.domain)));
}
function ruleQuery(rule: StoreMailRule) {
  const all = new Set([...rule.domains, ...(rule.senders ?? []).map((s) => s.domain)]);
  return `(${[...all].map((domain) => `from:${domain}`).join(" OR ")})`;
}

export function extractStoreAccessCode(
  storeKey: AccessCodeRequest["storeKey"],
  message: GmailMessage,
) {
  const rule = STORE_MAIL[storeKey];
  if (!rule || !senderAllowed(header(message, "from"), rule)) return null;
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
  // "chave de acesso é 773684" (Swift/VTEX, conferido em 13/09): o "é" vira "e" após tirar o
  // acento e é uma letra, por isso o conector verbal entra explícito antes do código.
  for (const match of normalized.matchAll(
    /\b(?:codigo|chave)(?:\s+(?:de|para))?(?:\s+(?:acesso|validacao|verificacao))?(?:\s+(?:e|eh|is|sera))?[^A-Z0-9]{0,24}((?=[A-Z0-9]{4,8}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+)\b/gi,
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
    const query = encodeURIComponent(`newer_than:1d ${ruleQuery(rule)}`);
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
    const query = encodeURIComponent(`newer_than:${days}d ${ruleQuery(rule)}`);
    const listed = (await this.gmail(`/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${query}`)) as { messages?: { id?: string }[] };
    const out: { id: string; from: string; subject: string; text: string; receivedAt: number }[] = [];
    for (const item of listed.messages ?? []) {
      if (!item.id) continue;
      const message = (await this.gmail(`/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`)) as GmailMessage;
      const receivedAt = Number(message.internalDate);
      if (!Number.isFinite(receivedAt) || receivedAt < sinceMs || !senderAllowed(header(message, "from"), rule)) continue;
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
