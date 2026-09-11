// Uma etapa só avança com evidência explícita; prazo decorrido nunca é evidência.
import { prisma } from "./prisma";
import { appendOrderNote } from "./order-flags";
import { whatsappAdapter } from "./adapters/whatsapp";
import { outsideServiceWindow } from "./turn-runtime";
import * as copy from "./lia-copy";

export type DeliveryEventKind = "bought" | "out_for_delivery" | "delivered";
export type DeliveryEvidence = {
  kind: DeliveryEventKind;
  source: "operator" | "tracking_reader";
  sourceReference: string;
  occurredAt?: Date;
  storeOrderNumber?: string;
  storeKey?: string;
  trackingUrl?: string;
  purchaseExecution?: { jobId: string; submissionId: string; actualTotal: number };
};
const TARGET: Record<DeliveryEventKind, string> = {
  bought: "retailer_preparing", out_for_delivery: "retailer_out_for_delivery", delivered: "delivered"
};

export function validateTrackingUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("O rastreio precisa ser uma URL https sem credenciais.");
  return url.toString();
}

export async function recordDeliveryEvent(orderId: string, evidence: DeliveryEvidence) {
  const reference = evidence.sourceReference.trim();
  if (!reference || reference.length > 300) throw new Error("Informe a referência da evidência da loja.");
  const occurredAt = evidence.occurredAt ?? new Date();
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 60_000) throw new Error("Data da evidência inválida.");
  const tracking = validateTrackingUrl(evidence.trackingUrl);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (evidence.purchaseExecution) {
      const proof = evidence.purchaseExecution;
      const job = await tx.purchaseJob.findUniqueOrThrow({ where: { id: proof.jobId } });
      if (job.deliveryOrderId !== order.id || job.submissionId !== proof.submissionId || !["submitting", "outcome_unknown", "completed"].includes(job.status)) throw new Error("Tentativa de compra incompatível.");
      if (job.status === "completed" && job.storeOrderNumber !== evidence.storeOrderNumber?.trim()) throw new Error("Comprovante duplicado com número diferente.");
    }
    // O leitor não pode associar pedidos por nome, telefone ou produto parecido.
    if (evidence.source === "tracking_reader") {
      if (evidence.kind === "bought") throw new Error("O leitor de rastreio não confirma compras.");
      const stores = new Set((Array.isArray(order.items) ? order.items : []).flatMap((i) =>
        i && typeof i === "object" && !Array.isArray(i) && typeof i.storeKey === "string" ? [i.storeKey] : []));
      if (stores.size > 1 || (Array.isArray(order.fulfillments) && order.fulfillments.length > 1)) {
        throw new Error("Cesta com múltiplas entregas exige acompanhamento por pacote; revisar no /ops.");
      }
      const actualStore = stores.size === 1 ? [...stores][0] : order.storeKey;
      if (!order.storeOrderNumber || evidence.storeOrderNumber !== order.storeOrderNumber || evidence.storeKey !== actualStore) {
        throw new Error("A evidência não corresponde ao pedido e à loja registrados.");
      }
    }
    if (evidence.kind === "bought" && order.storeOrderNumber && evidence.storeOrderNumber?.trim() !== order.storeOrderNumber) {
      throw new Error("Já existe outro número de compra registrado para este pedido.");
    }
    const key = `${order.id}:${evidence.kind}`;
    const existing = await tx.deliveryEvent.findUnique({ where: { dedupeKey: key } });
    if (existing) {
      // Dois registros concorrentes da mesma compra podem chegar com/sem rastreio.
      // Completar um campo ausente não gera outro evento nem sobrescreve link mais novo.
      const reconciled = tracking && !order.courierTrackingUrl
        ? await tx.deliveryOrder.update({ where: { id: order.id }, data: { courierTrackingUrl: tracking } }) : order;
      if(tracking && !order.courierTrackingUrl) await tx.trackingSubscription.updateMany({where:{deliveryOrderId:order.id},data:{trackingUrl:tracking}});
      return { order: reconciled, eventId: existing.id };
    }
    if (order.status === TARGET[evidence.kind]) return { order, eventId: null };
    const allowed = evidence.kind === "bought" ? ["paid"] : evidence.kind === "out_for_delivery"
      ? ["retailer_preparing", "operator_buying"]
      : evidence.source === "tracking_reader" ? ["retailer_preparing", "retailer_out_for_delivery"] : ["retailer_out_for_delivery", "dispatched"];
    if (!allowed.includes(order.status)) throw new Error("Etapa incompatível com o estado atual do pedido.");
    if (order.paidAt && occurredAt < order.paidAt) throw new Error("Evidência anterior ao pagamento do pedido.");
    const last = await tx.deliveryEvent.findFirst({ where: { deliveryOrderId: order.id }, orderBy: { occurredAt: "desc" } });
    if (last && occurredAt < last.occurredAt) throw new Error("Evidência antiga; o pedido já tem atualização mais recente.");
    const number = evidence.storeOrderNumber?.trim() || order.storeOrderNumber;
    if (evidence.kind === "bought" && !number) throw new Error("Informe o número da compra na loja.");
    const updated = await tx.deliveryOrder.update({ where: { id: order.id }, data: {
      status: TARGET[evidence.kind],
      ...(evidence.kind === "bought" ? { storeOrderNumber: number } : {}),
      ...(tracking ? { courierTrackingUrl: tracking } : {}),
      ...(evidence.kind === "out_for_delivery" ? { courierDispatchedAt: occurredAt } : {}),
      ...(evidence.kind === "delivered" ? { deliveredAt: occurredAt } : {}),
      notes: appendOrderNote(order.notes, `🧾 ${evidence.kind} — ${evidence.source}: ${reference.replace(/[\r\n]/g, " ")} (${occurredAt.toISOString()}).`)
    } });
    if (evidence.kind === "bought") {
      await tx.purchaseJob.updateMany({ where: { deliveryOrderId: order.id, status: { in: ["queued", "retrying", "claimed", "needs_review", "awaiting_approval", "approved", "submitting", "outcome_unknown", "manual_queue"] } },
        data: { status: "completed", storeOrderNumber: number, lockedAt: null, nextAttemptAt: null, completedAt: new Date() } });
    }
    if (evidence.kind === "bought") {
      if (evidence.purchaseExecution) {
        await tx.purchaseJob.update({ where: { id: evidence.purchaseExecution.jobId }, data: { status: "completed", actualTotal: evidence.purchaseExecution.actualTotal, storeOrderNumber: number, completedAt: new Date(), lockedAt: null } });
        await tx.purchaseAttempt.updateMany({ where: { purchaseJobId: evidence.purchaseExecution.jobId, idempotencyKey: evidence.purchaseExecution.submissionId }, data: { status: "completed", completedAt: new Date() } });
      }
      const stores = new Set((Array.isArray(order.items) ? order.items : []).flatMap(i => i && typeof i === "object" && !Array.isArray(i) && typeof i.storeKey === "string" ? [i.storeKey] : []));
      if (stores.size === 1 && number && (!Array.isArray(order.fulfillments) || order.fulfillments.length <= 1)) {
        await tx.trackingSubscription.upsert({ where: { deliveryOrderId: order.id }, create: { deliveryOrderId: order.id, storeKey: [...stores][0], storeOrderNumber: number, trackingUrl: updated.courierTrackingUrl }, update: { trackingUrl: updated.courierTrackingUrl } });
      }
    }
    if (evidence.kind === "delivered") await tx.trackingSubscription.updateMany({ where: { deliveryOrderId: order.id }, data: { completedAt: new Date(), lockedAt: null } });
    const shortId = order.id.slice(-6).toUpperCase();
    const text = evidence.kind === "bought" ? copy.orderStatusLine({ shortId, status: updated.status, trackingUrl: updated.courierTrackingUrl })
      : evidence.kind === "out_for_delivery" ? copy.retailerOutForDelivery(updated.courierTrackingUrl) : copy.delivered();
    const event = await tx.deliveryEvent.create({ data: {
      deliveryOrderId: order.id, dedupeKey: key, kind: evidence.kind, source: evidence.source,
      sourceReference: reference, occurredAt, message: evidence.kind === "bought" ? text : `Pedido #${shortId}: ${text}`
    } });
    return { order: updated, eventId: event.id };
  });
  // A transação já terminou: rede não segura o lock do pedido e falha não desfaz a etapa.
  if (result.eventId) await dispatchDeliveryEvent(result.eventId).catch((error) => {
    console.warn("[delivery-event:dispatch]", result.eventId, error instanceof Error ? error.message : "failed");
  });
  return result.order;
}

function messageIdFrom(result: unknown): string | undefined {
  const value = result as { payload?: unknown; messages?: Array<{ id?: string }> } | undefined;
  if (value?.payload) return messageIdFrom(value.payload);
  return value?.messages?.[0]?.id;
}

export async function dispatchDeliveryEvent(id: string) {
  const now = new Date();
  const event = await prisma.deliveryEvent.findUniqueOrThrow({ where: { id }, include: { deliveryOrder: { select: { phone: true, status: true } } } });
  if (event.deliveryStatus !== "pending" || (event.nextAttemptAt && event.nextAttemptAt > now)) return;
  // Não mandar "saiu" atrasado depois de "entregue", nem "comprado" depois de estorno.
  const obsolete = ["canceled", "refunded", "refund_pending"].includes(event.deliveryOrder.status) ||
    (event.kind !== "delivered" && event.deliveryOrder.status === "delivered") ||
    (event.kind === "bought" && event.deliveryOrder.status === "retailer_out_for_delivery");
  if (obsolete) {
    await prisma.deliveryEvent.updateMany({ where: { id, deliveryStatus: "pending" }, data: { deliveryStatus: "suppressed", lastError: "Pedido avançou; aviso antigo suprimido." } });
    return;
  }
  const outside = await outsideServiceWindow(event.deliveryOrder.phone);
  const template = process.env.LIA_TEMPLATE_ORDER_UPDATE?.trim();
  if (outside && !template) {
    await prisma.deliveryEvent.updateMany({ where: { id, deliveryStatus: "pending" }, data: { lastError: "Fora da janela de 24h e sem template aprovado", nextAttemptAt: new Date(Date.now() + 10 * 60_000) } });
    return;
  }
  const claimed = await prisma.deliveryEvent.updateMany({ where: { id, deliveryStatus: "pending" }, data: { deliveryStatus: "sending", attempts: { increment: 1 }, lockedAt: now, nextAttemptAt: null } });
  if (!claimed.count) return;
  try {
    const result = outside
      ? await whatsappAdapter.sendTemplateMessage(event.deliveryOrder.phone, { name: template!, bodyParams: [event.deliveryOrderId.slice(-6).toUpperCase(), event.message] }, id)
      : await whatsappAdapter.sendMessage(event.deliveryOrder.phone, event.message, { noticeId: id });
    const providerMessageId = messageIdFrom(result);
    if (process.env.WHATSAPP_PROVIDER === "meta" && !providerMessageId) throw new Error("Meta não devolveu o id da mensagem");
    await prisma.deliveryEvent.updateMany({ where: { id, deliveryStatus: "sending" }, data: {
      deliveryStatus: "accepted", providerMessageId: providerMessageId ?? null, lockedAt: null, lastError: null
    } });
  } catch (error) {
    // Não repetir um envio cuja aceitação é desconhecida. Recibo por callback ainda
    // pode reconciliar; sem recibo, a pendência fica visível para revisão.
    await prisma.deliveryEvent.updateMany({ where: { id, deliveryStatus: "sending" }, data: {
      deliveryStatus: "unknown", lockedAt: null, lastError: error instanceof Error ? error.message.slice(0, 300) : "Resultado do envio desconhecido"
    } });
  }
}

export async function recordDeliveryReceipt(input: { id?: unknown; status?: unknown; biz_opaque_callback_data?: unknown; timestamp?: unknown; errors?: unknown }) {
  if (typeof input.id !== "string" || !["sent", "delivered", "read", "failed"].includes(String(input.status))) return;
  const callbackId = typeof input.biz_opaque_callback_data === "string" ? input.biz_opaque_callback_data : undefined;
  const event = await prisma.deliveryEvent.findFirst({ where: { OR: [
    { providerMessageId: input.id }, ...(callbackId ? [{ id: callbackId }] : [])
  ] } });
  if (!event) return;
  if (event.providerMessageId && event.providerMessageId !== input.id) return;
  // Recibo atrasado de falha/sent jamais apaga delivered/read.
  const allowed = input.status === "read" ? ["sending", "unknown", "accepted", "delivered", "failed"]
    : input.status === "delivered" ? ["sending", "unknown", "accepted", "failed"] : ["sending", "unknown", "accepted"];
  const timestamp = Number(input.timestamp) * 1000;
  await prisma.deliveryEvent.updateMany({ where: { id: event.id, deliveryStatus: { in: allowed } }, data: {
    providerMessageId: input.id, deliveryStatus: input.status === "sent" ? "accepted" : String(input.status),
    receiptAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date(), lockedAt: null,
    lastError: input.status === "failed" ? JSON.stringify(input.errors ?? "Meta recusou o envio").slice(0, 300) : null
  } });
}

export async function flushDeliveryEvents() {
  await prisma.deliveryEvent.updateMany({ where: { deliveryStatus: "sending", lockedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
    data: { deliveryStatus: "unknown", lastError: "Executor interrompido durante o envio; aguardar recibo ou revisar.", lockedAt: null } });
  const rows = await prisma.deliveryEvent.findMany({ where: { deliveryStatus: "pending", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
    orderBy: { createdAt: "asc" }, take: 20, select: { id: true } });
  // Lotes de quatro limitam pressão na Meta e cabem no orçamento do cron.
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.allSettled(rows.slice(i, i + 4).map((row) => dispatchDeliveryEvent(row.id)));
  }
  return rows.length;
}
