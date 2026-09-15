// 15/09: o comprador escolhia a entrega comparando o TEXTO da promessa com o prazo de cada
// opção; "pela própria loja · prazo da loja: 7 dias úteis" nunca batia. Agora a promessa vira
// minutos e qualquer entrega igual ou mais rápida serve (a mais barata).
import { test } from "node:test";
import assert from "node:assert/strict";
import { promisedMinutes, estimateMinutes } from "../src/lib/live-freight";

test("promisedMinutes lê a promessa em qualquer formato da Lia", () => {
  assert.equal(promisedMinutes("pela própria loja · prazo da loja: 7 dias úteis"), 7 * 1440);
  assert.equal(promisedMinutes("prazo da loja: 1 dia útil"), 1440);
  assert.equal(promisedMinutes("prazo da loja: 2 dias"), 2 * 1440);
  assert.equal(promisedMinutes("prazo da loja: 16h"), 16 * 60);
  assert.equal(promisedMinutes("prazo da loja: 45 min"), 45);
  assert.equal(promisedMinutes("prazo da loja: hoje"), 1440);
  assert.equal(promisedMinutes(undefined), null);
  assert.equal(promisedMinutes("entrega pela loja"), null);
  // Opções da Cobasi reais: Econômica 1bd e 7bd cabem em 7 dias úteis; 16h também.
  for (const e of ["1bd", "7bd", "16h"]) assert.ok(estimateMinutes(e) <= promisedMinutes("prazo da loja: 7 dias úteis")!);
  assert.ok(estimateMinutes("8bd") > promisedMinutes("prazo da loja: 7 dias úteis")!);
});
