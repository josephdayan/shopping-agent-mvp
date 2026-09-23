// Financeiro por pedido (23/09/2026): P&L automático por pedido — o que o cliente pagou,
// taxa do provedor (real ou estimada), custo real na loja (comprovante) e o que sobrou.
// Parte pura (computeOrderPnl / CSV / leitura das taxas do MP) + parte com banco
// (registro do custo real, backfill da taxa, leitura consolidada).
import "./helpers/load-env";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { computeOrderPnl, estimatedProviderFee, loadPnl, pnlCsv, pnlMonthKey, summarizePnl, type PnlOrderInput } from "../src/lib/pnl";
import { mercadoPagoFees } from "../src/lib/payments/mercadopago";
import { backfillPaymentFees, recordPayment } from "../src/lib/payments/ledger";
import { opsSetStoreCost } from "../src/lib/ops-lifecycle";

const PREFIX = `+5507${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
let phoneSeq = 0;
let dbOk = false;
const realFetch = globalThis.fetch;

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}

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

function baseOrder(over: Partial<PnlOrderInput> = {}): PnlOrderInput {
  return {
    id: "ckorderabc123",
    createdAt: new Date("2026-09-20T12:00:00Z"),
    paidAt: new Date("2026-09-20T12:05:00Z"),
    deliveredAt: null,
    status: "retailer_preparing",
    customerName: "Ana",
    phone: "+5511999991234",
    storeLabel: "Cobasi",
    storeOrderNumber: "CB-1",
    itemsSubtotal: 100,
    deliveryFee: 12.9,
    serviceFee: 10,
    total: 122.9,
    storePaidTotal: null,
    payments: [{ provider: "mercadopago", method: "pix", status: "approved", amountCents: 12290, refundedCents: 0, feeCents: null }],
    purchaseJobs: [],
    ...over
  };
}

// ---------- puro ----------

test("Pix com taxa real lida do MP: sobrou = pagou − taxa − custo real do comprovante", () => {
  const row = computeOrderPnl(
    baseOrder({
      storePaidTotal: 111.5,
      payments: [{ provider: "mercadopago", method: "pix", status: "approved", amountCents: 12290, refundedCents: 0, feeCents: 122 }]
    })
  );
  assert.equal(row.customerPaid, 122.9);
  assert.equal(row.providerFee, 1.22);
  assert.equal(row.providerFeeEstimated, false);
  assert.equal(row.netReceived, 121.68);
  assert.equal(row.storeCost, 111.5);
  assert.equal(row.storeCostEstimated, false);
  assert.equal(row.storeCostQuoted, 112.9);
  assert.equal(row.markup, 10);
  assert.equal(row.cardSurcharge, 0);
  assert.equal(row.profit, 10.18);
  assert.equal(row.profitPct, 8.28);
  assert.equal(row.method, "pix");
  assert.equal(row.customer, "Ana (…1234)");
  assert.equal(row.shortId, "ABC123");
});

test("sem taxa lida e sem comprovante: estima pela alíquota e pela cotação, e MARCA como estimado", () => {
  const row = computeOrderPnl(baseOrder());
  // 0,99% de 122,90 = 1,22
  assert.equal(row.providerFee, 1.22);
  assert.equal(row.providerFeeEstimated, true);
  assert.equal(row.storeCost, 112.9);
  assert.equal(row.storeCostEstimated, true);
  assert.equal(row.profit, 8.78);
});

test("alíquota estimada vem do env; mock nunca tem taxa", async () => {
  await withEnv({ LIA_MP_PIX_FEE_RATE: "0.02", LIA_MP_CARD_FEE_RATE: "0.05" }, async () => {
    assert.equal(estimatedProviderFee(100, "pix", "mercadopago"), 2);
    assert.equal(estimatedProviderFee(100, "card", "mercadopago"), 5);
    assert.equal(estimatedProviderFee(100, "pix", "mock"), 0);
  });
});

test("cartão: acréscimo repassado ao cliente aparece separado e cobre a taxa estimada", () => {
  // cardTotal(122.9) com MDR 4,99% = 129,35
  const row = computeOrderPnl(
    baseOrder({
      total: 129.35,
      payments: [{ provider: "mercadopago", method: "card", status: "approved", amountCents: 12935, refundedCents: 0, feeCents: null }]
    })
  );
  assert.equal(row.method, "card");
  assert.equal(row.cardSurcharge, 6.45);
  assert.equal(row.providerFeeEstimated, true);
  assert.equal(row.providerFee, 6.45);
  assert.equal(row.profit, 10);
});

test("estorno total sem compra: nada de custo de loja, taxa devolvida, sobrou zero", () => {
  const row = computeOrderPnl(
    baseOrder({
      status: "refunded",
      storeOrderNumber: null,
      payments: [{ provider: "mercadopago", method: "pix", status: "refunded", amountCents: 12290, refundedCents: 12290, feeCents: 122 }]
    })
  );
  assert.equal(row.purchased, false);
  assert.equal(row.refunded, 122.9);
  assert.equal(row.providerFee, 0);
  assert.equal(row.storeCost, 0);
  assert.equal(row.storeCostEstimated, false);
  assert.equal(row.netReceived, 0);
  assert.equal(row.profit, 0);
});

test("pago sem compra ainda: a cotação entra como custo previsto (≈), nunca lucro inteiro", () => {
  const row = computeOrderPnl(baseOrder({ status: "paid", storeOrderNumber: null }));
  assert.equal(row.purchased, false);
  assert.equal(row.open, true);
  assert.equal(row.storeCost, 112.9);
  assert.equal(row.storeCostEstimated, true);
  assert.equal(row.profit, 8.78);
});

test("estorno pedido e não executado: conta como devolvido (≈), taxa zera, sobrou zero", () => {
  const row = computeOrderPnl(
    baseOrder({
      status: "refund_pending",
      storeOrderNumber: null,
      payments: [{ provider: "mercadopago", method: "pix", status: "approved", amountCents: 12290, refundedCents: 0, feeCents: 122 }]
    })
  );
  assert.equal(row.open, true);
  assert.equal(row.refunded, 122.9);
  assert.equal(row.refundEstimated, true);
  assert.equal(row.providerFee, 0);
  assert.equal(row.storeCost, 0);
  assert.equal(row.profit, 0);
  assert.equal(summarizePnl([row])[0].estimated, 1);
});

test("estorno parcial: a parte devolvida não paga taxa", () => {
  const row = computeOrderPnl(
    baseOrder({
      payments: [{ provider: "mercadopago", method: "pix", status: "partially_refunded", amountCents: 10000, refundedCents: 5000, feeCents: 99 }],
      total: 100,
      itemsSubtotal: 80,
      serviceFee: 8,
      deliveryFee: 12,
      storePaidTotal: 40
    })
  );
  assert.equal(row.refunded, 50);
  assert.equal(row.providerFee, 0.5);
  assert.equal(row.netReceived, 49.5);
  assert.equal(row.profit, 9.5);
});

test("pedido pago sem linha no razão (mock antigo) usa o total; compra automática usa o actualTotal do job", () => {
  const row = computeOrderPnl(
    baseOrder({
      payments: [],
      status: "delivered",
      purchaseJobs: [
        { status: "completed", actualTotal: 110.4 },
        { status: "canceled", actualTotal: 999 }
      ]
    })
  );
  assert.equal(row.customerPaid, 122.9);
  assert.equal(row.providerFeeEstimated, true);
  assert.equal(row.storeCost, 110.4);
  assert.equal(row.storeCostEstimated, false);
});

test("pagamento 'unexpected' não entra na receita", () => {
  const row = computeOrderPnl(
    baseOrder({
      payments: [
        { provider: "mercadopago", method: "pix", status: "approved", amountCents: 12290, refundedCents: 0, feeCents: 122 },
        { provider: "mercadopago", method: "pix", status: "unexpected", amountCents: 12290, refundedCents: 0, feeCents: 122 }
      ]
    })
  );
  assert.equal(row.customerPaid, 122.9);
  assert.equal(row.providerFee, 1.22);
});

test("resumo por mês (fuso de São Paulo) soma e conta os estimados; CSV pt-BR com ; e vírgula", () => {
  const a = computeOrderPnl(baseOrder({ id: "a1", paidAt: new Date("2026-09-05T12:00:00Z"), storePaidTotal: 111.5 }));
  // 01/10 00:30 UTC ainda é 30/09 em São Paulo.
  const b = computeOrderPnl(baseOrder({ id: "b2", paidAt: new Date("2026-10-01T00:30:00Z") }));
  const c = computeOrderPnl(baseOrder({ id: "c3", paidAt: new Date("2026-10-01T12:00:00Z") }));
  assert.equal(pnlMonthKey(b.paidAt!), "2026-09");
  const months = summarizePnl([a, b, c]);
  assert.deepEqual(months.map((m) => [m.month, m.orders, m.estimated]), [["2026-10", 1, 1], ["2026-09", 2, 2]]);
  assert.equal(months[1].customerPaid, 245.8);
  assert.equal(months[1].profit, Math.round((a.profit + b.profit) * 100) / 100);

  const csv = pnlCsv([a]);
  assert.ok(csv.startsWith("﻿Pedido;Pago em;"));
  const line = csv.split("\r\n")[1];
  assert.ok(line.includes(";Ana (…1234);Cobasi;CB-1;pix;122,90;0,00;não;1,22;sim;121,68;112,90;111,50;não;12,90;10,00;0,00;10,18;8,28"), line);
});

test("leitura das taxas do corpo do MP: fee_details do collector, ou líquido − bruto, nunca zero chutado", () => {
  assert.deepEqual(
    mercadoPagoFees({ transaction_amount: 100, fee_details: [{ type: "mercadopago_fee", amount: 0.99, fee_payer: "collector" }], transaction_details: { net_received_amount: 99.01 } }),
    { feeAmount: 0.99, netAmount: 99.01 }
  );
  // Taxa paga pelo comprador (parcelamento) não é custo nosso.
  assert.deepEqual(
    mercadoPagoFees({ transaction_amount: 100, fee_details: [{ type: "financing_fee", amount: 3, fee_payer: "payer" }, { type: "mercadopago_fee", amount: 4.99, fee_payer: "collector" }] }),
    { feeAmount: 4.99, netAmount: 95.01 }
  );
  assert.deepEqual(mercadoPagoFees({ transaction_amount: 100, transaction_details: { net_received_amount: 99.01 } }), { feeAmount: 0.99, netAmount: 99.01 });
  assert.deepEqual(mercadoPagoFees({ transaction_amount: 100 }), { feeAmount: null, netAmount: null });
});

// ---------- banco ----------

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

after(async () => {
  globalThis.fetch = realFetch;
  if (!dbOk) return;
  await prisma.deliveryOrder.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

async function paidOrder(status: string, extra: Record<string, unknown> = {}) {
  const phone = newPhone();
  const user = await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: "Rua das Flores, 123, São Paulo - SP" } });
  return prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      customerName: "Teste P&L",
      storeKey: "concierge",
      storeLabel: "Lia",
      items: [{ sku: "x", name: "Ração", qty: 1, unitPrice: 100, lineTotal: 100 }] as unknown as object,
      itemsSubtotal: 100,
      serviceFee: 10,
      deliveryFee: 12.9,
      total: 122.9,
      status,
      paidAt: new Date(),
      ...extra
    }
  });
}

test("custo real: recusa antes da compra, grava depois, anota e aparece no P&L consolidado", async (t) => {
  if (!dbOk) return t.skip("sem banco de teste");
  const order = await paidOrder("paid");
  await assert.rejects(opsSetStoreCost(order.id, 111.5), /depois de confirmar a compra/);
  await assert.rejects(opsSetStoreCost(order.id, -1), /inválido/);

  await prisma.deliveryOrder.update({ where: { id: order.id }, data: { status: "retailer_preparing", storeOrderNumber: "CB-77" } });
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: `9${Date.now()}`, method: "pix", amountCents: 12290, status: "approved", feeCents: 122, netCents: 12168 });
  const updated = await opsSetStoreCost(order.id, 111.5);
  assert.equal(updated.storePaidTotal, 111.5);
  assert.match(updated.notes ?? "", /💰 Custo real na loja: R\$ 111,50/);

  const rows = await loadPnl({ months: 1 });
  const row = rows.find((r) => r.orderId === order.id);
  assert.ok(row, "pedido no P&L");
  assert.equal(row.storeCost, 111.5);
  assert.equal(row.storeCostEstimated, false);
  assert.equal(row.providerFee, 1.22);
  assert.equal(row.providerFeeEstimated, false);
  assert.equal(row.profit, 10.18);
  assert.equal(row.customer, `Teste P&L (…${order.phone.slice(-4)})`);
});

test("backfill: pagamento gravado sem taxa recebe fee/líquido lidos do MP; replay do razão preenche sem apagar", async (t) => {
  if (!dbOk) return t.skip("sem banco de teste");
  const order = await paidOrder("paid");
  const paymentId = `8${Date.now()}`;
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: paymentId, method: "pix", amountCents: 12290, status: "approved" });
  let before = await prisma.payment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: "mercadopago", providerPaymentId: paymentId } } });
  assert.equal(before.feeCents, null);

  // Sem credencial o backfill é no-op (não inventa taxa).
  const noop = await backfillPaymentFees(10);
  before = await prisma.payment.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(before.feeCents, null);
  assert.equal(noop.filled, 0);

  const mpFetch = (async (url: string | URL | Request) => {
    const target = String(url);
    if (!target.endsWith(`/v1/payments/${paymentId}`)) return new Response("{}", { status: 404 });
    return new Response(
      JSON.stringify({
        id: Number(paymentId), status: "approved", transaction_amount: 122.9, external_reference: order.id,
        fee_details: [{ type: "mercadopago_fee", amount: 1.22, fee_payer: "collector" }],
        transaction_details: { net_received_amount: 121.68 }
      }),
      { status: 200 }
    );
  }) as unknown as typeof globalThis.fetch;
  await withEnv({ MERCADO_PAGO_ACCESS_TOKEN: "test-token" }, async () => {
    globalThis.fetch = mpFetch;
    try {
      const report = await backfillPaymentFees(10);
      assert.ok(report.filled >= 1, JSON.stringify(report));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  const after1 = await prisma.payment.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(after1.feeCents, 122);
  assert.equal(after1.netCents, 12168);

  // Replay do webhook sem taxa (ex.: corpo antigo) não zera o que já foi lido.
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: paymentId, method: "pix", amountCents: 12290, status: "approved" });
  const after2 = await prisma.payment.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(after2.feeCents, 122);

  const rows = await loadPnl({ months: 1 });
  const row = rows.find((r) => r.orderId === order.id);
  assert.ok(row);
  assert.equal(row.providerFeeEstimated, false);
  assert.equal(row.storeCost, 112.9); // pago, ainda sem compra: cotação como custo previsto
  assert.equal(row.storeCostEstimated, true);
  assert.equal(row.purchased, false);
  assert.equal(row.open, true);
});
