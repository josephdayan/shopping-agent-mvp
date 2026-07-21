// Shared, client-safe order conventions. The DeliveryOrder row multiplexes a few
// facts into string columns (no schema migration needed for the pilot); this module
// is the ONE place that encodes/decodes them, imported by both the server brain
// (delivery-service) and the operator UI (OpsBoard).

// Appended to notes when the customer asks to cancel an already-paid order (refund
// is manual, so the operator must see it before buying/dispatching).
export const CANCEL_REQUEST_FLAG = "⚠️ CLIENTE PEDIU CANCELAMENTO";
export const REFUND_PENDING_FLAG = "⚠️ ESTORNO PENDENTE";
export const REFUND_CONFIRMED_PREFIX = "✅ ESTORNO CONFIRMADO:";

// DeliveryOrder.status is intentionally a string during the pilot so old orders keep
// working while the operation migrates from pickup/courier to retailer delivery.
// New direct-delivery orders use the explicit retailer_* states below; the old
// operator_buying/ready_for_pickup/dispatched states remain valid only for legacy
// orders and formally-authorized courier partners.
export const RETAILER_PREPARING_STATUS = "retailer_preparing";
export const RETAILER_OUT_FOR_DELIVERY_STATUS = "retailer_out_for_delivery";

// Manual concierge (the pilot's default): the customer asks for anything, the operator
// sources and prices it by hand, then sends the quote. The order waits in this state
// until the operator publishes the quote (which moves it to awaiting_quote_confirmation,
// reusing the same payment machinery the retailer-checkout quote already uses).
export const AWAITING_OPERATOR_QUOTE_STATUS = "awaiting_operator_quote";

// Sentinel store for free-form concierge baskets that don't belong to any single
// catalog store (the operator buys from wherever). Never resolves to a StoreConnector.
export const CONCIERGE_STORE_KEY = "concierge";
export const CONCIERGE_STORE_LABEL = "Lia";

export const ACTIVE_DELIVERY_ORDER_STATUSES = [
  AWAITING_OPERATOR_QUOTE_STATUS,
  "awaiting_supplier_validation",
  "awaiting_quote_confirmation",
  "payment_issuing",
  "awaiting_payment",
  "paid",
  RETAILER_PREPARING_STATUS,
  RETAILER_OUT_FOR_DELIVERY_STATUS,
  "operator_buying",
  "ready_for_pickup",
  "dispatched"
];

export const PAID_OR_IN_FULFILLMENT_STATUSES = [
  "paid",
  RETAILER_PREPARING_STATUS,
  RETAILER_OUT_FOR_DELIVERY_STATUS,
  "operator_buying",
  "ready_for_pickup",
  "dispatched"
];

export const REPEATABLE_DELIVERY_ORDER_STATUSES = [...PAID_OR_IN_FULFILLMENT_STATUSES, "delivered"];

export const OPS_QUEUE_STATUSES = [
  AWAITING_OPERATOR_QUOTE_STATUS,
  "awaiting_supplier_validation",
  "awaiting_quote_confirmation",
  "payment_issuing",
  "paid",
  RETAILER_PREPARING_STATUS,
  RETAILER_OUT_FOR_DELIVERY_STATUS,
  "operator_buying",
  "ready_for_pickup",
  "dispatched",
  "refund_pending"
];

type FulfillmentLike = { deliveryMode?: unknown };

export function isRetailerDeliveryOrder(order: { courierKey?: string | null; fulfillments?: unknown }): boolean {
  if (order.courierKey === "retailer_delivery") return true;
  if (!Array.isArray(order.fulfillments) || order.fulfillments.length === 0) return false;
  return order.fulfillments.every(
    (fulfillment) =>
      typeof fulfillment === "object" &&
      fulfillment !== null &&
      (fulfillment as FulfillmentLike).deliveryMode === "retailer_delivery"
  );
}

export function statusAfterStorePurchase(order: { courierKey?: string | null; fulfillments?: unknown }): string {
  return isRetailerDeliveryOrder(order) ? RETAILER_PREPARING_STATUS : "operator_buying";
}

// Same-hour concierge: the operator bought the goods and a courier (Uber Direct /
// Lalamove) delivers from the OPERATOR's location to the customer — no store-counter
// pickup, so none of the third-party-pickup document rules apply. This is the pilot's
// courier path (distinct from the legacy authorized-partner store pickup).
export function isOperatorCourierOrder(order: {
  courierKey?: string | null;
  storeKey?: string | null;
  fulfillments?: unknown;
}): boolean {
  if (isRetailerDeliveryOrder(order)) return false;
  if (order.storeKey === CONCIERGE_STORE_KEY) return true;
  if (Array.isArray(order.fulfillments)) {
    return order.fulfillments.some(
      (fulfillment) =>
        typeof fulfillment === "object" &&
        fulfillment !== null &&
        (fulfillment as FulfillmentLike).deliveryMode === "operator_courier"
    );
  }
  return false;
}

export function isOrderOutForDelivery(status: string): boolean {
  return status === RETAILER_OUT_FOR_DELIVERY_STATUS || status === "dispatched";
}

export function hasCancelRequest(notes?: string | null): boolean {
  return (notes ?? "").includes(CANCEL_REQUEST_FLAG);
}

export function hasPendingRefund(notes?: string | null): boolean {
  return (notes ?? "").includes(REFUND_PENDING_FLAG);
}

export function appendOrderNote(notes: string | null | undefined, line: string): string {
  const existing = (notes ?? "").split("\n").filter(Boolean);
  return existing.includes(line) ? existing.join("\n") : [...existing, line].join("\n");
}

// Payment-method line kept in notes (also human-readable on the ops card).
export function paymentNote(method: "pix" | "card", cardFeeLabel?: string): string {
  return method === "card" ? `Pagamento: cartão${cardFeeLabel ? ` (taxa ~${cardFeeLabel} embutida)` : ""}` : "Pagamento: Pix";
}

// Replace ONLY the payment line, preserving anything else stored in notes (e.g. the
// cancel-request flag) — switching Pix→cartão must never erase other annotations.
export function withPaymentNote(notes: string | null | undefined, line: string): string {
  const others = (notes ?? "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("Pagamento:"));
  return [line, ...others].join("\n");
}

// Is this charge a hosted card link (vs a Pix copia-e-cola)? The charge payload
// column holds either; the notes line is the primary signal, the URL shape the
// fallback. Kept here so brain + ops UI can never disagree.
export function isCardCharge(order: { notes?: string | null; pixCopiaECola?: string | null }): boolean {
  if ((order.notes ?? "").includes("Pagamento: cartão")) return true;
  if ((order.notes ?? "").includes("Pagamento: Pix")) return false;
  return (order.pixCopiaECola ?? "").startsWith("http");
}
