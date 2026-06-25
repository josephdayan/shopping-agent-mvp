import { prisma } from "@/lib/prisma";
import { aiAdapter } from "@/lib/adapters/ai";
import { fulfillmentAdapter } from "@/lib/adapters/fulfillment";
import { messagingAdapter } from "@/lib/adapters/messaging";
import { paymentAdapter } from "@/lib/adapters/payment";
import { productSearchAdapter } from "@/lib/adapters/products";
import type { ConversationContext, ProductIntent } from "@/lib/types";

const SERVICE_FEE = 2.99;
const DEMO_PHONE = "+5511999990000";

type UserInput = {
  phone?: string;
  name?: string;
  email?: string;
  defaultAddress?: string;
};

export async function getOrCreateUser(input: UserInput = {}) {
  const phone = normalizePhone(input.phone ?? DEMO_PHONE);
  return prisma.user.upsert({
    where: { phone },
    update: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.defaultAddress ? { defaultAddress: input.defaultAddress } : {})
    },
    create: {
      name: input.name ?? "Cliente WhatsApp",
      phone,
      email: input.email,
      defaultAddress: input.defaultAddress
    }
  });
}

export async function getOrCreateDemoUser() {
  return getOrCreateUser({
    phone: DEMO_PHONE,
    name: "Cliente Demo",
    email: "cliente@demo.local",
    defaultAddress: "Rua das Flores, 123 - Sao Paulo, SP"
  });
}

export async function createConversation(input: UserInput = {}) {
  const user = Object.keys(input).length ? await getOrCreateUser(input) : await getOrCreateDemoUser();
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      currentStep: "collecting_request",
      status: "active"
    }
  });

  await messagingAdapter.sendMessage(
    conversation.id,
    "Oi. Sou seu agente de compras. Me diga o que voce quer comprar hoje."
  );

  return getConversation(conversation.id);
}

export async function getOrCreateActiveConversation(input: UserInput = {}) {
  const user = Object.keys(input).length ? await getOrCreateUser(input) : await getOrCreateDemoUser();
  const activeConversation = await prisma.conversation.findFirst({
    where: {
      userId: user.id,
      status: { in: ["active", "order_created"] },
      currentStep: { notIn: ["cancelled"] }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (activeConversation && activeConversation.currentStep !== "order_created") {
    return getConversation(activeConversation.id);
  }

  return createConversation({
    phone: user.phone,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    defaultAddress: user.defaultAddress ?? undefined
  });
}

export async function getConversation(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      user: true,
      messages: { orderBy: { createdAt: "asc" } },
      options: {
        orderBy: { rank: "asc" },
        include: { product: true }
      },
      orders: {
        orderBy: { createdAt: "desc" },
        include: { product: true }
      }
    }
  });
}

export async function handleUserMessage(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  await messagingAdapter.receiveMessage(conversationId, text);

  if (/\b(cancelar|cancela|cancel|desistir|desisto|parar|para tudo)\b/.test(normalize(text))) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "cancelled", currentStep: "cancelled" }
    });
    await messagingAdapter.sendMessage(conversationId, "Sem problema. Cancelei este fluxo por aqui.");
    return getConversation(conversationId);
  }

  const step = conversation.currentStep;
  if (step === "awaiting_selection") return selectProduct(conversationId, text);
  if (step === "awaiting_address") return captureAddress(conversationId, text);
  if (step === "awaiting_confirmation") return confirmOrder(conversationId, text);
  if (step === "awaiting_payment") {
    await messagingAdapter.sendMessage(
      conversationId,
      "O pagamento ainda esta aguardando aprovacao. No MVP, use o botao Simular pagamento aprovado."
    );
    return getConversation(conversationId);
  }

  return startProductSearch(conversationId, text);
}

export async function handleInboundMessage(input: UserInput & { text: string }) {
  const conversation = await getOrCreateActiveConversation(input);
  if (!conversation) throw new Error("Conversation not found");
  return handleUserMessage(conversation.id, input.text);
}

export function toChannelResponse(conversation: Awaited<ReturnType<typeof getConversation>>) {
  if (!conversation) throw new Error("Conversation not found");
  const lastAssistantMessage = [...conversation.messages].reverse().find((message) => message.sender === "assistant");
  return {
    conversationId: conversation.id,
    userId: conversation.userId,
    status: conversation.status,
    currentStep: conversation.currentStep,
    reply: lastAssistantMessage?.text ?? "",
    products: conversation.currentStep === "awaiting_selection"
      ? conversation.options.map((option) => ({
          rank: option.rank,
          reason: option.reason,
          product: option.product
        }))
      : [],
    order: conversation.orders[0] ?? null
  };
}

async function startProductSearch(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const parsed = await aiAdapter.parseUserIntent(text);

  if (parsed.unsupported) {
    await messagingAdapter.sendMessage(conversationId, aiAdapter.generateAssistantResponse("unsupported"));
    return getConversation(conversationId);
  }

  const intent = parsed.wantsRepeat ? await intentFromLastOrder(conversation.userId) : parsed;
  if (!intent.category) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { currentStep: "collecting_request", intent: JSON.stringify(parsed), context: JSON.stringify({ intent: parsed }) }
    });
    await messagingAdapter.sendMessage(conversationId, "Claro. Qual produto voce quer que eu procure?");
    return getConversation(conversationId);
  }

  const options = await productSearchAdapter.searchProducts(intent, conversation.userId);
  if (!options.length) {
    await messagingAdapter.sendMessage(
      conversationId,
      "Nao encontrei produto disponivel para essa busca. Pode tentar outra marca ou categoria?"
    );
    return getConversation(conversationId);
  }

  await prisma.productOption.deleteMany({ where: { conversationId } });
  await prisma.productOption.createMany({
    data: options.map((option) => ({
      conversationId,
      productId: option.id,
      rank: option.rank,
      reason: option.reason
    }))
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      intent: JSON.stringify(intent),
      currentStep: "awaiting_selection",
      context: JSON.stringify({ intent })
    }
  });
  await messagingAdapter.sendMessage(conversationId, aiAdapter.generateAssistantResponse("options"), { options });
  return getConversation(conversationId);
}

async function selectProduct(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  if (looksLikeNewProductRequest(text)) return startProductSearch(conversationId, text);
  if (/outr|mais opc/.test(normalize(text))) return startProductSearch(conversationId, stringifyIntent(conversation.context));

  const selectedProductId = aiAdapter.interpretSelection(text, conversation.options);
  if (!selectedProductId) {
    await messagingAdapter.sendMessage(conversationId, "Nao consegui identificar a escolha. Pode responder 1, 2, 3 ou o nome da marca?");
    return getConversation(conversationId);
  }

  const product = await productSearchAdapter.getProductById(selectedProductId);
  if (!product || !product.availability) {
    await messagingAdapter.sendMessage(conversationId, "Esse produto ficou indisponivel. Vou buscar novas opcoes.");
    return startProductSearch(conversationId, stringifyIntent(conversation.context));
  }

  const context = readContext(conversation.context);
  context.selectedProductId = product.id;
  context.selectedProductExternalId = product.externalId;

  const hasAddress = Boolean(conversation.user.defaultAddress);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      currentStep: hasAddress ? "awaiting_confirmation" : "awaiting_address",
      context: JSON.stringify(context)
    }
  });

  if (!hasAddress) {
    await messagingAdapter.sendMessage(conversationId, "Qual endereco de entrega devo usar?");
    return getConversation(conversationId);
  }

  context.deliveryAddress = conversation.user.defaultAddress ?? undefined;
  await prisma.conversation.update({ where: { id: conversationId }, data: { context: JSON.stringify(context) } });
  await sendCheckoutSummary(conversationId, product.id, context.deliveryAddress);
  return getConversation(conversationId);
}

async function captureAddress(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const context = readContext(conversation.context);
  context.deliveryAddress = text.trim();
  if (text.trim().length < 8) {
    await messagingAdapter.sendMessage(conversationId, "Esse endereco parece curto demais. Pode enviar rua, numero, bairro e cidade?");
    return getConversation(conversationId);
  }

  await prisma.user.update({
    where: { id: conversation.userId },
    data: { defaultAddress: context.deliveryAddress }
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { currentStep: "awaiting_confirmation", context: JSON.stringify(context) }
  });
  await sendCheckoutSummary(conversationId, context.selectedProductId!, context.deliveryAddress);
  return getConversation(conversationId);
}

async function confirmOrder(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const normalized = normalize(text);
  if (!/(sim|confirma|confirmo|pode|ok|fechar|pix|cartao|cartão|link)/.test(normalized)) {
    await messagingAdapter.sendMessage(conversationId, "Pedido nao confirmado. Posso alterar produto, endereco ou cancelar.");
    return getConversation(conversationId);
  }

  const context = readContext(conversation.context);
  const product = await productSearchAdapter.getProductById(context.selectedProductId!);
  if (!product) throw new Error("Product not found");
  const paymentMethod = normalized.includes("cartao") || normalized.includes("cartão") ? "card" : normalized.includes("link") ? "link" : "pix";
  const subtotal = product.price;
  const shipping = product.shippingPrice;
  const total = subtotal + shipping + SERVICE_FEE;

  const order = await prisma.order.create({
    data: {
      userId: conversation.userId,
      conversationId,
      productId: product.id,
      subtotal,
      shipping,
      serviceFee: SERVICE_FEE,
      total,
      deliveryAddress: context.deliveryAddress ?? conversation.user.defaultAddress ?? "",
      paymentStatus: "awaiting_payment",
      status: "pending_payment",
      fulfillmentStatus: "not_started",
      fulfillmentMode: product.fulfillmentMode,
      source: product.source
    }
  });
  const paidOrder = await paymentAdapter.createPayment(order.id, paymentMethod);
  context.paymentMethod = paymentMethod;
  context.orderId = order.id;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      currentStep: "awaiting_payment",
      context: JSON.stringify(context)
    }
  });

  await messagingAdapter.sendMessage(
    conversationId,
    `Pagamento ${paymentMethod.toUpperCase()} gerado: ${paidOrder.paymentLink}. No MVP, aprove pelo admin ou pelo botao do chat.`,
    { orderId: order.id }
  );

  return getConversation(conversationId);
}

export async function approveConversationPayment(conversationId: string) {
  const conversation = await getConversation(conversationId);
  const order = conversation?.orders[0];
  if (!conversation || !order) throw new Error("Order not found");

  await paymentAdapter.simulatePaymentApproval(order.id);
  const fulfilledOrder = await fulfillmentAdapter.createFulfillment(order.id);
  await savePreference(order.userId, order.productId, order.deliveryAddress);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { currentStep: "order_created", status: "order_created" }
  });
  await messagingAdapter.sendMessage(
    conversationId,
    `Pagamento aprovado. Pedido ${fulfilledOrder.id.slice(-6).toUpperCase()} em processamento. Rastreio: ${fulfilledOrder.trackingCode}.`
  );
  return getConversation(conversationId);
}

async function sendCheckoutSummary(conversationId: string, productId: string, address?: string) {
  const product = await productSearchAdapter.getProductById(productId);
  if (!product) throw new Error("Product not found");
  const total = product.price + product.shippingPrice + SERVICE_FEE;
  await messagingAdapter.sendMessage(
    conversationId,
    [
      aiAdapter.generateAssistantResponse("checkout"),
      `${product.title}`,
      `Fonte: ${sourceLabel(product.source)} | Fulfillment: ${fulfillmentLabel(product.fulfillmentMode)}`,
      `Produto: R$ ${product.price.toFixed(2)} | Frete: R$ ${product.shippingPrice.toFixed(2)} | Taxa: R$ ${SERVICE_FEE.toFixed(2)}`,
      `Total: R$ ${total.toFixed(2)}`,
      `Entrega: ${product.deliveryEstimate}`,
      `Endereco: ${address ?? "a confirmar"}`,
      "Forma padrao: PIX mockado"
    ].join("\n"),
    { checkout: { productId, total, address } }
  );
}

async function intentFromLastOrder(userId: string): Promise<ProductIntent> {
  const order = await prisma.order.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { product: true }
  });
  if (!order) return { ambiguous: true };
  return {
    category: order.product.category,
    preferredBrand: order.product.brand,
    priceSensitivity: "balanced",
    urgency: order.product.deliveryHours <= 4 ? "fast" : "normal",
    wantsRepeat: true
  };
}

async function savePreference(userId: string, productId: string, deliveryAddress: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return;
  await prisma.user.update({ where: { id: userId }, data: { defaultAddress: deliveryAddress } });
  await prisma.preference.upsert({
    where: { userId_category: { userId, category: product.category } },
    update: {
      preferredBrand: product.brand,
      preferredStore: product.store,
      priceSensitivity: product.price < 15 ? "cheap" : "balanced",
      deliverySensitivity: product.deliveryHours <= 4 ? "fast" : "normal",
      notes: `Ultima compra: ${product.title} via ${product.store}`
    },
    create: {
      userId,
      category: product.category,
      preferredBrand: product.brand,
      preferredStore: product.store,
      priceSensitivity: product.price < 15 ? "cheap" : "balanced",
      deliverySensitivity: product.deliveryHours <= 4 ? "fast" : "normal",
      notes: `Ultima compra: ${product.title} via ${product.store}`
    }
  });
}

function readContext(value: unknown): ConversationContext {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ConversationContext;
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  return value as ConversationContext;
}

function stringifyIntent(value: unknown) {
  const context = readContext(value);
  return [
    context.intent?.category,
    context.intent?.preferredBrand,
    context.intent?.priceSensitivity,
    context.intent?.urgency === "fast" ? "entrega hoje" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : DEMO_PHONE;
}

function looksLikeNewProductRequest(text: string) {
  const normalized = normalize(text);
  if (/\b\d\b|primeir|segund|terceir|mais barata|mais rapida|melhor/.test(normalized)) return false;
  return /\b(quero|preciso|procura|procurar|busca|buscar|compra|comprar)\b/.test(normalized);
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    mercado_livre: "Mercado Livre",
    rappi: "Rappi",
    farmacia: "Farmacia",
    loja_local: "Loja local"
  };
  return labels[source] ?? source;
}

function fulfillmentLabel(mode: string) {
  const labels: Record<string, string> = {
    marketplace_native: "entrega nativa",
    local_courier: "courier local",
    manual_operator: "operador manual"
  };
  return labels[mode] ?? mode;
}
