// Localização compartilhada no WhatsApp (botão "Enviar localização", 04/09) → CEP e rua,
// via Nominatim (OpenStreetMap). Nunca lança: falha vira `null` e a Lia pede o CEP por
// texto, como sempre. Timeout curto: um turno do WhatsApp não pode esperar mapa lento.
export type ReverseGeocode = { cep?: string; street?: string; neighbourhood?: string; city?: string; uf?: string };
export type ReverseGeocoder = (lat: number, lng: number) => Promise<ReverseGeocode | null>;

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocode | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Lia/1.0 (contato@liadelivery.com.br)", Accept: "application/json" },
      signal: AbortSignal.timeout(Number(process.env.LIA_GEOCODE_TIMEOUT_MS ?? 4000)),
      cache: "no-store"
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    const cepDigits = (a.postcode ?? "").replace(/\D/g, "");
    return {
      cep: cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : undefined,
      street: a.road ?? a.pedestrian ?? a.residential ?? undefined,
      neighbourhood: a.suburb ?? a.neighbourhood ?? a.quarter ?? undefined,
      city: a.city ?? a.town ?? a.municipality ?? undefined,
      uf: a["ISO3166-2-lvl4"]?.split("-")[1] ?? undefined
    };
  } catch {
    return null;
  }
}

// O que entra no cérebro no lugar do texto: CEP (ele resolve a rua pelo ViaCEP e pede o
// número, como no fluxo normal). Sem CEP legível → null (a Lia pede por texto).
export function locationToText(geo: ReverseGeocode | null): string | null {
  if (!geo?.cep) return null;
  return geo.cep;
}

// Resposta do Flow de endereço (formulário dentro do chat) → uma linha de endereço
// completo, no formato que o parser de endereço já entende.
export function flowAddressToText(payload: Record<string, unknown>): string | null {
  const s = (k: string) => String(payload[k] ?? "").trim();
  const rua = s("rua");
  const numero = s("numero");
  const cep = s("cep").replace(/\D/g, "");
  if (!rua || !numero || cep.length !== 8) return null;
  const parts = [`${rua}, ${numero}`, s("complemento"), s("bairro"), s("cidade") ? `${s("cidade")}${s("uf") ? ` - ${s("uf")}` : ""}` : "", `CEP ${cep.slice(0, 5)}-${cep.slice(5)}`].filter(Boolean);
  return parts.join(", ");
}
