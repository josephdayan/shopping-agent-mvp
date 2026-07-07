// Regressão do review profundo de conversa (2026-07-06): 115 achados → correções de
// NLU, parser de lista e matcher. Cada bloco cita o sintoma original.
import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent, parseBasketLines, parseRefinement, parseChoiceReply, wantsMoreOptions, narrowChoiceByName, asksRunningTotal } from "../src/lib/lia-intents";
import { scoreCatalogMatch, rankCatalog } from "../src/lib/stores/types";

const kind = (s: string) => detectIntent(s).kind;

test("negação seca é reject (antes: busca → 'Esponja Não Risca')", () => {
  for (const s of ["não", "nao", "não, obrigado", "nao quero", "deixa pra lá", "esquece", "nao precisa mais", "melhor não", "hoje nao", "nn"]) {
    assert.equal(kind(s), "reject", s);
  }
});

test("fechamento de lista é done (antes: 'só isso' virava produto)", () => {
  for (const s of ["só isso", "so isso mesmo", "é só", "mais nada", "nada mais", "por hoje é isso", "não quero mais nada"]) {
    assert.equal(kind(s), "done", s);
  }
});

test("multi-intenção tira+coloca separa remove e add", () => {
  const i = detectIntent("tira o arroz e coloca feijão");
  assert.deepEqual(i, { kind: "remove_item", target: "arroz", andAdd: "feijao" });
  const j = detectIntent("cancela o guarana e manda uma coca");
  assert.equal(j.kind, "remove_item");
  assert.equal((j as { target: string }).target, "guarana");
  assert.match((j as { andAdd?: string }).andAdd ?? "", /coca/);
});

test("perguntas operacionais são service_question (antes: sabonete)", () => {
  assert.deepEqual(detectIntent("vc entrega em osasco?"), { kind: "service_question", topic: "area" });
  assert.deepEqual(detectIntent("quanto custa o frete?"), { kind: "service_question", topic: "fee" });
  assert.equal(kind("vcs aceitam vale refeição?"), "service_question");
});

test("status cobre as frases de ansiedade da entrega", () => {
  for (const s of ["que horas chega?", "chega hoje?", "meu pedido nao chegou", "ta chegando?", "cade meu pedido", "caiu?", "e meu pedido?", "como ta minha entrega?"]) {
    assert.equal(kind(s), "status", s);
  }
  // frase inteira é status; "meu pedido" no meio de frase continua pedido de produto
  assert.equal(kind("adiciona um leite no meu pedido"), "free_text");
});

test("confirmações brasileiras são affirm", () => {
  for (const s of ["tá bom", "pode mandar", "confirmado", "é isso", "isso ai", "manda ai", "ss", "👍👍"]) {
    assert.equal(kind(s), "affirm", s);
  }
});

test("pagamento: reenviar código / expirado / trocar forma / recusa", () => {
  assert.deepEqual(detectIntent("não recebi o código"), { kind: "resend_code", expired: false });
  assert.equal((detectIntent("o pix expirou") as { expired: boolean }).expired, true);
  assert.equal(kind("quero mudar a forma de pagamento"), "switch_payment");
  assert.equal(kind("não vou pagar"), "cancel");
  assert.equal(kind("cancela o pagamento"), "cancel");
});

test("posso cancelar? é pergunta, não execução", () => {
  assert.equal(kind("posso cancelar?"), "cancel_question");
  assert.equal(kind("cancela o pedido"), "cancel");
});

test("humano e reclamação têm intent próprio", () => {
  assert.equal(kind("quero falar com atendente"), "human");
  assert.equal(kind("meu pedido veio errado"), "complaint");
});

test("CEP + itens juntos não descarta os itens", () => {
  const i = detectIntent("meu cep é 01310-100, quero arroz e leite");
  assert.equal(i.kind, "cep");
  assert.match((i as { rest?: string }).rest ?? "", /arroz/);
});

test("número com zero à esquerda não é escolha de opção", () => {
  assert.equal(kind("08"), "free_text");
  assert.equal(kind("8"), "number");
});

test("parser: peso não é quantidade; extenso e enumeração funcionam", () => {
  assert.deepEqual(parseBasketLines("2kg de arroz"), [{ phrase: "arroz 2kg", qty: 1 }]);
  assert.deepEqual(parseBasketLines("dois pães"), [{ phrase: "pães", qty: 2 }]);
  assert.deepEqual(parseBasketLines("meia dúzia de ovo"), [{ phrase: "ovo", qty: 6 }]);
  assert.deepEqual(parseBasketLines("1 arroz\n2 feijao\n3 oleo").map((x) => x.qty), [1, 1, 1]);
  assert.equal(parseBasketLines("999 cocas")[0].qty, 50); // teto de sanidade
  assert.deepEqual(parseBasketLines("arroz + feijao").map((x) => x.phrase), ["arroz", "feijao"]);
  assert.deepEqual(parseBasketLines("ah e um papel toalha").map((x) => x.phrase), ["papel toalha"]);
});

test("parser: saudação e introdução com dois-pontos não viram produto", () => {
  const messy = parseBasketLines("oi lia tudo bem? preciso de umas coisas pra casa: papel higienico, detergente e sabao em po. ah e um refri tbm");
  assert.deepEqual(messy.map((x) => x.phrase), ["papel higienico", "detergente", "sabao em po", "refri"]);
  assert.deepEqual(parseBasketLines("oi lia, me ve um arroz").map((x) => x.phrase), ["arroz"]);
  // decimais sobrevivem ao split por ponto/vírgula
  assert.deepEqual(parseBasketLines("1,5l de leite"), [{ phrase: "leite 1,5l", qty: 1 }]);
});

test("escolhendo: texto que discrimina entre as opções estreita (não vira item novo)", () => {
  const ops = [
    { name: "Refrigerante Fanta Laranja 200ML" },
    { name: "Refrigerante Coca-Cola Sem Açúcar Pet 200 ml" },
    { name: "Refrigerante Coca-Cola Original Pet 200 ml" }
  ];
  assert.deepEqual(narrowChoiceByName("coca", ops), [1, 2]);
  assert.deepEqual(narrowChoiceByName("a fanta", ops), [0]);
  assert.deepEqual(narrowChoiceByName("e um leite", ops), []); // item novo de verdade
  assert.deepEqual(narrowChoiceByName("coca não", ops), []); // negação não discrimina
});

test("'quanto deu tudo?' é pergunta de total, não busca", () => {
  for (const s of ["quanto deu tudo?", "qual o total?", "resumo", "quanto ficou?", "meu carrinho"]) {
    assert.ok(asksRunningTotal(s), s);
  }
  assert.ok(!asksRunningTotal("quanto custa o frete?")); // essa é service_question
  assert.ok(!asksRunningTotal("quero coca"));
});

test("refinamento de mercado: desnatado/zero/sem lactose refinam, não viram item novo", () => {
  assert.deepEqual(parseRefinement("desnatado"), ["desnatado"]);
  assert.deepEqual(parseRefinement("tem sem lactose?"), ["sem lactose"]);
  assert.deepEqual(parseRefinement("zero"), ["zero"]);
});

test("escolha: último / mais caro / recomenda", () => {
  const ops = [{ name: "A", unitPrice: 5 }, { name: "B", unitPrice: 9 }, { name: "C", unitPrice: 7 }];
  assert.deepEqual(parseChoiceReply("o ultimo", ops), { type: "pick", index: 2 });
  assert.deepEqual(parseChoiceReply("o mais caro", ops), { type: "pick", index: 1 });
  assert.deepEqual(parseChoiceReply("qual voce recomenda?", ops), { type: "any" });
  assert.ok(wantsMoreOptions("tem outras marcas?"));
});

test("matcher: piso de relevância mata ruído conversacional", () => {
  const esponja = { sku: "x", name: "Esponja Multiuso Não Risca Carrefour", unitPrice: 2 };
  assert.equal(scoreCatalogMatch("não, obrigado", esponja), 0);
  assert.equal(scoreCatalogMatch("vc entrega em osasco", esponja), 0);
});

test("matcher: ingrediente não responde por produto ('ovos' ≠ Macarrão com Ovos)", () => {
  const macarrao = { sku: "m", name: "Macarrão com Ovos Adria 500g", unitPrice: 5 };
  assert.equal(scoreCatalogMatch("ovos", macarrao), 0);
  const petisco = { sku: "p", name: "Petisco para Cachorro Purina Frango", unitPrice: 10 };
  assert.equal(scoreCatalogMatch("frango", petisco), 0);
});

test("matcher: pet nunca responde por produto humano", () => {
  const dogShampoo = { sku: "d", name: "Shampoo para Cães e Gatos Sanol", unitPrice: 12 };
  assert.equal(scoreCatalogMatch("shampoo", dogShampoo), 0);
});

test("matcher: fardo perde pra unidade; variante processada perde pro básico", () => {
  const items = [
    { sku: "fardo", name: "Coca-Cola Zero 2 Litros 6 Unidades", unitPrice: 65.94 },
    { sku: "un", name: "Coca-Cola Sem Açúcar Pet 2 L", unitPrice: 10.99 }
  ];
  assert.equal(rankCatalog("coca zero 2l", items, 2)[0].sku, "un");
  const leites = [
    { sku: "cond", name: "Leite Condensado Piracanjuba 395g", unitPrice: 6 },
    { sku: "uht", name: "Leite UHT Integral Piracanjuba 1L", unitPrice: 5 }
  ];
  assert.equal(rankCatalog("leite", leites, 2)[0].sku, "uht");
});

test("matcher: 'sem açúcar' exclui açúcar; marca no head efetivo", () => {
  const acucar = { sku: "a", name: "Açúcar Refinado União 1kg", unitPrice: 5 };
  assert.equal(scoreCatalogMatch("café sem açúcar", acucar), 0);
  const base = { sku: "b", name: "Quem Disse, Berenice? Base Líquida Mate", brand: "Quem Disse, Berenice?", unitPrice: 40 };
  assert.ok(scoreCatalogMatch("base", base) > 0);
});

test("matcher: 'Sem Perfume' no NOME não responde por 'perfume'", () => {
  const semPerfume = { sku: "s", name: "Cuide-se bem Antitranspirante Em Creme Sem Perfume", unitPrice: 20 };
  assert.equal(scoreCatalogMatch("perfume", semPerfume), 0);
});

test("matcher: substantivo de categoria vale no meio do nome (beleza)", () => {
  const colonia = { sku: "c", name: "Celebre Agora Feminino Desodorante Colônia 100ml", brand: "Celebre", unitPrice: 90 };
  assert.ok(scoreCatalogMatch("perfume", colonia) > 0);
});

test("matcher: infantil/baby só quando pedido; fralda é isenta", () => {
  const baby = { sku: "b", name: "Boti Baby Colônia Lua 100ml", brand: "Boti Baby", unitPrice: 74 };
  const adulto = { sku: "a", name: "Celebre Agora Masculino Desodorante Colônia 10ml", brand: "Celebre", unitPrice: 90 };
  assert.equal(rankCatalog("perfume", [baby, adulto], 2)[0].sku, "a");
  assert.equal(rankCatalog("colonia infantil", [baby, adulto], 2)[0].sku, "b");
  // fralda tem "Baby" de fábrica no nome — não pode ser rebaixada
  const fralda = { sku: "f", name: "Fralda Capricho Baby Willy Mega G 34un", unitPrice: 30 };
  assert.ok(scoreCatalogMatch("fralda G", fralda) > 0);
  assert.equal(rankCatalog("fralda G", [fralda], 1)[0].sku, "f");
});
