import { prisma } from "@/lib/prisma";

const FLOWS: Record<string, string[]> = {
  marketplace_native: ["processing", "marketplace_order_created", "shipped", "delivered"],
  local_courier: ["processing", "courier_requested", "courier_picked_up", "delivered"],
  manual_operator: ["manual_task_created", "operator_purchasing", "purchased", "delivered"]
};

export const fulfillmentAdapter = {
  async createFulfillment(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
    if (!order) throw new Error("Order not found");

    const fulfillmentMode = order.product.fulfillmentMode;
    const firstStatus = FLOWS[fulfillmentMode]?.[0] ?? "processing";
    const notes = fulfillmentNotes(fulfillmentMode, order.product.source);

    if (fulfillmentMode === "manual_operator" || order.product.automationLevel === "manual") {
      await prisma.opsTask.create({
        data: {
          orderId,
          type: "manual_purchase",
          title: `Comprar manualmente: ${order.product.title}`,
          notes: `Fonte ${order.product.store}. Confirmar disponibilidade, comprar e atualizar status.`
        }
      });
    }

    if (fulfillmentMode === "local_courier") {
      await prisma.opsTask.create({
        data: {
          orderId,
          type: "courier",
          title: `Acionar courier para ${order.product.store}`,
          notes: `Retirar ${order.product.title} e entregar em ${order.deliveryAddress}.`
        }
      });
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentMode,
        source: order.product.source,
        fulfillmentStatus: firstStatus,
        fulfillmentNotes: notes,
        status: firstStatus === "manual_task_created" ? "processing" : firstStatus,
        trackingCode: `MOCK-${order.product.source.toUpperCase().slice(0, 3)}-${orderId.slice(-6).toUpperCase()}`
      }
    });
  },

  getFulfillmentStatus(orderId: string) {
    return prisma.order.findUnique({ where: { id: orderId }, select: { fulfillmentStatus: true, status: true, trackingCode: true } });
  },

  async simulateNextStep(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");
    const flow = FLOWS[order.fulfillmentMode] ?? FLOWS.marketplace_native;
    const current = order.fulfillmentStatus === "not_started" ? flow[0] : order.fulfillmentStatus;
    const index = flow.indexOf(current);
    const next = flow[Math.min(Math.max(index, 0) + 1, flow.length - 1)] ?? "processing";
    return prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: next,
        status: next,
        trackingCode: order.trackingCode ?? `MOCK-${order.id.slice(-6).toUpperCase()}`
      }
    });
  },

  async markPurchased(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: "purchased", status: "purchased" }
    });
  },

  async markDelivered(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: "delivered", status: "delivered" }
    });
  },

  async requestSubstitution(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
    if (!order) throw new Error("Order not found");
    await prisma.opsTask.create({
      data: {
        orderId,
        type: "substitution",
        title: `Pedir substituicao para ${order.product.title}`,
        notes: "Produto indisponivel ou operador solicitou alternativa equivalente."
      }
    });
    return prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: "substitution_requested", status: "processing" }
    });
  },

  async cancelAndRefund(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: "cancelled",
        fulfillmentStatus: "cancelled",
        paymentStatus: "refunded",
        refundStatus: "mock_refunded"
      }
    });
  }
};

function fulfillmentNotes(mode: string, source: string) {
  if (mode === "marketplace_native") return `Usar entrega nativa mockada de ${source}.`;
  if (mode === "local_courier") return "Criar entrega local com courier mockado.";
  return "Criar tarefa manual para operador comprar/acompanhar.";
}
