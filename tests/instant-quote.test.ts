import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { computeStoreFreights, freightBreakdownLabel, instantQuoteEligible, storeFreight } from "../src/lib/instant-quote";

// Frete da cotação instantânea = política do SITE de cada loja (correção do dono, 09/08:
// a entrega é pelo site do varejista, não por courier). Por loja: valor configurado +
// frete grátis por limiar sobre o subtotal daquela loja; sem política, tarifa padrão.

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("LIA_STORE_FREIGHT_") || key.startsWith("LIA_STORE_FREE_ABOVE_")) delete process.env[key];
  }
  delete process.env.LIA_FREIGHT_DEFAULT;
  delete process.env.LIA_INSTANT_QUOTE;
});

test("frete por loja: valor do site, grátis acima do limiar, padrão sem política", () => {
  process.env.LIA_STORE_FREIGHT_LOJAA = "14.90";
  process.env.LIA_STORE_FREE_ABOVE_LOJAA = "99";
  assert.equal(storeFreight("lojaa", "Loja A", 50).fee, 14.9);
  assert.equal(storeFreight("lojaa", "Loja A", 50).source, "loja");
  assert.equal(storeFreight("lojaa", "Loja A", 120).fee, 0);
  // Sem política nem semente → tarifa padrão (default 18; env muda sem deploy).
  // "lojax" não existe na semente de propósito: as lojas reais vão ganhando valores
  // pesquisados em SEED_STORE_FREIGHT sem quebrar este caso.
  assert.equal(storeFreight("lojax", "Loja X", 50).fee, 18);
  assert.equal(storeFreight("lojax", "Loja X", 50).source, "padrao");
  process.env.LIA_FREIGHT_DEFAULT = "25";
  assert.equal(storeFreight("lojax", "Loja X", 50).fee, 25);
});

test("2 lojas = 2 fretes: soma por loja com subtotais separados", () => {
  process.env.LIA_STORE_FREIGHT_LOJAA = "14.90";
  process.env.LIA_STORE_FREIGHT_LOJAB = "9.99";
  process.env.LIA_STORE_FREE_ABOVE_LOJAB = "80";
  const { freights, totalFee } = computeStoreFreights([
    { qty: 2, unitPrice: 10, storeKey: "lojaa", storeLabel: "Loja A" },
    { qty: 1, unitPrice: 30, storeKey: "lojaa", storeLabel: "Loja A" },
    { qty: 1, unitPrice: 90, storeKey: "lojab", storeLabel: "Loja B" }
  ]);
  assert.equal(freights.length, 2);
  const lojaA = freights.find((f) => f.storeKey === "lojaa")!;
  const lojaB = freights.find((f) => f.storeKey === "lojab")!;
  assert.equal(lojaA.subtotal, 50);
  assert.equal(lojaA.fee, 14.9);
  // Loja B passou do limiar de frete grátis do próprio site.
  assert.equal(lojaB.fee, 0);
  assert.equal(totalFee, 14.9);
});

test("quebra humana marca tarifa padrão e frete grátis", () => {
  process.env.LIA_STORE_FREIGHT_LOJAA = "14.90";
  process.env.LIA_STORE_FREE_ABOVE_LOJAA = "99";
  const label = freightBreakdownLabel(
    computeStoreFreights([
      { qty: 1, unitPrice: 120, storeKey: "lojaa", storeLabel: "Loja A" },
      { qty: 1, unitPrice: 20, storeKey: "lojax", storeLabel: "Loja X" }
    ]).freights
  );
  assert.match(label, /Loja A grátis \+ Loja X R\$18,00 \(tarifa padrão\)/);
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
