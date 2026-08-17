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

test("marketplace: anúncio do ML sem frete grátis não é cobrado no automático (frete desconhecido → operador)", () => {
  // Dono, 17/08: cobrar R$18 de tarifa padrão sobre anúncio do ML é chute — o frete é
  // do anúncio, não da loja. Sem frete grátis declarado, a cotação vai pro operador.
  const mlGratis = { qty: 1, unitPrice: 319, storeKey: "mercadolivre", storeLabel: "Mercado Livre", freeShipping: true };
  // Link só de CATÁLOGO: não dá id de anúncio, então não há como consultar o frete real.
  const mlPago = { qty: 1, unitPrice: 40, storeKey: "mercadolivre", storeLabel: "Mercado Livre", productUrl: "https://www.mercadolivre.com.br/cabo/p/MLB75605670" };
  // Link de ANÚNCIO: a consulta ao vivo (`shipping_options`) resolve custo e prazo reais,
  // então a cesta pode fechar na hora — quem valida o número é o `tryPublishInstantQuote`.
  const mlAnuncio = { qty: 1, unitPrice: 40, storeKey: "mercadolivre", storeLabel: "Mercado Livre", productUrl: "https://produto.mercadolivre.com.br/MLB-1385716686-mochila-_JM" };
  const vitrine = { qty: 1, unitPrice: 9.9, storeKey: "carrefour", storeLabel: "Carrefour" };
  assert.equal(instantQuoteEligible([mlGratis], "concierge"), true, "anúncio frete grátis segue instantâneo");
  assert.equal(instantQuoteEligible([mlPago], "concierge"), false, "frete do anúncio desconhecido → manual");
  assert.equal(instantQuoteEligible([mlAnuncio], "concierge"), true, "link de anúncio permite frete real → instantâneo");
  assert.equal(instantQuoteEligible([mlGratis, mlPago], "concierge"), false, "um item pago derruba a cesta toda");
  assert.equal(instantQuoteEligible([vitrine, mlGratis], "concierge"), true, "loja com política + ML grátis seguem instantâneos");
});

test("frete grátis do próprio anúncio (ML) vence a tarifa padrão — e um item pago derruba a isenção", () => {
  // Caso real 17/08: violão do ML com "Chegará grátis hoje" saía na cotação com R$18 de
  // tarifa padrão (o ML não tem política de loja) — taxa fantasma, o anúncio entrega grátis.
  const anuncioGratis = { qty: 1, unitPrice: 319, storeKey: "mercadolivre", storeLabel: "Mercado Livre", freeShipping: true };
  const so = computeStoreFreights([anuncioGratis]);
  assert.equal(so.totalFee, 0, "anúncio com frete grátis não pode cobrar frete");

  // Dois anúncios grátis continuam grátis.
  const dois = computeStoreFreights([anuncioGratis, { ...anuncioGratis, unitPrice: 90 }]);
  assert.equal(dois.totalFee, 0);

  // Conservador: um item SEM frete grátis na mesma loja traz a política de volta
  // (nunca cobrar a menos — o operador é quem paga a diferença).
  const misto = computeStoreFreights([anuncioGratis, { qty: 1, unitPrice: 40, storeKey: "mercadolivre", storeLabel: "Mercado Livre" }]);
  assert.ok(misto.totalFee > 0, `esperava frete de volta, veio ${misto.totalFee}`);

  // Outras lojas seguem com a política delas mesmo quando o ML está grátis.
  const duasLojas = computeStoreFreights([anuncioGratis, { qty: 1, unitPrice: 30, storeKey: "oba", storeLabel: "Oba" }]);
  assert.equal(duasLojas.freights.find((f) => f.storeKey === "mercadolivre")?.fee, 0);
  assert.ok((duasLojas.freights.find((f) => f.storeKey === "oba")?.fee ?? 0) > 0);
});
