import { fulfillmentAdapter } from "@/lib/adapters/fulfillment";
import { paymentAdapter } from "@/lib/adapters/payment";
import { prisma } from "@/lib/prisma";
import { approveConversationPayment } from "@/lib/chat-service";

export async function getAdminSnapshot() {
  const [users, conversations, orders, products, opsTasks] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, include: { preferences: true } }),
    prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        user: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true, product: true, conversation: true, opsTasks: true }
    }),
    prisma.product.findMany({ orderBy: [{ category: "asc" }, { source: "asc" }, { price: "asc" }] }),
    prisma.opsTask.findMany({ orderBy: { createdAt: "desc" }, include: { order: { include: { product: true, user: true } } } })
  ]);

  return { users, conversations, orders, products, opsTasks };
}

export async function approveOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  return approveConversationPayment(order.conversationId);
}

export async function advanceOrder(orderId: string) {
  return fulfillmentAdapter.simulateNextStep(orderId);
}

export async function markOrderPurchased(orderId: string) {
  return fulfillmentAdapter.markPurchased(orderId);
}

export async function markOrderDelivered(orderId: string) {
  return fulfillmentAdapter.markDelivered(orderId);
}

export async function requestOrderSubstitution(orderId: string) {
  return fulfillmentAdapter.requestSubstitution(orderId);
}

export async function cancelAndRefundOrder(orderId: string) {
  return fulfillmentAdapter.cancelAndRefund(orderId);
}

export async function markProductUnavailable(productId: string) {
  return prisma.product.update({ where: { id: productId }, data: { availability: false } });
}
