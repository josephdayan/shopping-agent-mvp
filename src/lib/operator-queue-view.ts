import type { OpsRole } from "./auth";

type QueueEvent = {
  id: string;
  kind: string;
  deliveryStatus: string;
  lastError: string | null;
  occurredAt: Date;
};

type QueuePurchaseJob = { status: string };

type QueueOrder = Record<string, unknown> & {
  purchaseJobs?: QueuePurchaseJob[];
  events?: QueueEvent[];
  acquisitionTouch?: Record<string, unknown> | null;
};

// A consulta do dono continua completa. O operador recebe somente o necessário para
// cotar/comprar/acompanhar: sem ids internos, Pix copia-e-cola ou evidência dos jobs.
export function ordersForOpsRole<T extends QueueOrder>(orders: T[], role: OpsRole): unknown[] {
  if (role === "owner") return orders;
  return orders.map((order) => {
    const {
      purchaseJobs,
      userId: _userId,
      conversationId: _conversationId,
      pixId: _pixId,
      pixCopiaECola: _pixCopiaECola,
      courierQuoteId: _courierQuoteId,
      acquisitionTouch,
      ...safe
    } = order;
    return {
      ...safe,
      acquisitionTouch: acquisitionTouch ? {
        source: acquisitionTouch.source,
        campaignCode: acquisitionTouch.campaignCode,
        sourceType: acquisitionTouch.sourceType,
        sourceId: acquisitionTouch.sourceId,
        headline: acquisitionTouch.headline
      } : null,
      manualPurchase: purchaseJobs?.some((job) => job.status === "manual_queue") ?? false,
      events: (order.events ?? []).map(({ id, kind, deliveryStatus, lastError, occurredAt }) => ({
        id,
        kind,
        deliveryStatus,
        lastError,
        occurredAt,
      })),
    };
  });
}
