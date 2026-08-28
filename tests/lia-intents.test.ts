import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectIntent,
  extractCep,
  isBareCep,
  isRequestModifier,
  hasUrgencySignal,
  looksLikeMedicine,
  parseBasketLines,
  isNarrativeSegment,
  mergeShoppingLines,
  parseChoiceReply,
  stripListNumbering,
  parseRefinement,
  stripMedicineNegation,
  wantsMoreOptions
} from "../src/lib/lia-intents";

function kind(text: string) {
  return detectIntent(text).kind;
}

test("teste em massa 26/08: identidade composta, regateio, arrependimento, risada, frete", () => {
  // P1.5: identidade/golpe em frase composta vence a extração
  assert.equal(kind("oi... quem é vc? isso é golpe?"), "help");
  assert.equal(kind("isso é golpe?"), "help");
  // P2.3: regateio tem resposta própria
  assert.equal(kind("faz por 10?"), "haggle");
  assert.equal(kind("tem desconto?"), "haggle");
  // P1.7/P2.2: arrependimento seco é reject; risada é ack
  assert.equal(kind("pensando bem melhor não"), "reject");
  assert.equal(kind("kkkk beleza"), "thanks");
  assert.equal(kind("kkkkk"), "thanks");
  // P1.2: "quanto custa a entrega?" é PREÇO (fee), não área
  const fee = detectIntent("quanto custa a entrega?");
  assert.deepEqual(fee, { kind: "service_question", topic: "fee" });
  // pedido real com "entrega" no meio NÃO vira service_question
  assert.notEqual(kind("quero entrega de pizza"), "service_question");
});

test("2º testador (24/08): quanto falta, completar o valor e 'outro' singular", () => {
  assert.equal(kind("quanto falta?"), "missing_question");
  assert.equal(kind("falta quanto"), "missing_question");
  assert.equal(kind("o que posso pedir pra completar o valor"), "missing_question");
  assert.equal(kind("o que posso pedir pra completar o vamor".replace("vamor", "valor")), "missing_question");
  // "outro" singular pagina igual a "outras" (o amigo digitou no singular e virou busca)
  assert.equal(wantsMoreOptions("outro"), true);
  assert.equal(wantsMoreOptions("outra"), true);
  // "quanto custa o arroz" NÃO é missing_question — segue como pergunta/busca normal
  assert.notEqual(kind("quanto custa o arroz"), "missing_question");
});

test("feedback do 1º testador (24/08): identidade, endereço salvo e colírio", () => {
  // "Quem é vc" é apresentação, nunca busca (virou o blush "Quem Disse, Berenice?").
  assert.equal(kind("Quem é vc"), "help");
  assert.equal(kind("quem é você?"), "help");
  assert.equal(kind("vc é um robô?"), "help");
  assert.equal(kind("com quem eu to falando"), "help");
  // Pergunta sobre o endereço em arquivo responde o endereço — não vira busca.
  assert.equal(kind("Vc salvou o endereço já"), "address_question");
  assert.equal(kind("pegou meu cep?"), "address_question");
  assert.equal(kind("meu endereço tá certo?"), "address_question");
  // Mensagem COM cep/número é endereço chegando, não pergunta.
  assert.notEqual(kind("Rua X 221 São Paulo 01233020"), "address_question");
  // "trocar endereço" continua troca.
  assert.equal(kind("trocar endereço"), "change_address");
  // Colírio é item de farmácia: recusa explicada, nunca "não achei" genérico.
  assert.equal(looksLikeMedicine("colírio systane complete"), true);
});

test("troca por atributo e 'em vez de' (pedido do dono, 20/08)", () => {
  assert.deepEqual(detectIntent("coca zero em vez da normal"), { kind: "swap_item", from: "normal", to: "coca zero" });
  assert.deepEqual(detectIntent("bota coca zero no lugar da normal"), { kind: "swap_item", from: "normal", to: "coca zero" });
  assert.deepEqual(detectIntent("não quero de uva, quero de laranja"), { kind: "swap_item", from: "uva", to: "laranja", attr: true });
  // sem o "de" dos dois lados não é atributo — troca comum
  assert.deepEqual(detectIntent("não quero uva, quero laranja"), { kind: "swap_item", from: "uva", to: "laranja" });
  // comando nunca vira lado de troca
  assert.notEqual(kind("não quero mais nada, quero pagar"), "swap_item");
  assert.notEqual(kind("não quero mais, quero fechar"), "swap_item");
});

test("lista numerada: '1.' é índice, número nu é quantidade (20/08)", () => {
  assert.equal(
    stripListNumbering("1. coca\n2. vodka\n3. suco"),
    "coca\nvodka\nsuco"
  );
  assert.equal(
    stripListNumbering("1) coca\n2) vodka\n3- suco"),
    "coca\nvodka\nsuco"
  );
  // número NU é quantidade — não mexe
  assert.equal(stripListNumbering("1 coca\n2 vodka\n2 sucos"), "1 coca\n2 vodka\n2 sucos");
  // menos de 3 linhas: não é lista — não mexe ("1. coca" solto segue como veio)
  assert.equal(stripListNumbering("1. coca\n2. vodka"), "1. coca\n2. vodka");
  // linha sem numeração no meio quebra o padrão — não mexe
  assert.equal(stripListNumbering("1. coca\nvodka\n3. suco"), "1. coca\nvodka\n3. suco");
});

test("outras opções / mais barato fora da escolha reabrem a última (19/08)", () => {
  assert.equal(kind("opt:outras"), "more_options");
  assert.equal(kind("outras opções"), "more_options");
  assert.equal(kind("outras"), "more_options");
  assert.deepEqual(detectIntent("mais barato"), { kind: "more_options", cheaper: true });
  assert.deepEqual(detectIntent("Mais barata"), { kind: "more_options", cheaper: true });
  assert.deepEqual(detectIntent("tem mais barato?"), { kind: "more_options", cheaper: true });
  // com item junto NÃO é reabertura — é pedido/modificador de busca normal
  assert.notEqual(kind("leite mais barato"), "more_options");
});

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
  // toque atrasado no botão "Outras opções" fora da escolha: reject educado, nunca busca
  // 19/08: opt:outras fora da escolha deixou de ser reject — reabre a última escolha.
  assert.equal(kind("opt:outras"), "more_options");
  // "Escolher esse" por sku fora da escolha: botão de conversa ANTIGA — intent
  // próprio com copy específica (27/08 S1; antes era reject genérico).
  assert.equal(kind("optsku:petz-123"), "stale_option_tap");
  // botão "Trocar endereço" do resumo (id de máquina com underscore)
  assert.equal(kind("trocar_endereco"), "change_address");
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
  // botão "Outras opções" do card (id de máquina) e o atalho que a copy anuncia
  assert.equal(wantsMoreOptions("opt:outras"), true);
  assert.equal(wantsMoreOptions("outras"), true);
  assert.equal(wantsMoreOptions("mostrar mais"), true);
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
  assert.deepEqual(parseChoiceReply("quero o mais barato", options), { type: "cheapest" });
  // 19/08 (teste real): "mais barato" SECO não escolhe — navega pras mais baratas.
  // O cliente disse "Mais barata" rejeitando as 3 da mesa e a Lia comprou uma delas.
  assert.deepEqual(parseChoiceReply("mais barata", options), { type: "cheaper" });
  assert.deepEqual(parseChoiceReply("tem mais barato?", options), { type: "cheaper" });
  assert.deepEqual(parseChoiceReply("mais em conta", options), { type: "cheaper" });
  assert.deepEqual(parseChoiceReply("mais caro", options), { type: "pricier" });
  assert.deepEqual(parseChoiceReply("o mais caro", options), { type: "pick", index: 2 });
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

// ---------- 15 rodadas reais (14/08): restrições, negação e referências ----------

test("restrição nunca vira item: orçamento gruda como teto, resto some", () => {
  // Rodada 6: "até uns 100 reais" virou segundo item e a cesta foi a R$167.
  const gift = parseBasketLines("Preciso de um presente de aniversário para uma criança de 6 anos, até uns 100 reais.");
  assert.equal(gift.length, 1, `linhas: ${gift.map((l) => l.phrase).join(" | ")}`);
  assert.match(gift[0].phrase, /presente/);
  assert.match(gift[0].phrase, /até 100 reais/);
  // Rodada 5: "pode ser qualquer marca" não é item.
  const shampoo = parseBasketLines("Quero um shampoo barato, pode ser qualquer marca.");
  assert.equal(shampoo.length, 1, `linhas: ${shampoo.map((l) => l.phrase).join(" | ")}`);
  assert.match(shampoo[0].phrase, /shampoo/);
  // Rodada 12: urgência de entrega não é item.
  const agua = parseBasketLines("Preciso de água com gás, e queria receber hoje se der.");
  assert.equal(agua.length, 1, `linhas: ${agua.map((l) => l.phrase).join(" | ")}`);
  assert.match(agua[0].phrase, /agua com gas|água com gás/i);
  // Rodada 3: "de preferência o mais barato" não é item.
  const leite = parseBasketLines("Quero leite sem lactose, de preferência o mais barato.");
  assert.equal(leite.length, 1, `linhas: ${leite.map((l) => l.phrase).join(" | ")}`);
  assert.match(leite[0].phrase, /leite sem lactose/);
});

test("quantidade por extenso é quantidade ('quatro caixas de bombom' = 4)", () => {
  const lines = parseBasketLines("Queria quatro caixas de bombom, pode ser qualquer marca.");
  assert.equal(lines.length, 1, `linhas: ${lines.map((l) => l.phrase).join(" | ")}`);
  assert.equal(lines[0].qty, 4);
  assert.equal(lines[0].qtyExplicit, true);
});

test("'sem remédio' é negação — nunca alerta de medicamento", () => {
  // Rodadas 4 e 14: a Lia avisava que removeu um remédio que ninguém pediu.
  assert.equal(looksLikeMedicine(stripMedicineNegation("cotonete para cachorro, mas sem remédio")), false);
  assert.equal(looksLikeMedicine(stripMedicineNegation("ração para gato adulto, sem remédio")), false);
  assert.equal(looksLikeMedicine(stripMedicineNegation("não quero remédio, só um hidratante")), false);
  // Pedido REAL de remédio continua detectado.
  assert.equal(looksLikeMedicine(stripMedicineNegation("quero um remédio para dor de cabeça")), true);
  assert.equal(looksLikeMedicine(stripMedicineNegation("me vê uma dipirona")), true);
});

test("'antes de pagar' não é decisão de pagar; 'entregar em <lugar>' troca endereço", () => {
  // Rodada 15: quase pagou o frete do endereço velho.
  assert.equal(kind("Antes de pagar, quero entregar em Belo Horizonte."), "change_address");
  assert.equal(kind("Não vou pagar ainda"), "cancel");
  assert.equal(kind("quero entregar em Campinas"), "change_address");
  // "receber em casa" é o normal — não é troca.
  assert.notEqual(kind("quero receber em casa"), "change_address");
  // Pagamento de verdade continua pagamento.
  assert.equal(kind("pagar"), "pay");
  assert.equal(kind("pode fechar e me mostrar o total"), "pay");
});

test("'mais três do mesmo' referencia o último item, nunca nova busca", () => {
  const intent = detectIntent("Quero mais três caixas do mesmo bombom, por favor.");
  assert.equal(intent.kind, "add_more_same");
  assert.equal((intent as { qty: number }).qty, 3);
  const one = detectIntent("mais um igual");
  assert.equal(one.kind, "add_more_same");
  assert.equal((one as { qty: number }).qty, 1);
  // "mais duas caixas de bombom Garoto" NÃO referencia ("Garoto" = busca nova).
  assert.notEqual(detectIntent("coloca mais duas caixas de bombom Garoto").kind, "add_more_same");
});

// ---------- re-teste de 15/08: ruídos que sobraram ----------

test("re-teste 15/08: embalagem solta transfere quantidade; qualificador nunca é item", () => {
  // Rodada 9: "três pacotes" virava "não tenho como trazer: 3x pacotes".
  const racao = parseBasketLines("Quero ração para gato adulto, três pacotes");
  assert.equal(racao.length, 1, `linhas: ${racao.map((l) => l.phrase).join(" | ")}`);
  assert.equal(racao[0].qty, 3);
  assert.equal(racao[0].qtyExplicit, true);
  // Rodada 7: "quero dois pacotes" no meio da frase.
  const papel = parseBasketLines("Estou sem papel higiênico, quero dois pacotes, e detergente neutro");
  assert.equal(papel.length, 2, `linhas: ${papel.map((l) => l.phrase).join(" | ")}`);
  assert.equal(papel[0].qty, 2);
  assert.match(papel[0].phrase, /papel/);
  assert.match(papel[1].phrase, /detergente/);
  // Rodada 6: "qualquer time" não é produto.
  const camiseta = parseBasketLines("Quero uma camiseta de futebol, qualquer time.");
  assert.equal(camiseta.length, 1, `linhas: ${camiseta.map((l) => l.phrase).join(" | ")}`);
  assert.match(camiseta[0].phrase, /camiseta/);
  // Rodada 5: "mas entrega hoje se der" (adversativa na frente do modificador).
  const agua = parseBasketLines("Quero água com gás e café, mas entrega hoje se der");
  assert.equal(agua.length, 2, `linhas: ${agua.map((l) => l.phrase).join(" | ")}`);
});

test("re-teste 15/08: 'mais um desse café' mira o item pelo substantivo", () => {
  const intent = detectIntent("pode colocar mais um desse café");
  assert.equal(intent.kind, "add_more_same");
  assert.equal((intent as { qty: number }).qty, 1);
  assert.equal((intent as { noun?: string }).noun, "cafe");
});

// ---------- 3º ciclo (15/08 noite): negações, "cada", adições relativas ----------

test("3º ciclo: preferência negativa vira atributo 'sem X' do item anterior", () => {
  // Rodada 1: "sem pimenta" virava linha indisponível.
  const churrasco = parseBasketLines("2kg de linguiça, carvão, pão de alho, sem pimenta");
  assert.equal(churrasco.length, 3, `linhas: ${churrasco.map((l) => l.phrase).join(" | ")}`);
  assert.match(churrasco[2].phrase, /sem pimenta/);
  // Rodada 5: "não veicular" idem.
  const carregador = parseBasketLines("Preciso de um carregador USB-C para celular, não veicular, e queria algo barato.");
  assert.equal(carregador.length, 1, `linhas: ${carregador.map((l) => l.phrase).join(" | ")}`);
  assert.match(carregador[0].phrase, /sem veicular/);
  // Rodada 7: "até R$30 cada" é teto; "qualquer tema" e a negação não são itens.
  const lembrancinha = parseBasketLines("Preciso de três lembrancinhas para crianças, até R$30 cada, qualquer tema, mas não quero brinquedo barulhento.");
  assert.equal(lembrancinha.length, 1, `linhas: ${lembrancinha.map((l) => l.phrase).join(" | ")}`);
  assert.equal(lembrancinha[0].qty, 3);
  assert.match(lembrancinha[0].phrase, /até 30 reais/);
  assert.match(lembrancinha[0].phrase, /sem barulhento/);
  // Rodada 2: relaxamento "sem precisar de..." some.
  const lancheira = parseBasketLines("Pode ser qualquer lancheira infantil até R$80, sem precisar de espaço específico para garrafinha.");
  assert.equal(lancheira.length, 1, `linhas: ${lancheira.map((l) => l.phrase).join(" | ")}`);
  assert.doesNotMatch(lancheira[0].phrase, /garrafinha/);
});

test("3º ciclo: 'vou entregar em' troca destino e CEP no meio nunca é pagamento", () => {
  assert.equal(kind("vou entregar em Campinas"), "change_address");
  assert.notEqual(kind("Antes de pagar, vou entregar em Campinas, CEP 13010-100."), "pay");
});

test("3º ciclo: 'mais um saco de lixo desses' referencia com o substantivo composto", () => {
  const intent = detectIntent("Coloca mais um saco de lixo desses.");
  assert.equal(intent.kind, "add_more_same");
  assert.match((intent as { noun?: string }).noun ?? "", /lixo/);
});

// ---------- 4º ciclo (16/08): fillers, remoção falsa, teto no merge, CEP embutido ----------

test("4º ciclo: 'sem remédio' no começo é negação, nunca remoção", () => {
  const intent = detectIntent("Sem remédio hoje; quero um shampoo normal, qualquer marca.");
  assert.notEqual(intent.kind, "remove_item", `virou ${intent.kind}`);
  const lines = parseBasketLines(stripMedicineNegation("Sem remédio hoje; quero um shampoo normal, qualquer marca."));
  assert.equal(lines.length, 1, `linhas: ${lines.map((l) => l.phrase).join(" | ")}`);
  assert.match(lines[0].phrase, /shampoo/);
});

test("4º ciclo: 'pensando bem' e 'chega amanhã' nunca são itens", () => {
  const swapBefore = parseBasketLines("quero iogurte natural e granola; pensando bem,");
  assert.equal(swapBefore.length, 2, `linhas: ${swapBefore.map((l) => l.phrase).join(" | ")}`);
  const cafe = parseBasketLines("dois pacotes de café moído, e se der, chega amanhã");
  assert.equal(cafe.length, 1, `linhas: ${cafe.map((l) => l.phrase).join(" | ")}`);
  assert.equal(cafe[0].qty, 2);
});

test("4º ciclo: teto de preço sobrevive ao merge com a IA (a IA tira o preço da query)", () => {
  const det = parseBasketLines("dois pacotes de café moído até 25 reais cada, qualquer marca");
  const merged = mergeShoppingLines([{ phrase: "café moído", qty: 2, qtyExplicit: true }], det);
  assert.equal(merged.length, 1, `linhas: ${merged.map((l) => l.phrase).join(" | ")}`);
  assert.match(merged[0].phrase, /até 25 reais/);
});

test("4º ciclo: destino com CEP embutido consome o CEP direto", () => {
  const intent = detectIntent("Antes de pagar, vou entregar em São Paulo, CEP 01310-100.");
  assert.equal(intent.kind, "cep");
  assert.equal((intent as { cep: string }).cep, "01310-100");
});

// ---------- 5º ciclo (16/08): contexto/ocasião, plural no merge, adição na mesma mensagem ----------

test("5º ciclo: 'Para domingo'/'Para uma viagem'/'barato' nunca são itens", () => {
  const cafe = parseBasketLines("Para domingo, dois cafés moídos até R$25 cada, qualquer marca, não descafeinado; se der, entrega amanhã.");
  assert.equal(cafe.length, 1, `linhas: ${cafe.map((l) => l.phrase).join(" | ")}`);
  assert.equal(cafe[0].qty, 2);
  assert.match(cafe[0].phrase, /at[eé] (uns )?(r\$ ?)?25/i);
  assert.match(cafe[0].phrase, /sem descafeinado/);
  const viagem = parseBasketLines("Para uma viagem, quero uma escova de dentes macia e pasta de dente.");
  assert.equal(viagem.length, 2, `linhas: ${viagem.map((l) => l.phrase).join(" | ")}`);
  const cabo = parseBasketLines("Quero um cabo USB-C de 2 metros para celular, não veicular, barato.");
  assert.equal(cabo.length, 1, `linhas: ${cabo.map((l) => l.phrase).join(" | ")}`);
});

test("5º ciclo: plural não duplica no merge ('cafés moídos' casa 'café moído')", () => {
  const det = parseBasketLines("dois cafés moídos até 25 reais cada, não descafeinado");
  const merged = mergeShoppingLines([{ phrase: "café moído", qty: 2, qtyExplicit: true }], det);
  assert.equal(merged.length, 1, `linhas: ${merged.map((l) => l.phrase).join(" | ")}`);
  assert.match(merged[0].phrase, /até 25 reais/);
});

test("5º ciclo: adição relativa na MESMA mensagem soma na linha anterior", () => {
  // Rodada 5: "...30 litros, qualquer marca; mais um desses" → 3x, uma linha.
  const sacos = parseBasketLines("Quero dois sacos de lixo reforçados de 30 litros, qualquer marca; mais um desses.");
  assert.equal(sacos.length, 1, `linhas: ${sacos.map((l) => l.phrase).join(" | ")}`);
  assert.equal(sacos[0].qty, 3);
  // Rodada 8: "leite sem lactose; mais dois leites" → 3x na linha rica.
  const leite = parseBasketLines("Leite sem lactose, qualquer marca; mais dois leites.");
  assert.equal(leite.length, 1, `linhas: ${leite.map((l) => l.phrase).join(" | ")}`);
  assert.equal(leite[0].qty, 3);
  assert.match(leite[0].phrase, /sem lactose/);
  // E o lado da IA: linha nua com qty explícita se dobra na rica.
  const merged = mergeShoppingLines(
    [{ phrase: "leite sem lactose", qty: 1 }, { phrase: "leite", qty: 2, qtyExplicit: true }],
    parseBasketLines("Leite sem lactose, qualquer marca; mais dois leites.")
  );
  assert.equal(merged.length, 1, `linhas: ${merged.map((l) => l.phrase).join(" | ")}`);
  assert.equal(merged[0].qty, 3);
  // "mais um desses" no MEIO da mensagem não vira mais intent solto.
  assert.equal(detectIntent("Quero dois sacos de lixo de 30 litros, qualquer marca; mais um desses.").kind, "free_text");
  // Sozinho, continua funcionando.
  assert.equal(detectIntent("Mais três desses.").kind, "add_more_same");
});

// ---------- 6º ciclo (16/08): contexto na IA, escopo da negação, CEP órfão ----------

test("6º ciclo: isRequestModifier pega contexto que a IA deixa vazar", () => {
  assert.equal(isRequestModifier("Para uma viagem"), true);
  assert.equal(isRequestModifier("para o churrasco de sábado"), true);
  assert.equal(isRequestModifier("qualquer marca"), true);
  assert.equal(isRequestModifier("pão de alho"), false);
  assert.equal(isRequestModifier("linguiça sem pimenta"), false);
});

test("6º ciclo: negação inline fica no item dela — vizinhos intactos", () => {
  const churrasco = parseBasketLines("Para um churrasco de sábado, quero carvão, pão de alho e linguiça sem pimenta; coloca mais um carvão.");
  const phrases = churrasco.map((l) => l.phrase.toLowerCase());
  assert.ok(phrases.some((p) => /lingui/.test(p) && /sem pimenta/.test(p)), `linhas: ${phrases.join(" | ")}`);
  assert.ok(phrases.some((p) => /p[aã]o de alho/.test(p) && !/pimenta/.test(p)), `pão contaminado: ${phrases.join(" | ")}`);
});

test("urgência: sinal de entrega-hoje detectado, atributo de produto não", () => {
  // Vira a tag "⚡ URGENTE" no /ops — o operador escolhe o canal por isso.
  for (const msg of [
    "preciso pra hoje",
    "é urgente!!",
    "me manda o quanto antes",
    "queria receber hoje se der",
    "2 pilhas AA, pra agora",
    "tem como chegar ainda hoje?",
    "quero uma coca gelada e entrega rápida por favor",
    "tô com muita pressa",
    "quero um bolo de chocolate para hoje"
  ]) {
    assert.ok(hasUrgencySignal(msg), `devia marcar urgência: "${msg}"`);
  }
  // "rápido"/"hoje" como parte do PRODUTO ou de conversa comum não é urgência.
  for (const msg of [
    "carregador rápido usb-c",
    "cabo de carga rápida 2 metros",
    "hoje não, deixa pra amanhã",
    "quero um teste rápido de gravidez",
    "arroz, feijão e óleo",
    "pode entregar amanhã de manhã"
  ]) {
    assert.ok(!hasUrgencySignal(msg), `falso positivo de urgência: "${msg}"`);
  }
});

// ---------- rodada 2 de testes externos (27/08) ----------

test("27/08 S3: narrativa da mensagem longa não vira produto — só o shampoo sobra", () => {
  const lines = parseBasketLines(
    "meu neto vem sábado, eu quero deixar meu cabelo bem arrumado porque vou receber a família, quero um shampoo, que não seja muito caro"
  );
  assert.equal(lines.length, 1, JSON.stringify(lines));
  assert.match(lines[0].phrase, /shampoo/);
  assert.doesNotMatch(lines[0].phrase, /neto|família|familia|cabelo bem/);
});

test("27/08 S13: isNarrativeSegment reconhece contexto e poupa produto", () => {
  assert.equal(isNarrativeSegment("meu neto que pediu isso ai"), true);
  assert.equal(isNarrativeSegment("meu neto vem sábado"), true);
  assert.equal(isNarrativeSegment("vou receber a família"), true);
  assert.equal(isNarrativeSegment("que não seja muito caro"), true);
  assert.equal(isNarrativeSegment("fone bluetooth"), false);
  assert.equal(isNarrativeSegment("ração pro meu cachorro"), false);
  assert.equal(isNarrativeSegment("meu shampoo de sempre"), false);
});

test("27/08 S20: 'coisa simples de farmácia' é aposto, não item", () => {
  const lines = parseBasketLines("eu tô precisando de um shampoo, um protetor solar e uma escova de dente, coisa simples de farmácia");
  assert.equal(lines.length, 3, JSON.stringify(lines));
  assert.ok(lines.every((l) => !/coisa/.test(l.phrase)), JSON.stringify(lines));
  assert.equal(isRequestModifier("coisa simples de farmácia"), true);
  assert.equal(isRequestModifier("coisas básicas de mercado"), true);
});

test("27/08 S3: o resgate do merge não re-promove narrativa que a IA descartou", () => {
  const ai = [{ phrase: "shampoo", qty: 1 }];
  const det = parseBasketLines("quero um shampoo") // garante gêmeo real
    .concat([{ phrase: "eu deixar meu cabelo bem arrumado porque vou receber a familia", qty: 1 }, { phrase: "coisa simples de farmacia", qty: 1 }]);
  const merged = mergeShoppingLines(ai, det);
  assert.equal(merged.length, 1, JSON.stringify(merged));
  assert.match(merged[0].phrase, /shampoo/);
});

test("27/08 S8: 'tira o café, quero café de centeio' remove E busca o novo", () => {
  const intent = detectIntent("tira o café, quero café de centeio orgânico da Islândia");
  assert.equal(intent.kind, "remove_item");
  if (intent.kind === "remove_item") {
    assert.match(intent.target, /^cafe/);
    assert.doesNotMatch(intent.target, /centeio/);
    assert.ok(intent.andAdd, "andAdd se perdeu");
    assert.match(intent.andAdd!, /cafe de centeio organico/);
  }
  // A forma antiga com " e " continua funcionando.
  const eForm = detectIntent("tira o arroz e coloca feijão");
  assert.equal(eForm.kind, "remove_item");
  if (eForm.kind === "remove_item") assert.match(eForm.andAdd ?? "", /feijao|feij/);
});

test("27/08 S1: optsku fora da escolha vira stale_option_tap com o sku preservado", () => {
  const intent = detectIntent("optsku:dsp-685674");
  assert.equal(intent.kind, "stale_option_tap");
  if (intent.kind === "stale_option_tap") assert.equal(intent.sku, "dsp-685674");
});

// ---------- rodada 3 de testes externos (27/08) ----------

test("27/08 r3 S6/S13/S19: auto-apresentação nunca vira produto", () => {
  assert.equal(isNarrativeSegment("seu jorge aqui"), true);
  assert.equal(isNarrativeSegment("aqui e a marlene"), true);
  assert.equal(isNarrativeSegment("sou o pedro"), true);
  assert.equal(isNarrativeSegment("me chamo julia"), true);
  const lines = parseBasketLines("seu Jorge aqui, queria um café moído pra passar em casa");
  assert.equal(lines.length, 1, JSON.stringify(lines));
  assert.match(lines[0].phrase, /café moído/);
  const farmacia = parseBasketLines("seu Jorge aqui, to precisando de um shampoo, um protetor solar e uma escova de dente, coisa simples de farmacia");
  assert.equal(farmacia.length, 3, JSON.stringify(farmacia));
});

test("27/08 r3 S15: sujeito-parente sai, produto fica", () => {
  const violao = parseBasketLines("Oi, meu neto quer um violão.");
  assert.equal(violao.length, 1, JSON.stringify(violao));
  assert.equal(violao[0].phrase, "violão");
  const suco = parseBasketLines("minha filha pediu suco de uva");
  assert.equal(suco.length, 1, JSON.stringify(suco));
  assert.match(suco[0].phrase, /^suco de uva/);
  // narrativa SEM produto continua morrendo inteira
  assert.equal(parseBasketLines("meu neto que pediu isso ai").length, 0);
});

test("27/08 r3 S14: 'esquece' é remoção, mesmo com interjeição na frente", () => {
  const a = detectIntent("aa esquece o carregador");
  assert.equal(a.kind, "remove_item");
  if (a.kind === "remove_item") assert.match(a.target, /carregador/);
  const b = detectIntent("esquece o carregador");
  assert.equal(b.kind, "remove_item");
  // "esquece tudo" continua limpando o carrinho
  assert.equal(detectIntent("esquece tudo").kind, "clear_cart");
});

test("27/08 r3 S17: 'outra opção' no singular pede mais opções", () => {
  assert.equal(wantsMoreOptions("me mostra outra opção"), true);
  assert.equal(wantsMoreOptions("tem outra opcao"), true);
});
