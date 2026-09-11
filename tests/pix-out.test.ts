import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { recordPayment, refundOrderViaProvider } from "../src/lib/payments/ledger";
import { ensurePurchaseJobForPaidOrder } from "../src/lib/purchase-worker";
import {
  savePurchaseAccount, claimPurchaseSession, stageCheckout, beginPurchase, capturePix, pixPayoutStatus,
  approveReceiverAndPay, settlePixPayouts, retryAfterPixFailure, finishPurchase, type CheckoutEvidence,
} from "../src/lib/purchase-execution";
import { crc16, parsePixEmv, findPixCode, pixCodeHash } from "../src/lib/pix-emv";
import { mockPixOutCalls } from "../src/lib/payments/pix-out/mock";
import { opsActionButtonId } from "../src/lib/ops-actions";
import { handleOperatorInbound } from "../src/lib/ops-actions-inbound";

process.env.OPS_TOKEN ??= "unit-ops-token";
process.env.LIA_OPERATOR_PHONE = "+5511999990000";
process.env.LIA_PIX_OUT_PROVIDER = "mock";
delete process.env.LIA_PIX_OUT_OFF;
const OPERATOR = "+5511999990000";
const STORE = "swift";
const users: string[] = [];
let sequence = 0;

// BR Code dinâmico sintético (URL do PSP em 26-25), valor em 54, CRC real.
function emv(amount: string, opts: { dynamic?: boolean; txid?: string } = {}) {
  const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;
  const account = tlv("26", tlv("00", "br.gov.bcb.pix") + (opts.dynamic === false ? tlv("01", "chave@example.test") : tlv("25", "pix.psp.example/qr/v2/abc123")));
  const body = tlv("00", "01") + tlv("01", "12") + account + tlv("52", "0000") + tlv("53", "986") + tlv("54", amount) + tlv("58", "BR") + tlv("59", "PSP DA LOJA LTDA") + tlv("60", "SAO PAULO") + tlv("62", tlv("05", opts.txid ?? "LIA123")) + "6304";
  return body + crc16(body);
}

async function paidOrder() {
  const user = await prisma.user.create({ data: { phone: `+55090955${process.pid}${++sequence}`, name: "Cliente Pix" } });
  users.push(user.id);
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id, phone: user.phone, status: "paid", storeKey: STORE, storeLabel: STORE, customerName: "Cliente Pix",
      items: [{ sku: `${STORE}-5007`, name: "Carne", qty: 2, unitPrice: 10, lineTotal: 20, storeKey: STORE, storeLabel: STORE, productUrl: `https://www.${STORE}.com.br/carne/p` }],
      itemsSubtotal: 20, deliveryFee: 8, serviceFee: 2, total: 30, cep: "01310-100",
      deliveryAddress: "Rua Teste, 10, apto 2, Centro, São Paulo - SP", paidAt: new Date(Date.now() - 60_000), courierKey: "retailer_delivery",
    },
  });
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: `pixout-${process.pid}-${sequence}`, amountCents: 3000, status: "approved", method: "pix" });
  return order;
}
async function session() {
  const order = await paidOrder();
  await ensurePurchaseJobForPaidOrder(order.id);
  const job = await claimPurchaseSession("pix-tests", [STORE]);
  assert.ok(job);
  const evidence: CheckoutEvidence = {
    recipientName: order.customerName!, accountEmail: "compras@example.test", checkoutUrl: `https://www.${STORE}.com.br/checkout/`,
    cartHash: job.cartHash!, destination: order.deliveryAddress!, postalCode: order.cep!, deliveryOption: "NORMAL",
    deliveryPromise: "prazo da loja: 1 dia útil", payment: { kind: "pix_store", paymentSystem: 125 }, observedAt: new Date().toISOString(),
    items: [{ sku: `${STORE}-5007`, retailerSku: "5007", seller: "1", name: "Carne", qty: 2, unitPriceCents: 1000, lineTotalCents: 2000 }],
    freightCents: 800, totalCents: 2800,
  };
  const args = [job.jobId, "pix-tests", job.claimToken] as const;
  assert.equal((await stageCheckout(...args, evidence)).readyToSubmit, true);
  const permit = await beginPurchase(...args, evidence);
  assert.ok(permit.submissionId);
  return { order, job, args, submissionId: permit.submissionId! };
}
const oldStores = process.env.LIA_AUTO_PURCHASE_STORES;
process.env.LIA_AUTO_PURCHASE_STORES = STORE;
after(async () => {
  if (oldStores === undefined) delete process.env.LIA_AUTO_PURCHASE_STORES; else process.env.LIA_AUTO_PURCHASE_STORES = oldStores;
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.purchaseReceiver.deleteMany({ where: { storeKey: STORE } });
  await prisma.purchaseAccount.deleteMany({ where: { storeKey: STORE } });
  await prisma.$disconnect();
});

test("EMV: CRC, valor, dinâmico × estático, localizar no texto", () => {
  const code = emv("28.00");
  const parsed = parsePixEmv(code);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.amountCents, 2800);
  assert.equal(parsed.dynamic, true);
  assert.equal(parsed.txid, "LIA123");
  assert.equal(parsePixEmv(code.slice(0, -1) + (code.endsWith("0") ? "1" : "0")).crcOk, false);
  assert.equal(parsePixEmv(emv("5.00", { dynamic: false })).dynamic, false);
  assert.equal(findPixCode(`Copie o código: ${code} e pague`), code);
  assert.equal(pixCodeHash(code).length, 64);
});

test("Pix da loja: recebedor novo pede um toque; aprovado paga UMA vez; loja confirma pelo comprovante", async () => {
  await savePurchaseAccount({ storeKey: STORE, email: "compras@example.test", loginReady: true, paymentReady: true, enabled: true, paymentKind: "pix_out" });
  await prisma.purchaseSpend.updateMany({ data: { budgetDay: "2000-01-01" } });
  const { order, job, args, submissionId } = await session();
  const code = emv("28.00");
  // Valor divergente nunca paga.
  await assert.rejects(capturePix(...args, submissionId, emv("29.00")), /Valor/);
  // Estático nunca paga.
  await assert.rejects(capturePix(...args, submissionId, emv("28.00", { dynamic: false })), /dinâmica/);
  const before = mockPixOutCalls.pay;
  const captured = await capturePix(...args, submissionId, code);
  assert.equal(captured.status, "awaiting_receiver");
  assert.equal(mockPixOutCalls.pay, before, "sem toque do dono não sai dinheiro");
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } })).status, "pix_captured");
  // Estorno bloqueado com pagamento em curso.
  await assert.rejects(refundOrderViaProvider(order.id), /Reconcilie/);
  const action = await prisma.opsAction.findFirstOrThrow({ where: { purchaseJobId: job.jobId, kind: "receiver_new", status: "pending" } });
  assert.equal(await handleOperatorInbound(OPERATOR, opsActionButtonId(action, "pay")!), "handled");
  assert.equal((await prisma.purchaseReceiver.findFirstOrThrow({ where: { storeKey: STORE, receiverDoc: "12345678000199" } })).status, "approved");
  // O navegador, ainda com o modal aberto, reenvia o código e o servidor paga.
  const paid = await approveReceiverAndPay(job.jobId, code, "wa");
  assert.equal(paid.status, "paid");
  assert.equal(mockPixOutCalls.pay, before + 1);
  await assert.rejects(approveReceiverAndPay(job.jobId, code), /não está aguardando/);
  const payout = await prisma.pixPayout.findUniqueOrThrow({ where: { purchaseJobId: job.jobId } });
  assert.equal(payout.status, "paid");
  assert.ok(payout.endToEndId);
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } })).status, "pix_paid");
  assert.equal((await pixPayoutStatus(...args, submissionId)).status, "paid");
  await finishPurchase(...args, { submissionId, storeOrderNumber: "SWIFT-1", actualTotalCents: 2800 });
  assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "retailer_preparing");
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } })).status, "completed");
  // Recebedor já memorizado: a próxima compra da mesma loja paga sem toque.
  const second = await session();
  const direct = await capturePix(...second.args, second.submissionId, emv("28.00", { txid: "LIA456" }));
  assert.equal(direct.status, "paid");
  assert.equal(mockPixOutCalls.pay, before + 2);
  await prisma.purchaseJob.update({ where: { id: second.job.jobId }, data: { status: "canceled" } });
});

test("Pix da loja: timeout do banco = resultado desconhecido, nunca segunda chamada; recusa = Refazer libera reserva", async () => {
  await prisma.purchaseSpend.updateMany({ data: { budgetDay: "2000-01-01" } });
  process.env.LIA_PIX_OUT_MOCK_MODE = "timeout";
  try {
    const { job, args, submissionId } = await session();
    const before = mockPixOutCalls.pay;
    const outcome = await capturePix(...args, submissionId, emv("28.00", { txid: "T1" }));
    assert.equal(outcome.status, "unknown");
    assert.equal(mockPixOutCalls.pay, before + 1);
    const stuck = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } });
    assert.equal(stuck.status, "outcome_unknown");
    await assert.rejects(capturePix(...args, submissionId, emv("28.00", { txid: "T1" })), /fora da tentativa|Já existe/);
    assert.equal(mockPixOutCalls.pay, before + 1, "timeout nunca gera segunda chamada");
    await prisma.purchaseJob.update({ where: { id: job.jobId }, data: { status: "canceled" } });
  } finally {
    delete process.env.LIA_PIX_OUT_MOCK_MODE;
  }
  process.env.LIA_PIX_OUT_MOCK_MODE = "refused";
  try {
    const { job, args, submissionId } = await session();
    const outcome = await capturePix(...args, submissionId, emv("28.00", { txid: "R1" }));
    assert.equal(outcome.status, "refused");
    const review = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } });
    assert.equal(review.status, "needs_review");
    const action = await prisma.opsAction.findFirstOrThrow({ where: { purchaseJobId: job.jobId, kind: "pix_failed", status: "pending" } });
    assert.equal(await handleOperatorInbound(OPERATOR, opsActionButtonId(action, "retry")!), "handled");
    const requeued = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } });
    assert.equal(requeued.status, "queued");
    assert.equal(await prisma.pixPayout.count({ where: { purchaseJobId: job.jobId } }), 0);
    assert.equal((await prisma.purchaseSpend.findUniqueOrThrow({ where: { submissionId } })).status, "released");
    await assert.rejects(retryAfterPixFailure(job.jobId), /Só é possível/);
    await prisma.purchaseJob.update({ where: { id: job.jobId }, data: { status: "canceled" } });
  } finally {
    delete process.env.LIA_PIX_OUT_MOCK_MODE;
  }
});

test("Pix da loja: cron concilia pagamento pendente e avisa loja em silêncio", async () => {
  await prisma.purchaseSpend.updateMany({ data: { budgetDay: "2000-01-01" } });
  process.env.LIA_PIX_OUT_MOCK_MODE = "pending";
  const { job, args, submissionId } = await session();
  const outcome = await capturePix(...args, submissionId, emv("28.00", { txid: "P1" }));
  assert.equal(outcome.status, "submitted");
  process.env.LIA_PIX_OUT_MOCK_MODE = "paid";
  await prisma.pixPayout.update({ where: { purchaseJobId: job.jobId }, data: { submittedAt: new Date(Date.now() - 60_000) } });
  const report = await settlePixPayouts();
  assert.equal(report.settled, 1);
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } })).status, "pix_paid");
  await prisma.purchaseJob.update({ where: { id: job.jobId }, data: { updatedAt: new Date(Date.now() - 40 * 60_000) } });
  const silent = await settlePixPayouts();
  assert.equal(silent.silent, 1);
  assert.equal(await prisma.opsAction.count({ where: { purchaseJobId: job.jobId, kind: "store_silent", status: "pending" } }), 1);
  assert.equal((await settlePixPayouts()).silent, 0, "um aviso por vez");
  // "Confirmar" pede o número; o número fecha a compra pelo mesmo caminho do ML.
  const action = await prisma.opsAction.findFirstOrThrow({ where: { purchaseJobId: job.jobId, kind: "store_silent", status: "pending" } });
  assert.equal(await handleOperatorInbound(OPERATOR, opsActionButtonId(action, "confirm")!), "handled");
  assert.equal(await handleOperatorInbound(OPERATOR, "778899001"), "handled");
  assert.equal((await prisma.purchaseJob.findUniqueOrThrow({ where: { id: job.jobId } })).status, "completed");
  delete process.env.LIA_PIX_OUT_MOCK_MODE;
});

test("kill-switch LIA_PIX_OUT_OFF bloqueia a captura antes de qualquer chamada", async () => {
  process.env.LIA_PIX_OUT_OFF = "true";
  try {
    await prisma.purchaseSpend.updateMany({ data: { budgetDay: "2000-01-01" } });
    const { job, args, submissionId } = await session();
    await assert.rejects(capturePix(...args, submissionId, emv("28.00", { txid: "K1" })), /pausado/);
    await prisma.purchaseJob.update({ where: { id: job.jobId }, data: { status: "canceled" } });
  } finally {
    delete process.env.LIA_PIX_OUT_OFF;
  }
});
