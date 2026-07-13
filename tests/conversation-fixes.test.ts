// Regressão do review profundo de conversa (2026-07-06): 115 achados → correções de
// NLU, parser de lista e matcher. Cada bloco cita o sintoma original.
import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent, mergeShoppingLines, parseBasketLines, parseContextualQuantity, parseRefinement, parseChoiceReply, wantsMoreOptions, narrowChoiceByName, asksRunningTotal, parsePriceCap } from "../src/lib/lia-intents";
import { inferCatalogRefinement, scoreCatalogMatch, rankCatalog } from "../src/lib/stores/types";

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
  assert.equal(kind("fecha"), "pay");
  assert.deepEqual(detectIntent("fecha no pix"), { kind: "pay", method: "pix" });
  assert.deepEqual(detectIntent("cartao msm"), { kind: "choose_payment", method: "card" });
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
  assert.deepEqual(parseBasketLines("dois pães"), [{ phrase: "pães", qty: 2, qtyExplicit: true }]);
  assert.deepEqual(parseBasketLines("meia dúzia de ovo"), [{ phrase: "ovo", qty: 6, qtyExplicit: true }]);
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

test("mensagem preguiçosa: abreviações não contaminam o nome do produto", () => {
  assert.deepEqual(parseBasketLines("qro uma coca tb pf").map((x) => x.phrase), ["coca"]);
  assert.deepEqual(parseBasketLines("qr detergente e sabonete tbm").map((x) => x.phrase), ["detergente", "sabonete"]);
  assert.deepEqual(parseBasketLines("bota um papel hig pff").map((x) => x.phrase), ["papel hig"]);
});

test("quantidade contextual entende resposta natural e botão", () => {
  for (const [text, qty] of [["qty:3", 3], ["mais 2", 2], ["quero 5", 5], ["duas", 2], ["me vê quatro", 4], ["meia dúzia", 6]] as const) {
    assert.equal(parseContextualQuantity(text), qty, text);
  }
  assert.equal(parseContextualQuantity("muitas"), null);
  assert.equal(parseContextualQuantity("99"), null);
});

test("busca tolera um erro de digitação sem aceitar ruído curto", () => {
  const catalog = [
    { sku: "1", name: "Detergente Líquido Neutro", unitPrice: 3 },
    { sku: "2", name: "Banana Nanica", unitPrice: 5 },
    { sku: "3", name: "Escova Dental Macia", unitPrice: 8 }
  ];
  assert.equal(rankCatalog("detergnte", catalog, 3)[0]?.sku, "1");
  assert.equal(rankCatalog("bananna", catalog, 3)[0]?.sku, "2");
  assert.equal(rankCatalog("escva", catalog, 3)[0]?.sku, "3");
  assert.equal(rankCatalog("bom", catalog, 3).length, 0);
});

test("extração por IA não pode esquecer parte de uma lista", () => {
  assert.deepEqual(
    mergeShoppingLines(
      [{ phrase: "refrigerante coca cola", qty: 1 }],
      [{ phrase: "coca", qty: 1 }, { phrase: "escova de dente", qty: 1 }]
    ),
    [{ phrase: "refrigerante coca cola", qty: 1 }, { phrase: "escova de dente", qty: 1 }]
  );
  assert.deepEqual(
    mergeShoppingLines(
      [{ phrase: "creme dental", qty: 1 }],
      [{ phrase: "pasta de dente", qty: 1 }, { phrase: "sabonete", qty: 1 }]
    ),
    [{ phrase: "creme dental", qty: 1 }, { phrase: "sabonete", qty: 1 }]
  );
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

test("refinamento de perfume: masculino/feminino filtram a escolha atual", () => {
  assert.deepEqual(parseRefinement("masculino"), ["masculino"]);
  assert.deepEqual(parseRefinement("quero o feminino"), ["feminino"]);
  assert.deepEqual(parseRefinement("pode ser unissex"), ["unissex"]);
  assert.deepEqual(parseRefinement("pra homem"), ["masculino"]);
  assert.deepEqual(parseRefinement("de mulher"), ["feminino"]);
  assert.deepEqual(parseRefinement("infantil"), ["infantil"]);
  assert.deepEqual(parseRefinement("pra filhote"), ["filhote"]);
});

test("refinamento é geral e descoberto nos candidatos, não específico de produto", () => {
  const candidates = [
    { sku: "a", name: "Sabonete Líquido Lavanda 500ml", brand: "Casa", unitPrice: 10 },
    { sku: "b", name: "Tênis Corrida Azul Tamanho 42", brand: "Run", unitPrice: 100 },
    { sku: "c", name: "Iogurte Sabor Morango", brand: "Leve", unitPrice: 5 }
  ];
  assert.deepEqual(inferCatalogRefinement("cheiro de lavanda", candidates), ["lavanda"]);
  assert.deepEqual(inferCatalogRefinement("cor azul", candidates), ["azul"]);
  assert.deepEqual(inferCatalogRefinement("tamanho 42", candidates), ["42"]);
  assert.deepEqual(inferCatalogRefinement("sabor morango", candidates), ["morango"]);
  assert.equal(inferCatalogRefinement("adiciona um leite", candidates), null);
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

test("matcher: coca genérica prioriza embalagem comum, não mini de 200 ml", () => {
  const cocas = [
    { sku: "mini", name: "Coca-Cola Sem Açúcar Pet 200 ml", unitPrice: 1.69 },
    { sku: "lata", name: "Coca-Cola Lata 350 ml", unitPrice: 4.39 },
    { sku: "600", name: "Coca-Cola Pet 600 ml", unitPrice: 5.48 },
    { sku: "2l", name: "Coca-Cola Garrafa 2 L", unitPrice: 11.99 }
  ];
  assert.deepEqual(rankCatalog("coca", cocas, 4).map((i) => i.sku), ["lata", "600", "2l", "mini"]);
  assert.equal(rankCatalog("coca 200 ml", cocas, 1)[0].sku, "mini");
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

// ---- ciclo conversation-improver 2026-07-12 ----

test("parser: 'preciso d'/'presiso de' não contaminam o item (antes: opção '*preciso d arros 5kg*')", () => {
  assert.deepEqual(parseBasketLines("preciso d arros 5kg, feijaum carioca").map((x) => x.phrase), ["arros 5kg", "feijaum carioca"]);
  assert.deepEqual(parseBasketLines("presiso de arroz").map((x) => x.phrase), ["arroz"]);
});

test("parser: vocativo não vira produto ('minha filha', 'amiga')", () => {
  assert.deepEqual(parseBasketLines("boa tarde minha filha quero arroz e cafe por favor").map((x) => x.phrase), ["arroz", "cafe"]);
  assert.deepEqual(parseBasketLines("amiga me ve um leite"), [{ phrase: "leite", qty: 1, qtyExplicit: true }]);
});

test("parser: conjunção no começo não fica no nome ('e areia pro gato tb' → 'areia pro gato')", () => {
  assert.deepEqual(parseBasketLines("e areia pro gato tb").map((x) => x.phrase), ["areia pro gato"]);
  assert.deepEqual(parseBasketLines("e tbm feijao").map((x) => x.phrase), ["feijao"]);
});

test("parser: cláusula 'ele é filhote' descreve o item anterior, não vira item novo", () => {
  assert.deepEqual(parseBasketLines("qro racao pro meu dog, ele é filhote"), [{ phrase: "racao pro meu dog filhote", qty: 1 }]);
  // descrição solta sem item anterior não vira produto
  assert.deepEqual(parseBasketLines("ela é pequena"), []);
});

test("teto de preço: 'algum até 150 reais?' é filtro de preço, não escolha nem item", () => {
  assert.equal(parsePriceCap("algum ate 150 reais?"), 150);
  assert.equal(parsePriceCap("tem por menos de r$ 50?"), 50);
  assert.equal(parsePriceCap("até 89,90 reais"), 89.9);
  assert.equal(parsePriceCap("quero 2"), null);
  assert.equal(parsePriceCap("fralda ate tamanho g"), null);
});

test("matcher: 'coca' genérica prefere a original à Sem Açúcar (antes: Sem Açúcar 310ml em 1º)", () => {
  const cocas = [
    { sku: "sa", name: "Coca Cola Sem Açúcar Lata 310 ml", unitPrice: 3.99 },
    { sku: "or", name: "Coca-Cola Lata 350 ml", unitPrice: 4.39 }
  ];
  assert.equal(rankCatalog("cocas", cocas, 2)[0].sku, "or");
  assert.equal(rankCatalog("coca", cocas, 2)[0].sku, "or");
  // pedir zero/sem açúcar inverte
  assert.equal(rankCatalog("coca zero", cocas, 2)[0].sku, "sa");
});

test("matcher: 'pro' (= pra o) não é match de marca Pro Plan (antes: ração de R$343 em 2º)", () => {
  const racoes = [
    { sku: "pp", name: "Ração Nestlé Purina Pro Plan para Cães Adultos Sabor Frango 10,1 kg", unitPrice: 343 },
    { sku: "pe", name: "Ração Pedigree para Cães Adultos Carne 10,1 kg", unitPrice: 90 }
  ];
  assert.equal(rankCatalog("racao pro meu dog", racoes, 2)[0].sku, "pe");
  // pedir a marca de verdade continua funcionando
  assert.equal(rankCatalog("racao pro plan", racoes, 2)[0].sku, "pp");
});

test("matcher: achocolatado em pó é o básico — não perde pro chocolate quente pronto", () => {
  const items = [
    { sku: "quente", name: "Achocolatado Chocolate Quente Cremoso 3 Corações 180g", unitPrice: 22.39 },
    { sku: "nescau", name: "Achocolatado em Pó Nescau 550g", unitPrice: 14.9 }
  ];
  assert.equal(rankCatalog("achocolatado", items, 2)[0].sku, "nescau");
  // leite em pó continua sendo variante processada de "leite"
  const leites = [
    { sku: "po", name: "Leite em Pó Ninho Integral 380g", unitPrice: 15 },
    { sku: "uht", name: "Leite UHT Integral Piracanjuba 1L", unitPrice: 6 }
  ];
  assert.equal(rankCatalog("leite", leites, 2)[0].sku, "uht");
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
