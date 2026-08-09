import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { freightForKm, freightBreakdownLabel, instantQuoteEligible } from "../src/lib/instant-quote";

// Frete da cotação instantânea: base + R$/km POR LOJA (decisão do dono, 09/08 — "tem que
// ser da loja até a casa do cara; 2 lojas, 2 fretes"). Sem distância real, tarifa padrão.

afterEach(() => {
  delete process.env.LIA_FREIGHT_BASE;
  delete process.env.LIA_FREIGHT_PER_KM;
  delete process.env.LIA_FREIGHT_DEFAULT;
  delete process.env.LIA_INSTANT_QUOTE;
});

test("frete: base + R$/km arredondado pra cima; sem km usa a tarifa padrão", () => {
  // defaults: base 12, 1.80/km, padrão 18
  assert.equal(freightForKm(0), 12);
  assert.equal(freightForKm(3.2), Math.ceil(12 + 1.8 * 3.2)); // 18
  assert.equal(freightForKm(10), 30);
  assert.equal(freightForKm(null), 18);
  process.env.LIA_FREIGHT_BASE = "10";
  process.env.LIA_FREIGHT_PER_KM = "2";
  process.env.LIA_FREIGHT_DEFAULT = "25";
  assert.equal(freightForKm(5), 20);
  assert.equal(freightForKm(null), 25);
});

test("elegibilidade: só cesta 100% vitrine com preço; linha livre ou vazia caem fora", () => {
  const vitrine = { qty: 1, unitPrice: 9.9, storeKey: "carrefour", storeLabel: "Carrefour" };
  const livre = { qty: 1, unitPrice: 0, storeKey: "concierge", storeLabel: "Concierge" };
  assert.equal(instantQuoteEligible([vitrine], "concierge"), true);
  assert.equal(instantQuoteEligible([vitrine, livre], "concierge"), false);
  assert.equal(instantQuoteEligible([], "concierge"), false);
  process.env.LIA_INSTANT_QUOTE = "false";
  assert.equal(instantQuoteEligible([vitrine], "concierge"), false);
});

test("2 lojas = 2 fretes, discriminados na quebra", () => {
  const label = freightBreakdownLabel([
    { storeKey: "carrefour", storeLabel: "Carrefour", km: 3.2, fee: 18 },
    { storeKey: "petz", storeLabel: "Petz", km: null, fee: 18 }
  ]);
  assert.match(label, /Carrefour 3\.2km R\$18,00 \+ Petz R\$18,00/);
});
