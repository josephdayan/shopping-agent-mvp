import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { refundDifference } from "../src/lib/plan-b";
import { recordPayment, refundOrderViaProvider } from "../src/lib/payments/ledger";
import { markDeliveryOrderPaid, opsMarkBought, opsMarkDelivered, opsMarkRetailerOutForDelivery } from "../src/lib/delivery-service";
import { recordDeliveryEvent, recordDeliveryReceipt, dispatchDeliveryEvent } from "../src/lib/delivery-events";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { ensurePurchaseJobForPaidOrder, claimNextPurchaseJob, isMercadoLivrePurchaseUrl, purchaseCartHash, validatePurchaseCompletion } from "../src/lib/purchase-worker";

const userIds: string[] = [];
const originalFetch = globalThis.fetch;
const originalSend = whatsappAdapter.sendMessage;
const originalTemplate = whatsappAdapter.sendTemplateMessage;
const sent: { text: string; template: boolean }[] = [];
let sequence = 0;
(whatsappAdapter as { sendMessage: unknown }).sendMessage = async (_phone: string, text: string) => { sent.push({ text, template: false }); return { messages: [{ id: `wamid_review_${++sequence}` }] }; };
(whatsappAdapter as { sendTemplateMessage: unknown }).sendTemplateMessage = async (_phone: string, input: { bodyParams: string[] }) => { sent.push({ text: input.bodyParams.join(" "), template: true }); return { messages: [{ id: `wamid_review_${++sequence}` }] }; };
process.env.LIA_TEMPLATE_ORDER_UPDATE = "pedido_atualizacao";
const item = { sku: "ml-a", name: "Café", qty: 1, unitPrice: 20, lineTotal: 20, storeKey: "mercadolivre", storeLabel: "Mercado Livre", productUrl: "https://produto.mercadolivre.com.br/MLB-123456-cafe" };
async function make(status = "paid", storeKey = "mercadolivre") {
  const user = await prisma.user.create({ data: { phone: `+550906${process.pid}${++sequence}` } });
  userIds.push(user.id);
  return prisma.deliveryOrder.create({ data: {
    userId: user.id, phone: user.phone, status, storeKey, storeLabel: storeKey, items: [{ ...item, storeKey }],
    itemsSubtotal: 20, deliveryFee: 8, serviceFee: 2, total: 30, cep: "01310-100", deliveryAddress: "Endereço de teste",
    paidAt: status === "paid" ? new Date(Date.now() - 60_000) : null, courierKey: "retailer_delivery"
  } });
}
async function paid(order: Awaited<ReturnType<typeof make>>) {
  return recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: String(900000 + ++sequence), method: "pix", amountCents: 3000, status: "approved" });
}
after(async () => {
  globalThis.fetch = originalFetch;
  whatsappAdapter.sendMessage = originalSend;
  whatsappAdapter.sendTemplateMessage = originalTemplate;
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test("worker: domínio semelhante ao ML não autoriza URL de compra", () => {
  assert.equal(isMercadoLivrePurchaseUrl("https://falsomercadolivre.com.br/produto"), false);
  assert.equal(isMercadoLivrePurchaseUrl("https://mercadolivre.com.br@evil.example/produto"), false);
  assert.equal(isMercadoLivrePurchaseUrl(item.productUrl), true);
});
test("worker: mudança de endereço invalida o hash mesmo com cesta e preço iguais", () => {
  assert.notEqual(purchaseCartHash([item], 8, "2d", { cep: "01310-100" }), purchaseCartHash([item], 8, "2d", { cep: "01229-000" }));
});
test("worker: status paid sem razão real não entra na fila", async () => {
  const order = await make();
  assert.equal(await ensurePurchaseJobForPaidOrder(order.id), null);
  await paid(order);
  assert.ok(await ensurePurchaseJobForPaidOrder(order.id));
  await prisma.purchaseJob.updateMany({ where: { deliveryOrderId: order.id }, data: { status: "canceled" } });
});
test("worker: dois workers não montam o mesmo carrinho físico em paralelo", async () => {
  const a = await make(); const b = await make(); await paid(a); await paid(b);
  await ensurePurchaseJobForPaidOrder(a.id); await ensurePurchaseJobForPaidOrder(b.id);
  const result = await Promise.all([claimNextPurchaseJob("review-a"), claimNextPurchaseJob("review-b")]);
  assert.equal(result.filter(Boolean).length, 1);
  await prisma.purchaseJob.updateMany({ where: { deliveryOrderId: { in: [a.id, b.id] } }, data: { status: "canceled" } });
});
test("worker: lease expirado vira revisão, nunca uma segunda compra", async () => {
  const order = await make(); await paid(order);
  const job = await ensurePurchaseJobForPaidOrder(order.id); assert.ok(job);
  await prisma.purchaseJob.update({ where: { id: job.id }, data: { status: "claimed", browserSessionId: "old", lockedAt: new Date(Date.now() - 3_600_000) } });
  await claimNextPurchaseJob("new");
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.id } })).lastErrorCode, "WORKER_LEASE_EXPIRED");
  await prisma.purchaseJob.update({ where: { id: job.id }, data: { status: "canceled" } });
});
test("worker: total NaN e aprovação sem validade não passam", async () => {
  const order = await make(); await paid(order); const job = await ensurePurchaseJobForPaidOrder(order.id); assert.ok(job);
  await prisma.purchaseJob.update({ where: { id: job.id }, data: { status: "claimed", lockedAt: new Date(), browserSessionId: "review", approvalStatus: "approved", approvedAt: new Date(), approvalExpiresAt: new Date(Date.now() + 60000) } });
  process.env.PURCHASE_AUTOMATION_MODE = "purchase";
  try {
    await assert.rejects(validatePurchaseCompletion(job.id, "review", { actualTotal: NaN, cartHash: job.cartHash!, storeOrderNumber: "123" }), /Invalid retailer total/);
    await prisma.purchaseJob.update({ where: { id: job.id }, data: { approvalExpiresAt: null } });
    await assert.rejects(validatePurchaseCompletion(job.id, "review", { actualTotal: 28, cartHash: job.cartHash!, storeOrderNumber: "123" }), /expiration/);
  } finally { delete process.env.PURCHASE_AUTOMATION_MODE; await prisma.purchaseJob.update({ where: { id: job.id }, data: { status: "canceled" } }); }
});
test("pagamento: confirmação simultânea cria exatamente uma entrada no razão", async () => {
  const order = await make("awaiting_payment");
  const evidence = { provider: "mercadopago" as const, paymentId: String(910000 + ++sequence), amount: 30 };
  await Promise.all([markDeliveryOrderPaid(order.id, evidence), markDeliveryOrderPaid(order.id, evidence)]);
  assert.equal(await prisma.payment.count({ where: { deliveryOrderId: order.id } }), 1);
  assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "paid");
  await prisma.purchaseJob.updateMany({ where: { deliveryOrderId: order.id }, data: { status: "canceled" } });
});
test("pagamento: um segundo pagamento de pedido pago é registrado como inesperado", async () => {
  const order = await make(); await paid(order);
  await markDeliveryOrderPaid(order.id, { provider: "mercadopago", paymentId: String(920000 + ++sequence), amount: 30 });
  assert.equal(await prisma.payment.count({ where: { deliveryOrderId: order.id, status: "unexpected" } }), 1);
});
test("razão: replay aprovado não ressuscita pagamento já estornado", async () => {
  const order = await make(); const payment = await paid(order);
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded", refundedCents: 3000 } });
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: payment.providerPaymentId, amountCents: 3000, status: "approved", method: "pix" });
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
});
test("estorno: duas parcelas iguais têm identidades diferentes no provedor", async () => {
  const order = await make(); const payment = await paid(order); const keys: string[] = [];
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "test";
  globalThis.fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get("X-Idempotency-Key")!);
    return new Response(JSON.stringify({ id: keys.length, status: "approved", amount: 5 }), { status: 201 });
  };
  try { await refundOrderViaProvider(order.id, 5); await refundOrderViaProvider(order.id, 5); }
  finally { delete process.env.MERCADO_PAGO_ACCESS_TOKEN; globalThis.fetch = originalFetch; }
  assert.equal(new Set(keys).size, 2);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedCents, 1000);
});
test("estorno: resposta pendente não autoriza dizer que o dinheiro voltou", async () => {
  const order = await make(); const payment = await paid(order);
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 123, status: "pending", amount: 30 }), { status: 201 });
  try { await assert.rejects(refundOrderViaProvider(order.id), /ainda não confirmado/); }
  finally { delete process.env.MERCADO_PAGO_ACCESS_TOKEN; globalThis.fetch = originalFetch; }
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedCents, 0);
});
test("entrega: compra exige número, eventos duplicados enviam uma mensagem e preservam link", async () => {
  const order = await make("paid", "oba");
  await assert.rejects(opsMarkBought(order.id, ""), /número/);
  await Promise.all([opsMarkBought(order.id, "STORE-123", "https://example.com/tracking"), opsMarkBought(order.id, "STORE-123")]);
  const before = sent.length;
  await Promise.all([opsMarkRetailerOutForDelivery(order.id), opsMarkRetailerOutForDelivery(order.id)]);
  assert.equal(sent.length - before, 1);
  assert.ok(sent.at(-1)!.template, "cliente sem inbound precisa de template");
  assert.match(sent.at(-1)!.text, /example.com\/tracking/);
  await opsMarkDelivered(order.id);
  const event = await prisma.deliveryEvent.findUniqueOrThrow({ where: { dedupeKey: `${order.id}:delivered` } });
  assert.equal(event.deliveryStatus, "accepted", "Graph aceitou não significa entregue ao cliente");
  await recordDeliveryReceipt({ id: event.providerMessageId, status: "delivered" });
  await recordDeliveryReceipt({ id: event.providerMessageId, status: "sent" });
  assert.equal((await prisma.deliveryEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveryStatus, "delivered");
});
test("entrega: prova direta de entregue não inventa etapa intermediária", async () => {
  const order = await make("paid", "oba"); await opsMarkBought(order.id, "DIRECT-1");
  await recordDeliveryEvent(order.id, { kind: "delivered", source: "tracking_reader", sourceReference: "api:verified:1", storeKey: "oba", storeOrderNumber: "DIRECT-1" });
  assert.equal(await prisma.deliveryEvent.count({ where: { deliveryOrderId: order.id, kind: "out_for_delivery" } }), 0);
  await assert.rejects(recordDeliveryEvent(order.id, { kind: "out_for_delivery", source: "tracking_reader", sourceReference: "api:old", storeKey: "oba", storeOrderNumber: "DIRECT-1" }), /incompatível/);
});
test("entrega: leitor rejeita pedido de outra loja e cesta de múltiplas lojas", async () => {
  const order = await make("paid", "oba"); await opsMarkBought(order.id, "S-1");
  const evidence = { kind: "out_for_delivery" as const, source: "tracking_reader" as const, sourceReference: "page:1", storeKey: "petz", storeOrderNumber: "S-1" };
  await assert.rejects(recordDeliveryEvent(order.id, evidence), /não corresponde/);
  await prisma.deliveryOrder.update({ where: { id: order.id }, data: { items: [{ ...item, storeKey: "oba" }, { ...item, storeKey: "petz" }] } });
  await assert.rejects(recordDeliveryEvent(order.id, { ...evidence, storeKey: "oba" }), /múltiplas/);
});
test("entrega: envio incerto não repete; recibo tardio pelo callback reconcilia", async () => {
  const order = await make("paid", "oba");
  const sendTemplate = whatsappAdapter.sendTemplateMessage;
  whatsappAdapter.sendTemplateMessage = async () => { throw new Error("timeout"); };
  try { await opsMarkBought(order.id, "TIMEOUT-1"); } finally { whatsappAdapter.sendTemplateMessage = sendTemplate; }
  const event = await prisma.deliveryEvent.findUniqueOrThrow({ where: { dedupeKey: `${order.id}:bought` } });
  assert.equal(event.deliveryStatus, "unknown");
  const before = sent.length; await dispatchDeliveryEvent(event.id); assert.equal(sent.length, before);
  await recordDeliveryReceipt({ id: "late-wamid", status: "delivered", biz_opaque_callback_data: event.id });
  assert.equal((await prisma.deliveryEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveryStatus, "delivered");
});
test("entrega: sem template preserva aviso pendente; atualização seguinte suprime aviso antigo", async () => {
  const order = await make("paid", "oba"); delete process.env.LIA_TEMPLATE_ORDER_UPDATE;
  try {
    await opsMarkBought(order.id, "PENDING-1");
    const event = await prisma.deliveryEvent.findUniqueOrThrow({ where: { dedupeKey: `${order.id}:bought` } });
    assert.equal(event.deliveryStatus, "pending");
    await prisma.deliveryOrder.update({ where: { id: order.id }, data: { status: "delivered" } });
    await prisma.deliveryEvent.update({ where: { id: event.id }, data: { nextAttemptAt: null } });
    await dispatchDeliveryEvent(event.id);
    assert.equal((await prisma.deliveryEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveryStatus, "suppressed");
  } finally { process.env.LIA_TEMPLATE_ORDER_UPDATE = "pedido_atualizacao"; }
});

test("worker: habilitação explícita prepara outra loja mesmo com cabeçalho concierge", async () => {
  const order = await make(); await paid(order);
  await prisma.deliveryOrder.update({ where: { id: order.id }, data: { storeKey: "concierge", items: [{ ...item, sku: "paguemenos-123", storeKey: "paguemenos", storeLabel: "Pague Menos", productUrl: "https://www.paguemenos.com.br/cafe/p" }] } });
  const previous = process.env.LIA_PURCHASE_PREP_STORES;
  try {
    delete process.env.LIA_PURCHASE_PREP_STORES;
    assert.equal(await ensurePurchaseJobForPaidOrder(order.id), null);
    process.env.LIA_PURCHASE_PREP_STORES = "mercadolivre,paguemenos";
    const job = await ensurePurchaseJobForPaidOrder(order.id);
    assert.equal(job?.storeKey, "paguemenos");
  } finally {
    if (previous === undefined) delete process.env.LIA_PURCHASE_PREP_STORES; else process.env.LIA_PURCHASE_PREP_STORES = previous;
    await prisma.purchaseJob.updateMany({ where: { deliveryOrderId: order.id }, data: { status: "canceled" } });
  }
});

test("pagamento: id do provedor já ligado a outro pedido não deixa pedido pago sem razão", async () => {
  const a = await make(); const payment = await paid(a); const b = await make("awaiting_payment");
  await assert.rejects(markDeliveryOrderPaid(b.id, { provider: "mercadopago", paymentId: payment.providerPaymentId, amount: 30 }));
  assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: b.id } })).status, "awaiting_payment");
  assert.equal(await prisma.payment.count({ where: { deliveryOrderId: b.id } }), 0);
});

test("estorno: duas solicitações simultâneas não devolvem a mesma parcela duas vezes", async () => {
  const order = await make(); const payment = await paid(order); let calls = 0;
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "test";
  globalThis.fetch = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 40));
    return new Response(JSON.stringify({ id: 123, status: "approved", amount: 5 }), { status: 201 });
  };
  try {
    const result = await Promise.allSettled([refundOrderViaProvider(order.id, 5), refundOrderViaProvider(order.id, 5)]);
    assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(calls, 1);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedCents, 500);
  } finally { delete process.env.MERCADO_PAGO_ACCESS_TOKEN; globalThis.fetch = originalFetch; }
});

// A margem é por unidade, inclusive quando a soma da cesta cruza R$200.
test("plano B: diferença respeita margem por unidade e devolve centavos", () => {
  const original = { ...item, unitPrice: 100, qty: 3, lineTotal: 300 };
  const substitute = { fromSku: item.sku, fromName: item.name, fromStore: item.storeLabel, qty: 3, to: { ...item, unitPrice: 99.9 } };
  assert.equal(refundDifference({ items: [original], deliveryFee: 8 }, [substitute]), 0.33);
});
