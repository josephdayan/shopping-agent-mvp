// Pluggable last-mile courier layer. The flow quotes a courier (real-time fee +
// ETA) before charging the customer (frete is passed through), then dispatches it
// once the store order is ready. Uber Direct first; add Lalamove/Borzo/Loggi by
// writing one more connector and registering it.

export type CourierQuoteInput = {
  pickupCep?: string;
  dropoffCep?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
};

export type CourierQuote = {
  quoteId: string;
  courierKey: string;
  fee: number; // BRL, passed through to the customer
  etaMinutes: number;
  expiresAt: string;
  mock: boolean;
};

export type CourierDispatchInput = {
  orderId: string;
  pickupAddress: string;
  dropoffAddress: string;
  // CEPs so a connector can RE-quote at dispatch time (the quote from order time has
  // usually expired by the time the operator dispatches).
  pickupCep?: string;
  dropoffCep?: string;
  instructions: string; // counter-pickup doc instructions for click-e-retire
  quoteId?: string;
  dropoffName?: string;
  dropoffPhone?: string;
};

export type CourierDispatch = {
  dispatchId: string;
  trackingUrl: string;
  mock: boolean;
};

export type CourierConnector = {
  key: string; // "uber_direct"
  label: string; // "Uber Direct"
  quote(input: CourierQuoteInput): Promise<CourierQuote>;
  dispatch(input: CourierDispatchInput): Promise<CourierDispatch>;
};
