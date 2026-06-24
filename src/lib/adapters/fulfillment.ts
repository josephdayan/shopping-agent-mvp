import { prisma } from "@/lib/prisma";

const FLOW = ["processing", "purchased", "shipped", "delivered"] as const;

export const fulfillmentAdapter = {
  async createFulfillment(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: "processing",
        status: "processing",
        trackingCode: `MOCK-${orderId.slice(-6).toUpperCase()}`
      }
    });
  },

  getFulfillmentStatus(orderId: string) {
    return prisma.order.findUnique({ where: { id: orderId }, select: { fulfillmentStatus: true, status: true, trackingCode: true } });
  },

  async simulateNextStep(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");
    const current = order.fulfillmentStatus === "not_started" ? "processing" : order.fulfillmentStatus;
    const index = FLOW.indexOf(current as (typeof FLOW)[number]);
    const next = FLOW[Math.min(index + 1, FLOW.length - 1)] ?? "processing";
    return prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: next,
        status: next,
        trackingCode: order.trackingCode ?? `MOCK-${order.id.slice(-6).toUpperCase()}`
      }
    });
  }
};
