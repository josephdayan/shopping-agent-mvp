import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectIntent,
  extractCep,
  isBareCep,
  looksLikeMedicine,
  parseBasketLines,
  parseChoiceReply
} from "../src/lib/lia-intents";

function kind(text: string) {
  return detectIntent(text).kind;
}

test("saudações e social", () => {
  assert.equal(kind("oi"), "greeting");
  assert.equal(kind("Olá!"), "greeting");
  assert.equal(kind("bom dia"), "greeting");
  assert.equal(kind("tudo bem?"), "greeting");
  assert.equal(kind("obrigado"), "thanks");
  assert.equal(kind("muito obrigada Lia!"), "thanks");
  assert.equal(kind("valeu"), "thanks");
  assert.equal(kind("ajuda"), "help");
  assert.equal(kind("como funciona?"), "help");
});

test("status do pedido", () => {
  assert.equal(kind("status"), "status");
  assert.equal(kind("cade meu pedido?"), "status");
  assert.equal(kind("quando chega minha entrega?"), "status");
  assert.equal(kind("quero o rastreio"), "status");
  assert.equal(kind("já saiu pra entrega?"), "status");
});

test("paguei / pagamento", () => {
  assert.equal(kind("paguei"), "paid_claim");
  assert.equal(kind("já paguei o pix"), "paid_claim");
  assert.equal(kind("fiz o pix agora"), "paid_claim");
  assert.equal(kind("pago"), "paid_claim");
  assert.equal(kind("pagamento feito"), "paid_claim");
  assert.equal(kind("pagar"), "pay");
  assert.equal(kind("quero pagar"), "pay");
  assert.equal(kind("finalizar"), "pay");
  assert.equal(kind("fechar o pedido"), "pay");
  const payPix = detectIntent("quero pagar no pix");
  assert.equal(payPix.kind, "pay");
  assert.equal((payPix as { method?: string }).method, "pix");
  assert.equal(kind("pix"), "choose_payment");
  assert.equal(kind("no cartão"), "choose_payment");
  const card = detectIntent("cartão de crédito");
  assert.equal(card.kind, "choose_payment");
  assert.equal((card as { method?: string }).method, "card");
});

test("cancelar vs limpar carrinho vs tirar item", () => {
  assert.equal(kind("cancelar"), "cancel");
  assert.equal(kind("quero cancelar"), "cancel");
  assert.equal(kind("cancela o pedido"), "cancel");
  assert.equal(kind("desisti"), "cancel");
  assert.equal(kind("não quero mais"), "cancel");
  assert.equal(kind("limpar carrinho"), "clear_cart");
  assert.equal(kind("zerar"), "clear_cart");
  assert.equal(kind("novo pedido"), "clear_cart");
  assert.equal(kind("tira tudo"), "clear_cart");
  const rm = detectIntent("tira a esponja");
  assert.equal(rm.kind, "remove_item");
  assert.equal((rm as { target: string }).target, "esponja");
  const rm2 = detectIntent("cancela o guaraná");
  assert.equal(rm2.kind, "remove_item");
  const rm3 = detectIntent("remove o arroz da lista por favor");
  assert.equal(rm3.kind, "remove_item");
  assert.equal((rm3 as { target: string }).target, "arroz");
});

test("trocar item", () => {
  const swap = detectIntent("troca o arroz por feijão");
  assert.equal(swap.kind, "swap_item");
  assert.equal((swap as { from: string }).from, "arroz");
  assert.equal((swap as { to: string }).to, "feijao");
  const swap2 = detectIntent("troca o arroz por favor");
  assert.equal(swap2.kind, "swap_item");
  assert.equal((swap2 as { to: string }).to, "");
  assert.equal(kind("mudar endereço"), "change_address");
});

test("endereço e CEP", () => {
  assert.equal(kind("trocar endereço"), "change_address");
  assert.equal(kind("meu cep mudou"), "change_address");
  assert.equal(kind("quero atualizar o cep"), "change_address");
  const cep = detectIntent("01310-100");
  assert.equal(cep.kind, "cep");
  assert.equal((cep as { cep: string }).cep, "01310-100");
  assert.equal((cep as { bare: boolean }).bare, true);
  const cep2 = detectIntent("cep 04538132");
  assert.equal(cep2.kind, "cep");
  assert.equal((cep2 as { bare: boolean }).bare, true);
  assert.equal(extractCep("meu cep é 04538-132"), "04538-132");
  assert.equal(isBareCep("04538132"), true);
  assert.equal(isBareCep("2 arroz e 1 coca"), false);
});

test("repetir pedido anterior", () => {
  assert.equal(kind("repete o de sempre"), "repeat_last");
  assert.equal(kind("pedido anterior"), "repeat_last");
  assert.equal(kind("mesma coisa de sempre"), "repeat_last");
});

test("afirmação, rejeição e números", () => {
  assert.equal(kind("sim"), "affirm");
  assert.equal(kind("pode ser"), "affirm");
  assert.equal(kind("fechado"), "affirm");
  assert.equal(kind("não era isso"), "reject");
  assert.equal(kind("não gostei, tem outras?"), "reject");
  const n = detectIntent("2");
  assert.equal(n.kind, "number");
  assert.equal((n as { value: number }).value, 2);
});

test("pedidos de produto continuam free_text", () => {
  assert.equal(kind("quero guaraná e pasta de dente"), "free_text");
  assert.equal(kind("2 arroz 5kg, 1 óleo de soja"), "free_text");
  assert.equal(kind("ração pro cachorro filhote"), "free_text");
  // "pilha" contém "pi", "coca" etc. — nada disso pode virar comando
  assert.equal(kind("pilha AA"), "free_text");
});

test("multi-item: parser determinístico com quantidades", () => {
  const lines = parseBasketLines("quero 2 guaraná, pasta de dente e 3x papel higiênico");
  assert.deepEqual(
    lines.map((l) => l.qty),
    [2, 1, 3]
  );
  assert.match(lines[0].phrase, /guaran/i);
  assert.match(lines[2].phrase, /papel/i);
});

test("remédio: guarda determinística", () => {
  assert.equal(looksLikeMedicine("quero dipirona"), true);
  assert.equal(looksLikeMedicine("tylenol e guaraná"), true);
  assert.equal(looksLikeMedicine("remédio pra dor"), true);
  assert.equal(looksLikeMedicine("sabão em pó e água sanitária"), false);
  assert.equal(looksLikeMedicine("ração pra gato"), false);
});

test("regressões do review: confirmações multi-palavra são affirm, não busca", () => {
  assert.equal(kind("sim, confirmo"), "affirm");
  assert.equal(kind("pode confirmar"), "affirm");
  assert.equal(kind("isso mesmo, fechado"), "affirm");
  assert.equal(kind("perfeito!"), "affirm");
  assert.equal(kind("show"), "affirm");
  // agradecimento puro continua thanks
  assert.equal(kind("obrigado"), "thanks");
});

test("regressões do review: cancelar item no meio da frase, não o carrinho todo", () => {
  const rm = detectIntent("não quero mais o guaraná");
  assert.equal(rm.kind, "remove_item");
  assert.equal((rm as { target: string }).target, "guarana");
  const rm2 = detectIntent("quero cancelar o arroz");
  assert.equal(rm2.kind, "remove_item");
  assert.equal(kind("não quero mais"), "cancel");
  const explicit = detectIntent("cancela o pedido");
  assert.equal(explicit.kind, "cancel");
  assert.equal((explicit as { explicitOrder?: boolean }).explicitOrder, true);
});

test("regressões do review: negação de pagamento pede o código de novo", () => {
  assert.equal(kind("ainda não paguei"), "pay");
  assert.equal(kind("não consegui pagar"), "pay");
  assert.equal(kind("paguei"), "paid_claim");
});

test("regressões do review: pergunta de preço não dispara cobrança", () => {
  assert.equal(kind("quanto fica no cartão?"), "free_text");
  assert.equal(kind("qual o valor no pix?"), "free_text");
  assert.equal(kind("cartão"), "choose_payment");
});

test("regressões do review: status não sequestra pedido de item", () => {
  assert.equal(kind("adiciona um leite no meu pedido"), "free_text");
  assert.equal(kind("coloca papel higiênico na minha entrega"), "free_text");
  assert.equal(kind("cade meu pedido?"), "status");
});

test("regressões do review: 'o mesmo' e 'igual da última vez' repetem", () => {
  assert.equal(kind("manda o mesmo"), "repeat_last");
  assert.equal(kind("o mesmo"), "repeat_last");
  assert.equal(kind("igual da última vez"), "repeat_last");
});

test("escolha de opções: número, ordinal, qualquer, mais barato, marca, nenhuma", () => {
  const options = [
    { name: "Leite Integral Piracanjuba 1L", unitPrice: 5.99 },
    { name: "Leite Desnatado Italac 1L", unitPrice: 4.99 },
    { name: "Leite Semidesnatado Parmalat 1L", unitPrice: 6.49 }
  ];
  assert.deepEqual(parseChoiceReply("2", options), { type: "pick", index: 1 });
  assert.deepEqual(parseChoiceReply("opção 3", options), { type: "pick", index: 2 });
  assert.deepEqual(parseChoiceReply("a primeira", options), { type: "pick", index: 0 });
  assert.deepEqual(parseChoiceReply("qualquer", options), { type: "any" });
  assert.deepEqual(parseChoiceReply("tanto faz", options), { type: "any" });
  assert.deepEqual(parseChoiceReply("o mais barato", options), { type: "cheapest" });
  assert.deepEqual(parseChoiceReply("o parmalat", options), { type: "pick", index: 2 });
  assert.deepEqual(parseChoiceReply("nenhuma dessas", options), { type: "skip" });
  // um novo pedido não pode ser interpretado como escolha
  assert.equal(parseChoiceReply("adiciona 2 sabonetes", options), null);
  // regressões do review: "pode ser a X" escolhe a X, não a primeira
  assert.deepEqual(parseChoiceReply("pode ser a parmalat", options), { type: "pick", index: 2 });
  assert.deepEqual(parseChoiceReply("pode ser a 2", options), { type: "pick", index: 1 });
  assert.deepEqual(parseChoiceReply("quero o 2 por favor", options), { type: "pick", index: 1 });
  assert.deepEqual(parseChoiceReply("pode ser", options), { type: "any" });
  assert.equal(parseChoiceReply("2 cocas", options), null);
});
