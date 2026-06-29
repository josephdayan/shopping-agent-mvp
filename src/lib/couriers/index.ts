import type { CourierConnector, CourierDispatch, CourierQuote } from "./types";
import { uberDirectCourier } from "./uber-direct";

// Courier registry. Add Lalamove/Borzo/Loggi by writing one connector and
// registering it here; the flow and dashboard stay courier-agnostic.
const COURIERS: Record<string, CourierConnector> = {
  [uberDirectCourier.key]: uberDirectCourier
  // [lalamoveCourier.key]: lalamoveCourier,
};

export const DEFAULT_COURIER_KEY = uberDirectCourier.key;

export function getCourier(key?: string | null): CourierConnector {
  return COURIERS[key ?? DEFAULT_COURIER_KEY] ?? COURIERS[DEFAULT_COURIER_KEY];
}

export function listCouriers(): CourierConnector[] {
  return Object.values(COURIERS);
}

export type { CourierConnector, CourierQuote, CourierDispatch };
