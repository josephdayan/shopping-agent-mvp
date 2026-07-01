import type { CourierConnector, CourierDispatch, CourierQuote, CourierQuoteInput } from "./types";
import { uberDirectCourier } from "./uber-direct";
import { lalamoveCourier } from "./lalamove";
import { loggiCourier } from "./loggi";

// Courier registry. Add another by writing one connector and registering it here; the
// flow and dashboard stay courier-agnostic. All registered couriers are quoted in
// parallel and the cheapest wins (see quoteCheapest).
const COURIERS: Record<string, CourierConnector> = {
  [uberDirectCourier.key]: uberDirectCourier,
  [lalamoveCourier.key]: lalamoveCourier,
  [loggiCourier.key]: loggiCourier
};

export const DEFAULT_COURIER_KEY = uberDirectCourier.key;

export function getCourier(key?: string | null): CourierConnector {
  return COURIERS[key ?? DEFAULT_COURIER_KEY] ?? COURIERS[DEFAULT_COURIER_KEY];
}

export function listCouriers(): CourierConnector[] {
  return Object.values(COURIERS);
}

const QUOTE_TIMEOUT_MS = Number(process.env.LIA_COURIER_QUOTE_TIMEOUT_MS ?? 8000);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("courier quote timeout")), ms))
  ]);
}

// Quote EVERY registered courier in parallel and return the CHEAPEST. Prefers REAL
// quotes over mock ones, so a credential-less courier can't "win" with a fake price and
// then fail to dispatch. A per-courier timeout keeps one slow courier from hanging the
// WhatsApp turn. Falls back to the default courier if every quote fails/times out.
export async function quoteCheapest(input: CourierQuoteInput): Promise<CourierQuote> {
  const settled = await Promise.allSettled(listCouriers().map((c) => withTimeout(c.quote(input), QUOTE_TIMEOUT_MS)));
  const quotes = settled
    .filter((s): s is PromiseFulfilledResult<CourierQuote> => s.status === "fulfilled")
    .map((s) => s.value);
  const real = quotes.filter((q) => !q.mock);
  const pool = real.length ? real : quotes;
  if (!pool.length) return getCourier(DEFAULT_COURIER_KEY).quote(input);
  return pool.reduce((best, q) => (q.fee < best.fee ? q : best));
}

export type { CourierConnector, CourierQuote, CourierDispatch };
