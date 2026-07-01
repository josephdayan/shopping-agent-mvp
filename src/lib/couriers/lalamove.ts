import { createHmac, randomUUID } from "crypto";
import type {
  CourierConnector,
  CourierDispatch,
  CourierDispatchInput,
  CourierQuote,
  CourierQuoteInput
} from "./types";

// Lalamove — self-serve on-demand courier in SP. Real API (v3) wired below but INERT
// until LALAMOVE_API_KEY + LALAMOVE_API_SECRET are set (mock quotes/dispatch in sandbox).
// Auth = HMAC-SHA256 signature per request. Docs: https://developers.lalamove.com
const BASE_FEE = Number(process.env.LIA_COURIER_BASE_FEE ?? 9.9);
const MARKET = process.env.LALAMOVE_MARKET ?? "BR_SAO";
const SERVICE_TYPE = process.env.LALAMOVE_SERVICE_TYPE ?? "MOTORCYCLE";
const BASE_URL =
  process.env.LALAMOVE_ENV === "prod" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com";

function hasCreds() {
  return Boolean(process.env.LALAMOVE_API_KEY && process.env.LALAMOVE_API_SECRET);
}

// Deterministic mock fee — a slightly different curve from Uber so "pick the cheapest"
// is meaningful in sandbox (where every courier is mock).
function mockFee(input: CourierQuoteInput) {
  const digits = (input.dropoffCep ?? input.pickupCep ?? "").replace(/\D/g, "");
  const proxy = digits ? Number(digits.slice(-3)) % 90 : 30;
  const km = 1.5 + (proxy / 89) * 6;
  return Math.round((BASE_FEE - 0.5 + Math.max(0, km - 4) * 0.9) * 100) / 100;
}
function mockEta(input: CourierQuoteInput) {
  const digits = (input.dropoffCep ?? "").replace(/\D/g, "");
  const proxy = digits ? Number(digits.slice(-2)) % 30 : 10;
  return 45 + proxy; // 45–74 min — mock: cheapest but slower than Uber (a real tradeoff)
}

export const lalamoveCourier: CourierConnector = {
  key: "lalamove",
  label: "Lalamove",

  async quote(input: CourierQuoteInput): Promise<CourierQuote> {
    if (hasCreds()) {
      try {
        return await realQuote(input);
      } catch (error) {
        console.warn("[courier:lalamove:quote:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    return {
      quoteId: `mockq_${randomUUID()}`,
      courierKey: "lalamove",
      fee: mockFee(input),
      etaMinutes: mockEta(input),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      mock: true
    };
  },

  async dispatch(input: CourierDispatchInput): Promise<CourierDispatch> {
    if (hasCreds()) {
      try {
        return await realDispatch(input);
      } catch (error) {
        console.warn("[courier:lalamove:dispatch:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    const id = `mockd_${randomUUID()}`;
    return { dispatchId: id, trackingUrl: `https://track.mock/${id}`, mock: true };
  }
};

// --- Geocoding (Lalamove requires lat/lng on each stop; we only have CEP/address) ---
const geoCache = new Map<string, { lat: number; lng: number }>();

async function geocode(cep?: string, address?: string): Promise<{ lat: number; lng: number }> {
  const cacheKey = (cep ?? address ?? "").trim();
  if (!cacheKey) throw new Error("lalamove geocode: no cep/address");
  const cached = geoCache.get(cacheKey);
  if (cached) return cached;

  let coords: { lat: number; lng: number } | null = null;
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length === 8) {
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`, { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { location?: { coordinates?: { latitude?: string | number; longitude?: string | number } } };
        const c = d.location?.coordinates;
        if (c?.latitude && c?.longitude) coords = { lat: Number(c.latitude), lng: Number(c.longitude) };
      }
    } catch {
      /* fall through to Nominatim */
    }
  }
  if (!coords && address) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
        headers: { "User-Agent": "Lia/1.0 (delivery)" },
        cache: "no-store"
      });
      if (r.ok) {
        const arr = (await r.json()) as Array<{ lat?: string; lon?: string }>;
        if (arr[0]?.lat && arr[0]?.lon) coords = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
      }
    } catch {
      /* no-op */
    }
  }
  if (!coords) throw new Error("lalamove geocode: could not resolve coordinates");
  geoCache.set(cacheKey, coords);
  return coords;
}

// --- Signed request (HMAC-SHA256 over `${ts}\r\n${METHOD}\r\n${path}\r\n\r\n${body}`) ---
async function signedFetch(method: "GET" | "POST", path: string, bodyObj?: unknown): Promise<unknown> {
  const key = process.env.LALAMOVE_API_KEY as string;
  const secret = process.env.LALAMOVE_API_SECRET as string;
  const timestamp = Date.now().toString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const raw = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `hmac ${key}:${timestamp}:${signature}`,
      Market: MARKET,
      "Request-ID": randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    ...(body ? { body } : {}),
    cache: "no-store"
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`lalamove ${method} ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

type LalaQuotation = {
  data?: {
    quotationId?: string;
    priceBreakdown?: { total?: string; currency?: string };
    stops?: Array<{ stopId?: string }>;
  };
};

async function requestQuotation(input: CourierQuoteInput) {
  const pickup = await geocode(input.pickupCep, input.pickupAddress);
  const dropoff = await geocode(input.dropoffCep, input.dropoffAddress);
  const bodyObj = {
    data: {
      serviceType: SERVICE_TYPE,
      language: "pt_BR",
      stops: [
        { coordinates: { lat: String(pickup.lat), lng: String(pickup.lng) }, address: input.pickupAddress ?? "" },
        { coordinates: { lat: String(dropoff.lat), lng: String(dropoff.lng) }, address: input.dropoffAddress ?? "" }
      ]
    }
  };
  const data = (await signedFetch("POST", "/v3/quotations", bodyObj)) as LalaQuotation;
  return {
    quotationId: data.data?.quotationId ?? "",
    fee: Number(data.data?.priceBreakdown?.total ?? 0),
    stops: data.data?.stops ?? []
  };
}

async function realQuote(input: CourierQuoteInput): Promise<CourierQuote> {
  const q = await requestQuotation(input);
  if (!q.quotationId) throw new Error("lalamove quote: no quotationId");
  return {
    quoteId: q.quotationId,
    courierKey: "lalamove",
    fee: q.fee,
    etaMinutes: 40, // Lalamove quotation doesn't return an ETA; estimate.
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    mock: false
  };
}

async function realDispatch(input: CourierDispatchInput): Promise<CourierDispatch> {
  // Re-quote for a fresh quotationId + stopIds (the order-time quote has expired).
  const q = await requestQuotation({
    pickupCep: input.pickupCep,
    dropoffCep: input.dropoffCep,
    pickupAddress: input.pickupAddress,
    dropoffAddress: input.dropoffAddress
  });
  if (!q.quotationId || q.stops.length < 2) throw new Error("lalamove dispatch: missing quotation/stops");
  const senderPhone = (process.env.LALAMOVE_SENDER_PHONE ?? process.env.UBER_DIRECT_PICKUP_PHONE ?? input.dropoffPhone ?? "").trim();
  const bodyObj = {
    data: {
      quotationId: q.quotationId,
      sender: {
        stopId: q.stops[0].stopId,
        name: process.env.LALAMOVE_SENDER_NAME ?? process.env.UBER_DIRECT_PICKUP_NAME ?? "Lia",
        phone: senderPhone
      },
      recipients: [
        {
          stopId: q.stops[1].stopId,
          name: input.dropoffName ?? "Cliente",
          phone: (input.dropoffPhone ?? "").trim(),
          remarks: input.instructions
        }
      ],
      metadata: { orderId: input.orderId }
    }
  };
  const data = (await signedFetch("POST", "/v3/orders", bodyObj)) as { data?: { orderId?: string; shareLink?: string } };
  return {
    dispatchId: data.data?.orderId ?? `d_${randomUUID()}`,
    trackingUrl: data.data?.shareLink ?? "",
    mock: false
  };
}
