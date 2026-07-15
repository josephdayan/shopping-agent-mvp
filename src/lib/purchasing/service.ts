import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cartHash, getPurchasePolicy, money } from "./policy";
import { getBuyer } from "./index";
import { PURCHASE_JOB_STATUS, PurchaseError, type BuyerInput, type CartSnapshot, type PurchaseItemInput, type StoreOrderResult } from "./types";

type OrderBasketItem = {
  sku?: string;
  name?: string;
  qty?: number;
  unitPrice?: number;
  storeKey?: string;
  storeLabel?: string;
  productUrl?: string;
};

type OrderFulfillment = {
  storeKey?: string;
  storeLabel?: string;
  unitId?: string;
  unitLabel?: string;
};

function asBasket(value: unknown): OrderBasketItem[] {
  return Array.isArray(value) ? (value as OrderBasketItem[]) : [];
}

function asFulfillments(value: unknown): OrderFulfillment[] {
  return Array.isArray(value) ? (value as OrderFulfillment[]) : [];
}

function itemInput(item: OrderBasketItem): PurchaseItemInput | null {
  if (!item.sku || !item.name || !Number.isFinite(item.qty) || !item.qty || item.qty < 1) return null;
  return {
    requestedSku: item.sku,
    requestedName: item.name,
    requestedQty: Math.max(1, Math.floor(item.qty)),
    requestedUnitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : null,
    productUrl: item.productUrl ?? null
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido na automação de compra.";
}

function errorCode(error: unknown): string {
  return error instanceof PurchaseError ? error.code : "PURCHASE_WORKER_ERROR";
}

type AlreadyCompletedPurchase = { alreadyDone: true };

function isAlreadyCompletedPurchase(result: StoreOrderResult | AlreadyCompletedPurchase): result is AlreadyCompletedPurchase {
  return "alreadyDone" in result && result.alreadyDone === true;
}

function workerAccountKey(input: BuyerInput): string {
  // A Carrefour Browserbase Context is a single persisted shopping cart. Keep its
  // lease separate from other stores/contexts, but never store a card or cookie.
  const contextId = input.storeKey === "carrefour" ? process.env.CARREFOUR_BROWSER_CONTEXT_ID ?? "unconfigured" : input.storeUnitId ?? "default";
  return `${input.storeKey}:${contextId}`;
}

async function withWorkerLease<T>(input: BuyerInput, work: () => Promise<T>): Promise<T> {
  const accountKey = workerAccountKey(input);
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  let acquired = false;

  try {
    try {
      await prisma.purchaseWorkerLease.create({ data: { accountKey, token, expiresAt } });
      acquired = true;
    } catch (error) {
      // A crashed worker leaves an expiring lease; only a genuinely expired lease
      // may be taken over. This prevents two browser sessions mixing carts.
      const reclaimed = await prisma.purchaseWorkerLease.updateMany({
        where: { accountKey, expiresAt: { lt: now } },
        data: { token, expiresAt }
      });
      if (reclaimed.count === 1) acquired = true;
      else if (!(error instanceof Error)) throw error;
    }
    if (!acquired) {
      throw new PurchaseError("RETAILER_BUSY", "A conta da loja está ocupada com outro carrinho. O job será refeito assim que ela ficar livre.");
    }
    return await work();
  } finally {
    if (acquired) await prisma.purchaseWorkerLease.deleteMany({ where: { accountKey, token } });
  }
}

async function assertCartAvailable(jobId: string, input: BuyerInput): Promise<void> {
  // Quotes are short-lived. If a customer never responds, release their persisted
  // cart before deciding that the next customer must wait behind it.
  const expiredQuotes = await prisma.deliveryOrder.findMany({
    where: {
      storeKey: input.storeKey,
      status: "awaiting_quote_confirmation",
      quoteExpiresAt: { lt: new Date() }
    },
    select: { id: true }
  });
  if (expiredQuotes.length) {
    const orderIds = expiredQuotes.map((order) => order.id);
    await prisma.$transaction([
      prisma.purchaseJob.updateMany({
        where: { deliveryOrderId: { in: orderIds }, status: { in: [PURCHASE_JOB_STATUS.PREFLIGHT_QUEUED, PURCHASE_JOB_STATUS.PREFLIGHTING, PURCHASE_JOB_STATUS.CART_READY] } },
        data: { status: PURCHASE_JOB_STATUS.CANCELED, lastErrorCode: "QUOTE_EXPIRED", lastErrorMessage: "A cotação do varejista expirou antes do pagamento." }
      }),
      prisma.deliveryOrder.updateMany({
        where: { id: { in: orderIds }, status: "awaiting_quote_confirmation" },
        data: { status: "canceled" }
      })
    ]);
  }
  // A persisted retailer context has exactly one cart. Do not clear or overwrite a
  // cart that is still waiting on an approval/checkout from another order.
  const conflict = await prisma.purchaseJob.findFirst({
    where: {
      id: { not: jobId },
      storeKey: input.storeKey,
      status: {
        in: [
          PURCHASE_JOB_STATUS.CART_READY,
          PURCHASE_JOB_STATUS.AWAITING_APPROVAL,
          PURCHASE_JOB_STATUS.APPROVED,
          PURCHASE_JOB_STATUS.PURCHASING
        ]
      }
    },
    orderBy: { updatedAt: "asc" }
  });
  if (conflict) {
    throw new PurchaseError("RETAILER_BUSY", `A conta ${input.storeLabel} está reservada pelo carrinho ${conflict.id.slice(-6)}.`);
  }
}

export async function createPurchaseJobsForOrder(deliveryOrderId: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: deliveryOrderId } });
  if (!order) throw new Error("Delivery order not found");
  if (!["awaiting_supplier_validation", "paid", "operator_buying", "ready_for_pickup"].includes(order.status)) {
    throw new Error("Só é permitido preparar compras de pedidos pagos ou em validação da loja.");
  }
  const basket = asBasket(order.items);
  const fulfillments = asFulfillments(order.fulfillments);
  const sources = fulfillments.length
    ? fulfillments.map((fulfillment, index) => ({
        fulfillmentKey: `${fulfillment.storeKey ?? order.storeKey}:${fulfillment.unitId ?? index}`,
        storeKey: fulfillment.storeKey ?? order.storeKey,
        storeLabel: fulfillment.storeLabel ?? order.storeLabel,
        storeUnitId: fulfillment.unitId ?? null,
        storeUnitLabel: fulfillment.unitLabel ?? null
      }))
    : [
        {
          fulfillmentKey: "primary",
          storeKey: order.storeKey,
          storeLabel: order.storeLabel,
          storeUnitId: null,
          storeUnitLabel: order.storeUnit ?? null
        }
      ];

  return prisma.$transaction(
    sources.map((source) => {
      const items = basket
        .filter((item) => !item.storeKey || item.storeKey === source.storeKey)
        .map(itemInput)
        .filter((item): item is PurchaseItemInput => Boolean(item));
      return prisma.purchaseJob.upsert({
        where: { deliveryOrderId_fulfillmentKey: { deliveryOrderId, fulfillmentKey: source.fulfillmentKey } },
        update: {},
        create: {
          deliveryOrderId,
          fulfillmentKey: source.fulfillmentKey,
          storeKey: source.storeKey,
          storeLabel: source.storeLabel,
          storeUnitId: source.storeUnitId,
          storeUnitLabel: source.storeUnitLabel,
          items: {
            create: items.map((item) => ({
              requestedSku: item.requestedSku,
              requestedName: item.requestedName,
              requestedQty: item.requestedQty,
              requestedUnitPrice: item.requestedUnitPrice ?? null,
              productUrl: item.productUrl ?? null
            }))
          }
        },
        include: { items: true }
      });
    })
  );
}

async function loadBuyerInput(jobId: string): Promise<{ input: BuyerInput; job: Awaited<ReturnType<typeof prisma.purchaseJob.findUniqueOrThrow>> }> {
  const job = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { items: true, deliveryOrder: true }
  });
  return {
    job,
    input: {
      jobId: job.id,
      deliveryOrderId: job.deliveryOrderId,
      browserSessionId: job.browserSessionId,
      deliveryCep: job.deliveryOrder.cep,
      storeKey: job.storeKey,
      storeLabel: job.storeLabel,
      storeUnitId: job.storeUnitId,
      storeUnitLabel: job.storeUnitLabel,
      items: job.items.map((item) => ({
        requestedSku: item.requestedSku,
        requestedName: item.requestedName,
        requestedQty: item.requestedQty,
        requestedUnitPrice: item.requestedUnitPrice,
        expectedUnitPrice: item.expectedUnitPrice,
        productUrl: item.productUrl
      }))
    }
  };
}

async function recordSnapshot(jobId: string, snapshot: CartSnapshot, phase: "preflight" | "revalidate") {
  const current = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: jobId }, include: { deliveryOrder: { select: { status: true } } } });
  if (current.deliveryOrder.status === "canceled") {
    return prisma.purchaseJob.update({
      where: { id: jobId },
      data: { status: PURCHASE_JOB_STATUS.CANCELED, lastErrorCode: "ORDER_CANCELED", lastErrorMessage: "Pedido cancelado antes da conclusão da cotação." }
    });
  }
  const ready = snapshot.status === "ready" && snapshot.items.every((item) => item.status === "resolved");
  const hash = ready ? cartHash(snapshot) : null;
  const nextStatus = ready ? PURCHASE_JOB_STATUS.CART_READY : PURCHASE_JOB_STATUS.NEEDS_HUMAN;
  const job = await prisma.purchaseJob.update({
    where: { id: jobId },
    data: {
      status: nextStatus,
      cartHash: hash,
      cartSnapshot: snapshot as object,
      browserSessionId: snapshot.browserSessionId ?? current.browserSessionId,
      // The first verified cart becomes the comparison baseline. Revalidation only
      // changes actualTotal; a changed hash invalidates any existing approval.
      expectedTotal: current.expectedTotal ?? snapshot.total,
      actualTotal: snapshot.total,
      approvalStatus: current.approvalCartHash && current.approvalCartHash !== hash ? "invalidated" : current.approvalStatus,
      approvalCartHash: current.approvalCartHash && current.approvalCartHash !== hash ? null : current.approvalCartHash,
      lastErrorCode: ready ? null : "PREFLIGHT_NEEDS_HUMAN",
      lastErrorMessage: ready ? null : snapshot.reason ?? "Carrinho não pôde ser validado automaticamente.",
      nextAttemptAt: null
    }
  });
  for (const item of snapshot.items) {
    const existing = await prisma.purchaseItem.findFirst({ where: { purchaseJobId: jobId, requestedSku: item.requestedSku } });
    if (!existing) continue;
    await prisma.purchaseItem.update({
      where: { id: existing.id },
      data: {
        retailerSku: item.retailerSku ?? null,
        retailerProductId: item.retailerProductId ?? null,
        retailerSellerId: item.retailerSellerId ?? null,
        ean: item.ean ?? null,
        resolvedName: item.resolvedName ?? null,
        expectedUnitPrice: phase === "preflight" ? item.actualUnitPrice ?? null : existing.expectedUnitPrice,
        actualUnitPrice: item.actualUnitPrice ?? null,
        matchConfidence: item.matchConfidence ?? null,
        status: item.status,
        raw: item.raw as Prisma.InputJsonValue | undefined
      }
    });
  }
  return job;
}

async function runSnapshot(jobId: string, phase: "preflight" | "revalidate") {
  const { input } = await loadBuyerInput(jobId);
  const attempt = await prisma.purchaseAttempt.create({ data: { purchaseJobId: jobId, step: phase } });
  await prisma.purchaseJob.update({
    where: { id: jobId },
    data: { status: phase === "preflight" ? PURCHASE_JOB_STATUS.PREFLIGHTING : PURCHASE_JOB_STATUS.PREFLIGHTING, lastErrorCode: null, lastErrorMessage: null }
  });
  try {
    const { snapshot, job } = await withWorkerLease(input, async () => {
      if (phase === "preflight") await assertCartAvailable(jobId, input);
      const buyer = getBuyer(input.storeKey);
      const snapshot = await (phase === "preflight" ? buyer.preflight(input) : buyer.revalidate(input));
      // Hold the retailer-context lease until this snapshot is committed. Releasing it
      // earlier would let the next worker clear the cart in the small gap before this
      // job becomes cart_ready.
      const job = await recordSnapshot(jobId, snapshot, phase);
      return { snapshot, job };
    });
    await prisma.purchaseAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "succeeded",
        browserSessionId: snapshot.browserSessionId ?? null,
        details: { cartHash: job.cartHash, total: snapshot.total, ready: snapshot.status === "ready" },
        completedAt: new Date()
      }
    });
    return job;
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    await prisma.purchaseAttempt.update({
      where: { id: attempt.id },
      data: { status: "failed", errorCode: code, errorMessage: message, completedAt: new Date() }
    });
    const busy = code === "RETAILER_BUSY";
    return prisma.purchaseJob.update({
      where: { id: jobId },
      data: {
        status: busy ? PURCHASE_JOB_STATUS.PREFLIGHT_QUEUED : PURCHASE_JOB_STATUS.NEEDS_HUMAN,
        lastErrorCode: code,
        lastErrorMessage: message,
        nextAttemptAt: busy ? new Date(Date.now() + 30_000) : null
      }
    });
  }
}

export async function preflightPurchaseJob(jobId: string) {
  return runSnapshot(jobId, "preflight");
}

export async function revalidatePurchaseJob(jobId: string) {
  return runSnapshot(jobId, "revalidate");
}

export async function requestPurchaseApproval(jobId: string) {
  const job = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: jobId }, include: { deliveryOrder: true } });
  if (job.deliveryOrder.status !== "paid") throw new Error("A compra na loja só pode ser aprovada após o pagamento do cliente.");
  if (job.status !== PURCHASE_JOB_STATUS.CART_READY || !job.cartHash || !job.actualTotal) {
    throw new Error("A compra só pode ser aprovada com um carrinho validado.");
  }
  const policy = getPurchasePolicy();
  return prisma.purchaseJob.update({
    where: { id: jobId },
    data: {
      status: PURCHASE_JOB_STATUS.AWAITING_APPROVAL,
      approvalStatus: "requested",
      approvalMaxTotal: job.actualTotal,
      approvalCartHash: job.cartHash,
      approvalExpiresAt: new Date(Date.now() + policy.approvalTtlMinutes * 60_000)
    }
  });
}

export async function approvePurchaseJob(jobId: string, approvedBy: string) {
  const job = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== PURCHASE_JOB_STATUS.AWAITING_APPROVAL || !job.cartHash || job.approvalCartHash !== job.cartHash) {
    throw new Error("O carrinho mudou ou não está aguardando aprovação.");
  }
  if (job.approvalExpiresAt && job.approvalExpiresAt < new Date()) throw new Error("A aprovação expirou; revalide o carrinho.");
  return prisma.purchaseJob.update({
    where: { id: jobId },
    data: { status: PURCHASE_JOB_STATUS.APPROVED, approvalStatus: "approved", approvedBy, approvedAt: new Date() }
  });
}

// Policy auto-approval is intentionally a distinct audit event from human approval.
// It can only be called by the workflow after a fresh revalidation passed every guard.
export async function autoApprovePurchaseJob(jobId: string) {
  const job = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: jobId }, include: { deliveryOrder: true } });
  if (job.deliveryOrder.status !== "paid") throw new Error("A compra na loja só pode ser aprovada após o pagamento do cliente.");
  if (job.status !== PURCHASE_JOB_STATUS.CART_READY || !job.cartHash || !job.actualTotal) {
    throw new Error("O carrinho não está pronto para aprovação automática.");
  }
  return prisma.purchaseJob.update({
    where: { id: jobId },
    data: {
      status: PURCHASE_JOB_STATUS.APPROVED,
      approvalStatus: "auto_approved",
      approvalMaxTotal: job.actualTotal,
      approvalCartHash: job.cartHash,
      approvedBy: "policy",
      approvedAt: new Date(),
      approvalExpiresAt: new Date(Date.now() + getPurchasePolicy().approvalTtlMinutes * 60_000)
    }
  });
}

export async function placeApprovedPurchaseJob(jobId: string, idempotencyKey: string) {
  const { input, job } = await loadBuyerInput(jobId);
  if (job.status === PURCHASE_JOB_STATUS.ORDERED || job.status === PURCHASE_JOB_STATUS.READY_FOR_PICKUP) return job;
  const deliveryOrder = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: job.deliveryOrderId }, select: { status: true } });
  if (deliveryOrder.status !== "paid") throw new Error("A compra na loja só pode ser finalizada após o pagamento do cliente.");
  if (job.status !== PURCHASE_JOB_STATUS.APPROVED || !job.cartSnapshot || !job.cartHash || job.approvalCartHash !== job.cartHash) {
    throw new Error("A compra não está aprovada para o carrinho atual.");
  }
  if (job.approvalExpiresAt && job.approvalExpiresAt < new Date()) throw new Error("A aprovação expirou; revalide o carrinho.");
  const snapshot = job.cartSnapshot as unknown as CartSnapshot;
  let attemptId: string | null = null;
  try {
    const result: StoreOrderResult | AlreadyCompletedPurchase = await withWorkerLease(input, async (): Promise<StoreOrderResult | AlreadyCompletedPurchase> => {
      const begun = await prisma.$transaction(async (tx) => {
        const current = await tx.purchaseJob.findUniqueOrThrow({ where: { id: jobId } });
        if (current.status === PURCHASE_JOB_STATUS.ORDERED || current.status === PURCHASE_JOB_STATUS.READY_FOR_PICKUP) return { alreadyDone: true } as const;
        if (current.status === PURCHASE_JOB_STATUS.PURCHASING) {
          throw new PurchaseError(
            "ORDER_STATUS_UNKNOWN",
            "Já existe uma tentativa de finalização em andamento. Confira a sessão da loja antes de tentar novamente."
          );
        }
        if (current.status !== PURCHASE_JOB_STATUS.APPROVED) throw new Error("A aprovação não está mais válida.");
        const transitioned = await tx.purchaseJob.updateMany({
          where: { id: jobId, status: PURCHASE_JOB_STATUS.APPROVED, cartHash: current.cartHash },
          data: { status: PURCHASE_JOB_STATUS.PURCHASING, lockedAt: new Date() }
        });
        if (transitioned.count !== 1) throw new Error("A compra foi alterada por outro worker.");
        const attempt = await tx.purchaseAttempt.create({ data: { purchaseJobId: jobId, step: "place_order", idempotencyKey } });
        return { alreadyDone: false, attemptId: attempt.id } as const;
      });
      if (begun.alreadyDone) return { alreadyDone: true } as const;
      attemptId = begun.attemptId;
      return getBuyer(input.storeKey).placeOrder(input, snapshot, idempotencyKey);
    });
    if (isAlreadyCompletedPurchase(result)) return prisma.purchaseJob.findUniqueOrThrow({ where: { id: jobId } });
    const updated = await prisma.purchaseJob.update({
      where: { id: jobId },
      data: {
        status: result.status === "ready_for_pickup" ? PURCHASE_JOB_STATUS.READY_FOR_PICKUP : PURCHASE_JOB_STATUS.ORDERED,
        storeOrderNumber: result.storeOrderNumber,
        browserSessionId: result.browserSessionId ?? job.browserSessionId,
        completedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null
      }
    });
    await prisma.deliveryOrder.update({
      where: { id: job.deliveryOrderId },
      data: {
        storeOrderNumber: result.storeOrderNumber,
        status: result.status === "ready_for_pickup" ? "ready_for_pickup" : "operator_buying"
      }
    });
    if (attemptId) {
      await prisma.purchaseAttempt.update({ where: { id: attemptId }, data: { status: "succeeded", completedAt: new Date(), details: { storeOrderNumber: result.storeOrderNumber } } });
    }
    return updated;
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (attemptId) {
      await prisma.purchaseAttempt.update({ where: { id: attemptId }, data: { status: "failed", errorCode: code, errorMessage: message, completedAt: new Date() } });
    }
    return prisma.purchaseJob.update({
      where: { id: jobId },
      data: { status: PURCHASE_JOB_STATUS.NEEDS_HUMAN, lastErrorCode: code, lastErrorMessage: message }
    });
  }
}

export async function getPurchaseJobForOps(jobId: string) {
  return prisma.purchaseJob.findUnique({ where: { id: jobId }, include: { items: true, attempts: { orderBy: { createdAt: "desc" }, take: 10 }, deliveryOrder: true } });
}

export async function listPurchaseJobsForOrder(deliveryOrderId: string) {
  return prisma.purchaseJob.findMany({ where: { deliveryOrderId }, include: { items: true }, orderBy: { createdAt: "asc" } });
}

export function purchaseWorkerSummary(job: { status: string; actualTotal?: number | null; lastErrorCode?: string | null; lastErrorMessage?: string | null }) {
  return {
    status: job.status,
    actualTotal: job.actualTotal == null ? null : money(job.actualTotal),
    error: job.lastErrorCode ? { code: job.lastErrorCode, message: job.lastErrorMessage ?? "" } : null
  };
}
