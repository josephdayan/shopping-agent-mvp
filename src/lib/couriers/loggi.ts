import { randomUUID } from "crypto";
import type {
  CourierConnector,
  CourierDispatch,
  CourierDispatchInput,
  CourierQuote,
  CourierQuoteInput
} from "./types";

// Loggi — on-demand same-day in SP (Loggi Expresso). Registered as courier #3 so it
// joins the "quote all, pick cheapest" comparison automatically once wired.
//
// HONEST STATE: Loggi's credentials are NOT self-serve (commercial onboarding via
// contato@loggi.com) and the API is GraphQL/parcel-oriented — it can't be implemented
// correctly BLIND (no sandbox to test against). So the real quote/dispatch below are
// stubs that throw and fall back to mock. Finalize them during onboarding using the
// issued client_id/client_secret + docs.api.loggi.com. Until then Loggi returns mock
// quotes, which are excluded from the real comparison whenever another courier is real.
const BASE_FEE = Number(process.env.LIA_COURIER_BASE_FEE ?? 9.9);

function hasCreds() {
  return Boolean(process.env.LOGGI_CLIENT_ID && process.env.LOGGI_CLIENT_SECRET);
}

function mockFee(input: CourierQuoteInput) {
  const digits = (input.dropoffCep ?? input.pickupCep ?? "").replace(/\D/g, "");
  const proxy = digits ? Number(digits.slice(-3)) % 90 : 30;
  const km = 1.5 + (proxy / 89) * 6;
  return Math.round((BASE_FEE + 0.5 + Math.max(0, km - 4) * 1.1) * 100) / 100;
}
function mockEta(input: CourierQuoteInput) {
  const digits = (input.dropoffCep ?? "").replace(/\D/g, "");
  const proxy = digits ? Number(digits.slice(-2)) % 30 : 10;
  return 40 + proxy;
}

export const loggiCourier: CourierConnector = {
  key: "loggi",
  label: "Loggi",

  async quote(input: CourierQuoteInput): Promise<CourierQuote> {
    if (hasCreds()) {
      try {
        return await realQuote(input);
      } catch (error) {
        console.warn("[courier:loggi:quote:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    return {
      quoteId: `mockq_${randomUUID()}`,
      courierKey: "loggi",
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
        console.warn("[courier:loggi:dispatch:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    const id = `mockd_${randomUUID()}`;
    return { dispatchId: id, trackingUrl: `https://track.mock/${id}`, mock: true };
  }
};

// --- Real Loggi API — TO FINALIZE DURING COMMERCIAL ONBOARDING ---
// Token via client_credentials (Loggi Auth API) -> GraphQL price quote / create order at
// docs.api.loggi.com. Left as a stub so setting creds doesn't silently ship a wrong
// guess; both throw -> graceful mock fallback until implemented against the real sandbox.
async function realQuote(_input: CourierQuoteInput): Promise<CourierQuote> {
  throw new Error("loggi realQuote: not implemented — finalize during onboarding (docs.api.loggi.com)");
}
async function realDispatch(_input: CourierDispatchInput): Promise<CourierDispatch> {
  throw new Error("loggi realDispatch: not implemented — finalize during onboarding (docs.api.loggi.com)");
}
