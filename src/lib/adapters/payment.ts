import { prisma } from "@/lib/prisma";

export const paymentAdapter = {
  async createPayment(orderId: string, method: "pix" | "card" | "link" = "pix") {
    const paymentLink = `https://pagamento.mock/checkout/${orderId}?method=${method}`;
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentLink,
        paymentStatus: "awaiting_payment",
        status: "pending_payment"
      }
    });
  },

  checkPaymentStatus(orderId: string) {
    return prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } });
  },

  async simulatePaymentApproval(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "approved",
        status: "paid",
        fulfillmentStatus: "processing"
      }
    });
  },

  async simulatePaymentDecline(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "declined",
        status: "failed"
      }
    });
  }
};
