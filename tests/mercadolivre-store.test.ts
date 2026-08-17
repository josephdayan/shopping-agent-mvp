import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import { deliveryLabelFrom, mercadoLivreEnabled, mlImageAsJpg, searchMercadoLivre } from "../src/lib/stores/mercadolivre";
import { withoutMedicine } from "../src/lib/stores/anvisa";
import { needsLongTailSearch, type StoreCandidate } from "../src/lib/stores";
import type { StoreConnector } from "../src/lib/stores/types";

// Mercado Livre = vitrine de cauda longa ao vivo (16/08). O que estes testes travam:
// (1) o flag é a única chave — desligado, o conector é inerte e não toca a rede;
// (2) o prazo mostrado ao cliente é o do ANÚNCIO, nunca inventado;
// (3) anúncio impróprio (patrocinado, sem preço, sem estoque) nunca vira opção.
// A amostra abaixo é o shape REAL do actor karamelo/mercadolivre-scraper (run de
// 16/08, dataset VVHId08cAXB5tkqzG) — se o actor mudar o contrato, isto quebra aqui
// em vez de quebrar na frente do cliente.

test("ML: desligado por padrão — não busca, não toca rede", async () => {
  const previous = { flag: process.env.LIA_ENABLE_MERCADOLIVRE, token: process.env.APIFY_API_TOKEN, fetch: global.fetch };
  delete process.env.LIA_ENABLE_MERCADOLIVRE;
  process.env.APIFY_API_TOKEN = "token-de-teste";
  global.fetch = (async () => {
    throw new Error("não era pra chamar rede com o conector desligado");
  }) as typeof fetch;
  try {
    assert.equal(mercadoLivreEnabled(), false);
    assert.deepEqual(await searchMercadoLivre("cabo usb-c 2 metros", 3), []);
  } finally {
    process.env.LIA_ENABLE_MERCADOLIVRE = previous.flag;
    process.env.APIFY_API_TOKEN = previous.token;
    global.fetch = previous.fetch;
  }
});

test("ML: ligado sem token continua inerte (nunca meia-boca)", () => {
  const previous = { flag: process.env.LIA_ENABLE_MERCADOLIVRE, token: process.env.APIFY_API_TOKEN };
  process.env.LIA_ENABLE_MERCADOLIVRE = "true";
  delete process.env.APIFY_API_TOKEN;
  try {
    assert.equal(mercadoLivreEnabled(), false);
  } finally {
    process.env.LIA_ENABLE_MERCADOLIVRE = previous.flag;
    process.env.APIFY_API_TOKEN = previous.token;
  }
});

test("ML: prazo mostrado é o do anúncio (nunca estimado por nós)", () => {
  // Strings reais devolvidas pelo actor.
  assert.equal(deliveryLabelFrom("Chegará grátis hoje Enviado pelo FULL"), "chega hoje");
  assert.equal(deliveryLabelFrom("Chegará grátis amanhã Enviado pelo FULL"), "chega amanhã");
  assert.equal(deliveryLabelFrom("Chegará em 3 dias"), "chega em 3 dias");
  assert.equal(deliveryLabelFrom("Frete grátis"), "frete grátis");
  // Sem informação de envio, NÃO inventa prazo.
  assert.equal(deliveryLabelFrom(""), undefined);
  assert.equal(deliveryLabelFrom(undefined), undefined);
});

test("ML: só entra quando nenhuma vitrine local tem match forte", () => {
  const localStore = { key: "local", label: "Local" } as StoreConnector;
  const leite: StoreCandidate[] = [{
    store: localStore,
    item: { sku: "local-leite", name: "Leite Integral 1L", unitPrice: 5.9 }
  }];
  const falsoCabo: StoreCandidate[] = [{
    store: localStore,
    item: { sku: "local-carregador", name: "Carregador de Parede USB-C 20W", unitPrice: 59.9 }
  }];
  assert.equal(needsLongTailSearch("leite", leite), false);
  assert.equal(needsLongTailSearch("cabo usb c 2 metros", falsoCabo), true);
});

test("ML: guarda ANVISA vale para a vitrine ao vivo (o ML vende remédio)", () => {
  // O conector passa o resultado do actor por withoutMedicine antes de virar opção.
  const fromMl = [
    { sku: "ml-1", name: "Dipirona Sódica 500mg 10 Comprimidos Genérico", unitPrice: 9.9 },
    { sku: "ml-2", name: "Cabo Usb Tipo C 2 Metros Turbo", unitPrice: 18.68 }
  ];
  const safe = withoutMedicine(fromMl);
  assert.equal(safe.length, 1, `remédio passou: ${safe.map((i) => i.name).join(" | ")}`);
  assert.match(safe[0].name, /Cabo/);
});

test("ML: pipeline completo com o payload REAL do actor (rede mockada)", async () => {
  // Amostra fiel do run de 16/08 (dataset VVHId08cAXB5tkqzG) + casos que precisam cair.
  const actorItems = [
    {
      eTituloProduto: "Cabo Usb X Tipo C Turbo 60w - 2 Metros Celular Notebook",
      novoPreco: "18,68",
      freteGratis: true,
      zProdutoLink: "https://www.mercadolivre.com.br/cabo-usb-x-tipo-c-turbo-60w--2-metros/up/MLBU4682329236",
      imagemLink: "https://http2.mlstatic.com/D_NQ_NP_869026.webp",
      is_inStock: null,
      patrocinado: "",
      envio: "Chegará grátis hoje Enviado pelo FULL",
      idPublicacao: "MLBU4682329236"
    },
    {
      eTituloProduto: "Cabo Tipo C de 2 Metros 120W Carga Rápida",
      novoPreco: "28,99",
      zProdutoLink: "https://www.mercadolivre.com.br/cabo-tipo-c-2m-120w/p/MLB75605670",
      imagemLink: "https://http2.mlstatic.com/D_NQ_NP_758210.webp",
      is_inStock: true,
      patrocinado: "",
      envio: "Chegará grátis amanhã Enviado pelo FULL",
      idPublicacao: "MLB75605670"
    },
    // anúncio patrocinado (publicidade) — nunca vira opção
    { eTituloProduto: "Cabo Usb C PATROCINADO", novoPreco: "9,90", zProdutoLink: "https://x/p/MLB9", patrocinado: "PATROCINADO", idPublicacao: "MLB9" },
    // sem preço utilizável — o operador não consegue comprar
    { eTituloProduto: "Cabo Usb C sem preço", novoPreco: "", zProdutoLink: "https://x/p/MLB8", patrocinado: "", idPublicacao: "MLB8" },
    // fora de estoque
    { eTituloProduto: "Cabo Usb C esgotado", novoPreco: "22,00", zProdutoLink: "https://x/p/MLB7", patrocinado: "", is_inStock: false, idPublicacao: "MLB7" },
    // remédio: o ML vende, a Lia não pode
    { eTituloProduto: "Dipirona Monoidratada 500mg 20 Comprimidos", novoPreco: "12,90", zProdutoLink: "https://x/p/MLB6", patrocinado: "", is_inStock: true, idPublicacao: "MLB6" }
  ];
  const previous = { flag: process.env.LIA_ENABLE_MERCADOLIVRE, token: process.env.APIFY_API_TOKEN, fetch: global.fetch, poll: process.env.APIFY_MERCADO_LIVRE_POLL_MS };
  process.env.LIA_ENABLE_MERCADOLIVRE = "true";
  process.env.APIFY_API_TOKEN = "token-de-teste";
  process.env.APIFY_MERCADO_LIVRE_POLL_MS = "1";
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/runs?")) return new Response(JSON.stringify({ data: { id: "run1", defaultDatasetId: "ds1" } }), { status: 200 });
    if (url.includes("/actor-runs/")) return new Response(JSON.stringify({ data: { status: "SUCCEEDED", defaultDatasetId: "ds1" } }), { status: 200 });
    if (url.includes("/datasets/")) return new Response(JSON.stringify(actorItems), { status: 200 });
    throw new Error(`url inesperada: ${url}`);
  }) as typeof fetch;
  try {
    const items = await searchMercadoLivre(`cabo usb c teste ${Date.now()}`, 5);
    const names = items.map((i) => i.name).join(" | ");
    // Só os dois anúncios legítimos sobrevivem.
    assert.equal(items.length, 2, `esperava 2 opções, veio: ${names}`);
    assert.doesNotMatch(names, /PATROCINADO|sem preço|esgotado|Dipirona/i, `passou item impróprio: ${names}`);
    // Preço em centavos vira número; prazo do anúncio viaja pro card; link e foto reais.
    const first = items.find((i) => /60w/i.test(i.name))!;
    assert.equal(first.unitPrice, 18.68);
    assert.equal(first.category, "chega hoje");
    assert.match(first.productUrl ?? "", /mercadolivre\.com\.br/);
    assert.match(first.imageUrl ?? "", /mlstatic\.com/);
  // A foto tem que sair em JPG — WebP faz a Meta descartar o card inteiro (16/08).
  assert.match(first.imageUrl ?? "", /\.jpg$/, `foto em formato que a Meta recusa: ${first.imageUrl}`);
    assert.match(first.sku, /^ml-/);
  } finally {
    process.env.LIA_ENABLE_MERCADOLIVRE = previous.flag;
    process.env.APIFY_API_TOKEN = previous.token;
    process.env.APIFY_MERCADO_LIVRE_POLL_MS = previous.poll;
    global.fetch = previous.fetch;
  }
});

test("ML→Meta: foto do ML sai em JPG (a Meta recusa WebP e descarta o card)", () => {
  // Caso real 16/08: 3 camisetas encontradas, cards enviados, Meta respondeu
  // "131053 — WebP image uploads are not currently supported" e NENHUM card chegou;
  // a conversa ficou presa em `choosing` esperando escolha de opções invisíveis.
  const webp = "https://http2.mlstatic.com/D_NQ_NP_869026-MLB115903230515_082026-O.webp";
  assert.equal(mlImageAsJpg(webp), "https://http2.mlstatic.com/D_NQ_NP_869026-MLB115903230515_082026-O.jpg");
  // Com querystring (o CDN às vezes assina a URL).
  assert.match(mlImageAsJpg(`${webp}?v=2`) ?? "", /\.jpg\?v=2$/);
  // JPG já correto não é tocado; vazio continua indefinido.
  const jpg = "https://http2.mlstatic.com/D_NQ_NP_1.jpg";
  assert.equal(mlImageAsJpg(jpg), jpg);
  assert.equal(mlImageAsJpg(""), undefined);
});
