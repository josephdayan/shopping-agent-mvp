// Revisão 01/09/2026 — dinheiro que chega tem que bater com a cobrança na mesa.
//
// Antes: o webhook do Mercado Pago marcava "pago" só com `status=approved` +
// `external_reference`, sem conferir valor nem qual Pix foi pago; cancelar/reabrir um
// pedido em `awaiting_payment` não olhava cartão salvo em cobrança; e uma emissão de
// cartão que falhava deixava o gross-up gravado em `total`, encarecendo o Pix seguinte.
// Aqui os quatro contratos ficam travados.
import "./helpers/load-env";
process.env.LIA_OPERATOR_PHONE = "+5511900000000";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage, markDeliveryOrderPaid } from "../src/lib/delivery-service";
import * as copy from "../src/lib/lia-copy";

const OPERATOR = "+5511900000000";
const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5503${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
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

const realFetch = globalThis.fetch;

async function withRealCredsAnd<T>(fetchImpl: typeof globalThis.fetch, run: () => Promise<T>): Promise<T> {
  const previous = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "APP_USR-test-token";
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
    if (previous === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    else process.env.MERCADO_PAGO_ACCESS_TOKEN = previous;
  }
}

const failingFetch = (async () => {
  throw new Error("fetch failed: ETIMEDOUT api.mercadopago.com");
}) as unknown as typeof globalThis.fetch;

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}

async function send(phone: string, text: string): Promise<string> {
  const start = outbox.length;
  await handleDeliveryMessage({ phone, text, messageId: `prc_${RUN}_${++msgSeq}` });
  return outbox.slice(start).filter((m) => m.to === phone).map((m) => m.text).join("\n---\n");
}

function textsTo(to: string, start: number): string {
  return outbox.slice(start).filter((m) => m.to === to).map((m) => m.text).join("\n---\n");
}

async function orderInStep(
  step: "awaiting_payment" | "awaiting_quote_confirmation",
  overrides: Partial<{ pixId: string | null; pixCopiaECola: string | null; status: string; quoteExpiresAt: Date | null; notes: string }> = {}
) {
  const phone = newPhone();
  const user = await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: TEST_ADDRESS } });
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      cep: "01310-100",
      deliveryAddress: TEST_ADDRESS,
      storeKey: "concierge",
      storeLabel: "Lia",
      items: [{ sku: "x", name: "Café", qty: 1, unitPrice: 20, lineTotal: 20 }] as unknown as object,
      itemsSubtotal: 20,
      serviceFee: 2,
      deliveryFee: 8,
      total: 30,
      courierKey: "retailer_delivery",
      notes: overrides.notes ?? "Pagamento: Pix",
      status: overrides.status ?? step,
      pixId: overrides.pixId ?? null,
      pixCopiaECola: overrides.pixCopiaECola ?? null,
      quoteExpiresAt: overrides.quoteExpiresAt ?? null
    }
  });
  const convo = await prisma.conversation.create({
    data: {
      userId: user.id,
      status: "active",
      currentStep: step,
      context: JSON.stringify({
        flow: "delivery",
        step,
        cep: "01310-100",
        deliveryAddress: TEST_ADDRESS,
        deliveryAddressVerified: true,
        deliveryOrderId: order.id,
        ...(step === "awaiting_payment" ? { paymentIssuedAt: Date.now() } : {})
      })
    }
  });
  await prisma.deliveryOrder.update({ where: { id: order.id }, data: { conversationId: convo.id } });
  return { phone, userId: user.id, orderId: order.id };
}

async function wipeTestData() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await prisma.paymentAttempt.deleteMany({ where: { deliveryOrder: { userId: { in: ids } } } });
  await prisma.paymentCredential.deleteMany({ where: { userId: { in: ids } } });
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
    console.warn("⚠️  Banco indisponível — evals de reconciliação de pagamento serão pulados.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipeTestData();
  await prisma.$disconnect();
});

// ---------- webhook: evidência tem que bater ----------

test("pagamento com valor diferente do total NÃO aprova: nota, alerta ao operador e aviso ao cliente", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await orderInStep("awaiting_payment", { pixId: "111", pixCopiaECola: "00020126PIX-111" });
  const start = outbox.length;
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "111", amount: 25 });

  const order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "awaiting_payment");
  assert.equal(order.paidAt, null);
  assert.match(order.notes ?? "", /PAGAMENTO FORA DO ESPERADO/);
  assert.match(textsTo(OPERATOR, start), /FORA DO ESPERADO/);
  assert.match(textsTo(phone, start), /Recebi um pagamento de R\$ 25,00/);
  assert.doesNotMatch(textsTo(phone, start), /Pagamento confirmado/i);

  // Replay do mesmo webhook não duplica nota nem alerta.
  const again = outbox.length;
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "111", amount: 25 });
  assert.equal(outbox.length, again, "replay é silencioso");
});

test("Pix antigo pago depois da troca de cobrança NÃO aprova (id não é o vigente)", async (t) => {
  if (!dbOk) return t.skip();
  const { orderId } = await orderInStep("awaiting_payment", { pixId: "222", pixCopiaECola: "00020126PIX-222" });
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "111", amount: 30 });
  const order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "awaiting_payment");
  assert.match(order.notes ?? "", /não é a cobrança vigente/);
});

test("evidência que bate aprova normalmente", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await orderInStep("awaiting_payment", { pixId: "333", pixCopiaECola: "00020126PIX-333" });
  const start = outbox.length;
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "333", amount: 30 });
  const order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "paid");
  assert.ok(order.paidAt);
  assert.equal(textsTo(phone, start), copy.paymentConfirmed());
});

test("dinheiro em pedido já cancelado vira alerta, nunca some", async (t) => {
  if (!dbOk) return t.skip();
  const { orderId } = await orderInStep("awaiting_payment", { status: "canceled", pixId: "444" });
  const start = outbox.length;
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "444", amount: 30 });
  const order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "canceled");
  assert.match(order.notes ?? "", /pedido estava em "canceled"/);
  assert.match(textsTo(OPERATOR, start), /FORA DO ESPERADO/);
});

// ---------- cancelar com cartão salvo em cobrança ----------

test("'cancelar' com tentativa de cartão CONFIRMADA não cancela: responde que o cartão está sendo cobrado", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, userId, orderId } = await orderInStep("awaiting_payment", { notes: "Pagamento: Cartão salvo" });
  const credential = await prisma.paymentCredential.create({
    data: { userId, providerCustomerId: `cus_${RUN}`, providerCardId: `card_${RUN}_${orderId.slice(-4)}`, last4: "1234", consentAt: new Date() }
  });
  await prisma.paymentAttempt.create({
    data: {
      deliveryOrderId: orderId,
      credentialId: credential.id,
      amountCents: 3000,
      status: "confirmed",
      confirmedAt: new Date(),
      // Já expirada pelo TTL — a guarda antiga (getConfirmedPaymentAttempt) a ignorava.
      expiresAt: new Date(Date.now() - 60_000)
    }
  });
  const out = await send(phone, "cancelar");
  assert.equal(out, copy.cardPaymentProcessing());
  const order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "awaiting_payment", "pedido não pode ser cancelado com cobrança em voo");
});

// ---------- total volta à base quando a emissão do cartão falha ----------

test("cartão que falha na emissão não deixa a taxa gravada: o Pix seguinte sai no total base", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await orderInStep("awaiting_quote_confirmation", {
    quoteExpiresAt: new Date(Date.now() + 10 * 60_000),
    notes: "Cotação manual enviada."
  });
  await withRealCredsAnd(failingFetch, () => send(phone, "cartão"));
  let order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "awaiting_quote_confirmation");
  assert.equal(order.total, 30, "o gross-up do cartão não pode sobreviver à falha");

  const bodies: Record<string, unknown>[] = [];
  const capturingPixFetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ id: 555, point_of_interaction: { transaction_data: { qr_code: "00020126PIX-555" } } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof globalThis.fetch;
  await withRealCredsAnd(capturingPixFetch, () => send(phone, "pix"));
  order = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(order.status, "awaiting_payment");
  assert.equal(order.total, 30);
  assert.equal(bodies[0]?.transaction_amount, 30, "o Pix é cobrado na base, sem taxa de cartão");
});
