import { randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { recordDeliveryEvent } from "./delivery-events";
import { trackingPageAllowed, explicitTrackingStatus } from "./tracking-policy";
export { trackingPageAllowed, explicitTrackingStatus } from "./tracking-policy";
export function trackingWorkerAuthorized(request: Request) {
  const expected = process.env.LIA_TRACKING_WORKER_TOKEN?.trim();
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected),
    b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
// Pedidos já comprados antes da migration também entram no acompanhamento.
async function backfillTrackingSubscriptions(stores: string[]) {
  let cursor: string | undefined;
  for (;;) {
    const orders = await prisma.deliveryOrder.findMany({
      where: {
        status: { in: ["retailer_preparing", "retailer_out_for_delivery"] },
        storeOrderNumber: { not: null },
        trackingSubscription: { is: null },
      },
      orderBy: { id: "asc" },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        items: true,
        fulfillments: true,
        storeOrderNumber: true,
        courierTrackingUrl: true,
      },
    });
    for (const order of orders) {
      const keys = new Set(
        (Array.isArray(order.items) ? order.items : []).flatMap((i) =>
          i &&
          typeof i === "object" &&
          !Array.isArray(i) &&
          typeof i.storeKey === "string"
            ? [i.storeKey]
            : [],
        ),
      );
      if (
        keys.size !== 1 ||
        !stores.includes([...keys][0]) ||
        (Array.isArray(order.fulfillments) && order.fulfillments.length > 1) ||
        !order.storeOrderNumber?.trim()
      )
        continue;
      await prisma.trackingSubscription.upsert({
        where: { deliveryOrderId: order.id },
        create: {
          deliveryOrderId: order.id,
          storeKey: [...keys][0],
          storeOrderNumber: order.storeOrderNumber,
          trackingUrl: order.courierTrackingUrl,
        },
        update: {},
      });
    }
    if (orders.length < 50) return;
    cursor = orders[orders.length - 1].id;
  }
}
export async function claimTracking(workerId: string, stores: string[]) {
  await backfillTrackingSubscriptions(stores);
  const now = new Date();
  const candidates = await prisma.trackingSubscription.findMany({
    where: {
      storeKey: { in: stores },
      completedAt: null,
      nextCheckAt: { lte: now },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      ],
      deliveryOrder: {
        status: { in: ["retailer_preparing", "retailer_out_for_delivery"] },
        purchaseJobs: {
          none: {
            status: {
              in: ["claimed", "submitting"],
            },
          },
        },
      },
    },
    orderBy: { nextCheckAt: "asc" },
    take: 10,
  });
  for (const row of candidates) {
    const token = randomUUID();
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase-account:${row.storeKey}`}))::text`;
      const busy = await tx.purchaseJob.findFirst({
        where: {
          storeKey: row.storeKey,
          OR: [
            {
              status: { in: ["awaiting_approval", "approved"] },
              lockedAt: { not: null },
            },
            {
              status: {
                in: ["claimed", "submitting", "outcome_unknown"],
              },
            },
            { status: "needs_review", lockedAt: { not: null } },
          ],
        },
      });
      const reading = await tx.trackingSubscription.findFirst({
        where: {
          storeKey: row.storeKey,
          lockedAt: { gt: new Date(Date.now() - 5 * 60_000) },
        },
      });
      if (busy || reading) return { count: 0 };
      return tx.trackingSubscription.updateMany({
        where: {
          id: row.id,
          nextCheckAt: row.nextCheckAt,
          OR: [
            { lockedAt: null },
            { lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
          ],
        },
        data: { workerId, claimToken: token, lockedAt: now },
      });
    });
    if (claimed.count)
      return {
        id: row.id,
        storeKey: row.storeKey,
        storeOrderNumber: row.storeOrderNumber,
        trackingUrl: row.trackingUrl,
        claimToken: token,
      };
  }
  return null;
}
export async function reportTracking(
  id: string,
  workerId: string,
  token: string,
  input: {
    pageUrl?: string;
    storeOrderNumber?: string;
    statusText?: string;
    observedAt?: string;
    wholeOrder?: boolean;
    error?: string;
  },
) {
  const row = await prisma.trackingSubscription.findUniqueOrThrow({
    where: { id },
  });
  if (
    row.workerId !== workerId ||
    !token ||
    row.claimToken !== token ||
    !row.lockedAt ||
    row.lockedAt.getTime() < Date.now() - 5 * 60_000
  )
    throw new Error("Consulta vencida ou de outro leitor.");
  let issue = input.error;
  const kind = explicitTrackingStatus(input.statusText ?? "");
  if (!issue) {
    const age = Date.now() - Date.parse(input.observedAt ?? "");
    if (
      !input.pageUrl ||
      !trackingPageAllowed(row.storeKey, input.pageUrl, row.trackingUrl) ||
      input.storeOrderNumber !== row.storeOrderNumber ||
      !Number.isFinite(age) ||
      age < -60_000 ||
      age > 120_000
    )
      issue = "Página, número ou horário não confere com o pedido.";
    else if (kind && !input.wholeOrder)
      issue = "Status de um pacote não confirma o pedido inteiro.";
    else if (kind)
      await recordDeliveryEvent(row.deliveryOrderId, {
        kind,
        source: "tracking_reader",
        sourceReference: input.pageUrl,
        occurredAt: new Date(input.observedAt!),
        storeKey: row.storeKey,
        storeOrderNumber: row.storeOrderNumber,
      });
  }
  const delay = issue ? Math.min(60, 5 * 2 ** Math.min(row.failures, 4)) : 2;
  await prisma.trackingSubscription.updateMany({
    where: { id, claimToken: token },
    data: {
      lockedAt: null,
      claimToken: null,
      workerId: null,
      lastCheckedAt: new Date(),
      lastError: issue?.slice(0, 200) ?? null,
      failures: issue ? { increment: 1 } : 0,
      nextCheckAt: new Date(Date.now() + delay * 60_000),
    },
  });
  return { ok: !issue, changed: Boolean(kind && !issue) };
}
