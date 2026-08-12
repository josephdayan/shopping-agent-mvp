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

// Regra 11/08 matou a linha livre no fluxo do cliente: para exercitar o FALLBACK manual
// (operador cota no /ops), desliga a cotação instantânea e fecha uma cesta de vitrine.
async function manualQuoteOrder(c: { send: (t: string) => Promise<string>; userId: string }) {
  process.env.LIA_INSTANT_QUOTE = "false";
  try {
    await c.send("quero coca cola");
    const afterChoice = await c.send("1");
    if (/quantas unidades/i.test(afterChoice)) await c.send("1");
    await c.send("só isso");
  } finally {
    delete process.env.LIA_INSTANT_QUOTE;
  }
  return prisma.deliveryOrder.findFirst({
    where: { userId: c.userId, status: "awaiting_operator_quote" },
    orderBy: { createdAt: "desc" }
  });
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

test("regra 11/08: item sem preço é recusado NA HORA — nunca 'anotei, vou cotar'", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("quero um vedante pra torneira");
  assert.match(out, /não tenho como trazer/i);
  assert.match(out.toLowerCase(), /vedante/);
  assert.doesNotMatch(out, /anotei|vou cotar|garimpar/i);
  const order = await prisma.deliveryOrder.findFirst({ where: { userId: c.userId } });
  assert.equal(order, null, "recusa honesta não cria pedido");
});

// ---------- vitrine (03/08; regra 11/08: sem linha livre) ----------
// O concierge procura na vitrine e mostra opções com foto; o que não tem preço é recusado
// com honestidade na mesma resposta — nunca vira espera de cotação.

test("vitrine: item com preço vira opção; item sem preço é recusado na mesma resposta", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("quero coca cola e um vedante pra torneira");
  // A coca existe na vitrine → opções numeradas.
  assert.match(out, /op(ç|c)(õ|o)es/i);
  assert.match(out.toLowerCase(), /coca/);
  // O vedante não existe → recusa honesta na hora (regra 11/08), nunca "vou cotar".
  assert.match(out, /não tenho como trazer/i);
  assert.match(out.toLowerCase(), /vedante|torneira/);
  assert.doesNotMatch(out, /garimpar|vou cotar/i);
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

test("fechar a lista com escolha pendente pede pra ESCOLHER — e aí o total sai na hora", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("quero coca cola");
  // Fecha a lista no meio das opções, sem escolher: a Lia pede pra confirmar o item
  // (regra 11/08: nada de linha livre — só item com preço entra no pedido).
  const closed = await c.send("só isso");
  assert.match(closed, /confirma esse item primeiro/i);
  assert.match(closed.toLowerCase(), /coca/, "as opções voltam pra facilitar a escolha");
  const order = await prisma.deliveryOrder.findFirst({ where: { phone: c.phone } });
  assert.equal(order, null, "sem escolha não há pedido");
  // Escolhe e fecha: total na mesma resposta.
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("1");
  const done = await c.send("só isso");
  assert.match(done, /Total/i, `fechamento: ${done.slice(0, 200)}`);
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

test("cotação instantânea: cesta 100% vitrine fecha com total NA HORA, sem esperar operador", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("quero coca cola");
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("1");
  const closed = await c.send("só isso");
  // Nada de "vou cotar e te aviso": o total chega na mesma resposta, com menu de pagamento.
  assert.match(closed, /Total/i, `resposta do fechamento: ${closed.slice(0, 200)}`);
  assert.doesNotMatch(closed, /Vou cotar tudo agora/i);
  const order = await prisma.deliveryOrder.findFirst({ where: { phone: c.phone }, orderBy: { createdAt: "desc" } });
  assert.equal(order!.status, "awaiting_quote_confirmation");
  assert.ok(order!.deliveryFee > 0, `frete deveria ser > 0, veio ${order!.deliveryFee}`);
  assert.ok(order!.total > order!.deliveryFee, "total inclui produtos + frete");
  assert.match(order!.notes ?? "", /Cotação instantânea/i);
  assert.match(order!.notes ?? "", /Frete por loja/i);
});

test("cotação instantânea: item sem preço é recusado na entrada e o resto fecha NA HORA", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const first = await c.send("quero coca cola e uma vela de aniversário");
  // Regra 11/08: a vela (sem preço) é recusada JÁ na entrada — nunca arrasta o pedido
  // inteiro pra cotação manual.
  assert.match(first, /não tenho como trazer/i);
  assert.match(first.toLowerCase(), /vela/);
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("1");
  const closed = await c.send("só isso");
  assert.match(closed, /Total/i, `fechamento: ${closed.slice(0, 200)}`);
  const order = await prisma.deliveryOrder.findFirst({ where: { phone: c.phone }, orderBy: { createdAt: "desc" } });
  assert.equal(order!.status, "awaiting_quote_confirmation");
  const items = (order!.items as unknown as { name: string }[]) ?? [];
  assert.ok(!items.some((i) => /vela/i.test(i.name)), "a vela recusada não pode entrar no pedido");
});

test("cotação instantânea: kill-switch LIA_INSTANT_QUOTE=false volta ao fluxo manual", async (t) => {
  if (!dbOk) return t.skip();
  process.env.LIA_INSTANT_QUOTE = "false";
  try {
    const c = await returningCustomer();
    await c.send("quero coca cola");
    const afterChoice = await c.send("1");
    if (/quantas unidades/i.test(afterChoice)) await c.send("1");
    const closed = await c.send("só isso");
    assert.match(closed, /Recebi seu pedido/i);
    const order = await prisma.deliveryOrder.findFirst({ where: { phone: c.phone }, orderBy: { createdAt: "desc" } });
    assert.equal(order!.status, "awaiting_operator_quote");
  } finally {
    delete process.env.LIA_INSTANT_QUOTE;
  }
});

test("concierge completo: pede → operador cota → paga → compra → motoboy do operador → entregue", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();

  // 1-2. Fallback manual (instantânea desligada): pedido de vitrine aguardando cotação.
  const pending = await manualQuoteOrder(c);
  assert.ok(pending, "deveria existir um pedido aguardando cotação");
  assert.equal(pending!.storeKey, "concierge");
  assert.equal((pending!.items as unknown as unknown[]).length, 1);

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

test("pedir item DURANTE a cotação do operador inclui no pedido — nunca engole (caso real 07/08)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const pending = await manualQuoteOrder(c);
  assert.ok(pending, "pedido deveria estar aguardando cotação");

  // Em produção isso respondia "segura aí" e DESCARTAVA o cotonete; o cliente teve
  // que cancelar o pedido pra conseguir pedir de novo.
  const out = await c.send("quero um cotonete");
  assert.match(out, /inclu(í|i) na cotação/i);
  assert.match(out.toLowerCase(), /cotonete/);
  assert.doesNotMatch(out, /segura aí/i);

  const updated = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(updated!.status, "awaiting_operator_quote");
  const items = updated!.items as unknown as { name: string; qty: number }[];
  assert.equal(items.length, 2);
  assert.ok(items.some((i) => /cotonete/i.test(i.name)), `itens: ${items.map((i) => i.name).join(", ")}`);
  assert.match(updated!.notes ?? "", /adicionou durante a cotação/i);

  // Pergunta sobre o andamento tem resposta própria e NÃO vira item na cotação.
  const asking = await c.send("já saiu o total?");
  assert.ok(asking.length > 0, "pergunta ficou sem resposta");
  assert.doesNotMatch(asking, /inclu(í|i) na cotação/i);
  const afterAsk = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal((afterAsk!.items as unknown as unknown[]).length, 2);
});

test("não é possível cotar um pedido que não está aguardando cotação", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
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
  const order = await manualQuoteOrder(c);
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
  const order = await manualQuoteOrder(c);
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
  await manualQuoteOrder(c);
  const canceled = await c.send("cancelar");
  assert.match(canceled, /cancel/i);
  const order = await prisma.deliveryOrder.findFirst({ where: { userId: c.userId }, orderBy: { createdAt: "desc" } });
  assert.equal(order!.status, "canceled");
});

test("concierge: cotação manual dispara alerta no WhatsApp do OPERADOR", async (t) => {
  if (!dbOk) return t.skip();
  // Caso real 11/08: pedido ficou 2 dias em awaiting_operator_quote porque nada avisava
  // o operador — o alerta (LIA_OPERATOR_PHONE) é o que fecha o ciclo "em instantes".
  const operator = "+5500999000111";
  process.env.LIA_OPERATOR_PHONE = operator;
  try {
    const c = await returningCustomer();
    const start = outbox.length;
    await manualQuoteOrder(c);
    const toOperator = outbox
      .slice(start)
      .filter((m) => m.to === operator)
      .map((m) => m.text)
      .join("\n");
    assert.match(toOperator, /aguardando SUA cotação/, `sem alerta ao operador: ${toOperator || "(vazio)"}`);
    assert.match(toOperator.toLowerCase(), /coca/);
  } finally {
    delete process.env.LIA_OPERATOR_PHONE;
  }
});

test("concierge: cotação abandonada 1h+ expira sozinha e a conversa recomeça", async (t) => {
  if (!dbOk) return t.skip();
  // Caso real 11/08: pedido de sábado ficou 2 dias em awaiting_operator_quote e a
  // "camiseta de futebol" de segunda caiu DENTRO dele. Agora o retorno após 1h+ de
  // silêncio cancela o pedido não-cotado e processa a mensagem nova do zero.
  const c = await returningCustomer();
  const stuck = await manualQuoteOrder(c);
  assert.ok(stuck, "esperava pedido em awaiting_operator_quote");
  // Viagem no tempo: o cliente sumiu por 2 horas.
  await prisma.$executeRaw`UPDATE "Conversation" SET "updatedAt" = NOW() - INTERVAL '2 hours' WHERE "userId" = ${c.userId}`;
  const back = await c.send("quero um leite");
  assert.match(back, /cancelei pra não te atrapalhar/, `sem aviso de recomeço: ${back.slice(0, 200)}`);
  assert.doesNotMatch(back, /já incluí na cotação/, "a mensagem nova NÃO pode cair no pedido velho");
  const after = await prisma.deliveryOrder.findUnique({ where: { id: stuck!.id } });
  assert.equal(after?.status, "canceled");
  assert.match(after?.notes ?? "", /Cancelado automático/);
  // O leite seguiu como pedido NOVO (opções ou anotação — qualquer resposta de produto).
  assert.match(back, /leite/i);
});

test("card ANTIGO escolhe o produto do card, não a posição (ids por sku — bug real 11/08)", async (t) => {
  if (!dbOk) return t.skip();
  // Produção: "Escolher esse" confirmava OUTRO produto se a lista tinha trocado por
  // baixo ("outras"). O id agora carrega o sku e o toque resolve pelo histórico.
  const c = await returningCustomer();
  await c.send("quero refrigerante");
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx1 = JSON.parse(convo!.context ?? "{}");
  const firstBatch = ctx1.pending?.[0]?.options as Array<{ sku: string; name: string }>;
  assert.ok(firstBatch?.length >= 2, "esperava opções na 1ª página");
  const more = await c.send("outras");
  assert.match(more, /Mais opções/);
  // Toca num card da PRIMEIRA página (que já saiu da mesa).
  const tapped = firstBatch[1];
  const out = await c.send(`optsku:${tapped.sku}`);
  const fragment = tapped.name.slice(0, 14).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(out, new RegExp(fragment, "i"), `esperava "${tapped.name}", veio: ${out.slice(0, 200)}`);
});
