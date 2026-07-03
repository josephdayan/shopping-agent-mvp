import type { StoreUnit } from "./types";
import { geocode, haversineKm, type LatLng } from "@/lib/geo";

// Escolha da unidade mais próxima, compartilhada pelos 3 conectores (antes era
// nearestUnit triplicado com proximidade numérica de CEP). Cadeia de fallback:
//   1. GEO: cliente geocodificado + unidade com lat/lng → haversine (distância real).
//   2. CEP: proximidade numérica de CEP (algoritmo antigo, movido pra cá verbatim).
//   3. default: units[0].
// distanceKm só é != null no caminho GEO — é o que a guarda de frete usa pra recusar
// endereço longe demais. Sem coords no dado (estado atual), sempre cai no CEP → distanceKm
// null → comportamento byte-idêntico ao de hoje.

export type NearestUnitResult = { unit: StoreUnit; distanceKm: number | null; method: "geo" | "cep" | "default" };

// CEP -> número comparável de 8 dígitos (zero-padded). null se inutilizável.
function cepToNumber(cep?: string | null): number | null {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  return Number(digits.padEnd(8, "0").slice(0, 8));
}

export function nearestByCoords(units: StoreUnit[], point: LatLng): NearestUnitResult | null {
  let best: StoreUnit | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const u of units) {
    if (u.lat == null || u.lng == null) continue;
    const km = haversineKm(point, { lat: u.lat, lng: u.lng });
    if (km < bestKm) {
      bestKm = km;
      best = u;
    }
  }
  return best ? { unit: best, distanceKm: Math.round(bestKm * 10) / 10, method: "geo" } : null;
}

export function nearestByCepProxy(units: StoreUnit[], cep?: string): StoreUnit | null {
  const target = cepToNumber(cep);
  if (target == null) return null;
  let best: StoreUnit | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const u of units) {
    const n = cepToNumber(u.cep);
    if (n == null) continue;
    const diff = Math.abs(n - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = u;
    }
  }
  return best;
}

export async function pickNearestUnit(units: StoreUnit[], cep?: string): Promise<NearestUnitResult> {
  if (!units.length) throw new Error("pickNearestUnit: no units");

  // 1) GEO — só tenta se ALGUMA unidade tem coords (senão é fetch à toa).
  if (units.some((u) => u.lat != null && u.lng != null)) {
    const point = await geocode(cep);
    if (point) {
      const geo = nearestByCoords(units, point);
      if (geo) return geo;
    }
  }

  // 2) CEP-numérico (algoritmo atual)
  const proxy = nearestByCepProxy(units, cep);
  if (proxy) return { unit: proxy, distanceKm: null, method: "cep" };

  // 3) default
  return { unit: units[0], distanceKm: null, method: "default" };
}
