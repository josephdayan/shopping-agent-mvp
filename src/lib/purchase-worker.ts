import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { isRetailerDeliveryOrder } from "@/lib/order-flags";

type OrderItem = {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal?: number;
  storeKey: string;
  storeLabel: string;
  productUrl?: string;
};

const CLAIMABLE = ["queued", "retrying"];

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function leaseMs(): number {
  const configured = Number(process.env.LIA_PURCHASE_WORKER_LEASE_MS ?? 15 * 60_000);
  return Number.isFinite(configured) ? Math.max(60_000, Math.min(60 * 60_000, configured)) : 15 * 60_000;
}

function retryMs(): number {
  const configured = Number(process.env.LIA_PURCHASE_WORKER_RETRY_MS ?? 5 * 60_000);
  return Number.isFinite(configured) ? Math.max(60_000, Math.min(60 * 60_000, configured)) : 5 * 60_000;
}

function cartHash(items: OrderItem[], deliveryFee: number, promise?: string): string {
  const canonical = {
    items: items
      .map((item) => ({ sku: item.sku, qty: item.qty, unitPrice: money(item.unitPrice), productUrl: item.productUrl ?? null }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    deliveryFee: money(deliveryFee),
    promise: promise ?? null
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function deliveryPromise(fulfillments: unknown): string | undefined {
  if (!Array.isArray(fulfillments)) return undefined;
  const values = fulfillments
    .map((entry) => (entry && typeof entry === "object" ? (entry as { deliveryPromise?: unknown }).deliveryPromise : undefined))
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return values.length ? values.join(" · ") : undefined;
}

function mercadoLivreOnly(items: OrderItem[]): boolean {
  return items.length > 0 && items.every((item) => item.storeKey === "mercadolivre" && /^https:\/\/[^/]*mercadolivre\.com\.br\//i.test(item.productUrl ?? ""));
}

export async function ensurePurchaseJobForPaidOrder(orderId: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId }, include: { purchaseJobs: true } });
  if (!order || order.status !== "paid" || !isRetailerDeliveryOrder(order)) return null;
  const items = ((order.items as unknown as OrderItem[]) ?? []).filter(Boolean);
  // The first pilot is deliberately restricted to exact Mercado Livre listing URLs.
  // Free-form concierge lines and mixed-store baskets always remain with the operator.
  if (!mercadoLivreOnly(items)) return null;
  const existing = order.purchaseJobs.find((job) => job.fulfillmentKey === "mercadolivre");
  if (existing) return existing;

  const promise = deliveryPromise(order.fulfillments);
  const expectedTotal = money(order.itemsSubtotal + order.deliveryFee);
  const hash = cartHash(items, order.deliveryFee, promise);
  try {
    return await prisma.purchaseJob.create({
      data: {
        deliveryOrderId: order.id,
        fulfillmentKey: "mercadolivre",
        storeKey: "mercadolivre",
        storeLabel: "Mercado Livre",
        status: "queued",
        expectedTotal,
        approvalMaxTotal: expectedTotal,
        approvalCartHash: hash,
        cartHash: hash,
        cartSnapshot: { deliveryFee: money(order.deliveryFee), deliveryPromise: promise ?? null },
        items: {
          create: items.map((item) => ({
            requestedSku: item.sku,
            requestedName: item.name,
            requestedQty: Math.max(1, Math.round(item.qty)),
            requestedUnitPrice: money(item.unitPrice),
            productUrl: item.productUrl,
            expectedUnitPrice: money(item.unitPrice),
            status: "resolved"
          }))
        }
      }
    });
  } catch (error) {
    // Payment webhooks may race. The unique (order, fulfillment) constraint is the
    // authority, so the loser returns the row created by the winner.
    const raced = await prisma.purchaseJob.findUnique({
      where: { deliveryOrderId_fulfillmentKey: { deliveryOrderId: order.id, fulfillmentKey: "mercadolivre" } }
    });
    if (raced) return raced;
    throw error;
  }
}

export async function backfillPaidPurchaseJobs(limit = 25) {
  const orders = await prisma.deliveryOrder.findMany({
    where: { status: "paid", purchaseJobs: { none: {} } },
    orderBy: { paidAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
    select: { id: true }
  });
  let created = 0;
  for (const order of orders) if (await ensurePurchaseJobForPaidOrder(order.id)) created += 1;
  return created;
}

export async function claimNextPurchaseJob(workerId: string) {
  await backfillPaidPurchaseJobs();
  const now = new Date();
  const stale = new Date(now.getTime() - leaseMs());

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.purchaseJob.findFirst({
      where: {
        status: { in: CLAIMABLE },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        AND: [{ OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }] }],
        deliveryOrder: { status: "paid" }
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true }
    });
    if (!candidate) return null;
    const claimed = await prisma.purchaseJob.updateMany({
      where: { id: candidate.id, status: candidate.status, OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }] },
      data: { status: "claimed", lockedAt: now, browserSessionId: workerId, nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null }
    });
    if (!claimed.count) continue;
    return prisma.purchaseJob.findUnique({
      where: { id: candidate.id },
      include: { items: true, deliveryOrder: true }
    });
  }
  return null;
}

export function workerPayload(job: NonNullable<Awaited<ReturnType<typeof claimNextPurchaseJob>>>) {
  return {
    jobId: job.id,
    orderId: job.deliveryOrderId,
    shortOrderId: job.deliveryOrderId.slice(-6).toUpperCase(),
    expectedTotal: job.expectedTotal,
    maximumTotal: job.approvalMaxTotal,
    cartHash: job.cartHash,
    mode: process.env.PURCHASE_AUTOMATION_MODE ?? "cart_only",
    customer: {
      name: job.deliveryOrder.customerName,
      phone: job.deliveryOrder.phone,
      cep: job.deliveryOrder.cep,
      address: job.deliveryOrder.deliveryAddress
    },
    items: job.items.map((item) => ({
      sku: item.requestedSku,
      name: item.requestedName,
      quantity: item.requestedQty,
      expectedUnitPrice: item.expectedUnitPrice,
      productUrl: item.productUrl
    }))
  };
}

export async function reportPurchaseJobFailure(jobId: string, workerId: string, input: { code: string; message: string; retryable?: boolean }) {
  const status = input.retryable ? "retrying" : "needs_review";
  const updated = await prisma.purchaseJob.updateMany({
    where: { id: jobId, status: "claimed", browserSessionId: workerId },
    data: {
      status,
      lockedAt: null,
      nextAttemptAt: input.retryable ? new Date(Date.now() + retryMs()) : null,
      lastErrorCode: input.code.slice(0, 80),
      lastErrorMessage: input.message.slice(0, 500)
    }
  });
  if (!updated.count) throw new Error("Purchase job is not claimed by this worker.");
  await prisma.purchaseAttempt.create({
    data: { purchaseJobId: jobId, step: "worker", status, browserSessionId: workerId, errorCode: input.code.slice(0, 80), errorMessage: input.message.slice(0, 500), completedAt: new Date() }
  });
}

export async function validatePurchaseCompletion(jobId: string, workerId: string, input: { actualTotal: number; cartHash: string; storeOrderNumber: string }) {
  const job = await prisma.purchaseJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "claimed" || job.browserSessionId !== workerId) throw new Error("Purchase job is not claimed by this worker.");
  if ((process.env.PURCHASE_AUTOMATION_MODE ?? "cart_only") !== "purchase") throw new Error("Final purchase is disabled (cart_only).");
  if (job.approvalStatus !== "approved" || !job.approvedAt) throw new Error("Purchase job has no current operator approval.");
  if (job.approvalExpiresAt && job.approvalExpiresAt < new Date()) throw new Error("Purchase approval expired.");
  if (!job.approvalCartHash || input.cartHash !== job.approvalCartHash) throw new Error("Cart changed after approval.");
  const actualTotal = money(input.actualTotal);
  if (!job.approvalMaxTotal || actualTotal > money(job.approvalMaxTotal)) throw new Error("Retailer total exceeds the approved maximum.");
  if (!input.storeOrderNumber.trim()) throw new Error("Retailer order number is required.");
  return { job, actualTotal, completionToken: randomUUID() };
}

export async function markPurchaseJobCompleted(jobId: string, actualTotal: number, storeOrderNumber: string) {
  await prisma.purchaseJob.update({
    where: { id: jobId },
    data: { status: "completed", actualTotal, storeOrderNumber: storeOrderNumber.trim(), lockedAt: null, nextAttemptAt: null, completedAt: new Date() }
  });
  await prisma.purchaseAttempt.upsert({
    where: { purchaseJobId_idempotencyKey: { purchaseJobId: jobId, idempotencyKey: `retailer-order:${storeOrderNumber.trim()}` } },
    create: { purchaseJobId: jobId, step: "purchase", status: "completed", idempotencyKey: `retailer-order:${storeOrderNumber.trim()}`, details: { actualTotal }, completedAt: new Date() },
    update: { status: "completed", details: { actualTotal }, completedAt: new Date() }
  });
}
