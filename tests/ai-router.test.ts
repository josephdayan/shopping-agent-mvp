// Unidade do filtro anti-promessa do roteador LLM: a IA nunca entrega desconto,
// gratuidade, estorno ou prazo — mesmo que o modelo escorregue, o filtro derruba.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRouterReply } from "../src/lib/adapters/ai";

test("respostas normais passam; promessas proibidas caem", () => {
  assert.equal(
    sanitizeRouterReply("A entrega é feita pela própria loja e eu acompanho até chegar 🙂"),
    "A entrega é feita pela própria loja e eu acompanho até chegar 🙂"
  );
  assert.equal(sanitizeRouterReply("Fechado, te dou 10% de desconto!"), undefined);
  assert.equal(sanitizeRouterReply("Pode deixar que sai de graça pra você"), undefined);
  assert.equal(sanitizeRouterReply("Já estornei o valor no seu cartão"), undefined);
  assert.equal(sanitizeRouterReply("Chega hoje sem falta!"), undefined);
  assert.equal(sanitizeRouterReply("Cancelei seu pedido agora"), undefined);
  assert.equal(sanitizeRouterReply("Tenho um cupom especial pra você"), undefined);
  assert.equal(sanitizeRouterReply(""), undefined);
  assert.equal(sanitizeRouterReply(undefined), undefined);
});

test("resposta gigante é cortada em 500 caracteres", () => {
  const long = "a".repeat(900);
  assert.equal(sanitizeRouterReply(long)?.length, 500);
});
