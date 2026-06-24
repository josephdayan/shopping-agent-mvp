import { prisma } from "@/lib/prisma";

export const messagingAdapter = {
  async sendMessage(conversationId: string, text: string, metadata?: unknown) {
    return prisma.message.create({
      data: {
        conversationId,
        sender: "assistant",
        text,
        metadata: metadata === undefined ? undefined : JSON.stringify(metadata)
      }
    });
  },

  async receiveMessage(conversationId: string, text: string, metadata?: unknown) {
    return prisma.message.create({
      data: {
        conversationId,
        sender: "user",
        text,
        metadata: metadata === undefined ? undefined : JSON.stringify(metadata)
      }
    });
  }
};
