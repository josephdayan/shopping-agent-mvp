import { prisma } from "@/lib/prisma";

type TacReadiness = {
  enabled: boolean;
  mode: "local_memory" | "conversation_memory";
  credentials: {
    apiKey: boolean;
    apiSecret: boolean;
    conversationConfigurationId: boolean;
    memoryStoreId: boolean;
    phoneNumber: boolean;
    voicePublicDomain: boolean;
  };
};

export const twilioAgentConnectAdapter = {
  readiness(): TacReadiness {
    const memoryStoreId = Boolean(process.env.TWILIO_MEMORY_STORE_ID);
    return {
      enabled: Boolean(process.env.TWILIO_AGENT_CONNECT_ENABLED === "true"),
      mode: memoryStoreId ? "conversation_memory" : "local_memory",
      credentials: {
        apiKey: Boolean(process.env.TWILIO_API_KEY),
        apiSecret: Boolean(process.env.TWILIO_API_SECRET),
        conversationConfigurationId: Boolean(process.env.TWILIO_CONVERSATION_CONFIGURATION_ID),
        memoryStoreId,
        phoneNumber: Boolean(process.env.TWILIO_PHONE_NUMBER),
        voicePublicDomain: Boolean(process.env.TWILIO_VOICE_PUBLIC_DOMAIN)
      }
    };
  },

  async buildLocalMemoryContext(input: { phone?: string; userId?: string }) {
    const user = await prisma.user.findFirst({
      where: input.userId ? { id: input.userId } : { phone: normalizePhone(input.phone ?? "") },
      include: {
        preferences: { orderBy: { updatedAt: "desc" } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { product: true }
        }
      }
    });

    if (!user) return { found: false, memoryContext: "" };

    const preferences = user.preferences.map((preference) =>
      [
        preference.category,
        preference.preferredBrand ? `marca ${preference.preferredBrand}` : null,
        preference.preferredStore ? `loja ${preference.preferredStore}` : null,
        preference.deliverySensitivity ? `entrega ${preference.deliverySensitivity}` : null,
        preference.priceSensitivity ? `preco ${preference.priceSensitivity}` : null
      ]
        .filter(Boolean)
        .join(", ")
    );

    const recentOrders = user.orders.map((order) =>
      `${order.product.category}: ${order.product.brand} em ${order.product.store}, status ${order.status}`
    );

    return {
      found: true,
      profile: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        defaultAddress: user.defaultAddress
      },
      memoryContext: [
        user.defaultAddress ? `Endereco padrao: ${user.defaultAddress}` : null,
        preferences.length ? `Preferencias: ${preferences.join(" | ")}` : null,
        recentOrders.length ? `Pedidos recentes: ${recentOrders.join(" | ")}` : null
      ]
        .filter(Boolean)
        .join("\n")
    };
  }
};

function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}
