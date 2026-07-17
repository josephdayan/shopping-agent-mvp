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

export const ACTIVE_DELIVERY_ORDER_STATUSES = [
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
