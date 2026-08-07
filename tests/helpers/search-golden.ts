// Golden set da BUSCA de produtos — o placar que substitui tentativa-e-erro infinita.
//
// Cada caso é um pedido real (ou realista) com o resultado esperado rotulado. Ele é
// consumido por dois harnesses:
//
//   1. tests/search-golden.test.ts — roda o pipeline DETERMINÍSTICO (sem OpenAI) nos
//      casos `deterministic: true`. É o piso de regressão: o que passa aqui não pode
//      voltar a quebrar. Roda no `npm test`, rápido e sem rede.
//   2. scripts/eval-search.mts — roda o pipeline COMPLETO (extração + rerank por IA)
//      em TODOS os casos com a chave real e imprime o placar. É onde se mede se uma
//      mudança de prompt/scorer melhorou ou piorou o conjunto, antes de ir pra prod.
//
// Fluxo de melhoria: cliente reporta busca ruim → vira caso aqui (com o esperado
// certo) → roda o eval → conserta (prompt, scorer, catálogo) → placar sobe → commit.
// Regras novas no scorer só entram acompanhadas de caso que as justifique.
//
// Convenções: os regexes casam contra o NOME NORMALIZADO (minúsculas, sem acento —
// normalizeText). `query` é a linha JÁ extraída (o que chega na busca); `message` é a
// mensagem crua do cliente, usada só pelo eval completo quando a extração por IA faz
// parte do que se quer testar (sinônimo tipo "pasta de dente" → "creme dental").

export type GoldenCase = {
  name: string;
  // Linha de pedido como chega na busca (pós-extração).
  query: string;
  // Mensagem crua p/ o eval completo (default: a própria query).
  message?: string;
  // A 1ª opção mostrada deve casar…
  top1Include?: RegExp;
  // …e não pode casar.
  top1Exclude?: RegExp;
  // NENHUMA das opções mostradas pode casar (o determinístico só garante isso nos
  // casos `deterministic`; no eval por IA vale para todos).
  allExclude?: RegExp;
  // Resultado honesto = nenhuma opção (linha livre pro operador cotar).
  none?: boolean;
  // O pipeline determinístico (sem OpenAI) já passa este caso — vira regressão dura
  // no npm test. `false` = só a camada de IA resolve (sinônimo/julgamento semântico).
  deterministic: boolean;
  note?: string;
};

export const GOLDEN_CASES: GoldenCase[] = [
  // ---- o caso que motivou tudo (06/08): forma/uso errados com palavras parecidas ----
  {
    name: "carregador usb c → parede/cabo USB-C, nunca veicular",
    query: "carregador usb c",
    top1Include: /usb.?c|parede/,
    allExclude: /veicular/,
    deterministic: true,
    note: "3 carregadores veiculares venciam por empate léxico + desempate por preço"
  },
  {
    name: "carregador veicular continua achável (o inverso não pode quebrar)",
    query: "carregador veicular",
    top1Include: /veicular/,
    deterministic: true
  },

  // ---- guardas de espécie/variante que já existiam (não podem regredir) ----
  { name: "ração de cachorro sem item de gato", query: "racao para cachorro", top1Include: /ca(es|o)|cachorro/, allExclude: /gato/, deterministic: true },
  { name: "ração de gato sem item de cão", query: "racao para gato", top1Include: /gato/, allExclude: /\bca(es|o)\b(?! e gatos)|cachorro/, deterministic: true },
  { name: "ração de filhote quando pedida", query: "racao filhote cachorro", top1Include: /filhote|puppy|junior/, deterministic: true },
  { name: "shampoo humano nunca vira produto pet", query: "shampoo", allExclude: /\bca(es|o)\b|cachorro|\bgatos?\b|\bpet\b/, top1Include: /shampoo|xampu/, deterministic: true },

  // ---- tamanho/atributo pedido ----
  { name: "coca 2 litros traz a garrafa certa", query: "coca cola 2 litros", top1Include: /coca.*2\s*l/, deterministic: true },
  { name: "leite sem lactose respeita a negação", query: "leite sem lactose", top1Include: /(sem|zero)\s*lactose/, deterministic: true },
  { name: "café sem açúcar não traz o adoçado", query: "cafe sem acucar", allExclude: /com acucar/, deterministic: true },

  // ---- básicos de mercearia/higiene (o feijão-com-arroz não pode quebrar) ----
  { name: "arroz básico primeiro", query: "arroz", top1Include: /arroz/, deterministic: true },
  { name: "papel higiênico", query: "papel higienico", top1Include: /higienico/, deterministic: true },
  { name: "sabão em pó", query: "sabao em po", top1Include: /sabao|lava.?roupas/, deterministic: true },
  { name: "água com gás", query: "agua com gas", top1Include: /com gas/, deterministic: true },
  { name: "detergente", query: "detergente", top1Include: /detergente/, deterministic: true },
  { name: "miojo acha o lámen", query: "miojo", top1Include: /miojo|lamen/, deterministic: true },

  // ---- verticais ----
  { name: "perfume feminino vai pra beleza", query: "perfume feminino", top1Include: /colonia|perfume|eau de/, deterministic: true },
  { name: "cerveja da marca pedida", query: "cerveja heineken", top1Include: /heineken/, deterministic: true },
  { name: "vinho tinto", query: "vinho tinto", top1Include: /tinto/, deterministic: true },
  { name: "chocolate", query: "chocolate", top1Include: /chocolate|bombom|cacau/, deterministic: true },
  { name: "fralda tamanho G", query: "fralda g", top1Include: /fralda/, deterministic: true },
  { name: "brinquedo de cachorro", query: "brinquedo cachorro", top1Include: /brinquedo|mordedor|bolinha/, deterministic: true },
  { name: "whisky", query: "whisky", top1Include: /whisky|whiskey/, deterministic: true },

  // ---- honestidade: fora de catálogo → nenhuma opção (linha livre) ----
  { name: "conserto de torneira não vira espumante", query: "conserto de torneira", none: true, deterministic: true, note: "fuzzy conserto≈concerto; caso real do piso do concierge" },
  { name: "parafusadeira fora de catálogo é linha livre", query: "parafusadeira", none: true, deterministic: true },

  // ---- casos que SÓ a camada de IA resolve (sinônimo/julgamento) ----
  {
    name: "escova de dente acha Escova Dental (derivação que o léxico não cobre)",
    query: "escova de dente macia",
    top1Include: /escova (de )?dent/,
    deterministic: false,
    note: "o piso léxico não casa dente≈dental; o rerank deve aprovar o candidato"
  },
  {
    name: "pasta de dente é creme dental (sinônimo na extração)",
    query: "creme dental",
    message: "quero uma pasta de dente",
    top1Include: /creme dental/,
    allExclude: /amendoim/,
    deterministic: false
  },
  {
    name: "refri vira refrigerante na extração",
    query: "refrigerante",
    message: "me ve um refri gelado",
    top1Include: /refrigerante|coca|guarana/,
    deterministic: true,
    note: "a query canônica é determinística; a mensagem crua depende da extração"
  },
  {
    name: "carregador genérico prioriza o de uso comum (parede), não o veicular",
    query: "carregador de celular",
    top1Exclude: /veicular/,
    deterministic: false,
    note: "empate semântico: IA deve preferir parede/cabo como 1ª opção"
  }
];
