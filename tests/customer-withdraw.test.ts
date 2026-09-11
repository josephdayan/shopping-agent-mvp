import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { recordPayment } from "../src/lib/payments/ledger";
import { customerWithdrawRefund } from "../src/lib/ops-lifecycle";
import { manualQueueJobForPaidOrder } from "../src/lib/purchase-worker";
import { createOpsAction, opsActionButtonId } from "../src/lib/ops-actions";
import { handleOperatorInbound } from "../src/lib/ops-actions-inbound";
import { cancelHowTo, cancelRequestedPaid, withdrawnRefunded } from "../src/lib/lia-copy";

process.env.OPS_TOKEN ??= "unit-ops-token";
process.env.LIA_OPERATOR_PHONE = "+5511999990000";
const users: string[] = [];
let sequence = 0;
async function paidOrder(status = "paid") {
  const user = await prisma.user.create({ data: { phone: `+55090966${process.pid}${++sequence}`, name: "Cliente" } });
  users.push(user.id);
  const convo = await prisma.conversation.create({ data: { userId: user.id, status: "active", currentStep: "collecting", context: "{}" } });
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id, conversationId: convo.id, phone: user.phone, status, storeKey: "kalunga", storeLabel: "Kalunga",
      items: [{ sku: "kalunga-1", name: "Caneta", qty: 1, unitPrice: 20, lineTotal: 20, storeKey: "kalunga", storeLabel: "Kalunga", productUrl: "https://www.kalunga.com.br/prod/caneta" }],
      itemsSubtotal: 20, deliveryFee: 8, serviceFee: 2, total: 30, cep: "01310-100",
      deliveryAddress: "Rua Teste, 10, Centro, São Paulo - SP", paidAt: new Date(Date.now() - 60_000), courierKey: "retailer_delivery",
    },
  });
  await recordPayment({ deliveryOrderId: order.id, provider: "mock", providerPaymentId: `withdraw-${process.pid}-${sequence}`, amountCents: 3000, status: "approved", method: "pix" });
  return order;
}
after(async () => {
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.conversation.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

test("desistência antes da compra: estorno imediato, job manual cancelado, pedido refunded", async () => {
  const order = await paidOrder();
  const job = await manualQueueJobForPaidOrder(order.id);
  const outcome = await customerWithdrawRefund(order.id);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.amount, 30);
  const after1 = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(after1.status, "refunded");
  assert.match(after1.notes ?? "", /Cliente desistiu antes da compra/);
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job!.id } })).status, "canceled");
  assert.equal((await prisma.payment.findFirstOrThrow({ where: { deliveryOrderId: order.id } })).refundedCents, 3000);
  // Segunda desistência não estorna duas vezes.
  assert.equal((await customerWithdrawRefund(order.id)).ok, false);
});

test("carrinho nas mãos do dono: cliente desiste só se ganhar a corrida do botão", async () => {
  const order = await paidOrder();
  const job = await prisma.purchaseJob.create({ data: { deliveryOrderId: order.id, fulfillmentKey: "mercadolivre", storeKey: "mercadolivre", storeLabel: "ML", status: "awaiting_owner_confirm", submissionId: `sub-${process.pid}-${sequence}` } });
  await prisma.purchaseSpend.create({ data: { submissionId: job.submissionId!, purchaseJobId: job.id, budgetDay: "2000-01-01", amountCents: 3000, authorization: "owner_confirm" } });
  const action = await prisma.$transaction((tx) => createOpsAction(tx, { kind: "ml_cart_ready", purchaseJobId: job.id, deliveryOrderId: order.id }));
  const outcome = await customerWithdrawRefund(order.id);
  assert.equal(outcome.ok, true);
  assert.equal((await prisma.purchaseSpend.findUniqueOrThrow({ where: { submissionId: job.submissionId! } })).status, "released");
  // O botão que o dono ainda tinha na tela não faz mais nada.
  assert.equal(await handleOperatorInbound("+5511999990000", opsActionButtonId(action, "bought")!), "handled");
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.id } })).status, "canceled");
  // Dono já tocou "Comprei" → cliente perde a corrida.
  const order2 = await paidOrder();
  await prisma.purchaseJob.create({ data: { deliveryOrderId: order2.id, fulfillmentKey: "mercadolivre", storeKey: "mercadolivre", storeLabel: "ML", status: "awaiting_store_number", submissionId: `sub2-${process.pid}-${sequence}` } });
  const blocked = await customerWithdrawRefund(order2.id);
  assert.equal(blocked.ok, false);
  assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order2.id } })).status, "paid");
});

test("depois do número na loja ou fora de 'paid', não há desistência; copy explica", async () => {
  const bought = await paidOrder("retailer_preparing");
  assert.equal((await customerWithdrawRefund(bought.id)).ok, false);
  const numbered = await paidOrder();
  await prisma.deliveryOrder.update({ where: { id: numbered.id }, data: { storeOrderNumber: "123456" } });
  assert.equal((await customerWithdrawRefund(numbered.id)).ok, false);
  assert.match(cancelRequestedPaid(), /já foi feita na loja/);
  assert.match(cancelHowTo(true), /cancelar/);
  assert.match(withdrawnRefunded(30), /30,00/);
});
