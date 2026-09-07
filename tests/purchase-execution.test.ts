import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import {
  recordPayment,
  refundOrderViaProvider,
} from "../src/lib/payments/ledger";
import { ensurePurchaseJobForPaidOrder } from "../src/lib/purchase-worker";
import {
  savePurchaseAccount,
  claimPurchaseSession,
  stageCheckout,
  parkCheckout,
  approveCheckout,
  beginPurchase,
  finishPurchase,
  executionUnknown,
  reconcileEmptyPurchase,
  checkCheckout,
  type CheckoutEvidence,
} from "../src/lib/purchase-execution";
import {
  claimTracking,
  reportTracking,
  explicitTrackingStatus,
  trackingWorkerAuthorized,
} from "../src/lib/tracking-worker";
import { opsCancelRefund } from "../src/lib/ops-lifecycle";
const users: string[] = [];
let sequence = 0;
const store = "kopenhagen";
async function make() {
  const user = await prisma.user.create({
    data: { phone: `+55090688${process.pid}${++sequence}` },
  });
  users.push(user.id);
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone: user.phone,
      status: "paid",
      storeKey: store,
      storeLabel: store,
      items: [
        {
          sku: "kopenhagen-123",
          name: "Chocolate",
          qty: 2,
          unitPrice: 10,
          lineTotal: 20,
          storeKey: store,
          storeLabel: store,
          productUrl: "https://www.kopenhagen.com.br/chocolate/p",
        },
      ],
      itemsSubtotal: 20,
      deliveryFee: 8,
      serviceFee: 2,
      total: 30,
      cep: "01310-100",
      deliveryAddress: "Rua Teste, 10, apto 2, Centro, São Paulo - SP",
      customerName: "Cliente Teste",
      paidAt: new Date(Date.now() - 60000),
      courierKey: "retailer_delivery",
    },
  });
  await recordPayment({
    deliveryOrderId: order.id,
    provider: "mercadopago",
    providerPaymentId: `execution-${process.pid}-${sequence}`,
    amountCents: 3000,
    status: "approved",
    method: "pix",
  });
  return order;
}
async function session() {
  const order = await make();
  await ensurePurchaseJobForPaidOrder(order.id);
  const job = await claimPurchaseSession("execution-tests", [store]);
  assert.ok(job);
  assert.equal(job.orderId, order.id);
  const evidence: CheckoutEvidence = {
    recipientName: order.customerName!,
    accountEmail: "compras@example.test",
    checkoutUrl: "https://www.kopenhagen.com.br/checkout/",
    cartHash: job.cartHash!,
    destination: order.deliveryAddress!,
    postalCode: order.cep!,
    deliveryOption: "NORMAL",
    deliveryPromise: "prazo da loja: 1 dia útil",
    paymentLabel: "Cartão corporativo salvo",
    paymentReference: "a".repeat(64),
    observedAt: new Date().toISOString(),
    items: [
      {
        sku: "kopenhagen-123",
        retailerSku: "123",
        seller: "1",
        name: "Chocolate",
        qty: 2,
        unitPriceCents: 1000,
        lineTotalCents: 2000,
      },
    ],
    freightCents: 800,
    totalCents: 2800,
  };
  return { order, job, evidence };
}
after(async () => {
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.purchaseAccount.deleteMany({ where: { storeKey: store } });
  await prisma.$disconnect();
});
test("conta precisa de e-mail, login e cartão para ativar", async () => {
  await assert.rejects(
    savePurchaseAccount({
      storeKey: store,
      enabled: true,
      loginReady: true,
      paymentReady: true,
    }),
  );
  await savePurchaseAccount({
    storeKey: store,
    email: "compras@example.test",
    enabled: true,
    loginReady: true,
    paymentReady: true,
  });
});
test("conferência rejeita mudança de endereço, quantidade, valor e prazo vencido", async () => {
  const { order, job, evidence } = await session();
  for (const e of [
    { ...evidence, recipientName: "Outra pessoa" },
    { ...evidence, destination: "Outro endereço" },
    { ...evidence, totalCents: 2900 },
    { ...evidence, items: [{ ...evidence.items[0], qty: 3 }] },
    { ...evidence, observedAt: new Date(Date.now() - 180000).toISOString() },
  ])
    assert.throws(() => checkCheckout(order, e));
  await prisma.purchaseJob.update({
    where: { id: job.jobId },
    data: { status: "canceled" },
  });
});
test("aprovação exata permite um único envio; estorno e cancelamento aguardam resultado", async () => {
  const { job, evidence } = await session();
  const args = [job.jobId, "execution-tests", job.claimToken] as const;
  await assert.rejects(beginPurchase(...args, evidence));
  const staged = await stageCheckout(...args, evidence);
  await assert.rejects(approveCheckout(job.jobId, "b".repeat(64)));
  await approveCheckout(job.jobId, staged.checkoutHash);
  assert.equal((await stageCheckout(...args, evidence)).readyToSubmit, true);
  await assert.rejects(
    beginPurchase(...args, { ...evidence, paymentReference: "c".repeat(64) }),
  );
  const results = await Promise.allSettled([
    beginPurchase(...args, evidence),
    beginPurchase(...args, evidence),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const permit = results.find(
    (r) => r.status === "fulfilled",
  ) as PromiseFulfilledResult<{ submissionId: string }>;
  await assert.rejects(refundOrderViaProvider(job.orderId), /Reconcilie/);
  await assert.rejects(opsCancelRefund(job.orderId), /Confira/);
  await executionUnknown(...args, "TEST_INTERRUPTED");
  await assert.rejects(beginPurchase(...args, evidence));
  await assert.rejects(
    finishPurchase(...args, {
      submissionId: permit.value.submissionId,
      storeOrderNumber: "TEST-123",
      actualTotalCents: 2900,
    }),
  );
  const receipt = {
    submissionId: permit.value.submissionId,
    storeOrderNumber: "TEST-123",
    actualTotalCents: 2800,
  };
  await finishPurchase(...args, receipt);
  await finishPurchase(...args, receipt);
  assert.equal(
    await prisma.deliveryEvent.count({
      where: { deliveryOrderId: job.orderId, kind: "bought" },
    }),
    1,
  );
  assert.equal(
    (await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } }))
      .status,
    "completed",
  );
  assert.equal(
    await prisma.trackingSubscription.count({
      where: { deliveryOrderId: job.orderId },
    }),
    1,
  );
});
test("rastreio exige status atual do pedido inteiro e número exato; não inventa etapas", async () => {
  assert.equal(
    explicitTrackingStatus("Previsão: saiu para entrega amanhã"),
    null,
  );
  assert.equal(
    explicitTrackingStatus("Preparando > Saiu para entrega > Entregue"),
    null,
  );
  const poll = async (
    statusText: string,
    wholeOrder = true,
    number = "TEST-123",
  ) => {
    await prisma.trackingSubscription.updateMany({
      where: { storeKey: store },
      data: { nextCheckAt: new Date(0) },
    });
    const job = await claimTracking("reader", [store]);
    assert.ok(job);
    return reportTracking(job.id, "reader", job.claimToken, {
      pageUrl: "https://www.kopenhagen.com.br/account/orders/TEST-123",
      storeOrderNumber: number,
      statusText,
      wholeOrder,
      observedAt: new Date().toISOString(),
    });
  };
  assert.equal((await poll("Entregue", false)).ok, false);
  assert.equal((await poll("Entregue", true, "OTHER")).ok, false);
  assert.equal((await poll("Previsão de entrega amanhã")).changed, false);
  assert.equal((await poll("Saiu para entrega")).changed, true);
  assert.equal((await poll("Entregue")).changed, true);
  const row = await prisma.trackingSubscription.findFirstOrThrow({
    where: { storeKey: store },
  });
  assert.ok(row.completedAt);
  assert.equal(
    (
      await prisma.deliveryOrder.findUniqueOrThrow({
        where: { id: row.deliveryOrderId },
      })
    ).status,
    "delivered",
  );
});
test("leitor não aceita token de operações ou do comprador", () => {
  process.env.LIA_TRACKING_WORKER_TOKEN = "reader-secret";
  assert.equal(
    trackingWorkerAuthorized(
      new Request("https://example.test", {
        headers: { authorization: "Bearer other-secret" },
      }),
    ),
    false,
  );
  assert.equal(
    trackingWorkerAuthorized(
      new Request("https://example.test", {
        headers: { authorization: "Bearer reader-secret" },
      }),
    ),
    true,
  );
  delete process.env.LIA_TRACKING_WORKER_TOKEN;
});
test("recuperação exige sessão encerrada, audita conferência e invalida token antigo", async () => {
  const { job, evidence } = await session();
  const args = [job.jobId, "execution-tests", job.claimToken] as const;
  await stageCheckout(...args, evidence);
  await executionUnknown(...args, "TEST");
  await assert.rejects(
    reconcileEmptyPurchase(
      job.jobId,
      "Sem pedido nem cobrança; carrinho esvaziado",
    ),
  );
  await prisma.purchaseJob.update({
    where: { id: job.jobId },
    data: { lockedAt: new Date(Date.now() - 180000) },
  });
  await reconcileEmptyPurchase(
    job.jobId,
    "Sem pedido nem cobrança; carrinho esvaziado",
  );
  await assert.rejects(stageCheckout(...args, evidence));
  assert.equal(
    await prisma.purchaseAttempt.count({
      where: { purchaseJobId: job.jobId, step: "reconcile_empty" },
    }),
    1,
  );
  await prisma.purchaseJob.update({
    where: { id: job.jobId },
    data: { status: "canceled" },
  });
});

test("rastreio inclui compra anterior à migration sem inventar evento", async () => {
  const order = await make();
  await prisma.deliveryOrder.update({
    where: { id: order.id },
    data: { status: "retailer_preparing", storeOrderNumber: "LEGACY-1" },
  });
  const job = await claimTracking("legacy-reader", [store]);
  assert.ok(job);
  assert.equal(job.storeOrderNumber, "LEGACY-1");
  assert.equal(
    await prisma.deliveryEvent.count({ where: { deliveryOrderId: order.id } }),
    0,
  );
  await reportTracking(job.id, "legacy-reader", job.claimToken, {
    error: "Loja indisponível",
  });
});

test("aprovação horas depois sobrevive sem navegador; carrinho diferente pede nova aprovação", async () => {
  const { job, evidence } = await session();
  const args = [job.jobId, "execution-tests", job.claimToken] as const;
  await stageCheckout(...args, evidence);
  await parkCheckout(...args);
  await prisma.purchaseJob.update({
    where: { id: job.jobId },
    data: {
      checkoutExpiresAt: new Date(Date.now() - 3600000),
      checkoutEvidence: {
        ...evidence,
        observedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    },
  });
  const other = await session();
  assert.notEqual(
    other.job.jobId,
    job.jobId,
    "Pedido estacionado não ocupa o carrinho",
  );
  await prisma.purchaseJob.update({
    where: { id: other.job.jobId },
    data: { status: "canceled" },
  });
  await approveCheckout(
    job.jobId,
    (await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } }))
      .checkoutHash!,
  );
  assert.equal(
    (await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } }))
      .approvalExpiresAt,
    null,
  );
  const resumed = await claimPurchaseSession("resumed-worker", [store]);
  assert.ok(resumed);
  assert.equal(resumed.jobId, job.jobId);
  const resume = [job.jobId, "resumed-worker", resumed.claimToken] as const;
  await assert.rejects(beginPurchase(...resume, evidence), /autorização atual/);
  const changed = {
    ...evidence,
    freightCents: 700,
    totalCents: 2700,
    observedAt: new Date().toISOString(),
  };
  const staged = await stageCheckout(...resume, changed);
  assert.equal(staged.readyToSubmit, false);
  await assert.rejects(beginPurchase(...resume, changed));
  await approveCheckout(job.jobId, staged.checkoutHash);
  assert.equal((await stageCheckout(...resume, changed)).readyToSubmit, true);
  const permit = await beginPurchase(...resume, changed);
  assert.ok(permit.submissionId);
  await prisma.purchaseJob.update({
    where: { id: job.jobId },
    data: { status: "canceled" },
  });
});
test("aprovação durante liberação do carrinho não se perde", async () => {
  const { job, evidence } = await session();
  const args = [job.jobId, "execution-tests", job.claimToken] as const;
  const staged = await stageCheckout(...args, evidence);
  await approveCheckout(job.jobId, staged.checkoutHash);
  await parkCheckout(...args);
  const resumed = await claimPurchaseSession("reconnected", [store]);
  assert.ok(resumed);
  assert.equal(resumed.jobId, job.jobId);
  const next = [job.jobId, "reconnected", resumed.claimToken] as const;
  await assert.rejects(
    stageCheckout(...next, {
      ...evidence,
      observedAt: new Date(Date.now() - 3600000).toISOString(),
    }),
    /vencida/,
  );
  assert.equal(
    (
      await stageCheckout(...next, {
        ...evidence,
        observedAt: new Date().toISOString(),
      })
    ).readyToSubmit,
    true,
  );
  await prisma.purchaseJob.update({
    where: { id: job.jobId },
    data: { status: "canceled" },
  });
});
