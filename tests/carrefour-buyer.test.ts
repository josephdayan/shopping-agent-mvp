import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCarrefourHumanAction,
  parseCarrefourDeliveryFee,
  parseCarrefourDeliveryPromise,
  parseCarrefourCartTotal,
  parseCarrefourOrderNumber
} from "../src/lib/purchasing/stores/carrefour-buyer";

test("Carrefour: lê o total do checkout, não o primeiro preço de produto", () => {
  const text = "Arroz R$ 24,90\nFrete R$ 8,99\nTotal do pedido R$ 33,89";
  assert.equal(parseCarrefourCartTotal(text), 33.89);
});

test("Carrefour: só aceita frete e prazo que o checkout exibiu", () => {
  const text = "Frete R$ 8,99\nEntrega amanhã, 16/07\nTotal do pedido R$ 33,89";
  assert.equal(parseCarrefourDeliveryFee(text), 8.99);
  assert.equal(parseCarrefourDeliveryPromise(text), "Entrega amanhã, 16/07");
  assert.equal(parseCarrefourDeliveryFee("Total do pedido R$ 33,89"), undefined);
  assert.equal(parseCarrefourDeliveryPromise("Total do pedido R$ 33,89"), undefined);
});

test("Carrefour: identifica desafios que precisam de humano", () => {
  assert.equal(detectCarrefourHumanAction("Confirme no aplicativo do banco para concluir")?.code, "PAYMENT_ACTION_REQUIRED");
  assert.equal(detectCarrefourHumanAction("Verifique que você é humano para continuar")?.code, "CAPTCHA_REQUIRED");
  assert.equal(detectCarrefourHumanAction("Pedido pronto")?.code, undefined);
});

test("Carrefour: extrai o número da confirmação sem aceitar um texto genérico", () => {
  assert.equal(parseCarrefourOrderNumber("Seu pedido nº ABCD-12345 foi confirmado"), "ABCD-12345");
  assert.equal(parseCarrefourOrderNumber("Compra em processamento"), undefined);
});
