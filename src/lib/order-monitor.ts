// Visibilidade operacional de TODAS as lojas. A fila de compra é apenas um subconjunto
// dos pedidos: job:null nunca significa que não há cliente aguardando atendimento.
import type { Prisma } from "@prisma/client";
import { OPS_QUEUE_STATUSES, hasCancelRequest, hasPendingRefund } from "./order-flags";
import { prisma } from "./prisma";

const monitorSelect = {
  id: true, status: true, storeKey: true, items: true, total: true,
  itemsSubtotal: true, deliveryFee: true, createdAt: true, updatedAt: true,
  paidAt: true, storeOrderNumber: true, notes: true,
  purchaseJobs: { select: {
    id: true, status: true, storeKey: true, storeOrderNumber: true,
    lastErrorCode: true
  } },
  payments: { select: {
    provider: true, status: true, amountCents: true, refundedCents: true
  } },
  paymentAttempts: { select: { status: true } }
} satisfies Prisma.DeliveryOrderSelect;

type MonitoredOrder = Prisma.DeliveryOrderGetPayload<{ select: typeof monitorSelect }>;
export const PURCHASE_BLOCKED_PREFIX = "🛑 COMPRA BLOQUEADA:";

function summarize(order: MonitoredOrder) {
  const items = Array.isArray(order.items) ? order.items.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    return [{ name: item.name, quantity: item.qty, storeKey: item.storeKey, productUrl: item.productUrl }];
  }) : [];
  const realPayments = order.payments.filter(p => ["mercadopago", "pagarme"].includes(p.provider));
  const receivedCents = realPayments.filter(p => p.status === "approved")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const paymentVerified = order.total > 0 && receivedCents === Math.round(order.total * 100)
    && realPayments.every(p => p.status === "approved" && p.refundedCents === 0);
  const existingPurchase = Boolean(order.storeOrderNumber)
    || order.purchaseJobs.some(j => Boolean(j.storeOrderNumber) || j.status === "completed");
  const cancellationRequested = hasCancelRequest(order.notes) || hasPendingRefund(order.notes);
  const paymentIssue = order.payments.some(p => p.status === "unexpected")
    || order.paymentAttempts.some(p => p.status === "unknown_outcome");
  const blockers = (order.notes ?? "").split("\n").filter(line => line.startsWith(PURCHASE_BLOCKED_PREFIX));
  const purchaseIssue = blockers.length > 0 || order.purchaseJobs.some(j => ["needs_review", "needs_human"].includes(j.status));
  // Um job já reservado nunca vira uma segunda compra fora do worker. Estados
  // desconhecidos também exigem reconciliação, não uma tentativa paralela.
  const purchaseInProgress = order.purchaseJobs.some(j => !["queued", "retrying"].includes(j.status));
  let action = "waiting";
  if (paymentIssue) action = "payment_review";
  else if (order.status === "refund_pending" || cancellationRequested) action = "refund_review";
  else if (order.status === "paid") {
    action = existingPurchase ? "reconcile_purchase"
      : !paymentVerified ? "payment_review"
      : purchaseIssue ? "purchase_review"
      : purchaseInProgress ? "purchase_in_progress" : "purchase_required";
  } else if (["awaiting_operator_quote", "awaiting_supplier_validation"].includes(order.status)) action = "quote_required";
  else if (["retailer_preparing", "retailer_out_for_delivery", "operator_buying", "ready_for_pickup", "dispatched"].includes(order.status)) action = "track_delivery";
  else if (["delivered", "canceled", "refunded"].includes(order.status)) action = "closed";
  return {
    orderId: order.id, shortOrderId: order.id.slice(-6).toUpperCase(),
    status: order.status, action, createdAt: order.createdAt, updatedAt: order.updatedAt,
    paidAt: order.paidAt, total: order.total,
    maximumRetailerTotal: Math.round((order.itemsSubtotal + order.deliveryFee) * 100) / 100,
    paymentVerified, existingPurchase, cancellationRequested, blockers, items,
    purchaseJobs: order.purchaseJobs
  };
}

export async function monitorAllOrders(now = new Date()) {
  const orders = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.deliveryOrder.findMany({
      where: { OR: [
        { status: { in: OPS_QUEUE_STATUSES } },
        { updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
        { payments: { some: { status: "unexpected" } } },
        { paymentAttempts: { some: { status: "unknown_outcome" } } }
      ] },
      // Sem filtro por loja, por PurchaseJob ou limite dos primeiros N pedidos.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: monitorSelect
    });
  }, { timeout: 30_000 });
  const summarized = orders.map(summarize);
  return {
    checkedAt: now.toISOString(), source: "DeliveryOrder", scope: "all_stores",
    counts: summarized.reduce<Record<string, number>>((counts, o) => {
      counts[o.action] = (counts[o.action] ?? 0) + 1;
      return counts;
    }, {}),
    orders: summarized
  };
}

export async function inspectMonitoredOrder(reference: string) {
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(reference)) throw new Error("Informe o ID do pedido (completo ou os últimos 6 caracteres).");
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const matches = await tx.deliveryOrder.findMany({
      where: reference.length === 6 ? { id: { endsWith: reference.toLowerCase() } } : { id: reference },
      take: 2,
      select: {
        ...monitorSelect, customerName: true, phone: true, cep: true,
        deliveryAddress: true, fulfillments: true, courierTrackingUrl: true,
        user: { select: { name: true, email: true } }
      }
    });
    if (matches.length !== 1) throw new Error(matches.length ? "ID ambíguo: use o ID completo." : "Pedido não encontrado.");
    const order = matches[0];
    return {
      ...summarize(order),
      customer: { name: order.customerName || order.user.name, email: order.user.email,
        phone: order.phone, cep: order.cep, address: order.deliveryAddress },
      fulfillments: order.fulfillments, storeOrderNumber: order.storeOrderNumber,
      trackingUrl: order.courierTrackingUrl
    };
  }, { timeout: 30_000 });
}

// Lista TODOS os pedidos consultados, mas sem repetir seus itens/links em cada
// heartbeat. O detalhe completo é obtido por inspect; nenhum corte silencioso.
export function compactMonitorReport(report: Awaited<ReturnType<typeof monitorAllOrders>>) {
  return {
    checkedAt: report.checkedAt, source: report.source, scope: report.scope,
    checkedOrders: report.orders.length, counts: report.counts,
    columns: ["shortOrderId", "status", "updatedAtEpochMs", "stores"],
    byAction: report.orders.reduce<Record<string, unknown[][]>>((groups, o) => {
      (groups[o.action] ??= []).push([o.shortOrderId, o.status, o.updatedAt.getTime(),
        [...new Set(o.items.map(item => item.storeKey))]]);
      return groups;
    }, {})
  };
}
