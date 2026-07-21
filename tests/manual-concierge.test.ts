// End-to-end eval for the manual concierge flow (the pilot's production default):
// breadth (anything, even non-catalog), operator hand-quote, payment reusing the
// retailer-quote machinery, and same-hour dispatch by a courier that leaves the
// OPERATOR's base (not a store counter). Uses the real DB + mock WhatsApp/Pix/courier.
import "./helpers/load-env";
// This file exercises the concierge flow, so re-enable the flag the shared helper pins off.
process.env.LIA_MANUAL_CONCIERGE = "true";
process.env.LIA_OPERATOR_PICKUP_ADDRESS = "Rua da Base, 10, São Paulo - SP";
process.env.LIA_OPERATOR_PICKUP_CEP = "01310-100";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import {
  handleDeliveryMessage,
  markDeliveryOrderPaid,
  opsPublishManualQuote,
  opsMarkBought,
  opsDispatchCourier,
  opsMarkDelivered
} from "../src/lib/delivery-service";
import { isOperatorCourierOrder } from "../src/lib/order-flags";

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5501${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
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

function driver(phone: string) {
  async function send(text: string): Promise<string> {
    const start = outbox.length;
    await handleDeliveryMessage({ phone, text, messageId: `mc_${RUN}_${++msgSeq}` });
    return outbox
      .slice(start)
      .filter((m) => m.to === phone)
      .map((m) => m.text)
      .join("\n---\n");
  }
  return { send };
}

async function returningCustomer() {
  const phone = newPhone();
  const user = await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: TEST_ADDRESS } });
  return { phone, userId: user.id, ...driver(phone) };
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
  } catch {
    dbOk = false;
    console.warn("⚠️  Banco indisponível — evals concierge serão pulados.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipeTestData();
  await prisma.$disconnect();
});

test("breadth: itens fora de qualquer catálogo são anotados, não recusados", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const noted = await c.send("um carregador de celular e 2 cadernos universitários");
  assert.match(noted, /Anotei/i);
  assert.match(noted.toLowerCase(), /carregador/);
  assert.match(noted.toLowerCase(), /caderno/);
  // Nunca cai no "não achei no catálogo" do fluxo legado.
  assert.doesNotMatch(noted, /não achei|catálogo de hoje/i);
});

test("concierge completo: pede → operador cota → paga → compra → motoboy do operador → entregue", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();

  // 1. Cliente pede coisas diversas (largura). A Lia anota, sem cotar sozinha.
  await c.send("um cabo usb-c e uma vela de aniversário");
  const closed = await c.send("só isso");
  assert.match(closed, /cotar/i);
  assert.doesNotMatch(closed, /Total: R\$/); // nada de total inventado antes da cotação real

  // 2. O pedido está aguardando a cotação do operador.
  const pending = await prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" }
  });
  assert.ok(pending, "deveria existir um pedido aguardando cotação");
  assert.equal(pending!.storeKey, "concierge");
  assert.equal((pending!.items as unknown as unknown[]).length, 2);

  // 3. Operador cota à mão: R$ 50 de produtos + R$ 12 de motoboy, entrega na hora.
  const start = outbox.length;
  await opsPublishManualQuote(pending!.id, {
    itemsSubtotal: 50,
    deliveryFee: 12,
    deliveryMode: "operator_courier",
    deliveryPromise: "hoje até 19h",
    etaMinutes: 90
  });
  const quoteMsgs = outbox.slice(start).map((m) => m.text).join("\n---\n");
  // Produtos = 50 * 1.1 = 55; total = 55 + 12 = 67.
  assert.match(quoteMsgs, /Total: R\$ 67,00/);
  assert.match(quoteMsgs, /Como prefere pagar/i);

  // 4. Cliente escolhe Pix e recebe o código.
  const pix = await c.send("pix");
  assert.match(pix, /R\$ 67,00/);

  const awaitingPay = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(awaitingPay!.status, "awaiting_payment");
  assert.equal(awaitingPay!.total, 67);

  // 5. Pagamento confirma (webhook).
  await markDeliveryOrderPaid(pending!.id);
  const paid = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(paid!.status, "paid");

  // 6. Operador compra à mão e marca. Concierge → operator_buying (não retirada de loja).
  await opsMarkBought(pending!.id, "");
  const bought = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(bought!.status, "operator_buying");
  assert.equal(isOperatorCourierOrder(bought!), true);

  // 7. Despacha o motoboy — sai da BASE do operador, não de uma loja. Não pode lançar.
  await opsDispatchCourier(pending!.id);
  const dispatched = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(dispatched!.status, "dispatched");
  assert.ok(dispatched!.courierTrackingUrl, "deveria ter rastreio do motoboy");

  // 8. Entregue.
  await opsMarkDelivered(pending!.id);
  const delivered = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(delivered!.status, "delivered");
});

test("não é possível cotar um pedido que não está aguardando cotação", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("uma echarpe");
  await c.send("só isso");
  const order = await prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" }
  });
  assert.ok(order);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "operator_courier" });
  // Segunda cotação no mesmo pedido (agora awaiting_quote_confirmation) deve falhar.
  await assert.rejects(
    () => opsPublishManualQuote(order!.id, { itemsSubtotal: 40, deliveryFee: 10 }),
    /aguardando cotação/i
  );
});

test("cancelar durante a cotação do operador cancela sem cobrança", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("um guarda-chuva");
  await c.send("só isso");
  const canceled = await c.send("cancelar");
  assert.match(canceled, /cancel/i);
  const order = await prisma.deliveryOrder.findFirst({ where: { userId: c.userId }, orderBy: { createdAt: "desc" } });
  assert.equal(order!.status, "canceled");
});
