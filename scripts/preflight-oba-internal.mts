// Creates one auditable, non-customer Oba quote and runs only the cart_only preflight.
// It never creates a Mercado Pago charge, sends WhatsApp, or invokes the purchase step.
import { prisma } from "../src/lib/prisma";
import { createPurchaseJobsForOrder, preflightPurchaseJob } from "../src/lib/purchasing/service";

const storeLabel = "Oba Hortifruti";
const item = {
  sku: "oba-live-100004793-seller-1",
  name: "Arroz Camil 1 Kg",
  unitPrice: 5.99,
  productUrl: "https://secure.obahortifruti.com.br/arroz-camil-1kg-100004793/p"
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
      // The preflight uses only the public test CEP. No customer address is stored here.
      cep: "01310-100",
      storeKey: "oba",
      storeLabel,
      items: [{ ...item, qty: 1, storeKey: "oba", storeLabel }],
      fulfillments: [{ storeKey: "oba", storeLabel, deliveryMode: "retailer_delivery" }],
      itemsSubtotal: item.unitPrice,
      courierKey: "retailer_delivery",
      total: 0,
      status: "awaiting_supplier_validation",
      notes: "TESTE INTERNO 2026-07-19: preflight Oba em cart_only; sem WhatsApp, cobrança ou compra."
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
