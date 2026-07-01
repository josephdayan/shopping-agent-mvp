import { randomUUID } from "crypto";
import type {
  CourierConnector,
  CourierDispatch,
  CourierDispatchInput,
  CourierQuote,
  CourierQuoteInput
} from "./types";

// Uber Direct (self-serve last-mile in SP). Real API is wired below but stays
// INERT until creds are set — until then it returns realistic mock quotes/dispatches
// so the whole flow runs in sandbox.
//
// Auth: Uber Direct uses OAuth2 client_credentials. Set UBER_DIRECT_CLIENT_ID +
// UBER_DIRECT_CLIENT_SECRET (preferred — we mint + cache the bearer token), or drop a
// pre-minted UBER_DIRECT_TOKEN directly. Plus UBER_DIRECT_CUSTOMER_ID (your org id).
const BASE_FEE = Number(process.env.LIA_COURIER_BASE_FEE ?? 9.9);

function hasCreds() {
  const customer = Boolean(process.env.UBER_DIRECT_CUSTOMER_ID);
  const auth = Boolean(
    process.env.UBER_DIRECT_TOKEN ||
      (process.env.UBER_DIRECT_CLIENT_ID && process.env.UBER_DIRECT_CLIENT_SECRET)
  );
  return customer && auth;
}

// --- OAuth token (minted from client_credentials, cached in-memory until expiry) ---
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const direct = process.env.UBER_DIRECT_TOKEN;
  if (direct) return direct;
  const clientId = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const res = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "eats.deliveries"
    }),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`uber_direct oauth ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("uber_direct oauth: no access_token");
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 2592000) * 1000
  };
  return cachedToken.token;
}

// Deterministic mock fee from the dropoff CEP (LalaGo-style: base up to 4km + R$1/km).
function mockFee(input: CourierQuoteInput) {
  const digits = (input.dropoffCep ?? input.pickupCep ?? "").replace(/\D/g, "");
  const proxy = digits ? Number(digits.slice(-3)) % 90 : 30;
  const km = 1.5 + (proxy / 89) * 6; // ~1.5–7.5 km
  return Math.round((BASE_FEE + Math.max(0, km - 4) * 1) * 100) / 100;
}

function mockEta(input: CourierQuoteInput) {
  const digits = (input.dropoffCep ?? "").replace(/\D/g, "");
  const proxy = digits ? Number(digits.slice(-2)) % 30 : 10;
  return 28 + proxy; // 28–57 min — mock: pricier but faster than Lalamove (a real tradeoff)
}

export const uberDirectCourier: CourierConnector = {
  key: "uber_direct",
  label: "Uber Direct",

  async quote(input: CourierQuoteInput): Promise<CourierQuote> {
    if (hasCreds()) {
      try {
        return await realQuote(input);
      } catch (error) {
        console.warn("[courier:uber_direct:quote:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    return {
      quoteId: `mockq_${randomUUID()}`,
      courierKey: "uber_direct",
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
        console.warn("[courier:uber_direct:dispatch:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    const id = `mockd_${randomUUID()}`;
    return { dispatchId: id, trackingUrl: `https://track.mock/${id}`, mock: true };
  }
};

// --- Real Uber Direct API (inert until creds are set) ---
const UBER_API = "https://api.uber.com/v1/customers";

async function realQuote(input: CourierQuoteInput): Promise<CourierQuote> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID as string;
  const token = await getAccessToken();
  if (!token) throw new Error("uber_direct: missing token");
  const res = await fetch(`${UBER_API}/${customerId}/delivery_quotes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // Uber geocodes a single formatted address string for pickup/dropoff.
    body: JSON.stringify({
      pickup_address: input.pickupAddress,
      dropoff_address: input.dropoffAddress
    }),
    cache: "no-store"
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`uber_direct quote ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string; fee?: number; duration?: number; dropoff_eta?: number };
  return {
    quoteId: data.id ?? `q_${randomUUID()}`,
    courierKey: "uber_direct",
    fee: (data.fee ?? 0) / 100, // Uber returns the fee in cents
    etaMinutes: data.duration ?? 40,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    mock: false
  };
}

async function realDispatch(input: CourierDispatchInput): Promise<CourierDispatch> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID as string;
  const token = await getAccessToken();
  if (!token) throw new Error("uber_direct: missing token");
  // Re-quote for a FRESH quote_id — the one from order time has expired (~5 min) by the
  // time the operator dispatches. Uber's create-delivery requires a valid quote_id.
  const fresh = await realQuote({
    pickupCep: input.pickupCep,
    dropoffCep: input.dropoffCep,
    pickupAddress: input.pickupAddress,
    dropoffAddress: input.dropoffAddress
  });
  const res = await fetch(`${UBER_API}/${customerId}/deliveries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      quote_id: fresh.quoteId,
      // Pickup = the store (the operator who fetches the click-e-retire order).
      pickup_name: process.env.UBER_DIRECT_PICKUP_NAME ?? "Lia",
      pickup_phone_number: process.env.UBER_DIRECT_PICKUP_PHONE ?? input.dropoffPhone,
      pickup_address: input.pickupAddress,
      pickup_notes: input.instructions,
      // Dropoff = the customer.
      dropoff_name: input.dropoffName ?? "Cliente",
      dropoff_phone_number: input.dropoffPhone,
      dropoff_address: input.dropoffAddress,
      manifest_reference: input.orderId,
      manifest_items: [{ name: "Compras", quantity: 1, size: "medium" }]
    }),
    cache: "no-store"
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`uber_direct dispatch ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string; tracking_url?: string };
  return { dispatchId: data.id ?? `d_${randomUUID()}`, trackingUrl: data.tracking_url ?? "", mock: false };
}
