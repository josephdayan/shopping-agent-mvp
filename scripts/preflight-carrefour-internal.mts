// Creates one auditable, non-customer Carrefour quote and runs only the cart_only preflight.
// It never creates a Mercado Pago charge, sends WhatsApp, or invokes the purchase step.
import { prisma } from "../src/lib/prisma";
import { createPurchaseJobsForOrder, preflightPurchaseJob } from "../src/lib/purchasing/service";

const storeLabel = "Carrefour";
const item = {
  sku: "crf-live-3053",
  name: "Detergente Líquido com Glicerina Cristal Limpol Squeeze 500ml",
  unitPrice: 1.99,
  productUrl: "https://mercado.carrefour.com.br/produto/detergente-liquido-com-glicerina-cristal-limpol-squeeze-500ml-3053"
} as const;
const phone = `+550099${String(Date.now()).slice(-7)}`;

async function main() {
  if (process.env.PURCHASE_AUTOMATION_MODE !== "cart_only") {
    throw new Error("Este script só pode rodar com PURCHASE_AUTOMATION_MODE=cart_only.");
  }

  const user = await prisma.user.create({ data: { phone, name: "TESTE INTERNO — NÃO COBRAR" } });
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      customerName: "TESTE INTERNO — NÃO COBRAR",
      // Deliberately omit CEP/address: the buyer reuses only the already-selected retailer
      // region in the persistent Context and never stores the actual customer address here.
      storeKey: "carrefour",
      storeLabel,
      items: [{ ...item, qty: 1, storeKey: "carrefour", storeLabel }],
      fulfillments: [{ storeKey: "carrefour", storeLabel, deliveryMode: "retailer_delivery" }],
      itemsSubtotal: item.unitPrice,
      courierKey: "retailer_delivery",
      total: 0,
      status: "awaiting_supplier_validation",
      notes: "TESTE INTERNO 2026-07-16: preflight cart_only; sem WhatsApp, cobrança ou compra."
    }
  });
  const [job] = await createPurchaseJobsForOrder(order.id);
  if (!job) throw new Error("O pedido interno não gerou job de compra.");

  const result = await preflightPurchaseJob(job.id);
  console.log(JSON.stringify({
    orderId: order.id,
    jobId: result.id,
    status: result.status,
    errorCode: result.lastErrorCode,
    errorMessage: result.lastErrorMessage,
    actualTotal: result.actualTotal,
    cartHash: result.cartHash ? "present" : null
  }));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
