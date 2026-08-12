import { test } from "node:test";
import assert from "node:assert/strict";
import * as copy from "../src/lib/lia-copy";

const items = [
  { qty: 2, name: "Arroz Tio João 5kg", displayLineTotal: 55.0 },
  { qty: 1, name: "Óleo de Soja Liza 900ml", displayLineTotal: 8.79 }
];

test("concierge: recusa honesta, cotação pedida e resumo manual", () => {
  // Regra 11/08: item sem preço = "não tenho" na hora, nunca "anotei, vou cotar".
  const one = copy.itemsNotAvailable(["vedante de torneira"]);
  assert.match(one, /não tenho como trazer/);
  assert.match(one, /vedante de torneira/);
  const many = copy.itemsNotAvailable(["vedante de torneira", "2x cadernos"]);
  assert.match(many, /não tenho como trazer/);
  assert.match(many, /cadernos/);
  assert.doesNotMatch(many, /vou cotar|garimpar|Anotei/i);
  const noted = many;

  const requested = copy.operatorQuoteRequested(["1x cabo usb-c", "1x vela"]);
  assert.match(requested, /cotar/i);
  assert.doesNotMatch(requested, /Total: R\$/); // nunca inventa total antes da cotação

  const summary = copy.manualQuoteSummary({
    items: [
      { qty: 1, name: "cabo usb-c" },
      { qty: 1, name: "vela de aniversário" }
    ],
    produtos: 55,
    frete: 12,
    deliveryPromise: "hoje até 19h",
    total: 67,
    deliveryAddress: "Rua das Flores, 123",
    sameHour: true
  });
  assert.match(summary, /1x cabo usb-c/);
  assert.match(summary, /Total: R\$ 67,00/);
  assert.match(summary, /hoje até 19h/);
  for (const t of [noted, requested, summary, copy.operatorQuoteStillWorking(), copy.conciergeAskWhatYouWant()]) {
    assert.doesNotMatch(t, /undefined|NaN|\[object/);
  }
});

test("summary: mostra itens, frete, total e itens não achados", () => {
  const text = copy.summary({
    items,
    produtos: 63.79,
    frete: 12.5,
    etaMinutes: 38,
    total: 76.29,
    notFound: ["azeite trufado"]
  });
  assert.match(text, /Seu pedido/);
  assert.match(text, /2x Arroz Tio João 5kg — R\$ 55,00/);
  assert.match(text, /R\$ 12,50/);
  assert.match(text, /Total: R\$ 76,29/);
  assert.match(text, /azeite trufado/);
  assert.match(text, /pagar/);
  assert.doesNotMatch(text, /undefined|NaN/);
});

test("pedido mínimo: diz quanto falta", () => {
  const text = copy.minimumOrder({ items, produtos: 20, displayMin: 33, falta: 13 });
  assert.match(text, /R\$ 33,00/);
  assert.match(text, /R\$ 13,00/);
  assert.doesNotMatch(text, /undefined|NaN/);
});

test("opções: numeradas com preço e instrução de resposta", () => {
  const text = copy.choicesText("leite", [
    { name: "Leite A", displayPrice: 5.99 },
    { name: "Leite B", displayPrice: 4.99 }
  ]);
  assert.match(text, /\*1\)\* Leite A — R\$ 5,99/);
  assert.match(text, /\*2\)\* Leite B — R\$ 4,99/);
  assert.match(text, /Responde \*1\* ou \*2\*/);
});

test("pagamento: pix sem taxa, cartão com taxa, totais distintos", () => {
  const text = copy.paymentMethod(100, 105.25);
  assert.match(text, /Pix — R\$ 100,00/);
  assert.match(text, /Cartão — R\$ 105,25/);
  // O código Pix vai em mensagem SEPARADA (copiável) — a intro não o contém.
  const pix = copy.pixInstructions(100, true);
  assert.match(pix, /copia e cola/);
  assert.match(pix, /paguei/); // sandbox hint
  assert.doesNotMatch(pix, /00020126/);
  const pixReal = copy.pixInstructions(100, false);
  assert.doesNotMatch(pixReal, /sandbox/);
  const card = copy.cardInstructions(105.25, "https://mp.com/x", false);
  assert.match(card, /https:\/\/mp\.com\/x/);
  assert.match(card, /taxa/);
});

test("status: uma linha humana por estado do pedido", () => {
  for (const status of [
    "awaiting_payment",
    "paid",
    "retailer_preparing",
    "retailer_out_for_delivery",
    "operator_buying",
    "dispatched",
    "delivered",
    "refund_pending",
    "refunded",
    "canceled"
  ]) {
    const line = copy.orderStatusLine({ shortId: "ABC123", status });
    assert.ok(line.includes("#ABC123"), `${status} deve citar o pedido`);
    assert.doesNotMatch(line, /undefined/);
  }
  const tracked = copy.orderStatusLine({ shortId: "ABC123", status: "dispatched", trackingUrl: "https://t.co/x" });
  assert.match(tracked, /https:\/\/t\.co\/x/);
  const retailerTracked = copy.orderStatusLine({
    shortId: "ABC123",
    status: "retailer_out_for_delivery",
    trackingUrl: "https://loja.example/rastreio"
  });
  assert.match(retailerTracked, /pela loja/);
  assert.match(retailerTracked, /https:\/\/loja\.example\/rastreio/);
  assert.doesNotMatch(copy.orderStatusLine({ shortId: "ABC123", status: "retailer_preparing" }), /motoboy/i);
});

test("todas as mensagens simples são não-vazias e sem placeholders", () => {
  const texts = [
    copy.greeting(),
    copy.thanks(),
    copy.help(),
    copy.didNotUnderstand(),
    copy.welcomeAskCep(),
    copy.welcomeAskCep(["2x Arroz"]),
    copy.askNewCep(),
    copy.cepNotFound("00000-000"),
    copy.searching(),
    copy.noMedicine(),
    copy.cartCleared(),
    copy.removeNotFound(),
    copy.emptyCartPay(),
    copy.paymentConfirmed(),
    copy.pixNotSeenYet(),
    copy.cardPending(),
    copy.alreadyPaid(),
    copy.noOrdersYet(),
    copy.canceledUnpaid(),
    copy.cancelRequestedPaid(),
    copy.cancelTooLate(),
    copy.nothingToCancel(),
    copy.noPreviousOrder(),
    copy.refundRequested(),
    copy.refundConfirmed(),
    copy.delivered(),
    copy.genericError()
  ];
  for (const t of texts) {
    assert.ok(t.trim().length > 10);
    assert.doesNotMatch(t, /undefined|NaN|\[object/);
  }
});

test("pós-venda: limpa antes do pagamento, sem cancelamento ou substituição depois", () => {
  const beforePayment = copy.cancelHowTo(false);
  const afterPayment = copy.cancelHowTo(true);
  assert.match(beforePayment, /Antes do pagamento/);
  assert.match(afterPayment, /não oferecemos cancelamento/);
  assert.match(afterPayment, /estornamos o valor dele/);
  assert.match(afterPayment, /atras/i);
  assert.match(copy.complaintAck(), /não fazemos substituições/);
  assert.doesNotMatch(copy.help(), /cancelar/);
});
