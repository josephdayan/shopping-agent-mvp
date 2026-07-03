import { test } from "node:test";
import assert from "node:assert/strict";
import * as copy from "../src/lib/lia-copy";

const items = [
  { qty: 2, name: "Arroz Tio João 5kg", displayLineTotal: 55.0 },
  { qty: 1, name: "Óleo de Soja Liza 900ml", displayLineTotal: 8.79 }
];

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
  const pix = copy.pixInstructions(100, "00020126CODE", true);
  assert.match(pix, /copia e cola/);
  assert.match(pix, /paguei/); // sandbox hint
  const pixReal = copy.pixInstructions(100, "00020126CODE", false);
  assert.doesNotMatch(pixReal, /sandbox/);
  const card = copy.cardInstructions(105.25, "https://mp.com/x", false);
  assert.match(card, /https:\/\/mp\.com\/x/);
  assert.match(card, /taxa/);
});

test("status: uma linha humana por estado do pedido", () => {
  for (const status of ["awaiting_payment", "paid", "operator_buying", "dispatched", "delivered", "canceled"]) {
    const line = copy.orderStatusLine({ shortId: "ABC123", status });
    assert.ok(line.includes("#ABC123"), `${status} deve citar o pedido`);
    assert.doesNotMatch(line, /undefined/);
  }
  const tracked = copy.orderStatusLine({ shortId: "ABC123", status: "dispatched", trackingUrl: "https://t.co/x" });
  assert.match(tracked, /https:\/\/t\.co\/x/);
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
    copy.delivered(),
    copy.genericError()
  ];
  for (const t of texts) {
    assert.ok(t.trim().length > 10);
    assert.doesNotMatch(t, /undefined|NaN|\[object/);
  }
});
