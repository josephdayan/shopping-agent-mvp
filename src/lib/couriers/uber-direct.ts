import { randomUUID } from "crypto";
import type {
  CourierConnector,
  CourierDispatch,
  CourierDispatchInput,
  CourierQuote,
  CourierQuoteInput
} from "./types";

// Uber Direct (self-serve last-mile in SP). Real API is wired below but stays
// INERT until UBER_DIRECT_CUSTOMER_ID + UBER_DIRECT_TOKEN are set — until then it
// returns realistic mock quotes/dispatches so the whole flow runs in sandbox.
const BASE_FEE = Number(process.env.LIA_COURIER_BASE_FEE ?? 9.9);

function hasCreds() {
  return Boolean(process.env.UBER_DIRECT_CUSTOMER_ID && process.env.UBER_DIRECT_TOKEN);
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
  return 35 + proxy; // 35–64 min
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
async function realQuote(input: CourierQuoteInput): Promise<CourierQuote> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID as string;
  const token = process.env.UBER_DIRECT_TOKEN as string;
  const res = await fetch(`https://api.uber.com/v1/customers/${customerId}/delivery_quotes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pickup_address: input.pickupAddress, dropoff_address: input.dropoffAddress }),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`uber_direct quote ${res.status}`);
  const data = (await res.json()) as { id?: string; fee?: number; dropoff_eta?: number; duration?: number };
  return {
    quoteId: data.id ?? `q_${randomUUID()}`,
    courierKey: "uber_direct",
    fee: (data.fee ?? 0) / 100,
    etaMinutes: data.dropoff_eta ?? data.duration ?? 40,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    mock: false
  };
}

async function realDispatch(input: CourierDispatchInput): Promise<CourierDispatch> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID as string;
  const token = process.env.UBER_DIRECT_TOKEN as string;
  const res = await fetch(`https://api.uber.com/v1/customers/${customerId}/deliveries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      quote_id: input.quoteId,
      pickup_address: input.pickupAddress,
      dropoff_address: input.dropoffAddress,
      pickup_notes: input.instructions,
      dropoff_name: input.dropoffName,
      dropoff_phone_number: input.dropoffPhone,
      manifest_reference: input.orderId
    }),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`uber_direct dispatch ${res.status}`);
  const data = (await res.json()) as { id?: string; tracking_url?: string };
  return { dispatchId: data.id ?? `d_${randomUUID()}`, trackingUrl: data.tracking_url ?? "", mock: false };
}
