import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { classifyStoreMail } from "../src/lib/mailbox-policy";
import { reportMail } from "../src/lib/tracking-worker";

const users: string[] = [];
after(async () => {
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

test("classificação: remetente da loja, assunto explícito e número obrigatório; nada de inferência", () => {
  const text = "Olá! Seu pedido 1234567890-01 saiu para entrega. Acompanhe: https://www.swift.com.br/rastreio/abc";
  assert.deepEqual(classifyStoreMail("swift", { from: "Swift <pedidos@swift.com.br>", subject: "Seu pedido saiu para entrega", text }),
    { kind: "out_for_delivery", storeOrderNumber: "1234567890-01", trackingUrl: "https://www.swift.com.br/rastreio/abc" });
  assert.equal(classifyStoreMail("swift", { from: "golpe@example.test", subject: "Seu pedido saiu para entrega", text }), null);
  assert.equal(classifyStoreMail("swift", { from: "pedidos@swift.com.br", subject: "Promoção da semana", text }), null);
  assert.equal(classifyStoreMail("swift", { from: "pedidos@swift.com.br", subject: "Pedido entregue", text: "sem número" }), null);
  assert.equal(classifyStoreMail("mercadolivre", { from: "Mercado Livre <info@mercadolivre.com.br>", subject: "Sua compra chegou!", text: "Compra #2000012345678901" })?.kind, "delivered");
  assert.equal(classifyStoreMail("mercadolivre", { from: "info@mercadolivre.com.br", subject: "Ofertas do dia", text: "2000012345678901" }), null);
});

test("reportMail: só loja + número exatos avançam a etapa; e-mail repetido não duplica; created fecha o Pix da loja", async () => {
  const user = await prisma.user.create({ data: { phone: `+55090944${process.pid}` } });
  users.push(user.id);
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id, phone: user.phone, status: "retailer_preparing", storeKey: "swift", storeLabel: "Swift", storeOrderNumber: "555555555-01",
      items: [{ sku: "swift-1", name: "Carne", qty: 1, unitPrice: 10, storeKey: "swift", storeLabel: "Swift" }], itemsSubtotal: 10, total: 10,
      paidAt: new Date(Date.now() - 3_600_000), courierKey: "retailer_delivery",
    },
  });
  // Número de outro pedido: nada acontece.
  assert.equal((await reportMail({ storeKey: "swift", storeOrderNumber: "000000000-01", kind: "out_for_delivery", messageId: "m0", receivedAt: new Date().toISOString() })).matched, false);
  // Loja errada com o número certo: nada acontece.
  assert.equal((await reportMail({ storeKey: "cobasi", storeOrderNumber: "555555555-01", kind: "out_for_delivery", messageId: "m1", receivedAt: new Date().toISOString() })).matched, false);
  const first = await reportMail({ storeKey: "swift", storeOrderNumber: "555555555-01", kind: "out_for_delivery", messageId: "m2", receivedAt: new Date().toISOString(), trackingUrl: "https://www.swift.com.br/rastreio/x" });
  assert.equal(first.matched, true);
  const moved = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(moved.status, "retailer_out_for_delivery");
  assert.equal(moved.courierTrackingUrl, "https://www.swift.com.br/rastreio/x");
  await reportMail({ storeKey: "swift", storeOrderNumber: "555555555-01", kind: "out_for_delivery", messageId: "m2", receivedAt: new Date().toISOString() });
  assert.equal(await prisma.deliveryEvent.count({ where: { deliveryOrderId: order.id, kind: "out_for_delivery" } }), 1);
  await reportMail({ storeKey: "swift", storeOrderNumber: "555555555-01", kind: "delivered", messageId: "m3", receivedAt: new Date().toISOString() });
  assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "delivered");
  // "Pedido criado" fecha a etapa pix_paid → store_confirmed pelo número.
  const order2 = await prisma.deliveryOrder.create({ data: { userId: user.id, phone: user.phone, status: "paid", storeKey: "swift", storeLabel: "Swift", items: [], total: 10, courierKey: "retailer_delivery", paidAt: new Date() } });
  const job = await prisma.purchaseJob.create({ data: { deliveryOrderId: order2.id, fulfillmentKey: "swift", storeKey: "swift", storeLabel: "Swift", status: "pix_paid", storeOrderNumber: "777777777-01", submissionId: `mail-${process.pid}` } });
  const created = await reportMail({ storeKey: "swift", storeOrderNumber: "777777777-01", kind: "created", messageId: "m4", receivedAt: new Date().toISOString() });
  assert.equal(created.matched, true);
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.id } })).status, "store_confirmed");
});
