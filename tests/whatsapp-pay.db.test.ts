import "./helpers/load-env";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { pagarmeAdapter } from "../src/lib/payments/pagarme";
import { handlePaymentConfirmation } from "../src/lib/payments/whatsapp-pay";

const suffix = `${Date.now()}_${process.pid}`;

async function paymentTablesReady(t: { skip: (message?: string) => void }) {
  try {
    const rows = await prisma.$queryRaw<Array<{ tableName: string | null }>>`
      SELECT to_regclass('public."PaymentCredential"')::text AS "tableName"
    `;
    if (rows[0]?.tableName) return true;
  } catch {
    // The test database may be intentionally absent in a pure unit-test run.
  }
  t.skip("apply the WhatsApp payment migrations before running DB payment evals");
  return false;
}

async function makeAttempt(expiresAt = new Date(Date.now() + 60_000)) {
  const phone = `+5599${suffix.slice(-8)}${Math.floor(Math.random() * 10_000).toString().padStart(4, "0")}`;
  const user = await prisma.user.create({ data: { phone } });
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      storeKey: "boticario", // keeps the test out of the purchase workflow
      storeLabel: "O Boticário",
      items: [],
      total: 20,
      status: "awaiting_payment"
    }
  });
  const credential = await prisma.paymentCredential.create({
    data: {
      userId: user.id,
      providerCustomerId: `customer_${suffix}`,
      providerCardId: `card_${suffix}`,
      last4: "5235"
    }
  });
  const attempt = await prisma.paymentAttempt.create({
    data: { deliveryOrderId: order.id, credentialId: credential.id, amountCents: Math.round(order.total * 100), expiresAt }
  });
  return { user, order, credential, attempt };
}

async function removeAttempt(data: Awaited<ReturnType<typeof makeAttempt>>) {
  await prisma.paymentAttempt.deleteMany({ where: { deliveryOrderId: data.order.id } });
  await prisma.paymentCredential.deleteMany({ where: { userId: data.user.id } });
  await prisma.deliveryOrder.delete({ where: { id: data.order.id } });
  await prisma.user.delete({ where: { id: data.user.id } });
}

test("One-Click DB: confirmação duplicada cobra uma vez e paga o pedido", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeAttempt();
  const originalCharge = pagarmeAdapter.chargeSavedCard;
  const originalSendMessage = whatsappAdapter.sendMessage;
  let charges = 0;
  (pagarmeAdapter as { chargeSavedCard: typeof pagarmeAdapter.chargeSavedCard }).chargeSavedCard = async () => {
    charges += 1;
    return { status: "captured", providerOrderId: "mock_order", providerChargeId: "mock_payment", mock: true };
  };
  (whatsappAdapter as { sendMessage: typeof whatsappAdapter.sendMessage }).sendMessage = async () => ({ provider: "test" } as any);
  try {
    await Promise.all([
      handlePaymentConfirmation({ referenceId: data.attempt.id, credentialId: data.credential.id, last4: "5235", status: "confirmed" }),
      handlePaymentConfirmation({ referenceId: data.attempt.id, credentialId: data.credential.id, last4: "5235", status: "confirmed" })
    ]);
    assert.equal(charges, 1);
    assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: data.attempt.id } })).status, "charged");
    assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: data.order.id } })).status, "paid");
  } finally {
    (pagarmeAdapter as { chargeSavedCard: typeof pagarmeAdapter.chargeSavedCard }).chargeSavedCard = originalCharge;
    (whatsappAdapter as { sendMessage: typeof whatsappAdapter.sendMessage }).sendMessage = originalSendMessage;
    await removeAttempt(data);
  }
});

test("One-Click DB: confirmação expirada não chama o PSP", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeAttempt(new Date(Date.now() - 1_000));
  const originalCharge = pagarmeAdapter.chargeSavedCard;
  let charges = 0;
  (pagarmeAdapter as { chargeSavedCard: typeof pagarmeAdapter.chargeSavedCard }).chargeSavedCard = async () => {
    charges += 1;
    return { status: "captured", providerOrderId: "unexpected", providerChargeId: "unexpected", mock: true };
  };
  try {
    await handlePaymentConfirmation({ referenceId: data.attempt.id, credentialId: data.credential.id, last4: "5235", status: "confirmed" });
    assert.equal(charges, 0);
    assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: data.attempt.id } })).status, "expired");
    assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: data.order.id } })).status, "awaiting_payment");
  } finally {
    (pagarmeAdapter as { chargeSavedCard: typeof pagarmeAdapter.chargeSavedCard }).chargeSavedCard = originalCharge;
    await removeAttempt(data);
  }
});
