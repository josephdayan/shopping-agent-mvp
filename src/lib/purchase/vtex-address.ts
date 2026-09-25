// Endereço estruturado para o checkout VTEX, sem IA (25/09/2026). O cliente digita
// "Rua X, 221 ap 13" e o pedido guarda esse texto completado com bairro/cidade/UF/CEP
// (cep-lookup). Rua, bairro, cidade e UF vêm do CEP (autoridade); número e complemento
// vêm do texto do cliente; coordenadas do CEP (Cobasi só entrega com geo). Puro + testado.
import type { VtexAddress } from "./vtex-checkout";

export type CepAddress = { street?: string; neighborhood?: string; city?: string; uf?: string; geo?: { lat: number; lng: number } };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function lookupCepAddress(cep: string, fetchImpl: FetchLike = fetch, timeoutMs = 4_000): Promise<CepAddress | null> {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  let out: CepAddress | null = null;
  try {
    const r = await fetchImpl(`https://brasilapi.com.br/api/cep/v2/${digits}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (r.ok) {
      const b = (await r.json()) as { street?: string; neighborhood?: string; city?: string; state?: string; location?: { coordinates?: { latitude?: string | number; longitude?: string | number } } };
      const lat = Number(b.location?.coordinates?.latitude), lng = Number(b.location?.coordinates?.longitude);
      out = {
        street: b.street || undefined, neighborhood: b.neighborhood || undefined, city: b.city || undefined, uf: b.state || undefined,
        ...(Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { geo: { lat, lng } } : {}),
      };
    }
  } catch { /* cai no ViaCEP */ }
  if (!out?.street || !out.city) {
    try {
      const r = await fetchImpl(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) {
        const v = (await r.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };
        if (!v.erro) out = { ...(out ?? {}), street: out?.street || v.logradouro || undefined, neighborhood: out?.neighborhood || v.bairro || undefined, city: out?.city || v.localidade || undefined, uf: out?.uf || v.uf || undefined };
      }
    } catch { /* sem localidade */ }
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "Rua Engenheiro Edgar, 221 ap 13, Santa Cecília, São Paulo, SP, CEP 01233-020" →
// { street: "Rua Engenheiro Edgar", number: "221", complement: "ap 13" }. Remove do fim as
// partes de localidade/CEP conhecidas antes de procurar o número.
export function splitAddressText(text: string, locality: { neighborhood?: string; city?: string; uf?: string } = {}, cep?: string | null) {
  let t = (text ?? "").replace(/\s+/g, " ").trim();
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length === 8) t = t.replace(new RegExp(`,?\\s*(CEP\\s*)?${digits.slice(0, 5)}-?${digits.slice(5)}\\b`, "i"), "");
  for (const piece of [locality.city, locality.neighborhood]) {
    if (!piece) continue;
    const idx = fold(t).lastIndexOf(fold(piece));
    if (idx > 0) t = t.slice(0, idx).replace(/[,\s\-–]+$/, "");
  }
  if (locality.uf) t = t.replace(new RegExp(`[,\\s\\-–]+${locality.uf}\\s*$`, "i"), "");
  t = t.replace(/[,\s]+$/, "");
  const m = /^(.*?)[,\s]+(?:n[º°.o]?\s*)?(\d{1,6}[a-z]?)\b[\s,\-–]*(.*)$/i.exec(t);
  if (!m) return { street: t, number: "", complement: "" };
  return { street: m[1].trim(), number: m[2].trim(), complement: m[3].trim().replace(/^[,\s]+|[,\s]+$/g, "").slice(0, 100) };
}

export async function resolveVtexAddress(input: { receiverName: string; cep: string; addressText: string; fetchImpl?: FetchLike }): Promise<VtexAddress> {
  const digits = input.cep.replace(/\D/g, "");
  const lookup = await lookupCepAddress(digits, input.fetchImpl);
  const parts = splitAddressText(input.addressText, { neighborhood: lookup?.neighborhood, city: lookup?.city, uf: lookup?.uf }, digits);
  const street = lookup?.street || parts.street;
  if (!parts.number) throw new Error("Endereço sem número legível para a loja.");
  if (!street || !lookup?.city || !lookup?.uf) throw new Error("CEP sem rua/cidade conhecidas para a loja.");
  return {
    receiverName: input.receiverName.trim().slice(0, 100),
    postalCode: digits,
    street: street.slice(0, 100),
    number: parts.number,
    complement: parts.complement,
    neighborhood: (lookup.neighborhood ?? "").slice(0, 60),
    city: lookup.city.slice(0, 60),
    state: lookup.uf.toUpperCase(),
    ...(lookup.geo ? { geo: lookup.geo } : {}),
  };
}
