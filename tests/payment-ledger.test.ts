// Fase 2 da revisão (02/09) — dinheiro de ponta a ponta: razão de pagamentos, estorno
// pelo provedor, Pix expirado, desfecho desconhecido do cartão e mock proibido em produção.
import "./helpers/load-env";
process.env.LIA_OPERATOR_PHONE = "+5511900000000";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { markDeliveryOrderPaid, markPixExpired, opsRefundViaProvider, flagCardOutcomeUnknown } from "../src/lib/delivery-service";
import { PaymentProviderError, pixAdapter, checkoutAdapter, paymentsAreMocked } from "../src/lib/payments/mercadopago";
import { pagarmeAdapter } from "../src/lib/payments/pagarme";
import { reconcilePayments } from "../src/lib/payments/reconcile";
import * as copy from "../src/lib/lia-copy";

const OPERATOR = "+5511900000000";
const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5504${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
const TEST_ADDRESS = "Rua das Flores, 123, Bela Vista, São Paulo - SP";
let phoneSeq = 0;
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

function withEnv<T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return run().finally(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}

function textsTo(to: string, start: number): string {
  return outbox.slice(start).filter((m) => m.to === to).map((m) => m.text).join("\n---\n");
}

async function order(status: string, extra: Partial<{ pixId: string; pixCopiaECola: string; notes: string; paidAt: Date }> = {}) {
  const phone = newPhone();
  const user = await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: TEST_ADDRESS } });
  const row = await prisma.deliveryOrder.create({
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
      notes: extra.notes ?? "Pagamento: Pix",
      status,
      pixId: extra.pixId ?? null,
      pixCopiaECola: extra.pixCopiaECola ?? null,
      paidAt: extra.paidAt ?? null
    }
  });
  return { phone, userId: user.id, orderId: row.id };
}

async function wipeTestData() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await prisma.payment.deleteMany({ where: { deliveryOrder: { userId: { in: ids } } } });
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
    console.warn("⚠️  Banco indisponível — testes do razão de pagamentos serão pulados.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipeTestData();
  await prisma.$disconnect();
});

// ---------- puros ----------

test("produção sem credencial NUNCA gera Pix/link de mentira", async () => {
  await withEnv({ NODE_ENV: "production", VERCEL: "1", MERCADO_PAGO_ACCESS_TOKEN: undefined }, async () => {
    assert.equal(paymentsAreMocked(), false, "mock não existe em produção");
    await assert.rejects(() => pixAdapter.createPix({ orderId: "o1", amount: 10 }), PaymentProviderError);
    await assert.rejects(() => checkoutAdapter.createLink({ orderId: "o1", amount: 10, method: "card" }), PaymentProviderError);
  });
  await withEnv({ NODE_ENV: "test", VERCEL: undefined, MERCADO_PAGO_ACCESS_TOKEN: undefined }, async () => {
    assert.equal(paymentsAreMocked(), true, "dev/teste continua com mock");
  });
});

test("Pagar.me: 4xx da API é 'unavailable' (config), nunca 'cartão recusado'", async () => {
  const fetch422 = (async () => new Response(JSON.stringify({ message: "invalid card_id" }), { status: 422 })) as unknown as typeof globalThis.fetch;
  await withEnv({ PAGARME_SECRET_KEY: "sk_test_x", PAGARME_MOCK: undefined, NODE_ENV: "production" }, async () => {
    globalThis.fetch = fetch422;
    try {
      const result = await pagarmeAdapter.chargeSavedCard({ orderId: "o1", attemptId: "a1", amountCents: 1000, customerId: "c", cardId: "card_x", description: "t" });
      assert.equal(result.status, "unavailable");
      assert.match(result.error ?? "", /422/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// ---------- razão + estorno ----------

test("pagamento aprovado com evidência entra no razão; estorno pelo provedor fecha o pedido com referência automática", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await order("awaiting_payment", { pixId: "777", pixCopiaECola: "00020126PIX-777" });
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "777", amount: 30 });
  const ledger = await prisma.payment.findMany({ where: { deliveryOrderId: orderId } });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, "approved");
  assert.equal(ledger[0].amountCents, 3000);
  assert.equal(ledger[0].method, "pix");

  // Operador abre o estorno (refund_pending) e estorna pela API do MP.
  await prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: "refund_pending" } });
  const calls: { url: string; body: string }[] = [];
  const refundFetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ id: 9001, status: "approved", amount: 30 }), { status: 201 });
  }) as unknown as typeof globalThis.fetch;
  const start = outbox.length;
  await withEnv({ MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-test" }, async () => {
    globalThis.fetch = refundFetch;
    try {
      await opsRefundViaProvider(orderId);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/payments\/777\/refunds$/);
  const after = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(after.status, "refunded");
  assert.match(after.notes ?? "", /ESTORNO CONFIRMADO: integral — MP refund 9001/);
  const paid = await prisma.payment.findFirstOrThrow({ where: { deliveryOrderId: orderId } });
  assert.equal(paid.status, "refunded");
  assert.equal(paid.refundedCents, 3000);
  assert.equal(textsTo(phone, start), copy.refundConfirmed());
});

test("estorno parcial pelo provedor manda o valor e deixa o razão como parcial", async (t) => {
  if (!dbOk) return t.skip();
  const { orderId } = await order("awaiting_payment", { pixId: "778" });
  await markDeliveryOrderPaid(orderId, { provider: "mercadopago", paymentId: "778", amount: 30 });
  await prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: "refund_pending" } });
  const bodies: string[] = [];
  const refundFetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ id: 9002, status: "approved", amount: 12.5 }), { status: 201 });
  }) as unknown as typeof globalThis.fetch;
  await withEnv({ MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-test" }, async () => {
    globalThis.fetch = refundFetch;
    try {
      await opsRefundViaProvider(orderId, 12.5);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  assert.equal(JSON.parse(bodies[0]).amount, 12.5);
  const paid = await prisma.payment.findFirstOrThrow({ where: { deliveryOrderId: orderId } });
  assert.equal(paid.status, "partially_refunded");
  assert.equal(paid.refundedCents, 1250);
  const after = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.match(after.notes ?? "", /parcial R\$ 12,50/);
});

test("sem pagamento no razão, o estorno automático recusa com mensagem legível (caminho manual continua)", async (t) => {
  if (!dbOk) return t.skip();
  const { orderId } = await order("refund_pending", { paidAt: new Date() });
  await assert.rejects(() => opsRefundViaProvider(orderId), /Nenhum pagamento aprovado registrado/);
});

// ---------- Pix expirado ----------

test("Pix vencido: limpa o código, avisa UMA vez e 'pix' depois reemite", async (t) => {
  if (!dbOk) return t.skip();
  const { phone, orderId } = await order("awaiting_payment", { pixId: "779", pixCopiaECola: "00020126PIX-779" });
  const start = outbox.length;
  assert.equal(await markPixExpired(orderId, "779"), true);
  assert.equal(await markPixExpired(orderId, "779"), false, "repetição (cron) é silenciosa");
  const after = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(after.status, "awaiting_payment");
  assert.equal(after.pixId, null);
  assert.equal(after.pixCopiaECola, null);
  assert.match(after.notes ?? "", /PIX EXPIROU \(779\)/);
  assert.equal(textsTo(phone, start), copy.pixExpiredReissue());
});

// ---------- reconciliação ----------

test("cron: tentativa confirmada há 1h sem id do provedor vira desfecho desconhecido + alerta; Pix aprovado no MP paga com evidência", async (t) => {
  if (!dbOk) return t.skip();
  const { userId, orderId, phone } = await order("awaiting_payment", { notes: "Pagamento: cartão salvo" });
  const credential = await prisma.paymentCredential.create({
    data: { userId, providerCustomerId: `cus_${RUN}`, providerCardId: `card_${RUN}_${orderId.slice(-4)}`, last4: "1234", consentAt: new Date() }
  });
  const attempt = await prisma.paymentAttempt.create({
    data: {
      deliveryOrderId: orderId,
      credentialId: credential.id,
      amountCents: 3000,
      status: "confirmed",
      confirmedAt: new Date(Date.now() - 2 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 60 * 60_000)
    }
  });
  const pixOrder = await order("awaiting_payment", { pixId: "780", pixCopiaECola: "00020126PIX-780" });
  const expiredOrder = await order("awaiting_payment", { pixId: "781", pixCopiaECola: "00020126PIX-781" });

  const mpFetch = (async (url: unknown) => {
    const u = String(url);
    if (u.endsWith("/v1/payments/780")) return new Response(JSON.stringify({ id: 780, status: "approved", transaction_amount: 30, external_reference: pixOrder.orderId }), { status: 200 });
    if (u.endsWith("/v1/payments/781")) return new Response(JSON.stringify({ id: 781, status: "cancelled", transaction_amount: 30 }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as unknown as typeof globalThis.fetch;

  const start = outbox.length;
  const report = await withEnv({ MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-test" }, async () => {
    globalThis.fetch = mpFetch;
    try {
      return await reconcilePayments();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  assert.ok(report.attemptsUnknown >= 1, `sem desfecho desconhecido: ${JSON.stringify(report)}`);
  assert.ok(report.pixApproved >= 1, `Pix não aprovado: ${JSON.stringify(report)}`);
  assert.ok(report.pixExpired >= 1, `Pix não expirado: ${JSON.stringify(report)}`);

  const refreshed = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(refreshed.status, "unknown_outcome");
  const cardOrder = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.match(cardOrder.notes ?? "", /DESFECHO DESCONHECIDO/);
  assert.match(textsTo(OPERATOR, start), /DESFECHO DESCONHECIDO/);
  assert.equal(cardOrder.status, "awaiting_payment", "desfecho desconhecido não cobra nem cancela");
  void phone;

  const paidPix = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: pixOrder.orderId } });
  assert.equal(paidPix.status, "paid");
  assert.equal((await prisma.payment.count({ where: { deliveryOrderId: pixOrder.orderId, status: "approved" } })), 1);
  const expired = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: expiredOrder.orderId } });
  assert.equal(expired.pixId, null);
  assert.match(textsTo(expiredOrder.phone, start), /Pix venceu/);
});

test("flagCardOutcomeUnknown é idempotente na nota", async (t) => {
  if (!dbOk) return t.skip();
  const { orderId } = await order("awaiting_payment");
  await flagCardOutcomeUnknown(orderId, "att_x", "teste");
  await flagCardOutcomeUnknown(orderId, "att_x", "teste");
  const after = await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal((after.notes ?? "").split("DESFECHO DESCONHECIDO").length - 1, 1);
});
