// Geocodificação + distância compartilhadas. Nasceu do geocodificador ad-hoc do Lalamove
// (couriers/lalamove.ts), agora com timeout e contrato "nunca lança" — um turno de WhatsApp
// não pode travar por causa de uma API de geo lenta. Usado por: nearestUnit (escolher a loja
// mais próxima de verdade) e a guarda de frete (recusar endereço longe demais).

export type LatLng = { lat: number; lng: number };

const R_KM = 6371;

// Distância em km entre dois pontos (great-circle). Pura.
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const geoCache = new Map<string, LatLng>();
const timeoutMs = () => Number(process.env.LIA_GEOCODE_TIMEOUT_MS ?? 3500);

// Chave de cache canônica: CEP (8 dígitos) quando dá, senão o endereço em minúsculas.
function cacheKeyFor(cep?: string, address?: string): string | null {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length === 8) return digits;
  const a = (address ?? "").trim().toLowerCase();
  return a || null;
}

// Pré-carrega o cache (testes/evals rodam sem rede). Aceita "06010-000" ou "06010000".
export function seedGeoCache(key: string, coords: LatLng): void {
  const k = cacheKeyFor(key, key);
  if (k) geoCache.set(k, coords);
}

async function fromBrasilApi(digits: string): Promise<LatLng | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs())
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { location?: { coordinates?: { latitude?: string | number; longitude?: string | number } } };
    const c = d.location?.coordinates;
    if (c?.latitude != null && c?.longitude != null) {
      const lat = Number(c.latitude);
      const lng = Number(c.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

async function fromNominatim(address: string): Promise<LatLng | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`,
      {
        headers: { "User-Agent": "Lia/1.0 (delivery; contato@liadelivery.com.br)" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs())
      }
    );
    if (!r.ok) return null;
    const arr = (await r.json()) as Array<{ lat?: string; lon?: string }>;
    if (arr[0]?.lat && arr[0]?.lon) {
      const lat = Number(arr[0].lat);
      const lng = Number(arr[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

// CEP (BrasilAPI v2) e, se falhar, endereço (Nominatim). Cacheia só sucessos (uma falha
// transitória pode se recuperar num turno futuro). NUNCA lança — null em qualquer falha.
export async function geocode(cep?: string, address?: string): Promise<LatLng | null> {
  const key = cacheKeyFor(cep, address);
  if (!key) return null;
  const cached = geoCache.get(key);
  if (cached) return cached;

  let coords: LatLng | null = null;
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length === 8) coords = await fromBrasilApi(digits);
  if (!coords && address) coords = await fromNominatim(address);

  if (coords) geoCache.set(key, coords);
  return coords;
}
