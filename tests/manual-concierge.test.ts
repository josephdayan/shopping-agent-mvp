// End-to-end eval for the manual concierge flow (the pilot's production default):
// breadth (anything, even non-catalog), operator hand-quote, payment reusing the
// retailer-quote machinery, and same-hour dispatch by a courier that leaves the
// OPERATOR's base (not a store counter). Uses the real DB + mock WhatsApp/Pix/courier.
import "./helpers/load-env";
// This file exercises the concierge flow, so re-enable the flag the shared helper pins off.
process.env.LIA_MANUAL_CONCIERGE = "true";
process.env.LIA_OPERATOR_PICKUP_ADDRESS = "Rua da Base, 10, São Paulo - SP";
process.env.LIA_OPERATOR_PICKUP_CEP = "01310-100";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import {
  handleDeliveryMessage,
  markDeliveryOrderPaid,
  opsPublishManualQuote,
  opsMarkBought,
  opsDispatchCourier,
  opsMarkDelivered,
  opsCancelRefund,
  opsConfirmRefund
} from "../src/lib/delivery-service";
import { isOperatorCourierOrder } from "../src/lib/order-flags";

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5501${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
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

function newPhone(): string {
  const digits = `${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(3, "0")}`.slice(-10);
  return `${PREFIX}${digits}`;
}

function driver(phone: string) {
  async function send(text: string): Promise<string> {
    const start = outbox.length;
    await handleDeliveryMessage({ phone, text, messageId: `mc_${RUN}_${++msgSeq}` });
    return outbox
      .slice(start)
      .filter((m) => m.to === phone)
      .map((m) => m.text)
      .join("\n---\n");
  }
  return { send };
}

async function returningCustomer() {
  const phone = newPhone();
  const user = await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: TEST_ADDRESS } });
  return { phone, userId: user.id, ...driver(phone) };
}

async function wipeTestData() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
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
  } catch {
    dbOk = false;
    console.warn("⚠️  Banco indisponível — evals concierge serão pulados.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipeTestData();
  await prisma.$disconnect();
});

test("breadth: itens fora de qualquer catálogo são anotados, não recusados", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const noted = await c.send("um carregador de celular e 2 cadernos universitários");
  assert.match(noted, /Anotei/i);
  assert.match(noted.toLowerCase(), /carregador/);
  assert.match(noted.toLowerCase(), /caderno/);
  // Nunca cai no "não achei no catálogo" do fluxo legado.
  assert.doesNotMatch(noted, /não achei|catálogo de hoje/i);
});

// ---------- vitrine híbrida (03/08) ----------
// O concierge procura na vitrine e mostra opções com foto; o que não tem match vira linha
// livre. Estes testes travam as três regras que fazem isso não virar um passo atrás.

test("vitrine híbrida: item da vitrine vira opção pra escolher, item de fora vira linha livre", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("quero coca cola e um vedante pra torneira");
  // A coca existe na vitrine → opções numeradas.
  assert.match(out, /op(ç|c)(õ|o)es/i);
  assert.match(out.toLowerCase(), /coca/);
  // O vedante não existe → anotado como linha livre, nunca recusado.
  assert.match(out.toLowerCase(), /garimpar|anotei/);
  assert.match(out.toLowerCase(), /vedante|torneira/);
  assert.doesNotMatch(out, /não achei/i);
});

test("vitrine híbrida: escolher NÃO fecha a lista — o cliente ainda soma itens", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("quero coca cola");
  const afterChoice = await c.send("1");
  // Pode cair na pergunta de quantidade (qty implícita) — responde e segue.
  const settled = /quantas unidades/i.test(afterChoice) ? await c.send("2") : afterChoice;
  // A lista continua aberta: convida a somar mais e a fechar com "só isso".
  assert.match(settled, /mais alguma coisa/i);
  assert.match(settled, /só isso/i);
  // E NÃO foi para a fila de cotação ainda.
  assert.doesNotMatch(settled, /Recebi seu pedido/i);
  const order = await prisma.deliveryOrder.findFirst({ where: { phone: c.phone } });
  assert.equal(order, null, "a lista não pode virar pedido antes de o cliente fechar");
});

test("vitrine híbrida: fechar a lista com escolha pendente NÃO descarta o item", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("quero coca cola");
  // Fecha a lista no meio das opções, sem escolher.
  const closed = await c.send("só isso");
  assert.match(closed, /Recebi seu pedido/i);
  assert.match(closed.toLowerCase(), /coca/, "o item pendente tem de sobreviver como linha livre");
  const order = await prisma.deliveryOrder.findFirst({ where: { phone: c.phone } });
  assert.ok(order, "pedido deve existir");
  const items = (order!.items as unknown as { name: string }[]) ?? [];
  assert.ok(
    items.some((i) => /coca/i.test(i.name)),
    `o pedido precisa conter a coca; veio: ${JSON.stringify(items.map((i) => i.name))}`
  );
});

// ---------- onboarding: o endereço não pode virar lista de compras (06/08) ----------
// Achados ao validar a busca numa conversa real: o jeito mais natural de responder
// ("Av. Paulista 1000, apto 5, Bela Vista, São Paulo, 01310-100") caía no parser de
// itens e a Lia respondia "Já anotei: 1x apto 5" — e ainda pedia o endereço de novo.

test("onboarding: endereço com CEP na mesma mensagem é salvo (não vira '1x apto 5')", async (t) => {
  if (!dbOk) return t.skip();
  const phone = newPhone();
  const c = driver(phone);
  const out = await c.send("Av. Paulista 1000, apto 5, Bela Vista, São Paulo, 01310-100");
  assert.match(out, /Endere(ç|c)o salvo/i);
  // O texto do endereço nunca pode aparecer como item anotado.
  assert.doesNotMatch(out, /1x apto|1x Av|Já anotei/i);
  // E vai pro courier como o cliente escreveu — com acento, maiúscula e vírgula.
  const user = await prisma.user.findUnique({ where: { phone } });
  assert.equal(user?.defaultAddress, "Av. Paulista 1000, apto 5, Bela Vista, São Paulo");
  assert.equal(user?.cep, "01310-100");
});

test("onboarding: endereço como PRIMEIRA mensagem da conversa é salvo, não buscado", async (t) => {
  if (!dbOk) return t.skip();
  const c = driver(newPhone());
  const out = await c.send("Rua das Flores, 123, Bela Vista, São Paulo");
  assert.match(out, /Endere(ç|c)o salvo/i);
  assert.doesNotMatch(out, /Já anotei|1x Rua/i);
});

test("onboarding: pedido feito enquanto a Lia espera o endereço não é descartado", async (t) => {
  if (!dbOk) return t.skip();
  const c = driver(newPhone());
  await c.send("oi");
  // Cliente responde com o PEDIDO em vez do endereço — a Lia repergunta o endereço…
  const asked = await c.send("preciso de um carregador usb c");
  assert.match(asked, /endere(ç|c)o/i);
  // …e, quando o endereço chega, o pedido guardado é buscado (não sumiu).
  const after = await c.send("Rua das Flores, 123, Bela Vista, São Paulo, 01310-100");
  assert.match(after.toLowerCase(), /carregador/);
});

test("concierge completo: pede → operador cota → paga → compra → motoboy do operador → entregue", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();

  // 1. Cliente pede coisas diversas (largura). A Lia anota, sem cotar sozinha.
  await c.send("um cabo usb-c e uma vela de aniversário");
  const closed = await c.send("só isso");
  assert.match(closed, /cotar/i);
  assert.doesNotMatch(closed, /Total: R\$/); // nada de total inventado antes da cotação real

  // 2. O pedido está aguardando a cotação do operador.
  const pending = await prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" }
  });
  assert.ok(pending, "deveria existir um pedido aguardando cotação");
  assert.equal(pending!.storeKey, "concierge");
  assert.equal((pending!.items as unknown as unknown[]).length, 2);

  // 3. Operador cota à mão: R$ 50 de produtos + R$ 12 de motoboy, entrega na hora.
  const start = outbox.length;
  await opsPublishManualQuote(pending!.id, {
    itemsSubtotal: 50,
    deliveryFee: 12,
    deliveryMode: "operator_courier",
    deliveryPromise: "hoje até 19h",
    etaMinutes: 90
  });
  const quoteMsgs = outbox.slice(start).map((m) => m.text).join("\n---\n");
  // Produtos = 50 * 1.1 = 55; total = 55 + 12 = 67.
  assert.match(quoteMsgs, /Total: R\$ 67,00/);
  assert.match(quoteMsgs, /Como prefere pagar/i);

  // 4. Cliente escolhe Pix e recebe o código.
  const pix = await c.send("pix");
  assert.match(pix, /R\$ 67,00/);

  const awaitingPay = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(awaitingPay!.status, "awaiting_payment");
  assert.equal(awaitingPay!.total, 67);

  // 5. Pagamento confirma (webhook).
  await markDeliveryOrderPaid(pending!.id);
  const paid = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(paid!.status, "paid");

  // 6. Operador compra à mão e marca. Concierge → operator_buying (não retirada de loja).
  await opsMarkBought(pending!.id, "");
  const bought = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(bought!.status, "operator_buying");
  assert.equal(isOperatorCourierOrder(bought!), true);

  // 7. Despacha o motoboy — sai da BASE do operador, não de uma loja. Não pode lançar.
  await opsDispatchCourier(pending!.id);
  const dispatched = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(dispatched!.status, "dispatched");
  assert.ok(dispatched!.courierTrackingUrl, "deveria ter rastreio do motoboy");
  // Repetir o clique não pode criar um segundo despacho nem enviar nova mensagem.
  const trackingBeforeRetry = dispatched!.courierTrackingUrl;
  const messagesBeforeRetry = outbox.length;
  const retry = await opsDispatchCourier(pending!.id);
  assert.equal(retry.status, "dispatched");
  assert.equal(retry.courierTrackingUrl, trackingBeforeRetry);
  assert.equal(outbox.length, messagesBeforeRetry);

  // 8. Entregue.
  await opsMarkDelivered(pending!.id);
  const delivered = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(delivered!.status, "delivered");
});

test("não é possível cotar um pedido que não está aguardando cotação", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("uma echarpe");
  await c.send("só isso");
  const order = await prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" }
  });
  assert.ok(order);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "operator_courier" });
  // Segunda cotação no mesmo pedido (agora awaiting_quote_confirmation) deve falhar.
  await assert.rejects(
    () => opsPublishManualQuote(order!.id, { itemsSubtotal: 40, deliveryFee: 10 }),
    /aguardando cotação/i
  );
});

test("cotação concierge vencida não libera pagamento", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("um guarda-chuva");
  await c.send("só isso");
  const order = await prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(order);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "operator_courier" });
  await prisma.deliveryOrder.update({
    where: { id: order!.id },
    data: { quoteExpiresAt: new Date(Date.now() - 1_000) }
  });
  const expired = await c.send("pix");
  assert.match(expired, /cotação venceu/i);
  const canceled = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(canceled!.status, "canceled");
});

test("estorno parcial registra valor e referência antes de avisar", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("um guarda-chuva");
  await c.send("só isso");
  const order = await prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(order);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "operator_courier" });
  await c.send("pix");
  await markDeliveryOrderPaid(order!.id);
  await opsCancelRefund(order!.id);
  await opsConfirmRefund(order!.id, "mp-ref-123", 12);
  const refunded = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(refunded!.status, "refunded");
  assert.match(refunded!.notes ?? "", /ESTORNO CONFIRMADO: parcial R\$ 12,00 — mp-ref-123/);
});

test("cancelar durante a cotação do operador cancela sem cobrança", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("um guarda-chuva");
  await c.send("só isso");
  const canceled = await c.send("cancelar");
  assert.match(canceled, /cancel/i);
  const order = await prisma.deliveryOrder.findFirst({ where: { userId: c.userId }, orderBy: { createdAt: "desc" } });
  assert.equal(order!.status, "canceled");
});
