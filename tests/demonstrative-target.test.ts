// Rodada de teste ao vivo de 15/09, F2: a legenda "quero 2 desse" chegou como mensagem
// SEPARADA da foto (o WhatsApp Web não deixa legendar encaminhamento), o roteador
// classificou `basket_edit` e a palavra "desse" foi buscada como produto — a Lia
// respondeu "*2x desse* eu não achei em nenhuma loja agora". Demonstrativo sem
// substantivo aponta pro que já está na mesa: nunca é termo de busca.
import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDemonstrativeOnly } from "../src/lib/lia-intents";

test("demonstrativo sozinho nunca é busca (o caso do F2)", () => {
  for (const s of [
    "desse",
    "2 desse",
    "quero 2 desse",
    "2x desse",
    "esse",
    "quero esse",
    "esse aí",
    "esse ai por favor",
    "esses",
    "daquele mesmo",
    "mais um desse",
    "poe mais um desse",
    "coloca 2 desse",
    "isso"
  ]) {
    assert.equal(isDemonstrativeOnly(s), true, s);
  }
});

test("demonstrativo COM substantivo continua busca de verdade", () => {
  for (const s of [
    "esse arroz",
    "desse leite",
    "quero 2 arroz",
    "poe mais um shampoo",
    "manda 2 coca",
    "ração golden",
    "arroz",
    "2 caixas de leite",
    "shampoo do boticario",
    "tem leite?",
    "mais barato",
    "outra cor",
    "oi",
    "bom dia",
    "nao"
  ]) {
    assert.equal(isDemonstrativeOnly(s), false, s);
  }
});

test("frase vazia ou só pontuação não é demonstrativo (segue o caminho de sempre)", () => {
  for (const s of ["", "   ", "...", "2", "!!"]) assert.equal(isDemonstrativeOnly(s), false, JSON.stringify(s));
});
