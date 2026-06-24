import { fulfillmentAdapter } from "@/lib/adapters/fulfillment";
import { paymentAdapter } from "@/lib/adapters/payment";
import { prisma } from "@/lib/prisma";
import { approveConversationPayment } from "@/lib/chat-service";

export async function getAdminSnapshot() {
  const [users, conversations, orders, products] = await Promise.all([
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
      include: { user: true, product: true, conversation: true }
    }),
    prisma.product.findMany({ orderBy: [{ category: "asc" }, { price: "asc" }] })
  ]);

  return { users, conversations, orders, products };
}

export async function approveOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  await paymentAdapter.simulatePaymentApproval(orderId);
  await fulfillmentAdapter.createFulfillment(orderId);
  return approveConversationPayment(order.conversationId);
}

export async function advanceOrder(orderId: string) {
  return fulfillmentAdapter.simulateNextStep(orderId);
}
