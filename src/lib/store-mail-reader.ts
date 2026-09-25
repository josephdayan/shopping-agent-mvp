// Leitor de e-mails transacionais das lojas NO SERVIDOR (25/09/2026): substitui o
// `mailLoop` do comprador do Mac. Gmail somente-leitura por refresh token (envs
// LIA_GMAIL_CLIENT_ID / LIA_GMAIL_CLIENT_SECRET / LIA_GMAIL_REFRESH_TOKEN), classificação
// pura em mailbox-policy.ts e veredito para tracking-worker.reportMail. O corpo do e-mail
// nunca é gravado; só o id da mensagem (StoreMailSeen) para não reportar duas vezes.
import { prisma } from "./prisma";
import { classifyStoreMail, STORE_MAIL_RULES } from "./mailbox-policy";
import { reportMail } from "./tracking-worker";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; internalDate?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } };

export function storeMailReaderConfigured() {
  return Boolean(process.env.LIA_GMAIL_CLIENT_ID?.trim() && process.env.LIA_GMAIL_CLIENT_SECRET?.trim() && process.env.LIA_GMAIL_REFRESH_TOKEN?.trim());
}
function decode(part?: GmailPart): string {
  if (!part) return "";
  const own = part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  const children = (part.parts ?? []).map(decode).join("\n");
  return `${own}\n${children}`;
}
export function messageText(payload?: GmailPart): string {
  return decode(payload)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
function header(m: GmailMessage, name: string) {
  return (m.payload?.headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export class GmailStoreMailReader {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly fetchImpl: FetchLike = fetch) {}
  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const r = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.LIA_GMAIL_CLIENT_ID!, client_secret: process.env.LIA_GMAIL_CLIENT_SECRET!, refresh_token: process.env.LIA_GMAIL_REFRESH_TOKEN!, grant_type: "refresh_token" }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
    if (!r.ok || !body.access_token) throw new Error(`Gmail: refresh token recusado (${r.status} ${body.error ?? ""} ${body.error_description ?? ""}).`.replace(/\s+/g, " "));
    if (body.scope && !/gmail/i.test(body.scope)) console.warn("[store-mail] token sem escopo Gmail:", body.scope);
    // Diagnóstico sem segredo: formato do token e das envs (tamanho/prefixo), nunca o valor.
    const shape = (v: string | undefined) => `${(v ?? "").length}:${(v ?? "").slice(0, 4)}${/\s/.test(v ?? "") ? ":ESPACO" : ""}`;
    console.log("[store-mail] token", { access: shape(body.access_token), scope: body.scope, expires: body.expires_in, clientId: shape(process.env.LIA_GMAIL_CLIENT_ID), secret: shape(process.env.LIA_GMAIL_CLIENT_SECRET).slice(0, 3), refresh: shape(process.env.LIA_GMAIL_REFRESH_TOKEN) });
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }
  private async gmail<T>(path: string): Promise<T> {
    const token = await this.accessToken();
    const r = await this.fetchImpl(`https://gmail.googleapis.com${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) {
      const detail = (await r.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
      throw new Error(`Gmail ${r.status} em ${path.split("?")[0]}: ${detail.error?.status ?? ""} ${detail.error?.message ?? ""}`.replace(/\s+/g, " ").trim());
    }
    return (await r.json()) as T;
  }
  // Lista mensagens recentes de TODAS as lojas com regra, numa consulta só.
  async listRecent(days = 2, maxResults = 40) {
    const domains = [...new Set(Object.values(STORE_MAIL_RULES).flatMap((r) => [...r.domains, ...(r.senders ?? []).map((s) => s.domain)]))];
    const q = `newer_than:${days}d (${domains.map((d) => `from:${d}`).join(" OR ")})`;
    const listed = await this.gmail<{ messages?: { id: string }[] }>(`/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`);
    return (listed.messages ?? []).map((m) => m.id);
  }
  async read(id: string) {
    const m = await this.gmail<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`);
    return { id, from: header(m, "from"), subject: header(m, "subject"), text: messageText(m.payload).slice(0, 20_000), receivedAt: Number(m.internalDate) || Date.now() };
  }
}

// Uma passada: lê, classifica por loja, reporta o veredito e marca a mensagem como vista.
export async function readStoreMailOnce(reader = new GmailStoreMailReader(), days = 2) {
  const report = { checked: 0, reported: 0, matched: 0, errors: [] as string[] };
  if (!storeMailReaderConfigured()) return { ...report, configured: false };
  const ids = await reader.listRecent(days);
  const seen = new Set((await prisma.storeMailSeen.findMany({ where: { messageId: { in: ids } }, select: { messageId: true } })).map((s) => s.messageId));
  for (const id of ids) {
    if (seen.has(id)) continue;
    report.checked += 1;
    try {
      const mail = await reader.read(id);
      let verdictStore: string | null = null;
      let matched = false;
      for (const storeKey of Object.keys(STORE_MAIL_RULES)) {
        const verdict = classifyStoreMail(storeKey, mail);
        if (!verdict) continue;
        verdictStore = storeKey;
        const result = await reportMail({
          storeKey, storeOrderNumber: verdict.storeOrderNumber, kind: verdict.kind, messageId: id, receivedAt: new Date(mail.receivedAt).toISOString(),
          ...(verdict.trackingUrl ? { trackingUrl: verdict.trackingUrl } : {}), ...(verdict.deliveryCode ? { deliveryCode: verdict.deliveryCode } : {}),
        });
        report.reported += 1;
        if (result.matched) { matched = true; report.matched += 1; }
        break;
      }
      await prisma.storeMailSeen.create({ data: { messageId: id, storeKey: verdictStore, kind: verdictStore ? "reported" : "ignored", matched } }).catch(() => undefined);
    } catch (error) {
      report.errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ...report, configured: true };
}
