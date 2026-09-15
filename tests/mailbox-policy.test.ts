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
  assert.equal(classifyStoreMail("swift", { from: "Loja Online Swift <noreply@vtexcommerce.com.br>", subject: "Seu pedido saiu para entrega", text })?.kind, "out_for_delivery");
  assert.equal(classifyStoreMail("swift", { from: "Outra Loja <noreply@vtexcommerce.com.br>", subject: "Seu pedido saiu para entrega", text }), null);
  assert.equal(classifyStoreMail("swift", { from: "pedidos@swift.com.br", subject: "Promoção da semana", text }), null);
  assert.equal(classifyStoreMail("swift", { from: "pedidos@swift.com.br", subject: "Pedido entregue", text: "sem número" }), null);
  // Cobasi real (E3, 14/09): remetente de plataforma ct.vtex.com.br com nome "Cobasi" e número v…cbs-01.
  assert.deepEqual(classifyStoreMail("cobasi", { from: "Cobasi <c302168309894951837a612ccdf6258d@ct.vtex.com.br>", subject: "Pagamento aprovado do pedido v146373290cbs-01", text: "Seu pedido v146373290cbs-01 foi aprovado." }),
    { kind: "paid", storeOrderNumber: "v146373290cbs-01" });
  assert.equal(classifyStoreMail("cobasi", { from: "Outra <x@ct.vtex.com.br>", subject: "Pagamento aprovado do pedido v146373290cbs-01", text: "v146373290cbs-01" }), null);
  // Código de recebimento: sem número, com o código de 4 dígitos.
  assert.deepEqual(classifyStoreMail("cobasi", { from: "Cobasi <noreply@cobasi.com.br>", subject: "Código de segurança para recebimento do seu pedido", text: "Olá Joseph! Seu pedido já está a caminho Caso solicitado, apresente o código único 6065 Informe apenas após receber o pedido." }),
    { kind: "delivery_code", storeOrderNumber: "", deliveryCode: "6065" });
  assert.equal(classifyStoreMail("cobasi", { from: "golpe@example.test", subject: "Código de segurança para recebimento do seu pedido", text: "6065 Informe apenas após receber o pedido." }), null);
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

test("reportMail delivery_code: um pedido da loja em andamento → saiu pra entrega com o código; ambíguo → nada", async () => {
  const user = await prisma.user.create({ data: { phone: `+55090945${process.pid}` } });
  users.push(user.id);
  const mk = (status: string) => prisma.deliveryOrder.create({ data: {
    userId: user.id, phone: user.phone, status, storeKey: "cobasi", storeLabel: "Cobasi", storeOrderNumber: `v${process.pid}cbs-01`,
    items: [{ sku: "cobasi-1", name: "Ração", qty: 1, unitPrice: 10, storeKey: "cobasi", storeLabel: "Cobasi" }], itemsSubtotal: 10, total: 10,
    paidAt: new Date(Date.now() - 3_600_000), courierKey: "retailer_delivery",
  } });
  const order = await mk("retailer_preparing");
  const r = await reportMail({ storeKey: "cobasi", storeOrderNumber: "", kind: "delivery_code", messageId: "c1", receivedAt: new Date().toISOString(), deliveryCode: "6065" });
  assert.equal(r.matched, true);
  const moved = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(moved.status, "retailer_out_for_delivery");
  const event = await prisma.deliveryEvent.findFirstOrThrow({ where: { deliveryOrderId: order.id, kind: "out_for_delivery" } });
  assert.match(event.message, /6065/);
  assert.doesNotMatch(moved.notes ?? "", /6065/);
  // Segundo pedido em andamento da mesma loja: ambíguo, nada muda.
  const other = await mk("retailer_preparing");
  const r2 = await reportMail({ storeKey: "cobasi", storeOrderNumber: "", kind: "delivery_code", messageId: "c2", receivedAt: new Date().toISOString(), deliveryCode: "7777" });
  assert.equal(r2.matched, false);
  assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: other.id } })).status, "retailer_preparing");
});
