// Caso real de 02/09: chá de R$4,49 (Natural da Terra) cobrado com "tarifa padrão", sem
// estoque para o CEP e abaixo do mínimo da loja; pago às 10h45 no cartão e o cliente ficou
// o dia inteiro sem notícia. Três contratos aqui: (1) loja sem política de frete não
// cobra automático; (2) pedido pago sem compra há 2h+ alerta o operador e, com bloqueio,
// avisa o cliente — sem repetir; (3) "Não consegui comprar → estornar" estorna pelo
// provedor, fecha o pedido e explica ao cliente com o motivo.
import "./helpers/load-env";
process.env.LIA_OPERATOR_PHONE = "+5511900000000";
// Estorno Pagar.me em mock (sem chave) — mesmo arranjo do saved-card.test.
process.env.PAGARME_MOCK = "true";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage, opsPurchaseFailedRefund, watchPaidOrder } from "../src/lib/delivery-service";
import { reconcilePayments } from "../src/lib/payments/reconcile";
import { PURCHASE_BLOCKED_PREFIX } from "../src/lib/order-monitor";
import { AWAITING_OPERATOR_QUOTE_STATUS } from "../src/lib/order-flags";
import * as copy from "../src/lib/lia-copy";

const OPERATOR = "+5511900000000";
const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5507${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
const TEST_ADDRESS = "Rua das Flores, 123, Bela Vista, São Paulo - SP";
let phoneSeq = 0;
let msgSeq = 0;
let dbOk = false;

const outbox: { to: string; text: string }[] = [];
(whatsappAdapter as { sendMessage: unknown }).sendMessage = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};
(whatsappAdapter as { sendMedia: unknown }).sendMedia = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}
function textsTo(to: string, start: number): string {
  return outbox.slice(start).filter((m) => m.to === to).map((m) => m.text).join("\n---\n");
}
async function send(phone: string, text: string): Promise<string> {
  const start = outbox.length;
  await handleDeliveryMessage({ phone, text, messageId: `wd_${RUN}_${++msgSeq}` });
  return textsTo(phone, start);
}

async function paidOrder(paidAgoMs: number, notes = "Pagamento: cartão") {
  const phone = newPhone();
  const user = await prisma.user.create({ data: { phone, cep: "01229-000", defaultAddress: TEST_ADDRESS } });
  const paidAt = new Date(Date.now() - paidAgoMs);
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      cep: "01229-000",
      deliveryAddress: TEST_ADDRESS,
      storeKey: "concierge",
      storeLabel: "Lia",
      items: [{ sku: "naturaldaterra-165908", name: "Ice Tea Pêssego Zero", qty: 1, unitPrice: 4.49, lineTotal: 4.49, storeKey: "naturaldaterra" }] as unknown as object,
      itemsSubtotal: 4.49,
      serviceFee: 0.45,
      deliveryFee: 18,
      total: 24.14,
      courierKey: "retailer_delivery",
      notes,
      status: "paid",
      paidAt
    }
  });
  await prisma.payment.create({
    data: { deliveryOrderId: order.id, provider: "pagarme", providerPaymentId: `ch_${RUN}_${order.id.slice(-4)}`, method: "card", amountCents: 2414, status: "approved" }
  });
  return { phone, userId: user.id, orderId: order.id };
}

async function wipeTestData() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await prisma.message.deleteMany({ where: { conversation: { userId: { in: ids } } } });
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    await wipeTestData();
  } catch (error) {
    if (process.env.LIA_REQUIRE_DB === "1") throw error;
    dbOk = false;
    console.warn("⚠️  Banco indisponível — vigia de pedido pago será pulado.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipeTestData();
  await prisma.$disconnect();
});

test("loja sem política de frete calibrada NÃO cobra automático: vai pro operador com o motivo na nota", async (t) => {
  if (!dbOk) return t.skip();
  // Decathlon está no roster de teste e não tem semente de frete → "tarifa padrão".
  const phone = newPhone();
  await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: TEST_ADDRESS } });
  let out = await send(phone, "quero creatina");
  for (let i = 0; i < 4 && /Responde \*1\*/.test(out); i++) out = await send(phone, "1");
  const closed = await send(phone, "so isso");
  assert.doesNotMatch(closed, /Total: R\$/, `cobrou automático com tarifa padrão: ${closed.slice(0, 300)}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
  const order = await prisma.deliveryOrder.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  assert.ok(order, "esperava pedido na fila do operador");
  assert.equal(order!.status, AWAITING_OPERATOR_QUOTE_STATUS);
  assert.match(order!.notes ?? "", /tarifa padrão é chute/);
});

test("pedido pago há 3h sem compra e com bloqueio: alerta o operador e avisa o cliente UMA vez", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await paidOrder(3 * 60 * 60_000, `Pagamento: cartão\n${PURCHASE_BLOCKED_PREFIX} item sem estoque na Natural da Terra para o CEP; mínimo R$50.`);
  const start = outbox.length;
  assert.equal(await watchPaidOrder(orderId), "operator+customer");
  assert.match(textsTo(OPERATOR, start), /PAGO há 3h sem compra/);
  assert.match(textsTo(OPERATOR, start), /sem estoque/);
  assert.equal(textsTo(phone, start), copy.purchaseDelayedCustomer(orderId.slice(-6).toUpperCase(), true));
  const again = outbox.length;
  assert.equal(await watchPaidOrder(orderId), "none", "mesmo bucket não repete");
  assert.equal(outbox.length, again);
  const order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.match(order.notes ?? "", /COMPRA PENDENTE 2h/);
});

test("pedido pago há 30 min é normal: nada dispara; via cron o de 3h conta no relatório", async (t) => {
  if (!dbOk) return t.skip();
  const fresh = await paidOrder(30 * 60_000);
  assert.equal(await watchPaidOrder(fresh.orderId), "none");
  const stuck = await paidOrder(7 * 60 * 60_000);
  const start = outbox.length;
  const report = await reconcilePayments();
  assert.ok(report.paidStuckAlerts >= 1, JSON.stringify(report));
  assert.match(textsTo(OPERATOR, start), new RegExp(`#${stuck.orderId.slice(-6).toUpperCase()} PAGO há 7h`));
  // Sem bloqueio conhecido, 6h+ também avisa o cliente (texto honesto, sem promessa de prazo).
  assert.equal(textsTo(stuck.phone, start), copy.purchaseDelayedCustomer(stuck.orderId.slice(-6).toUpperCase(), false));
  assert.doesNotMatch(textsTo(stuck.phone, start), /hoje|amanh|\d+h/);
});

test("'Não consegui comprar → estornar': estorna pelo provedor, fecha o pedido e explica com o motivo", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await paidOrder(60 * 60_000);
  const start = outbox.length;
  const order = await opsPurchaseFailedRefund(orderId, "sem estoque para o seu endereço");
  assert.equal(order.status, "refunded");
  assert.match(order.notes ?? "", /Compra não realizada \(sem estoque para o seu endereço\)/);
  assert.match(order.notes ?? "", /ESTORNO CONFIRMADO: integral/);
  const paid = await prisma.payment.findFirstOrThrow({ where: { deliveryOrderId: orderId } });
  assert.equal(paid.status, "refunded");
  assert.equal(paid.refundedCents, 2414);
  const msg = textsTo(phone, start);
  assert.match(msg, /Não consegui comprar \*Ice Tea Pêssego Zero\*/);
  assert.match(msg, /sem estoque para o seu endereço/);
  assert.match(msg, /R\$ 24,14/);
  // Já estornado não estorna de novo.
  await assert.rejects(() => opsPurchaseFailedRefund(orderId), /Só um pedido pago/);
});
