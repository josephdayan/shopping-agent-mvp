// Shared, client-safe order conventions. The DeliveryOrder row multiplexes a few
// facts into string columns (no schema migration needed for the pilot); this module
// is the ONE place that encodes/decodes them, imported by both the server brain
// (delivery-service) and the operator UI (OpsBoard).

// Appended to notes when the customer asks to cancel an already-paid order (refund
// is manual, so the operator must see it before buying/dispatching).
export const CANCEL_REQUEST_FLAG = "⚠️ CLIENTE PEDIU CANCELAMENTO";

export function hasCancelRequest(notes?: string | null): boolean {
  return (notes ?? "").includes(CANCEL_REQUEST_FLAG);
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
