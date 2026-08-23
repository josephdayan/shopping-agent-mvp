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
    // Quantidade que passa do MÍNIMO da loja (o registry de teste pina o Carrefour,
    // mínimo R$30): fechar com 1 unidade agora é corretamente barrado.
    await c.send("quero 10 coca cola");
    const afterChoice = await c.send("1");
    if (/quantas unidades/i.test(afterChoice)) await c.send("10");
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
  assert.match(out, /não consigo trazer/i);
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
  // 19/08: com opções na mesma resposta, a recusa ganhou escopo ("não achei — o resto tá abaixo").
  assert.match(out, /eu não achei/i);
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
  // Escolhe (com quantidade que passa do mínimo da loja) e fecha: total na mesma resposta.
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("10");
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
  // 10 unidades: passa do mínimo da loja pinada nos testes (Carrefour, R$30).
  await c.send("quero 10 coca cola");
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("10");
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
  const first = await c.send("quero 10 coca cola e uma vela de aniversário");
  // Regra 11/08: a vela (sem preço) é recusada JÁ na entrada — nunca arrasta o pedido
  // inteiro pra cotação manual. (19/08: copy com escopo quando há opções junto.)
  assert.match(first, /eu não achei/i);
  assert.match(first.toLowerCase(), /vela/);
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("10");
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
    await c.send("quero 10 coca cola");
    const afterChoice = await c.send("1");
    if (/quantas unidades/i.test(afterChoice)) await c.send("10");
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
  // Link de acompanhamento colado na COMPRA (17/08): é a hora em que o operador tem a
  // página do pedido aberta — e nos pedidos entregues pela loja ele não sabe quando o
  // pacote sai, então esse é o único momento garantido de dar rastreio ao cliente.
  const TRACKING = "https://www.mercadolivre.com.br/vendas/123456/detalhe";
  // Link inseguro é recusado ANTES de escrever (o pedido continua pago e comprável).
  await assert.rejects(() => opsMarkBought(pending!.id, "", "http://inseguro.com/x"), /https/i);
  const stillPaid = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(stillPaid!.status, "paid", "recusa do link não pode mexer no pedido");
  const beforeBought = outbox.length;
  await opsMarkBought(pending!.id, "", TRACKING);
  const bought = await prisma.deliveryOrder.findUnique({ where: { id: pending!.id } });
  assert.equal(bought!.status, "operator_buying");
  assert.equal(isOperatorCourierOrder(bought!), true);
  // O cliente é avisado da compra (17/08): silêncio entre "pago" e "saiu pra entrega"
  // é onde nasce o "cadê meu pedido?".
  const boughtMsgs = outbox.slice(beforeBought);
  assert.ok(boughtMsgs.length >= 1, "compra tem que avisar o cliente");
  const boughtText = boughtMsgs[boughtMsgs.length - 1].text;
  assert.match(boughtText, /compr|prepar|separ/i);
  assert.ok(boughtText.includes(TRACKING), `aviso de compra tem que levar o link: ${boughtText}`);
  assert.equal(bought!.courierTrackingUrl, TRACKING, "link fica guardado no pedido");

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
  assert.match(out, /inclu(í|i) no pedido/i);
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
  assert.doesNotMatch(asking, /inclu(í|i) no pedido/i);
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
  assert.match(expired, /preço venceu/i);
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
  // Viagem no tempo: o cliente sumiu por 2 horas. Backdata as MENSAGENS também — desde
  // 11/08 o TTL mede a última atividade real (mensagem), não só o contexto gravado.
  await prisma.$executeRaw`UPDATE "Message" SET "createdAt" = NOW() - INTERVAL '2 hours' WHERE "conversationId" IN (SELECT id FROM "Conversation" WHERE "userId" = ${c.userId})`;
  await prisma.$executeRaw`UPDATE "Conversation" SET "updatedAt" = NOW() - INTERVAL '2 hours' WHERE "userId" = ${c.userId}`;
  const back = await c.send("quero um leite");
  assert.match(back, /por inatividade — nada foi cobrado/, `sem aviso de recomeço: ${back.slice(0, 200)}`);
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

test("'mais barata' seca NUNCA escolhe — mostra as mais baratas (caso real 19/08)", async (t) => {
  if (!dbOk) return t.skip();
  // Produção: cliente olhando 3 cards disse "Mais barata" e a Lia COMPROU a mais
  // barata da mesa. Preferência sem verbo/artigo agora navega, nunca escolhe.
  const c = await returningCustomer();
  await c.send("quero refrigerante");
  const out = await c.send("Mais barata");
  assert.doesNotMatch(out, /✅/, `não pode confirmar escolha: ${out.slice(0, 200)}`);
  assert.match(out, /mais baratas de/i, `esperava navegação por preço: ${out.slice(0, 200)}`);
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  assert.equal(ctx.step, "choosing", "a escolha continua aberta");
  assert.ok(!(ctx.basket?.length), "nada pode entrar na cesta");
  // As opções mostradas vêm ordenadas da mais barata pra mais cara.
  const prices = (ctx.pending?.[0]?.options ?? []).map((o: { unitPrice: number }) => o.unitPrice);
  assert.ok(prices.length >= 2, "esperava opções na mesa");
  assert.deepEqual(prices, [...prices].sort((a: number, b: number) => a - b));
});

test("'Outras opções' com escolha já fechada REABRE — e o novo pick substitui na cesta (19/08)", async (t) => {
  if (!dbOk) return t.skip();
  // Produção: depois de uma escolha fechada, o toque em "Outras opções" caía no
  // "Me diz de outro jeito — marca, tamanho" e "mais barato" no "não entendi".
  const c = await returningCustomer();
  await c.send("quero refrigerante");
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("2");
  const convo0 = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx0 = JSON.parse(convo0!.context ?? "{}");
  assert.equal(ctx0.basket?.length, 1, "a 1ª escolha entra na cesta");
  const firstSku = ctx0.basket[0].sku as string;
  const reopened = await c.send("opt:outras");
  assert.doesNotMatch(reopened, /outro jeito/i, `não pode cair no reject: ${reopened.slice(0, 200)}`);
  assert.match(reopened, /op(ç|c)(õ|o)es de/i, `esperava opções de novo: ${reopened.slice(0, 200)}`);
  const convo1 = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx1 = JSON.parse(convo1!.context ?? "{}");
  assert.equal(ctx1.step, "choosing");
  const options = ctx1.pending?.[0]?.options as Array<{ sku: string }>;
  assert.ok(options?.length, "esperava opções reabertas");
  const afterSwap = await c.send(`optsku:${options[0].sku}`);
  if (/quantas unidades/i.test(afterSwap)) await c.send("2");
  const convo2 = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx2 = JSON.parse(convo2!.context ?? "{}");
  assert.equal(ctx2.basket?.length, 1, `substitui, não soma: ${JSON.stringify(ctx2.basket?.map((i: { name: string }) => i.name))}`);
  assert.equal(ctx2.basket[0].sku, options[0].sku);
  assert.notEqual(ctx2.basket[0].sku, firstSku, "o item antigo saiu da cesta");
});

test("lista encaminhada (3+ linhas) monta a cesta DIRETO — sem interrogatório de cards (20/08)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("2 coca cola\n1 shampoo\n2 sabonete");
  assert.match(out, /Montei a cesta/i, `esperava cesta direta: ${out.slice(0, 250)}`);
  assert.doesNotMatch(out, /Responde \*1\*/, "não pode abrir escolha de cards");
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  assert.equal(ctx.step, "collecting");
  assert.ok(!(ctx.pending?.length), "sem escolha pendente");
  const basket = ctx.basket as Array<{ name: string; qty: number }>;
  assert.equal(basket.length, 3, `cesta: ${JSON.stringify(basket?.map((b) => `${b.qty}x ${b.name}`))}`);
  const byName = (frag: string) => basket.find((b) => new RegExp(frag, "i").test(b.name));
  assert.equal(byName("coca")?.qty, 2);
  assert.equal(byName("shampoo|sham")?.qty, 1);
  assert.equal(byName("sabonete")?.qty, 2);
});

test("lista NUMERADA: '1.' é índice — tudo entra com quantidade 1 (20/08)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("1. coca cola\n2. shampoo\n3. sabonete");
  assert.match(out, /Montei a cesta/i);
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket = JSON.parse(convo!.context ?? "{}").basket as Array<{ name: string; qty: number }>;
  assert.equal(basket.length, 3);
  for (const b of basket) assert.equal(b.qty, 1, `${b.name} deveria ter qty 1 (numeração ≠ quantidade)`);
});

test("lista com item inexistente: cesta monta e a linha sem preço é recusada junto (20/08)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("2 coca cola\n1 sabonete\n1 vedante de torneira industrial");
  assert.match(out, /Montei a cesta/i);
  assert.match(out, /não consigo trazer/i, `a linha impossível precisa da recusa: ${out.slice(0, 300)}`);
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket = JSON.parse(convo!.context ?? "{}").basket as Array<{ name: string }>;
  assert.equal(basket.length, 2);
  assert.ok(!basket.some((b) => /vedante/i.test(b.name)));
});

test("correção fina pós-lista: 'não quero de uva, quero de laranja' troca o SUCO (20/08)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("2 suco de uva\n1 coca cola\n2 sabonete");
  assert.match(out, /Montei a cesta/i, out.slice(0, 200));
  const swapped = await c.send("não quero de uva, quero de laranja");
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  const names = [
    ...((ctx.basket ?? []) as Array<{ name: string }>).map((b) => b.name),
    ...((ctx.pending ?? []) as Array<{ options: Array<{ name: string }> }>).flatMap((p) => p.options.map((o) => o.name))
  ];
  assert.ok(!names.some((n) => /uva/i.test(n)), `uva deveria sair: ${JSON.stringify(names)}`);
  // A troca por atributo compõe "suco laranja" — cesta ou opções precisam ser SUCO de
  // laranja, nunca a fruta.
  assert.ok(
    names.some((n) => /suco.*laranja|laranja.*suco/i.test(n)),
    `esperava suco de laranja em cesta/opções: ${JSON.stringify(names)} | resposta: ${swapped.slice(0, 200)}`
  );
});

test("'X em vez do Y' troca direto na cesta (20/08)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const out = await c.send("2 suco de uva\n1 coca cola\n2 sabonete");
  assert.match(out, /Montei a cesta/i);
  await c.send("suco de laranja em vez do de uva");
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  const names = [
    ...((ctx.basket ?? []) as Array<{ name: string }>).map((b) => b.name),
    ...((ctx.pending ?? []) as Array<{ options: Array<{ name: string }> }>).flatMap((p) => p.options.map((o) => o.name))
  ];
  assert.ok(!names.some((n) => /uva/i.test(n)), `uva deveria sair: ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => /laranja/i.test(n)), `laranja deveria entrar: ${JSON.stringify(names)}`);
});

// ---------- achados da revisão de código (11/08) ----------

test("dedupe do webhook é ATÔMICO: mesma mensagem em paralelo não dobra a cesta", async (t) => {
  if (!dbOk) return t.skip();
  // Antes: findFirst-depois-create deixava duas entregas SIMULTÂNEAS do mesmo sid
  // passarem juntas. Agora o índice único parcial decide quem processa.
  const c = await returningCustomer();
  const sid = `dup_${RUN}_${Date.now()}`;
  await Promise.all([
    handleDeliveryMessage({ phone: c.phone, text: "quero coca cola", messageId: sid }),
    handleDeliveryMessage({ phone: c.phone, text: "quero coca cola", messageId: sid })
  ]);
  const stored = await prisma.message.count({
    where: { conversation: { userId: c.userId }, metadata: sid, sender: "user" }
  });
  assert.equal(stored, 1, "a mesma mensagem do provedor foi gravada duas vezes");
  // RAIZ do problema: sem o upsert por id determinístico, as duas chamadas criavam
  // conversas DIFERENTES — o dedupe (por conversa) não colidia e a cesta se dividia.
  const convos = await prisma.conversation.count({ where: { userId: c.userId, status: "active" } });
  assert.equal(convos, 1, "duas mensagens simultâneas abriram conversas separadas");
});

test("pedido mínimo da LOJA vale no concierge (não cota o que a loja recusaria)", async (t) => {
  if (!dbOk) return t.skip();
  // A checagem existia só no fluxo legado, depois do return do concierge: uma cesta
  // abaixo do mínimo era cotada, cobrada e depois recusada no checkout da loja.
  // O registry de teste pina o Carrefour (mínimo R$30), então 1 refrigerante não fecha.
  const c = await returningCustomer();
  await c.send("quero coca cola");
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("1");
  const closed = await c.send("só isso");
  assert.match(closed, /m(í|i)nimo/i, `esperava aviso de pedido mínimo: ${closed.slice(0, 200)}`);
  const order = await prisma.deliveryOrder.findFirst({ where: { userId: c.userId } });
  assert.equal(order, null, "não pode criar pedido abaixo do mínimo da loja");
  // Somando até passar do mínimo, o pedido fecha normalmente.
  await c.send("quero 10 coca cola");
  const more = await c.send("1");
  if (/quantas unidades/i.test(more)) await c.send("10");
  const done = await c.send("só isso");
  assert.doesNotMatch(done, /m(í|i)nimo/i, `deveria ter fechado: ${done.slice(0, 200)}`);
});

test("trocar endereço com cotação na mesa cancela a cotação (não paga endereço velho)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "retailer_delivery" });
  const out = await c.send("trocar_endereco");
  assert.match(out, /cancelei essa cotação|CEP/i, `resposta: ${out.slice(0, 200)}`);
  assert.doesNotMatch(out, /Como prefere pagar/i, "não pode devolver o menu de pagamento");
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "canceled");
});

test("falha de envio ao publicar cotação DEVOLVE o pedido para a fila do operador", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  const original = whatsappAdapter.sendMessage;
  (whatsappAdapter as { sendMessage: unknown }).sendMessage = async () => {
    throw new Error("Graph API 500");
  };
  try {
    await assert.rejects(() => opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10 }));
  } finally {
    (whatsappAdapter as { sendMessage: unknown }).sendMessage = original;
  }
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  // Sem o rollback, o pedido ficava em awaiting_quote_confirmation: cliente sem total e
  // operador sem conseguir recotar (o /ops só cota quem está aguardando cotação).
  assert.equal(after!.status, "awaiting_operator_quote");
  assert.match(after!.notes ?? "", /Cotação revertida/);
  // E o operador consegue cotar de novo.
  const republished = await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10 });
  assert.equal(republished!.status, "awaiting_quote_confirmation");
});

test("cliente ativo NÃO é expirado: o TTL mede a última mensagem, não só o contexto", async (t) => {
  if (!dbOk) return t.skip();
  // Perguntar "já saiu o total?" não grava contexto — com o relógio em
  // Conversation.updatedAt, quem só pergunta parecia inativo e era cancelado no meio de
  // uma conversa viva.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  await prisma.$executeRaw`UPDATE "Conversation" SET "updatedAt" = NOW() - INTERVAL '2 hours' WHERE "userId" = ${c.userId}`;
  const out = await c.send("já saiu o total?");
  assert.doesNotMatch(out, /cancelei pra não te atrapalhar/i, `pedido vivo foi expirado: ${out.slice(0, 200)}`);
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "awaiting_operator_quote");
});

// ---------- 2ª revisão (11/08): corrida de contexto e troca de endereço ----------

test("mensagens simultâneas DIFERENTES não se apagam: o lock de turno serializa", async (t) => {
  if (!dbOk) return t.skip();
  // Antes: as duas liam a mesma cesta e a última gravação apagava o item da primeira.
  const c = await returningCustomer();
  await Promise.all([
    handleDeliveryMessage({ phone: c.phone, text: "quero coca cola", messageId: `race_a_${RUN}_${Date.now()}` }),
    handleDeliveryMessage({ phone: c.phone, text: "quero arroz", messageId: `race_b_${RUN}_${Date.now()}` })
  ]);
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  const queries = [
    ...(ctx.pending ?? []).map((p: { query: string }) => p.query),
    ...(ctx.basket ?? []).map((b: { name: string }) => b.name)
  ].join(" | ").toLowerCase();
  assert.match(queries, /coca/, `coca sumiu: ${queries}`);
  assert.match(queries, /arroz/, `arroz sumiu: ${queries}`);
  // E o lock foi liberado no final (nada fica preso pro próximo turno).
  assert.equal(convo!.turnLock, null);
});

test("trocar endereço com pedido na fila do operador ATUALIZA o pedido (não órfã)", async (t) => {
  if (!dbOk) return t.skip();
  const operator = "+5500999000222";
  process.env.LIA_OPERATOR_PHONE = operator;
  try {
    const c = await returningCustomer();
    const order = await manualQuoteOrder(c);
    await c.send("trocar endereço");
    await c.send("01310-200");
    const done = await c.send("Av Paulista, 1578, Bela Vista, São Paulo - SP");
    assert.match(done, /cotação continua/i, `resposta: ${done.slice(0, 200)}`);
    const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
    // O pedido segue vivo, com o endereço NOVO e nota pro operador.
    assert.equal(after!.status, "awaiting_operator_quote");
    assert.match(after!.deliveryAddress ?? "", /Paulista/);
    assert.match(after!.notes ?? "", /trocou o endereço/);
    const alert = outbox.filter((m) => m.to === operator).map((m) => m.text).join("\n");
    assert.match(alert, /trocou de endereço/);
    // E a conversa voltou pra espera da cotação (item novo ainda cai no mesmo pedido).
    const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
    assert.equal(JSON.parse(convo!.context ?? "{}").step, "awaiting_operator_quote");
  } finally {
    delete process.env.LIA_OPERATOR_PHONE;
  }
});

test("trocar endereço com pagamento emitido orienta a cancelar (cobrança não fica órfã)", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "retailer_delivery" });
  await c.send("pix"); // emite a cobrança → awaiting_payment
  const out = await c.send("trocar endereço");
  assert.match(out, /cancelar/i, `resposta: ${out.slice(0, 200)}`);
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "awaiting_payment", "pedido não pode ser abandonado nem cancelado sozinho");
  // A conversa continua vinculada ao pedido (nada de órfão).
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  assert.equal(JSON.parse(convo!.context ?? "{}").deliveryOrderId, order!.id);
});

test("falha PARCIAL no envio da cotação não desalinha pedido e conversa", async (t) => {
  if (!dbOk) return t.skip();
  // O resumo sai, o resto falha: o pedido FICA em awaiting_quote_confirmation ("pix"
  // por texto funciona) — sem rollback que desalinharia os dois.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  const original = whatsappAdapter.sendMessage;
  let sends = 0;
  (whatsappAdapter as { sendMessage: unknown }).sendMessage = async (to: string, text: string) => {
    sends += 1;
    if (sends > 1) throw new Error("Graph 500 depois do resumo");
    outbox.push({ to, text });
    return { provider: "test", to, text };
  };
  try {
    await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "retailer_delivery" });
  } finally {
    (whatsappAdapter as { sendMessage: unknown }).sendMessage = original;
  }
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "awaiting_quote_confirmation");
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  assert.equal(JSON.parse(convo!.context ?? "{}").step, "awaiting_quote_confirmation");
  // E o pagamento por texto segue funcionando.
  const pix = await c.send("pix");
  assert.match(pix, /R\$/);
});

// ---------- 15 rodadas reais (14/08): concierge — quantidades e esclarecimento ----------

test("rodada 13: 'quatro caixas' é quantidade, '4' ajusta e 'mais três do mesmo' repete o sku", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const opts = await c.send("queria quatro caixas de bombom, pode ser qualquer marca");
  assert.match(opts, /opções de \*/i, `esperava opções: ${opts.slice(0, 200)}`);
  const chosen = await c.send("1");
  // Quantidade veio por extenso → explícita → NUNCA re-pergunta "Quantas unidades?".
  assert.doesNotMatch(chosen, /quantas unidades/i, `re-perguntou quantidade: ${chosen.slice(0, 200)}`);
  const convo1 = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket1 = JSON.parse(convo1!.context ?? "{}").basket as Array<{ name: string; qty: number }>;
  assert.equal(basket1[basket1.length - 1].qty, 4, `qty: ${JSON.stringify(basket1)}`);
  // "mais três do mesmo" repete o MESMO produto (sku), sem nova busca.
  const more = await c.send("quero mais três caixas do mesmo bombom, por favor");
  assert.match(more, /agora são 7x/i, `não somou no mesmo item: ${more.slice(0, 200)}`);
  const convo2 = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket2 = JSON.parse(convo2!.context ?? "{}").basket as Array<{ name: string; qty: number }>;
  assert.equal(basket2.length, basket1.length, "não pode abrir linha nova de outro bombom");
  assert.equal(basket2[basket2.length - 1].qty, 7);
  // Número solto depois do item ajusta a quantidade do último item.
  const adjusted = await c.send("5");
  assert.match(adjusted, /Ajustei: 5x/i, `número solto não ajustou: ${adjusted.slice(0, 200)}`);
});

test("rodada 5: esclarecimento durante a escolha refina o MESMO item, nunca duplica", async (t) => {
  if (!dbOk) return t.skip();
  // Caso real: "só shampoo normal, sem preferência de marca" no meio da escolha virou
  // SEGUNDA linha e o cliente levou dois shampoos. Mesmo substantivo = refina, não soma.
  const c = await returningCustomer();
  const first = await c.send("quero uma coca cola, pode ser qualquer marca");
  assert.match(first, /opções de \*/i, `esperava opções: ${first.slice(0, 200)}`);
  const clarified = await c.send("pode ser coca zero");
  // Continua UMA escolha (refinada para zero) — nada de fila com 2 refrigerantes.
  assert.doesNotMatch(clarified, /Anotei \*/, `virou item novo: ${clarified.slice(0, 200)}`);
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  assert.equal((ctx.pending ?? []).length, 1, `pendências: ${JSON.stringify((ctx.pending ?? []).map((p: { query: string }) => p.query))}`);
  // Escolher agora deixa exatamente UM refrigerante na cesta.
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("1");
  const convo2 = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket = JSON.parse(convo2!.context ?? "{}").basket as Array<{ name: string }>;
  assert.equal(basket.length, 1, `cesta: ${JSON.stringify(basket.map((b) => b.name))}`);
});

test("rodada 15: 'antes de pagar, quero entregar em BH' troca o destino — nunca mostra pagamento", async (t) => {
  if (!dbOk) return t.skip();
  // Caso real 14/08: o intent de pagamento venceu a troca de destino e a Lia mostrou
  // o menu de pagamento do endereço ANTIGO. "pagar" em oração subordinada não decide.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "retailer_delivery" });
  const out = await c.send("Antes de pagar, quero entregar em Belo Horizonte.");
  assert.doesNotMatch(out, /Como prefere pagar/i, `mostrou pagamento: ${out.slice(0, 200)}`);
  assert.match(out, /CEP/i, `esperava pedir o novo CEP: ${out.slice(0, 200)}`);
  // A cotação amarrada ao endereço velho caiu junto.
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "canceled");
  // E o CEP de MG é recusado com lista de espera (guarda de UF já existente).
  const bh = await c.send("30130-010");
  assert.match(bh, /não chega|lista|região/i, `resposta ao CEP de BH: ${bh.slice(0, 200)}`);
});

// ---------- 3º ciclo (15/08 noite): adição relativa, CEP na cotação, swap em lista nova ----------

test("3º ciclo: 'mais um leite' herda o item da cesta (sku), nunca busca genérica", async (t) => {
  if (!dbOk) return t.skip();
  // Rodada 8: "mais um leite" abria busca e adicionava leite INTEGRAL separado.
  const c = await returningCustomer();
  await c.send("quero leite sem lactose");
  const afterChoice = await c.send("1");
  if (/quantas unidades/i.test(afterChoice)) await c.send("2");
  const more = await c.send("Pode colocar mais um leite.");
  assert.match(more, /agora são 3x/i, `não herdou o item: ${more.slice(0, 200)}`);
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket = JSON.parse(convo!.context ?? "{}").basket as Array<{ name: string; qty: number }>;
  assert.equal(basket.length, 1, `cesta: ${JSON.stringify(basket.map((b) => b.name))}`);
  assert.equal(basket[0].qty, 3);
});

test("3º ciclo: CEP no meio do menu de pagamento troca o destino (nunca re-mostra pagamento)", async (t) => {
  if (!dbOk) return t.skip();
  // Rodada 6: "Antes de pagar, vou entregar em Campinas, CEP 13010-100" devolvia o
  // menu de pagamento do endereço antigo.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "retailer_delivery" });
  const out = await c.send("Antes de pagar, vou entregar em Campinas, CEP 13010-100.");
  assert.doesNotMatch(out, /Como prefere pagar/i, `re-mostrou pagamento: ${out.slice(0, 250)}`);
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "canceled", "a cotação do endereço velho tem que cair");
});

test("3º ciclo: 'troca X por Y' numa lista NOVA corrige a própria mensagem", async (t) => {
  if (!dbOk) return t.skip();
  // Rodada 3: com a cesta vazia, o swap respondia "não achei pra tirar".
  const c = await returningCustomer();
  const out = await c.send("Quero detergente neutro e esponja de cozinha; pensando bem, troca a esponja por saco de lixo reforçado de 30 litros");
  assert.doesNotMatch(out, /não achei.*tirar|não encontrei.*remover/i, `virou remoção: ${out.slice(0, 200)}`);
  // A lista corrigida busca detergente e saco de lixo — a esponja fica de fora.
  assert.match(out.toLowerCase(), /detergente/, `sem detergente: ${out.slice(0, 250)}`);
  assert.match(out.toLowerCase(), /saco|lixo/, `sem saco de lixo: ${out.slice(0, 250)}`);
});

test("botão 'Outra quantidade' abre a pergunta livre e o número digitado vale", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  await c.send("quero coca cola");
  const afterChoice = await c.send("1");
  assert.match(afterChoice, /quantas unidades/i, `esperava pergunta de quantidade: ${afterChoice.slice(0, 150)}`);
  const other = await c.send("qty:other");
  assert.match(other, /quantas unidades|1 a 50/i, `esperava pergunta livre: ${other.slice(0, 150)}`);
  await c.send("7");
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const basket = JSON.parse(convo!.context ?? "{}").basket as Array<{ qty: number }>;
  assert.equal(basket[basket.length - 1].qty, 7);
});

test("5º ciclo: trocar endereço com cotação na mesa PRESERVA a cesta e re-cota sozinho", async (t) => {
  if (!dbOk) return t.skip();
  // Rodada 6: depois do endereço novo a Lia "esquecia" a cesta e pedia pra recomeçar.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  await opsPublishManualQuote(order!.id, { itemsSubtotal: 30, deliveryFee: 10, deliveryMode: "retailer_delivery" });
  const drop = await c.send("Antes de pagar, vou entregar em São Paulo, CEP 01310-100.");
  assert.doesNotMatch(drop, /Como prefere pagar/i);
  // Endereço com CEP repetido no fim — o "CEP" órfão não pode sobrar sem dígitos
  // (6º ciclo, rodada 8: salvava "… - SP, CEP." depois de remover os números).
  const done = await c.send("Avenida Paulista, 1000, Bela Vista, São Paulo - SP, CEP 01310-100.");
  assert.match(done, /Total|Recebi seu pedido/i, `não re-cotou: ${done.slice(0, 250)}`);
  assert.doesNotMatch(done, /me diz o que você quer/i, `esqueceu a cesta: ${done.slice(0, 250)}`);
  assert.doesNotMatch(done, /CEP\s*[.,]/, `CEP órfão no endereço: ${done.slice(0, 250)}`);
  assert.match(done, /Avenida Paulista, 1000/, `endereço perdido: ${done.slice(0, 250)}`);
  // O CEP processado aparece na confirmação (7º ciclo: era salvo mas invisível).
  assert.match(done, /01310-100/, `CEP sumiu da confirmação: ${done.slice(0, 250)}`);
});

// ---------- revisão dupla (18/08): pedido morto na mão do operador e frete velho ----------

// Coloca a conversa parada na escolha de entrega (barata × rápida) sem depender da
// consulta ao vivo do anúncio: o pedido é real (fila do operador) e só o contexto é
// montado à mão, exatamente como o fluxo instantâneo o grava.
async function parkOnFreightChoice(c: { userId: string }, orderId: string, quotedAt: number) {
  const convo = await prisma.conversation.findFirst({ where: { userId: c.userId } });
  const ctx = JSON.parse(convo!.context ?? "{}");
  await prisma.conversation.update({
    where: { id: convo!.id },
    data: {
      currentStep: "choosing_freight",
      context: JSON.stringify({
        ...ctx,
        step: "choosing_freight",
        deliveryOrderId: orderId,
        basket: undefined,
        pending: undefined,
        freightChoice: {
          orderId,
          itemsSubtotal: 30,
          stores: 1,
          quotedAt,
          barato: { fee: 10, estimate: "quinta, 21/08" },
          rapido: { fee: 22, estimate: "terça, 19/08" }
        }
      })
    }
  });
  return convo!.id;
}

async function ctxOf(userId: string) {
  const convo = await prisma.conversation.findFirst({ where: { userId } });
  return JSON.parse(convo!.context ?? "{}") as { step?: string; deliveryOrderId?: string; freightChoice?: unknown };
}

test("cancelamento do operador solta a conversa (nada de 'ainda estou cotando' de pedido morto)", async (t) => {
  if (!dbOk) return t.skip();
  // Revisão 18/08: opsCancelRefund cancelava o pedido e deixava o contexto em
  // awaiting_operator_quote — o cliente ouvia "estou cotando" para sempre e "cancelar"
  // respondia "não tem pedido" sem limpar nada.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  assert.ok(order);
  await opsCancelRefund(order!.id);
  const cleared = await ctxOf(c.userId);
  assert.equal(cleared.deliveryOrderId, undefined, `contexto ainda preso no pedido: ${JSON.stringify(cleared)}`);
  assert.notEqual(cleared.step, "awaiting_operator_quote");
  const back = await c.send("e aí, já saiu o total?");
  assert.doesNotMatch(back, /já.*cotando|cotando agora|segura a[ií]/i, `respondeu de pedido morto: ${back.slice(0, 200)}`);
});

test("'cancelar' com pedido já morto limpa o contexto (não repete 'não tem pedido')", async (t) => {
  if (!dbOk) return t.skip();
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  assert.ok(order);
  // Pedido cancelado por fora (qualquer caminho que não passe pela conversa).
  await prisma.deliveryOrder.update({ where: { id: order!.id }, data: { status: "canceled" } });
  const out = await c.send("cancelar");
  assert.match(out, /não tem pedido em andamento/i, `resposta inesperada: ${out.slice(0, 200)}`);
  const after = await ctxOf(c.userId);
  assert.equal(after.deliveryOrderId, undefined, `ponteiro morto sobreviveu: ${JSON.stringify(after)}`);
  assert.notEqual(after.step, "awaiting_operator_quote");
  // E a conversa volta a funcionar do zero.
  const novo = await c.send("quero coca cola");
  assert.doesNotMatch(novo, /não tem pedido/i);
  assert.match(novo.toLowerCase(), /coca/, `não recomeçou: ${novo.slice(0, 200)}`);
});

test("botão de frete de dias atrás não publica cotação com data vencida", async (t) => {
  if (!dbOk) return t.skip();
  // Revisão 18/08: `choosing_freight` não expirava nunca. O toque tardio publicava frete
  // e promessa de entrega consultados dias antes — possivelmente já no passado — e a
  // cotação saía pagável.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  assert.ok(order);
  await parkOnFreightChoice(c, order!.id, Date.now() - 3 * 24 * 60 * 60 * 1000);
  const out = await c.send("frete:barato");
  assert.match(out, /inatividade|venceu/i, `publicou ou travou: ${out.slice(0, 250)}`);
  assert.doesNotMatch(out, /Total/i, `publicou cotação velha: ${out.slice(0, 250)}`);
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "canceled");
  const ctx = await ctxOf(c.userId);
  assert.equal(ctx.step, undefined, `contexto ficou preso: ${JSON.stringify(ctx)}`);
  assert.equal(ctx.freightChoice, undefined);
});

test("escolha de frete recém-cotada continua publicando na hora", async (t) => {
  if (!dbOk) return t.skip();
  // Contraprova da trava acima: o toque normal (segundos depois) não pode ser barrado.
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  assert.ok(order);
  await parkOnFreightChoice(c, order!.id, Date.now() - 5_000);
  const out = await c.send("frete:rapido");
  assert.match(out, /Total/i, `não publicou a cotação: ${out.slice(0, 250)}`);
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "awaiting_quote_confirmation");
  assert.match(after!.notes ?? "", /escolheu a entrega mais rápida/i);
  assert.equal(after!.deliveryFee, 22);
});

test("cliente que some na escolha de frete: 1h+ cancela o pedido e não vira lista de compras", async (t) => {
  if (!dbOk) return t.skip();
  // O TTL de abandono passou a cobrir `choosing_freight`; o toque velho não pode ser
  // reprocessado como texto ("frete:barato" virando item de cesta).
  const c = await returningCustomer();
  const order = await manualQuoteOrder(c);
  assert.ok(order);
  await parkOnFreightChoice(c, order!.id, Date.now() - 2 * 60 * 60 * 1000);
  await prisma.$executeRaw`UPDATE "Message" SET "createdAt" = NOW() - INTERVAL '2 hours' WHERE "conversationId" IN (SELECT id FROM "Conversation" WHERE "userId" = ${c.userId})`;
  await prisma.$executeRaw`UPDATE "Conversation" SET "updatedAt" = NOW() - INTERVAL '2 hours' WHERE "userId" = ${c.userId}`;
  const out = await c.send("frete:barato");
  assert.match(out, /inatividade — nada foi cobrado|venceu/i, `sem aviso de recomeço: ${out.slice(0, 250)}`);
  assert.doesNotMatch(out, /não consigo trazer|frete:barato/i, `o toque virou lista de compras: ${out.slice(0, 250)}`);
  const after = await prisma.deliveryOrder.findUnique({ where: { id: order!.id } });
  assert.equal(after!.status, "canceled");
  const ctx = await ctxOf(c.userId);
  assert.equal(ctx.deliveryOrderId, undefined);
});
