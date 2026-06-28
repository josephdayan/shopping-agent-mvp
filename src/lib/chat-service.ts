import { prisma } from "@/lib/prisma";
import { aiAdapter } from "@/lib/adapters/ai";
import { fulfillmentAdapter } from "@/lib/adapters/fulfillment";
import { messagingAdapter } from "@/lib/adapters/messaging";
import { paymentAdapter } from "@/lib/adapters/payment";
import { productSearchAdapter } from "@/lib/adapters/products";
import type { ConversationContext, ProductFilters, ProductIntent } from "@/lib/types";

const SERVICE_FEE = 2.99;
const DEMO_PHONE = "+5511999990000";
const SEARCH_BATCH_SIZE = 3;

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
    "Oi! Sou a Lia, sua assistente de compras. Me diz o que você quer comprar que eu procuro pra você."
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
  const normalized = normalize(text);
  const step = conversation.currentStep;
  const checkoutAction =
    step === "awaiting_confirmation" &&
    /\b(confirmar pedido|alterar endereco|alterar endereço|alterar pagamento|forma de pagamento|cancelar)\b/.test(normalized);

  if (/\b(ajuda|help|menu|comandos)\b/.test(normalized)) {
    await messagingAdapter.sendMessage(conversationId, whatsappHelpText());
    return getConversation(conversationId);
  }

  if (!checkoutAction && /\b(status|rastreio|pedido)\b/.test(normalized)) {
    await sendLatestOrderStatus(conversationId, conversation.userId);
    return getConversation(conversationId);
  }

  if (/\b(novo|novo pedido|recomecar|reiniciar)\b/.test(normalized)) {
    await prisma.productOption.deleteMany({ where: { conversationId } });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "active", currentStep: "collecting_request", context: null, intent: null }
    });
    await messagingAdapter.sendMessage(conversationId, "Perfeito. Me diga o que você quer comprar agora.");
    return getConversation(conversationId);
  }

  if (/\b(cancelar|cancela|cancel|desistir|desisto|parar|para tudo)\b/.test(normalized)) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "cancelled", currentStep: "cancelled" }
    });
    await messagingAdapter.sendMessage(conversationId, "Sem problema. Cancelei este fluxo por aqui.");
    return getConversation(conversationId);
  }

  if (step === "awaiting_selection") return selectProduct(conversationId, text);
  if (step === "awaiting_address") return captureAddress(conversationId, text);
  if (step === "awaiting_payment_method") return capturePaymentMethod(conversationId, text);
  if (step === "awaiting_confirmation") return confirmOrder(conversationId, text);
  if (step === "awaiting_payment") {
    if (/\b(paguei|pago|pagou|aprovar|aprovado|simular pagamento)\b/.test(normalized)) {
      return approveConversationPayment(conversationId);
    }

    await messagingAdapter.sendMessage(
      conversationId,
      "Ainda estou aguardando o pagamento mockado. Para simular no WhatsApp, responda: paguei"
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
  const metadata = readMessageMetadata(lastAssistantMessage?.metadata);
  return {
    conversationId: conversation.id,
    userId: conversation.userId,
    status: conversation.status,
    currentStep: conversation.currentStep,
    reply: lastAssistantMessage?.text ?? "",
    actions: metadata.checkoutActions ?? [],
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

async function sendLatestOrderStatus(conversationId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { product: true }
  });

  if (!order) {
    await messagingAdapter.sendMessage(conversationId, "Você ainda não tem pedido comigo. Me diga o que quer comprar.");
    return;
  }

  await messagingAdapter.sendMessage(conversationId, formatOrderStatus(order));
}

async function startProductSearch(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  await prisma.productOption.deleteMany({ where: { conversationId } });
  const parsed = await aiAdapter.parseUserIntent(text);

  if (parsed.unsupported) {
    await messagingAdapter.sendMessage(conversationId, aiAdapter.generateAssistantResponse("unsupported"));
    return getConversation(conversationId);
  }

  const intent = {
    ...(parsed.wantsRepeat ? await intentFromLastOrder(conversation.userId) : parsed),
    searchBatchSize: SEARCH_BATCH_SIZE,
    searchOffset: 0
  };
  if (!intent.category) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { currentStep: "collecting_request", intent: JSON.stringify(parsed), context: JSON.stringify({ intent: parsed }) }
    });
    await messagingAdapter.sendMessage(conversationId, "Claro. Qual produto você quer que eu procure?");
    return getConversation(conversationId);
  }

  const options = await productSearchAdapter.searchProducts(intent, conversation.userId);
  if (!options.length) {
    await messagingAdapter.sendMessage(
      conversationId,
      "Não encontrei uma opção boa para essa busca. Pode me passar mais algum detalhe?"
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
      context: JSON.stringify({ intent, rejectedProductIds: [], rejectedProductKeys: [], searchOffset: 0 })
    }
  });
  await messagingAdapter.sendMessage(conversationId, aiAdapter.generateAssistantResponse("options"), { options });
  return getConversation(conversationId);
}

async function selectProduct(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  // Context-aware routing: decide whether this message is a selection, a request for
  // other options, a refinement of the same search, or a brand-new product.
  const turn = await aiAdapter.classifyTurn(text, {
    options: conversation.options.map((option) => ({
      rank: option.rank,
      title: option.product.title,
      brand: option.product.brand,
      price: option.product.price
    })),
    lastQuery: currentSearchQuery(conversation)
  });

  if (turn?.type === "reject") return searchMoreOptions(conversationId);
  if (turn?.type === "refine") return refineCurrentSearch(conversationId, text);
  if (turn?.type === "new_search") return startProductSearch(conversationId, text);

  // Deterministic heuristics backstop the model when it is unavailable or unsure.
  if (turn?.type !== "select") {
    if (isRejectionOrMoreOptions(text)) return searchMoreOptions(conversationId);
    if (looksLikeSearchRefinement(text)) return refineCurrentSearch(conversationId, text);
    if (looksLikeStandaloneProductRequest(text)) return startProductSearch(conversationId, text);
    if (looksLikeNewProductRequest(text)) return startProductSearch(conversationId, text);
  }

  const selectedProductId = selectionFromTurn(turn, conversation.options) ?? aiAdapter.interpretSelection(text, conversation.options);
  if (!selectedProductId) {
    await messagingAdapter.sendMessage(
      conversationId,
      "Não consegui identificar a escolha. Me responda 1, 2 ou 3, ou diga \"me manda outras\" que eu busco mais opções."
    );
    return getConversation(conversationId);
  }

  const product = await productSearchAdapter.getProductById(selectedProductId);
  if (!product || !product.availability) {
    await messagingAdapter.sendMessage(conversationId, "Esse produto ficou indisponível. Vou buscar novas opções.");
    return searchMoreOptions(conversationId);
  }

  const context = readContext(conversation.context);
  context.selectedProductId = product.id;
  context.selectedProductExternalId = product.externalId;
  context.paymentMethod = context.paymentMethod ?? "pix";

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
  await sendCheckoutSummary(conversationId, product.id, context.deliveryAddress, context.paymentMethod);
  return getConversation(conversationId);
}

async function refineCurrentSearch(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const context = readContext(conversation.context);
  const refinement = await aiAdapter.parseUserIntent(text);
  const intent = mergeIntentRefinement(context.intent ?? readIntent(conversation.intent), refinement);

  if (!intent.category && !intent.searchQuery) {
    await messagingAdapter.sendMessage(conversationId, "Me diga qual produto você quer ajustar e eu procuro de novo.");
    return getConversation(conversationId);
  }

  const options = await productSearchAdapter.searchProducts({
    ...intent,
    excludedProductIds: [],
    excludedProductKeys: [],
    searchBatchSize: SEARCH_BATCH_SIZE,
    searchOffset: 0
  }, conversation.userId);

  if (!options.length) {
    await messagingAdapter.sendMessage(conversationId, "Não encontrei uma opção boa com esse filtro. Pode tentar outra marca, preço ou prazo?");
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

  const updatedContext: ConversationContext = {
    ...context,
    intent: { ...intent, searchBatchSize: SEARCH_BATCH_SIZE, searchOffset: 0 },
    rejectedProductIds: [],
    rejectedProductKeys: [],
    searchOffset: 0
  };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      currentStep: "awaiting_selection",
      intent: JSON.stringify(updatedContext.intent),
      context: JSON.stringify(updatedContext)
    }
  });
  await messagingAdapter.sendMessage(conversationId, "Atualizei a busca com esse filtro.", { options });
  return getConversation(conversationId);
}

async function searchMoreOptions(conversationId: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const context = readContext(conversation.context);
  const rejectedProductIds = Array.from(
    new Set([...(context.rejectedProductIds ?? []), ...conversation.options.map((option) => option.productId)])
  );
  const rejectedProductKeys = Array.from(
    new Set([
      ...(context.rejectedProductKeys ?? []),
      ...conversation.options.flatMap((option) => [
        option.product.externalId,
        option.product.productUrl,
        option.product.title
      ])
    ])
  );
  const intent = {
    ...(context.intent ?? {}),
    excludedProductIds: rejectedProductIds,
    excludedProductKeys: rejectedProductKeys,
    searchBatchSize: SEARCH_BATCH_SIZE,
    searchOffset: (context.searchOffset ?? context.intent?.searchOffset ?? 0) + SEARCH_BATCH_SIZE
  };

  if (!intent.category && !intent.searchQuery) {
    await messagingAdapter.sendMessage(conversationId, "Me diga melhor o que você quer, que eu procuro de novo.");
    return getConversation(conversationId);
  }

  const options = await productSearchAdapter.searchProducts(intent, conversation.userId);
  if (!options.length) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { context: JSON.stringify({ ...context, searchOffset: intent.searchOffset, rejectedProductIds, rejectedProductKeys }) }
    });
    await messagingAdapter.sendMessage(
      conversationId,
      "Não achei opções melhores agora. Quer mudar algum detalhe? Ex.: marca, preço ou prazo."
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
      currentStep: "awaiting_selection",
      // Keep the top-level intent column in sync with context.intent so a later
      // refinement never reads a stale search.
      intent: JSON.stringify(intent),
      context: JSON.stringify({
        ...context,
        intent,
        searchOffset: intent.searchOffset,
        rejectedProductIds,
        rejectedProductKeys
      })
    }
  });
  await messagingAdapter.sendMessage(conversationId, "Encontrei outras opções:", { options });
  return getConversation(conversationId);
}

async function captureAddress(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const context = readContext(conversation.context);
  context.deliveryAddress = text.trim();
  if (text.trim().length < 8) {
    await messagingAdapter.sendMessage(conversationId, "Esse endereço parece curto demais. Pode enviar rua, número, bairro e cidade?");
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
  context.paymentMethod = context.paymentMethod ?? "pix";
  await prisma.conversation.update({ where: { id: conversationId }, data: { context: JSON.stringify(context) } });
  await sendCheckoutSummary(conversationId, context.selectedProductId!, context.deliveryAddress, context.paymentMethod);
  return getConversation(conversationId);
}

async function capturePaymentMethod(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const context = readContext(conversation.context);
  const paymentMethod = paymentMethodFromText(text);
  if (!paymentMethod) {
    await messagingAdapter.sendMessage(conversationId, "Qual forma de pagamento você prefere: PIX ou cartão?");
    return getConversation(conversationId);
  }

  context.paymentMethod = paymentMethod;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { currentStep: "awaiting_confirmation", context: JSON.stringify(context) }
  });
  await sendCheckoutSummary(
    conversationId,
    context.selectedProductId!,
    context.deliveryAddress ?? conversation.user.defaultAddress ?? undefined,
    context.paymentMethod
  );
  return getConversation(conversationId);
}

async function confirmOrder(conversationId: string, text: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const normalized = normalize(text);
  const context = readContext(conversation.context);

  if (/^(2|alterar endereco|alterar endereço|endereco|endereço|mudar endereco|mudar endereço)$/.test(normalized)) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { currentStep: "awaiting_address", context: JSON.stringify(context) }
    });
    await messagingAdapter.sendMessage(conversationId, "Claro. Envie o novo endereço com rua, número, bairro e cidade.");
    return getConversation(conversationId);
  }

  if (/^(3|alterar forma de pagamento|alterar pagamento|forma de pagamento|pagamento|mudar pagamento)$/.test(normalized)) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { currentStep: "awaiting_payment_method", context: JSON.stringify(context) }
    });
    await messagingAdapter.sendMessage(conversationId, "Qual forma de pagamento você prefere: PIX ou cartão?");
    return getConversation(conversationId);
  }

  if (!/(^1$|sim|confirma|confirmo|confirmar pedido|pode|ok|fechar|pix|cartao|cartão|link)/.test(normalized)) {
    await messagingAdapter.sendMessage(conversationId, "Pedido não confirmado. Posso alterar endereço, forma de pagamento ou cancelar.");
    return getConversation(conversationId);
  }

  const product = await productSearchAdapter.getProductById(context.selectedProductId!);
  if (!product) throw new Error("Product not found");
  const paymentMethod = paymentMethodFromText(text) ?? context.paymentMethod ?? "pix";
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
    `Pagamento ${paymentMethod.toUpperCase()} gerado: ${paidOrder.paymentLink}\n\nNo modo demo da Lia, responda "paguei" aqui no WhatsApp para simular a aprovação.`,
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
    `Pagamento aprovado. Pedido ${fulfilledOrder.id.slice(-6).toUpperCase()} em processamento.\nRastreio: ${fulfilledOrder.trackingCode}\n\nPara acompanhar, responda: status`
  );
  return getConversation(conversationId);
}

async function sendCheckoutSummary(
  conversationId: string,
  productId: string,
  address?: string,
  paymentMethod: ConversationContext["paymentMethod"] = "pix"
) {
  const product = await productSearchAdapter.getProductById(productId);
  if (!product) throw new Error("Product not found");
  const total = product.price + product.shippingPrice + SERVICE_FEE;
  await messagingAdapter.sendMessage(
    conversationId,
    [
      "*Resumo do pedido*",
      "",
      `🛒 *Nome do produto*: ${product.title}`,
      `💰 *Preço*: ${formatCurrency(product.price)}`,
      `🚚 *Frete*: ${formatCurrency(product.shippingPrice)}`,
      `🧾 *Total*: ${formatCurrency(total)}`,
      `📍 *Endereço*: ${address ?? "a confirmar"}`,
      `💳 *Forma de Pagamento*: ${paymentMethodLabel(paymentMethod)}`,
      "",
      "Confirmar Pedido",
      "Alterar Endereço",
      "Alterar Forma de Pagamento",
      "Cancelar"
    ].join("\n"),
    {
      checkout: { productId, total, address, paymentMethod },
      checkoutActions: [
        { id: "confirmar_pedido", title: "Confirmar Pedido" },
        { id: "alterar_endereco", title: "Alterar Endereço" },
        { id: "alterar_pagamento", title: "Alterar Forma de Pagamento" },
        { id: "cancelar", title: "Cancelar" }
      ]
    }
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function paymentMethodFromText(text: string): ConversationContext["paymentMethod"] | null {
  const normalized = normalize(text);
  if (/\b(cartao|cartão|credito|crédito|debito|débito)\b/.test(normalized)) return "card";
  if (/\b(link)\b/.test(normalized)) return "link";
  if (/\b(pix)\b/.test(normalized)) return "pix";
  return null;
}

function paymentMethodLabel(method?: ConversationContext["paymentMethod"]) {
  if (method === "card") return "Cartão";
  if (method === "link") return "Link";
  return "PIX";
}

function readIntent(value: unknown): ProductIntent {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ProductIntent;
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  return value as ProductIntent;
}

function mergeIntentRefinement(base: ProductIntent, refinement: ProductIntent): ProductIntent {
  const hasNewCategory = Boolean(refinement.category);
  const productFilters = mergeProductFilters(base.productFilters, refinement.productFilters);
  const merged: ProductIntent = {
    ...base,
    urgency: refinement.urgency ?? base.urgency,
    priceSensitivity: refinement.priceSensitivity ?? base.priceSensitivity,
    preferredBrand: refinement.preferredBrand ?? base.preferredBrand,
    restrictions: Array.from(new Set([...(base.restrictions ?? []), ...(refinement.restrictions ?? [])])),
    productFilters: Object.keys(productFilters).length ? productFilters : undefined,
    category: hasNewCategory ? refinement.category : base.category,
    searchQuery: hasNewCategory ? refinement.searchQuery ?? base.searchQuery : base.searchQuery,
    ambiguous: false,
    unsupported: refinement.unsupported
  };

  if (merged.preferredBrand && merged.searchQuery) {
    const normalizedBrand = normalize(merged.preferredBrand);
    if (!normalize(merged.searchQuery).includes(normalizedBrand)) {
      merged.searchQuery = `${merged.preferredBrand} ${merged.searchQuery}`;
    }
  }

  if (merged.productFilters?.petSize && merged.category?.startsWith("racao") && merged.searchQuery) {
    const sizeText = merged.productFilters.petSize === "small" ? "porte pequeno" : merged.productFilters.petSize === "large" ? "porte grande" : "porte médio";
    if (!normalize(merged.searchQuery).includes(normalize(sizeText))) {
      merged.searchQuery = `${merged.searchQuery} ${sizeText}`;
    }
  }

  return merged;
}

function mergeProductFilters(base?: ProductFilters, refinement?: ProductFilters): ProductFilters {
  const merged: ProductFilters = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(refinement ?? {}) as Array<[keyof ProductFilters, ProductFilters[keyof ProductFilters]]>) {
    if (value === undefined || value === null || value === "") continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
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

function readMessageMetadata(value: unknown): { checkoutActions?: Array<{ id: string; title: string }> } {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as { checkoutActions?: Array<{ id: string; title: string }> };
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  return value as { checkoutActions?: Array<{ id: string; title: string }> };
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

function whatsappHelpText() {
  return [
    "Comandos:",
    "- comprar: quero escova de dente para hoje",
    "- escolher: 1, 2 ou 3",
    "- pagar no demo: paguei",
    "- acompanhar: status",
    "- novo pedido: novo",
    "- cancelar: cancelar"
  ].join("\n");
}

function formatOrderStatus(order: Awaited<ReturnType<typeof prisma.order.findFirst>> & { product: NonNullable<Awaited<ReturnType<typeof prisma.product.findFirst>>> }) {
  return [
    `Pedido ${order.id.slice(-6).toUpperCase()}`,
    `${order.product.title}`,
    `Pagamento: ${order.paymentStatus}`,
    `Entrega: ${order.fulfillmentStatus}`,
    `Canal: ${sourceLabel(order.source)} / ${fulfillmentLabel(order.fulfillmentMode)}`,
    order.trackingCode ? `Rastreio: ${order.trackingCode}` : null,
    `Total: R$ ${order.total.toFixed(2)}`
  ]
    .filter(Boolean)
    .join("\n");
}

function looksLikeNewProductRequest(text: string) {
  const normalized = normalize(text);
  if (/\b\d\b|primeir|segund|terceir|mais barata|mais rapida|melhor/.test(normalized)) return false;
  if (/\b(quero|queria|preciso|necessito|procuro|busca|buscar|compra|comprar)\b/.test(normalized)) return true;
  return (
    /\b(camisa|camiseta|blusa|livro|escova|pasta|shampoo|desodorante|carregador|pilha|agua|chocolate|lenco|wipes|baby wipes|toalha umedecida|sapato|sapatos|tenis|calcado|racao|ração|dog food|cat food|violao|violão|guitarra|cadeira|mesa|mochila|cinto)\b/.test(
      normalized
    )
  );
}

function looksLikeStandaloneProductRequest(text: string) {
  const normalized = normalize(text);
  if (!/\b(quero|queria|preciso|necessito|procuro|busca|buscar|compra|comprar)\b/.test(normalized)) {
    return hasExplicitProductTerm(normalized);
  }

  if (hasExplicitProductTerm(normalized)) return true;

  const remainder = normalized
    .replace(/\b(quero|queria|preciso|necessito|procuro|busca|buscar|compra|comprar|muito|um|uma|uns|umas|de|do|da|dos|das|para|pra|por favor)\b/g, " ")
    .replace(/\b(mais barato|mais barata|menor preco|menor preço|mais em conta|barato|barata|mais rapido|mais rapida|frete gratis|frete grátis|sem frete|entrega hoje|entrega amanha|entrega amanhã|marca|porte pequeno|pequeno|pequena|menor|menores|porte grande|grande|porte medio|porte médio|filhote|adulto|senior)\b/g, " ")
    .replace(/\b(huggies|pampers|johnson|colgate|royal canin|gran plus|premier|pedigree|golden|special dog|dog chow|whiskas|special cat)\b/g, " ")
    .trim();

  return hasExplicitProductTerm(remainder);
}

function hasExplicitProductTerm(normalized: string) {
  return /\b(camisa|camiseta|blusa|livro|escova|pasta|shampoo|desodorante|carregador|pilha|agua|chocolate|lenco|wipes|baby wipes|toalha umedecida|sapato|sapatos|tenis|calcado|racao|ração|dog food|cat food|violao|violão|guitarra|cadeira|mesa|mochila|cinto)\b/.test(normalized);
}

function looksLikeSearchRefinement(text: string) {
  const normalized = normalize(text);
  if (/^(1|2|3)\b/.test(normalized)) return false;
  return (
    /\b(mais barato|mais barata|menor preco|menor preço|mais em conta|barato|barata|menos de|abaixo de|ate|até|maximo|máximo|mais rapido|mais rapida|mais rápido|mais rápida|chega hoje|chegue hoje|chegar hoje|pra hoje|frete gratis|frete grátis|sem frete|entrega hoje|entrega amanha|entrega amanhã|marca|huggies|pampers|johnson|colgate|royal canin|gran plus|premier|pedigree|golden|special dog|dog chow|porte pequeno|pequeno|pequena|menor|menores|porte grande|grande|porte medio|porte médio|filhote|adulto|senior|preto|preta|branco|branca|azul|vermelho|vermelha|verde|rosa|tamanho|tam)\b/.test(
      normalized
    )
  );
}

function currentSearchQuery(conversation: NonNullable<Awaited<ReturnType<typeof getConversation>>>) {
  const context = readContext(conversation.context);
  return context.intent?.searchQuery ?? readIntent(conversation.intent).searchQuery ?? undefined;
}

function selectionFromTurn(
  turn: Awaited<ReturnType<typeof aiAdapter.classifyTurn>>,
  options: Array<{ productId: string; product: { price: number; deliveryHours: number } }>
) {
  if (!turn || turn.type !== "select" || !turn.selection) return undefined;
  const { ordinal, hint } = turn.selection;
  if (ordinal && options[ordinal - 1]) return options[ordinal - 1].productId;
  if (hint === "cheapest") return [...options].sort((a, b) => a.product.price - b.product.price)[0]?.productId;
  if (hint === "fastest") return [...options].sort((a, b) => a.product.deliveryHours - b.product.deliveryHours)[0]?.productId;
  return undefined;
}

function isRejectionOrMoreOptions(text: string) {
  const normalized = normalize(text);
  return (
    /\b(outr|outra|outras|mais opc|mais alternativa|nova opc|novas opc|trocar opc|manda mais|me manda mais|ver mais)\b/.test(normalized) ||
    /\b(nao gostei|nao gostei de nenhuma|nao curti|nenhuma|nenhuma delas|nenhum deles|n gostei|n curti|ruim|horrivel|nao quero essas|nao quero esses)\b/.test(normalized)
  );
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
