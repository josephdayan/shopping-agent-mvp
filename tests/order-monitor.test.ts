import "./helpers/load-env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { monitorAllOrders, inspectMonitoredOrder, compactMonitorReport, PURCHASE_BLOCKED_PREFIX } from "../src/lib/order-monitor";

let userId: string;
const run = `monitor-${process.pid}-${Date.now()}`;
const created: string[] = [];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  assert.ok(["localhost", "127.0.0.1", "postgres"].includes(host), "Rode o teste em Postgres local, nunca em produção.");
  const user = await prisma.user.create({ data: { phone: `test-${run}`, name: "Cliente de teste", email: "cliente@example.test" } });
  userId = user.id;
});

after(async () => {
  if (userId) {
    await prisma.deliveryOrder.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

async function order(storeKey: string, extra: { status?: string; provider?: string; amount?: number; refunded?: number; notes?: string; storeOrderNumber?: string; old?: boolean } = {}) {
  const row = await prisma.deliveryOrder.create({ data: {
    userId, phone: `test-${run}`, cep: "01000-000", deliveryAddress: "Endereço privado de teste",
    storeKey: "concierge", status: extra.status ?? "paid", total: 24.14,
    itemsSubtotal: 4.49, deliveryFee: 18, notes: extra.notes,
    storeOrderNumber: extra.storeOrderNumber,
    ...(extra.old ? { createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01") } : {}),
    items: [{ name: "Chá", qty: 1, storeKey, productUrl: `https://example.test/${storeKey}/cha` }],
    payments: { create: { provider: extra.provider ?? "pagarme", method: "card", providerPaymentId: `${run}-${created.length}`,
      status: "approved", amountCents: extra.amount ?? 2414, refundedCents: extra.refunded ?? 0 } }
  } });
  created.push(row.id);
  return row;
}

test("pedido pago da Natural da Terra sem PurchaseJob aparece junto de Mercado Livre e outras lojas", async () => {
  const tea = await order("naturaldaterra");
  const ml = await order("mercadolivre");
  const old = await order("outra-loja", { old: true });
  const before = await prisma.purchaseJob.count();
  const report = await monitorAllOrders();
  for (const row of [tea, ml, old]) {
    const found = report.orders.find(o => o.orderId === row.id);
    assert.equal(found?.action, "purchase_required");
    assert.equal(found?.paymentVerified, true);
  }
  assert.equal(await prisma.purchaseJob.count(), before, "monitor não reserva nem cria jobs");
  assert.equal(report.scope, "all_stores");
});

test("monitor acompanha também pedido não pago, cotação manual e entrega", async () => {
  for (const [status, action] of [["awaiting_payment", "waiting"], ["awaiting_operator_quote", "quote_required"], ["retailer_preparing", "track_delivery"]]) {
    const row = await order("naturaldaterra", { status, old: true });
    const report = await monitorAllOrders();
    assert.equal(report.orders.find(o => o.orderId === row.id)?.action, action);
  }
});

test("pagamento simulado/divergente, estorno, compra já registrada e bloqueio não viram nova compra", async () => {
  const cases = [
    { input: { provider: "mock" }, action: "payment_review" },
    { input: { amount: 2413 }, action: "payment_review" },
    { input: { refunded: 1 }, action: "payment_review" },
    { input: { status: "refund_pending" }, action: "refund_review" },
    { input: { storeOrderNumber: "COMPRA-JA-FEITA" }, action: "reconcile_purchase" },
    { input: { notes: `${PURCHASE_BLOCKED_PREFIX} Produto indisponível.` }, action: "purchase_review" }
  ];
  for (const c of cases) {
    const row = await order("naturaldaterra", c.input);
    const report = await monitorAllOrders();
    assert.equal(report.orders.find(o => o.orderId === row.id)?.action, c.action);
  }
});

test("resumo não expõe dados de entrega; inspeção resolve apenas o pedido solicitado", async () => {
  const row = await order("naturaldaterra");
  const report = await monitorAllOrders();
  const summary = JSON.stringify(report.orders.find(o => o.orderId === row.id));
  assert.ok(!summary.includes("Endereço privado"));
  assert.ok(!summary.includes("cliente@example.test"));
  assert.ok(!summary.includes(`test-${run}`));
  const detail = await inspectMonitoredOrder(row.id);
  assert.equal(detail.orderId, row.id);
  assert.equal(detail.customer.address, "Endereço privado de teste");
  assert.equal(detail.maximumRetailerTotal, 22.49);
  await assert.rejects(() => inspectMonitoredOrder("invalido/"));
});

test("job reservado não inicia compra paralela; resumo compacto mantém todos os pedidos", async () => {
  const row = await order("mercadolivre");
  await prisma.purchaseJob.create({ data: { deliveryOrderId: row.id,
    storeKey: "mercadolivre", storeLabel: "Mercado Livre", status: "claimed" } });
  const report = await monitorAllOrders();
  assert.equal(report.orders.find(o => o.orderId === row.id)?.action, "purchase_in_progress");
  const compact = compactMonitorReport(report);
  assert.equal(compact.checkedOrders, report.orders.length);
  assert.equal(Object.values(compact.byAction).flat().length, report.orders.length);
  assert.ok(compact.byAction.purchase_in_progress.some(o => o[0] === row.id.slice(-6).toUpperCase()));
});
