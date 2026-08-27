import "./helpers/load-env";
// Modo cartão salvo SEM Meta Payments (decisão de 05/08): flag própria, ligada só aqui.
process.env.LIA_ENABLE_SAVED_CARD = "true";
process.env.PAGARME_MOCK = "true";

import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { detectIntent } from "../src/lib/lia-intents";
import { createCardAttempt, getOneClickCredential } from "../src/lib/payments/whatsapp-pay";
import { handleDeliveryMessage } from "../src/lib/delivery-service";

const suffix = `${Date.now()}_${process.pid}`;
let phoneSeq = 0;
let msgSeq = 0;

const outbox: { to: string; text: string }[] = [];
(whatsappAdapter as { sendMessage: unknown }).sendMessage = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};
(whatsappAdapter as { sendMedia: unknown }).sendMedia = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};

function textsFor(phone: string) {
  return outbox.filter((m) => m.to === phone).map((m) => m.text).join("\n---\n");
}

async function paymentTablesReady(t: { skip: (message?: string) => void }) {
  try {
    const rows = await prisma.$queryRaw<Array<{ tableName: string | null }>>`
      SELECT to_regclass('public."PaymentCredential"')::text AS "tableName"
    `;
    if (rows[0]?.tableName) return true;
  } catch {
    // sem banco → só os testes puros rodam
  }
  t.skip("apply the WhatsApp payment migrations before running DB payment evals");
  return false;
}

async function makeCardOrder() {
  phoneSeq += 1;
  const phone = `+5598${suffix.slice(-7)}${String(phoneSeq).padStart(3, "0")}`;
  const user = await prisma.user.create({ data: { phone, cep: "01310-100" } });
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      storeKey: "concierge",
      storeLabel: "Lia",
      items: [{ sku: "x", name: "Teste", qty: 1, lineTotal: 20 }],
      total: 22,
      status: "awaiting_payment",
      notes: "Pagamento: cartão"
    }
  });
  const credential = await prisma.paymentCredential.create({
    data: {
      userId: user.id,
      providerCustomerId: `customer_${suffix}_${phoneSeq}`,
      providerCardId: `card_${suffix}_${phoneSeq}`,
      last4: "4242"
    }
  });
  return { user, order, credential, phone };
}

async function cleanup(data: Awaited<ReturnType<typeof makeCardOrder>>) {
  await prisma.paymentAttempt.deleteMany({ where: { deliveryOrderId: data.order.id } });
  await prisma.cardEnrollmentSession.deleteMany({ where: { userId: data.user.id } });
  await prisma.paymentCredential.deleteMany({ where: { userId: data.user.id } });
  await prisma.message.deleteMany({ where: { conversation: { userId: data.user.id } } });
  await prisma.deliveryOrder.deleteMany({ where: { userId: data.user.id } });
  await prisma.conversation.deleteMany({ where: { userId: data.user.id } });
  await prisma.user.delete({ where: { id: data.user.id } });
}

async function send(phone: string, text: string) {
  msgSeq += 1;
  await handleDeliveryMessage({ phone, text, messageId: `saved-card-${suffix}-${msgSeq}` });
}

// ---------- intents (puros) ----------

test("cartão salvo: ids de botão e formas humanas viram os intents certos", () => {
  assert.deepEqual(detectIntent("cardpay:clx123abc"), { kind: "saved_card_pay", attemptId: "clx123abc" });
  assert.deepEqual(detectIntent("cardother"), { kind: "saved_card_other" });
  assert.deepEqual(detectIntent("usar cartão"), { kind: "saved_card_pay" });
  assert.deepEqual(detectIntent("usar cartão salvo"), { kind: "saved_card_pay" });
  assert.deepEqual(detectIntent("outro cartão"), { kind: "saved_card_other" });
  assert.deepEqual(detectIntent("trocar de cartão"), { kind: "saved_card_other" });
  // O método genérico continua intacto: "cartão" sozinho é escolha de forma de pagamento.
  assert.deepEqual(detectIntent("cartão"), { kind: "choose_payment", method: "card" });
  assert.deepEqual(detectIntent("pix"), { kind: "choose_payment", method: "pix" });
});

// ---------- fluxo com banco ----------

test("cartão salvo DB: credencial visível com a flag própria, sem LIA_ENABLE_WA_PAYMENTS", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeCardOrder();
  try {
    assert.equal(process.env.LIA_ENABLE_WA_PAYMENTS, undefined);
    const credential = await getOneClickCredential(data.user.id);
    assert.ok(credential, "a flag LIA_ENABLE_SAVED_CARD deve liberar a credencial salva");
    assert.equal(credential!.last4, "4242");
  } finally {
    await cleanup(data);
  }
});

test("cartão salvo DB: toque no botão cobra uma vez, paga o pedido e ignora replay", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeCardOrder();
  try {
    // Oferta: sem provider meta os botões degradam para o texto com as instruções.
    const attempt = await createCardAttempt(data.order, { id: data.credential.id, last4: data.credential.last4 });
    assert.match(textsFor(data.phone), /cart(ã|a)o salvo final \*4242\*/i);
    assert.equal(attempt.status ?? "pending", "pending");

    // Toque no botão (chega como texto com o id) → PAGARME_MOCK aprova → pedido pago.
    await send(data.phone, `cardpay:${attempt.id}`);
    const charged = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    assert.equal(charged.status, "charged");
    assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: data.order.id } })).status, "paid");
    assert.match(textsFor(data.phone), /Pagamento aprovado/i);

    // Replay do mesmo botão: não cobra de novo e não quebra a conversa.
    const before = outbox.length;
    await send(data.phone, `cardpay:${attempt.id}`);
    assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "charged");
    // Nenhuma nova mensagem de aprovação (o pipeline trata como duplicado silencioso).
    const after = outbox.slice(before).map((m) => m.text).join("\n");
    assert.doesNotMatch(after, /Pagamento aprovado/i);
  } finally {
    await cleanup(data);
  }
});

test("cartão salvo DB: 'usar cartão' por texto resolve a tentativa pendente do pedido", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeCardOrder();
  try {
    await createCardAttempt(data.order, { id: data.credential.id, last4: data.credential.last4 });
    await send(data.phone, "usar cartão");
    assert.match(textsFor(data.phone), /Cobrando no cart(ã|a)o final \*4242\*/i);
    assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: data.order.id } })).status, "paid");
  } finally {
    await cleanup(data);
  }
});

test("cartão salvo DB: 'outro cartão' expira a cobrança e manda link novo de cadastro", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeCardOrder();
  try {
    const attempt = await createCardAttempt(data.order, { id: data.credential.id, last4: data.credential.last4 });
    await send(data.phone, "outro cartão");
    assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "expired");
    assert.match(textsFor(data.phone), /cadastra o cart(ã|a)o neste link seguro/i);
    assert.equal((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: data.order.id } })).status, "awaiting_payment");
  } finally {
    await cleanup(data);
  }
});

test("cartão salvo DB: toque sem nada pendente responde honesto", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeCardOrder();
  try {
    await send(data.phone, "usar cartão");
    assert.match(textsFor(data.phone), /N(ã|a)o tem cobran(ç|c)a em aberto/i);
  } finally {
    await cleanup(data);
  }
});

test("cartão salvo DB: com DOIS cartões, a Lia lista os outros e '2' troca a cobrança", async (t) => {
  if (!(await paymentTablesReady(t))) return;
  const data = await makeCardOrder();
  try {
    // segundo cartão, mais antigo que o principal
    const older = await prisma.paymentCredential.create({
      data: {
        userId: data.user.id,
        providerCustomerId: `customer_multi_${suffix}`,
        providerCardId: `card_multi_${suffix}`,
        last4: "5678",
        brand: "Visa",
        createdAt: new Date(Date.now() - 60_000)
      }
    });
    // a conversa precisa estar em awaiting_payment pro "2" significar troca de cartão
    await prisma.conversation.upsert({
      where: { id: `conv_${data.user.id}` },
      update: { context: JSON.stringify({ flow: "delivery", step: "awaiting_payment", deliveryOrderId: data.order.id }) },
      create: {
        id: `conv_${data.user.id}`,
        userId: data.user.id,
        status: "active",
        currentStep: "delivery",
        context: JSON.stringify({ flow: "delivery", step: "awaiting_payment", deliveryOrderId: data.order.id })
      }
    });
    const start = outbox.length;
    await createCardAttempt(
      { id: data.order.id, userId: data.user.id, phone: data.phone, total: data.order.total, status: "awaiting_payment", deliveryFee: 2, items: [] },
      { id: data.credential.id, last4: data.credential.last4 }
    );
    const offered = outbox.slice(start).map((m) => m.text).join("\n");
    assert.match(offered, /Também tenho salvo/i, offered.slice(0, 300));
    assert.match(offered, /5678/);
    // "2" troca a cobrança pro Visa 5678: tentativa antiga expira, nova nasce no outro cartão
    const beforeSwap = outbox.length;
    await send(data.phone, "2");
    const swapped = outbox.slice(beforeSwap).map((m) => m.text).join("\n");
    assert.match(swapped, /5678/, swapped.slice(0, 300));
    const attempts = await prisma.paymentAttempt.findMany({
      where: { deliveryOrderId: data.order.id },
      orderBy: { createdAt: "asc" }
    });
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].status, "expired");
    assert.equal(attempts[1].status, "pending");
    assert.equal(attempts[1].credentialId, older.id);
  } finally {
    await cleanup(data);
  }
});
