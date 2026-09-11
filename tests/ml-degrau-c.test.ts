import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { recordPayment, refundOrderViaProvider } from "../src/lib/payments/ledger";
import { ensurePurchaseJobForPaidOrder } from "../src/lib/purchase-worker";
import {
  savePurchaseAccount,
  claimPurchaseSession,
  requestOwnerConfirm,
  beginPurchase,
  type CheckoutEvidence,
} from "../src/lib/purchase-execution";
import { opsActionButtonId, parseOpsActionButton, consumeOpsAction } from "../src/lib/ops-actions";
import { handleOperatorInbound } from "../src/lib/ops-actions-inbound";

process.env.OPS_TOKEN ??= "unit-ops-token";
process.env.LIA_OPERATOR_PHONE = "+5511999990000";
const OPERATOR = "+5511999990000";
const users: string[] = [];
let sequence = 0;

async function paidMlOrder() {
  const user = await prisma.user.create({ data: { phone: `+55090877${process.pid}${++sequence}`, name: "Cliente Teste" } });
  users.push(user.id);
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id, phone: user.phone, status: "paid", storeKey: "mercadolivre", storeLabel: "Mercado Livre",
      customerName: "Cliente Teste",
      items: [{ sku: "ml-MLB123", name: "Ração Golden 1kg", qty: 2, unitPrice: 10, lineTotal: 20, storeKey: "mercadolivre", storeLabel: "Mercado Livre", productUrl: "https://produto.mercadolivre.com.br/MLB-123-racao-golden" }],
      itemsSubtotal: 20, deliveryFee: 8, serviceFee: 2, total: 30, cep: "01310-100",
      deliveryAddress: "Rua Teste, 10, apto 2, Centro, São Paulo - SP", paidAt: new Date(Date.now() - 60_000),
      courierKey: "retailer_delivery",
    },
  });
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: `ml-${process.pid}-${sequence}`, amountCents: 3000, status: "approved", method: "pix" });
  return order;
}
function evidenceFor(order: { customerName: string | null; deliveryAddress: string | null; cep: string | null }, cartHash: string): CheckoutEvidence {
  return {
    recipientName: order.customerName!, accountEmail: "compras@example.test",
    checkoutUrl: "https://www.mercadolivre.com.br/gz/cart", cartHash, destination: order.deliveryAddress!,
    postalCode: order.cep!, deliveryOption: "Mercado Envios", deliveryPromise: "",
    payment: { kind: "ml_balance" }, observedAt: new Date().toISOString(),
    items: [{ sku: "ml-MLB123", retailerSku: "MLB123", seller: "loja-oficial", name: "Ração Golden 1kg", qty: 2, unitPriceCents: 1000, lineTotalCents: 2000 }],
    freightCents: 800, totalCents: 2800,
  };
}
async function mlSession() {
  const order = await paidMlOrder();
  assert.ok(await ensurePurchaseJobForPaidOrder(order.id), "ML é loja de preparação por padrão");
  const job = await claimPurchaseSession("ml-tests", ["mercadolivre"]);
  assert.ok(job, "conta do ML habilitada reivindica o job");
  assert.equal(job.orderId, order.id);
  assert.equal(job.deliveryFeeCents, 800);
  return { order, job, evidence: evidenceFor(order, job.cartHash!) };
}
after(async () => {
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.purchaseAccount.deleteMany({ where: { storeKey: "mercadolivre" } });
  await prisma.$disconnect();
});

const oldStores = process.env.LIA_AUTO_PURCHASE_STORES;
process.env.LIA_AUTO_PURCHASE_STORES = "mercadolivre";
after(() => { if (oldStores === undefined) delete process.env.LIA_AUTO_PURCHASE_STORES; else process.env.LIA_AUTO_PURCHASE_STORES = oldStores; });

test("conta do Mercado Livre só aceita saldo Mercado Pago", async () => {
  await assert.rejects(savePurchaseAccount({ storeKey: "mercadolivre", email: "compras@example.test", loginReady: true, paymentReady: true, enabled: true, paymentKind: "pix_out" }), /saldo/);
  const account = await savePurchaseAccount({ storeKey: "mercadolivre", email: "compras@example.test", loginReady: true, paymentReady: true, enabled: true });
  assert.equal(account.paymentKind, "ml_balance");
});

test("botão assinado: id ≤ 256, assinatura amarra ação e tipo, consumo é único", async () => {
  const action = await prisma.$transaction((tx) => tx.opsAction.create({ data: { kind: "ml_cart_ready", expiresAt: new Date(Date.now() + 60_000) } }));
  const id = opsActionButtonId(action, "bought")!;
  assert.ok(id.length <= 256 && id.startsWith("op1."));
  const parsed = parseOpsActionButton(id)!;
  assert.equal(parsed.id, action.id);
  assert.equal(parsed.choice, "bought");
  assert.equal(parseOpsActionButton("op1.x.y.z"), null);
  await assert.rejects(prisma.$transaction((tx) => consumeOpsAction(tx, { id: action.id, choice: "bought", sig: "0".repeat(32), by: "t" })), /inválido/);
  await assert.rejects(prisma.$transaction((tx) => consumeOpsAction(tx, { id: action.id, choice: "bought", sig: parsed.sig, by: "t", expectKind: "receiver_new" })), /outro tipo/);
  await prisma.$transaction((tx) => consumeOpsAction(tx, { id: action.id, choice: "bought", sig: parsed.sig, by: "t" }));
  await assert.rejects(prisma.$transaction((tx) => consumeOpsAction(tx, { id: action.id, choice: "bought", sig: parsed.sig, by: "t" })), /já usada/);
  const expired = await prisma.opsAction.create({ data: { kind: "ml_cart_ready", expiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(prisma.$transaction((tx) => consumeOpsAction(tx, { id: expired.id, choice: "bought", by: "t" })), /vencida/);
  // Telefone que não é operador nunca aciona nada, nem com botão válido.
  assert.equal(await handleOperatorInbound("+5511888880000", id), "ignored");
});

test("degrau C completo: carrinho pronto → Comprei → número do pedido → comprado", async () => {
  const { order, job, evidence } = await mlSession();
  const args = [job.jobId, "ml-tests", job.claimToken] as const;
  // Clique automático nunca existe para o ML.
  await assert.rejects(beginPurchase(...args, evidence));
  const requested = await requestOwnerConfirm(...args, evidence);
  assert.equal(requested.ok, true);
  const waiting = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } });
  assert.equal(waiting.status, "awaiting_owner_confirm");
  assert.equal(waiting.lockedAt, null, "o navegador foi liberado; o carrinho sincroniza para o app");
  assert.equal(await prisma.purchaseSpend.count({ where: { purchaseJobId: job.jobId, status: "reserved" } }), 1);
  // Enquanto o dono decide, o estorno ao cliente é bloqueado (dinheiro pode já ter saído).
  await assert.rejects(refundOrderViaProvider(order.id), /Reconcilie/);
  // Outro job do ML não entra no mesmo carrinho.
  const other = await paidMlOrder();
  await ensurePurchaseJobForPaidOrder(other.id);
  assert.equal(await claimPurchaseSession("ml-tests-2", ["mercadolivre"]), null, "conta ocupada pelo carrinho do dono");
  const pending = await prisma.opsAction.findFirstOrThrow({ where: { purchaseJobId: job.jobId, kind: "ml_cart_ready", status: "pending" } });
  const bought = opsActionButtonId(pending, "bought")!;
  assert.equal(await handleOperatorInbound(OPERATOR, bought), "handled");
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } })).status, "awaiting_store_number");
  // Toque repetido não faz nada.
  assert.equal(await handleOperatorInbound(OPERATOR, bought), "handled");
  assert.equal((await prisma.opsAction.count({ where: { purchaseJobId: job.jobId, kind: "await_store_number", status: "pending" } })), 1);
  // Texto que não é número segue como cliente; número puro é o pedido do ML.
  assert.equal(await handleOperatorInbound(OPERATOR, "quero um café"), "ignored");
  assert.equal(await handleOperatorInbound(OPERATOR, "#2000012345678901"), "handled");
  const done = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } });
  assert.equal(done.status, "completed");
  assert.equal(done.storeOrderNumber, "2000012345678901");
  const bought2 = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(bought2.status, "retailer_preparing");
  assert.equal(bought2.storeOrderNumber, "2000012345678901");
  assert.equal(await prisma.deliveryEvent.count({ where: { deliveryOrderId: order.id, kind: "bought" } }), 1);
  // Segundo número não reabre nada.
  assert.equal(await handleOperatorInbound(OPERATOR, "2000099999999999"), "ignored");
  await prisma.purchaseJob.updateMany({ where: { deliveryOrderId: other.id }, data: { status: "canceled" } });
});

test("degrau C: 'Não deu' vai para revisão sem liberar a reserva; teto diário bloqueia antes do dono", async () => {
  const { job, evidence } = await mlSession();
  const args = [job.jobId, "ml-tests", job.claimToken] as const;
  assert.equal((await requestOwnerConfirm(...args, evidence)).ok, true);
  const pending = await prisma.opsAction.findFirstOrThrow({ where: { purchaseJobId: job.jobId, kind: "ml_cart_ready", status: "pending" } });
  assert.equal(await handleOperatorInbound(OPERATOR, opsActionButtonId(pending, "failed")!), "handled");
  const declined = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } });
  assert.equal(declined.status, "needs_review");
  assert.equal(declined.lastErrorCode, "OWNER_DECLINED");
  assert.equal(await prisma.purchaseSpend.count({ where: { purchaseJobId: job.jobId, status: "reserved" } }), 1);
  await prisma.purchaseJob.update({ where: { id: job.jobId }, data: { status: "canceled" } });
  // Teto: R$500/dia já consumido → o carrinho nem chega ao dono.
  await prisma.purchaseSpend.updateMany({ data: { budgetDay: "2000-01-01" } });
  await prisma.purchaseSpend.create({ data: { submissionId: `ml-budget-${process.pid}-${sequence}`, purchaseJobId: "fixture", budgetDay: (await import("../src/lib/purchase-policy")).purchaseBudgetDay(), amountCents: 49000, authorization: "test" } });
  const second = await mlSession();
  const blocked = await requestOwnerConfirm(second.job.jobId, "ml-tests", second.job.claimToken, second.evidence);
  assert.equal(blocked.ok, false);
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: second.job.jobId } })).status, "needs_review");
  await prisma.purchaseSpend.deleteMany({ where: { purchaseJobId: "fixture" } });
  await prisma.purchaseJob.update({ where: { id: second.job.jobId }, data: { status: "canceled" } });
});
