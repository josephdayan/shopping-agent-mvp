// Parser puro do BR Code (Pix copia-e-cola), padrão EMV TLV do Bacen. Sem rede, sem banco.
// Usado como guarda ANTES de qualquer pagamento: CRC válido, valor exato, cobrança dinâmica.
import { createHash } from "node:crypto";

export type EmvPix = {
  valid: boolean;
  crcOk: boolean;
  amountCents: number | null;
  merchantName: string;
  merchantCity: string;
  txid: string | null;
  pixKey: string | null;
  url: string | null;
  // Cobrança dinâmica (URL do PSP em 26-25): é o que um checkout gera. Estática tem chave.
  dynamic: boolean;
  currency: string;
  countryCode: string;
  reason?: string;
};

function tlv(payload: string): { id: string; value: string }[] | null {
  const out: { id: string; value: string }[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) return null;
    const id = payload.slice(i, i + 2);
    const len = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(id) || !Number.isFinite(len) || i + 4 + len > payload.length) return null;
    out.push({ id, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

// CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), como exige o manual do Pix.
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function pixCodeHash(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export const PIX_EMV_RE = /000201[0-9A-Za-z\s.\-*+/:@$&=_%]{40,}6304[0-9A-Fa-f]{4}/;

export function parsePixEmv(input: string): EmvPix {
  const code = input.trim();
  const base: EmvPix = {
    valid: false, crcOk: false, amountCents: null, merchantName: "", merchantCity: "", txid: null,
    pixKey: null, url: null, dynamic: false, currency: "", countryCode: "",
  };
  if (!code.startsWith("000201") || code.length < 40 || code.length > 1024) return { ...base, reason: "formato" };
  const crcAt = code.lastIndexOf("6304");
  if (crcAt !== code.length - 8) return { ...base, reason: "crc-posicao" };
  const crcOk = crc16(code.slice(0, crcAt + 4)) === code.slice(crcAt + 4).toUpperCase();
  const fields = tlv(code);
  if (!fields) return { ...base, crcOk, reason: "tlv" };
  const get = (id: string) => fields.find((f) => f.id === id)?.value;
  const account = fields.find((f) => f.id >= "26" && f.id <= "51" && /br\.gov\.bcb\.pix/i.test(f.value));
  const inner = account ? tlv(account.value) ?? [] : [];
  const innerGet = (id: string) => inner.find((f) => f.id === id)?.value ?? null;
  const url = innerGet("25");
  const amountRaw = get("54");
  const amount = amountRaw != null ? Number(amountRaw) : null;
  const additional = get("62") ? tlv(get("62")!) ?? [] : [];
  const txidRaw = additional.find((f) => f.id === "05")?.value ?? null;
  const merchantName = (get("59") ?? "").trim();
  const merchantCity = (get("60") ?? "").trim();
  const currency = get("53") ?? "";
  const countryCode = get("58") ?? "";
  const valid = Boolean(crcOk && account && merchantName && currency === "986" && countryCode.toUpperCase() === "BR");
  return {
    valid, crcOk,
    amountCents: amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    merchantName, merchantCity,
    txid: txidRaw && txidRaw !== "***" ? txidRaw : null,
    pixKey: innerGet("01"), url, dynamic: Boolean(url), currency, countryCode,
    ...(valid ? {} : { reason: !crcOk ? "crc" : !account ? "sem-pix" : "campos" }),
  };
}

// Localiza um copia-e-cola dentro de um texto (modal do checkout, resposta do conector).
export function findPixCode(text: string): string | null {
  const m = text.replace(/\s+/g, " ").match(PIX_EMV_RE);
  if (!m) return null;
  // Nome/cidade do recebedor podem ter espaços legítimos; um modal pode quebrar o código
  // em linhas. Só vale a forma cujo CRC confere.
  for (const candidate of [m[0].trim(), m[0].replace(/\s+/g, "")]) {
    if (parsePixEmv(candidate).crcOk) return candidate;
  }
  return null;
}
