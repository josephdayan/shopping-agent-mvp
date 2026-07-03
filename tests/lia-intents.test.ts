import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectIntent,
  extractCep,
  isBareCep,
  looksLikeMedicine,
  parseBasketLines,
  parseChoiceReply,
  parseRefinement,
  wantsMoreOptions
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

test("escolhendo: 'acha outras' pede MAIS opções (não repete as mesmas)", () => {
  assert.equal(wantsMoreOptions("acha outras, por favor."), true);
  assert.equal(wantsMoreOptions("tem mais?"), true);
  assert.equal(wantsMoreOptions("tem outras opções?"), true);
  assert.equal(wantsMoreOptions("mostra outras"), true);
  assert.equal(wantsMoreOptions("quero ver mais"), true);
  assert.equal(wantsMoreOptions("nenhuma dessas, mostra outras"), true);
  // "mais barato" é escolha da mais barata, não paginação
  assert.equal(wantsMoreOptions("tem mais barato?"), false);
  assert.equal(wantsMoreOptions("quero o 2"), false);
  // review: ADICIONAR item não é paginação
  assert.equal(wantsMoreOptions("manda mais 2 cocas"), false);
  assert.equal(wantsMoreOptions("me manda mais um leite"), false);
  assert.equal(wantsMoreOptions("tem mais alguma marca de café?"), false);
  assert.equal(wantsMoreOptions("busca outro arroz"), false);
});

test("escolhendo: refinamento por cor/tamanho/peso", () => {
  assert.deepEqual(parseRefinement("tem essa em azul?"), ["azul"]);
  assert.deepEqual(parseRefinement("tem de 2kg?"), ["2kg"]);
  assert.deepEqual(parseRefinement("tem de 2 kg?"), ["2kg"]);
  assert.deepEqual(parseRefinement("quero uma maior"), ["grande"]);
  assert.deepEqual(parseRefinement("tem menor?"), ["pequeno"]);
  assert.deepEqual(parseRefinement("na cor rosa"), ["rosa"]);
  // um produto novo NÃO é refinamento
  assert.equal(parseRefinement("quero fralda azul"), null);
  assert.equal(parseRefinement("adiciona 2 leites"), null);
  assert.equal(parseRefinement("1"), null);
  // review: artigos, feminino e decimais
  assert.deepEqual(parseRefinement("quero a azul"), ["azul"]);
  assert.deepEqual(parseRefinement("prefiro a pequena"), ["pequena"]);
  assert.deepEqual(parseRefinement("a mesma mas grande"), ["grande"]);
  assert.deepEqual(parseRefinement("tem de 1,5l?"), ["1,5l"]);
  assert.deepEqual(parseRefinement("tem a de 2 litros?"), ["2l"]);
  assert.deepEqual(parseRefinement("pode ser a de 2 litros"), ["2l"]);
});

test("attrMatchesItem: pesos/volumes casam com nomes reais (espaçado, decimal)", async () => {
  const { attrMatchesItem } = await import("../src/lib/stores/types");
  const item = (name: string) => ({ sku: "x", name, unitPrice: 1 });
  assert.equal(attrMatchesItem("2kg", item("Arroz Tio João 2Kg")), true);
  assert.equal(attrMatchesItem("2kg", item("Arroz Tio João 2 Kg")), true);
  assert.equal(attrMatchesItem("2l", item("Coca-Cola Zero 2 Litros")), true);
  assert.equal(attrMatchesItem("2l", item("Coca-Cola 2L")), true);
  assert.equal(attrMatchesItem("1,5l", item("Guaraná Antarctica 1,5L")), true);
  // "5l" NÃO pode casar com "1,5L" nem "2l" com "12L"
  assert.equal(attrMatchesItem("5l", item("Guaraná Antarctica 1,5L")), false);
  assert.equal(attrMatchesItem("2l", item("Galão 12L")), false);
  assert.equal(attrMatchesItem("2kg", item("Ração Golden 15Kg")), false);
  // cor/tamanho usam o matcher de palavras
  assert.equal(attrMatchesItem("azul", item("Esponja Azul Scotch Brite")), true);
  assert.equal(attrMatchesItem("azul", item("Esponja Verde Scotch Brite")), false);
  assert.equal(attrMatchesItem("grande", item("Coleira Grande para Cães")), true);
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
  assert.deepEqual(parseChoiceReply("qualquer um", options), { type: "any" });
  assert.equal(parseChoiceReply("2 cocas", options), null);
  // review: "pode ser <atributo>" NÃO é carta branca — vira refinamento, nunca compra a 1
  assert.equal(parseChoiceReply("pode ser a de 2 litros", options), null);
  assert.equal(parseChoiceReply("pode ser em azul", options), null);
  assert.equal(parseChoiceReply("pode ser a grande", options), null);
  // review: "quero ver mais" não pode virar match de nome ("ver" não é token de produto)
  assert.equal(parseChoiceReply("quero ver mais", options), null);
  assert.equal(parseChoiceReply("acha outras", options), null);
});
