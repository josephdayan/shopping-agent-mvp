import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { mlItemIdFrom, mlItemFreight, mlBasketFreight } from "../src/lib/ml-freight";

// Frete + prazo por ANÚNCIO do Mercado Livre. O endpoint público do próprio ML
// (`/items/<id>/shipping_options?zip_code=`) é a fonte — verificado ao vivo em 17/08 sem
// token, ~0,35s, com custo e data por opção. Aqui o fetch é mockado: o teste garante a
// LEITURA da resposta e, sobretudo, que nada vira cobrança chutada.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.LIA_ML_FREIGHT_MAX;
  delete process.env.LIA_ML_LIVE_FREIGHT_OFF;
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

// Resposta real (formato conferido no ML em 17/08): duas opções, padrão mais barata e
// Sedex mais caro/rápido, com data estimada em cada uma.
const RESPOSTA_REAL = {
  options: [
    {
      cost: 14.99,
      list_cost: 14.99,
      base_cost: 29.5,
      display: "recommended",
      shipping_option_type: "address",
      shipping_method_type: "standard",
      estimated_delivery_time: { type: "known_frame", date: "2026-08-25T00:00:00-03:00" }
    },
    {
      cost: 25.99,
      display: "always",
      shipping_option_type: "address",
      shipping_method_type: "sedex",
      estimated_delivery_time: { type: "known_frame", date: "2026-08-20T00:00:00-03:00" }
    }
  ]
};

test("id do anúncio sai do link: anúncio direto e catálogo com anúncio vencedor; catálogo puro não", () => {
  assert.equal(mlItemIdFrom({ productUrl: "https://produto.mercadolivre.com.br/MLB-1385716686-mochila-hp-_JM" }), "MLB1385716686");
  // Link de catálogo carregando o anúncio vencedor (é o que o ML põe nos links da busca).
  assert.equal(mlItemIdFrom({ productUrl: "https://www.mercadolivre.com.br/cabo/p/MLB75605670?wid=MLB987654321&sid=search" }), "MLB987654321");
  assert.equal(mlItemIdFrom({ productUrl: "https://www.mercadolivre.com.br/x/p/MLB75605670?pdp_filters=item_id%3AMLB123456789" }), "MLB123456789");
  // Catálogo puro: o id é de PRODUTO, não de anúncio — a consulta de frete não aceita.
  assert.equal(mlItemIdFrom({ productUrl: "https://www.mercadolivre.com.br/cabo-tipo-c-2m/p/MLB75605670" }), null);
  assert.equal(mlItemIdFrom({ productUrl: "https://www.mercadolivre.com.br/cabo/up/MLBU4682329236" }), null);
  assert.equal(mlItemIdFrom({}), null);
});

test("frete do anúncio: cobra a opção MAIS BARATA de entrega no endereço e lê a data", async () => {
  mockFetch(200, RESPOSTA_REAL);
  const outcome = await mlItemFreight("MLB6187268520", "01310-100");
  assert.equal(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  // R$14,99 (padrão), não R$25,99 (Sedex): o operador escolhe subir de opção, o cliente
  // não paga por isso sem pedir.
  assert.equal(outcome.fee, 14.99);
  assert.equal(outcome.estimate, "25/08");
});

test("ponto de retirada não serve: concierge entrega no endereço do cliente", async () => {
  mockFetch(200, {
    options: [
      { cost: 0, shipping_option_type: "pickup", estimated_delivery_time: { date: "2026-08-19T00:00:00-03:00" } },
      { cost: 19.9, shipping_option_type: "address", estimated_delivery_time: { date: "2026-08-21T00:00:00-03:00" } }
    ]
  });
  const outcome = await mlItemFreight("MLB111111111", "01310100");
  assert.equal(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assert.equal(outcome.fee, 19.9, "retirada grátis não pode virar o frete cobrado");
});

test("anúncio grátis pro CEP devolve frete zero", async () => {
  mockFetch(200, { options: [{ cost: 0, shipping_option_type: "address", estimated_delivery_time: { date: "2026-08-18T00:00:00-03:00" } }] });
  const outcome = await mlItemFreight("MLB111111111", "01310100");
  assert.deepEqual(outcome, { kind: "ok", fee: 0, estimate: "18/08" });
});

test("sem estoque/sem entrega pro CEP nunca vira cobrança", async () => {
  mockFetch(404, { message: "NSOPublicAPI error", cause: [{ detail: "stock out for all requested products" }] });
  assert.equal((await mlItemFreight("MLB111111111", "01310100")).kind, "no-delivery");
  mockFetch(200, { options: [] });
  assert.equal((await mlItemFreight("MLB111111111", "01310100")).kind, "no-delivery");
});

test("falha, teto de sanidade, CEP inválido e kill-switch caem em unavailable (nunca chutam)", async () => {
  globalThis.fetch = (async () => {
    throw new Error("timeout");
  }) as typeof fetch;
  assert.equal((await mlItemFreight("MLB111111111", "01310100")).kind, "unavailable");

  mockFetch(200, { options: [{ cost: 400, shipping_option_type: "address" }] });
  assert.equal((await mlItemFreight("MLB111111111", "01310100")).kind, "unavailable", "frete absurdo é pro operador olhar");

  mockFetch(200, RESPOSTA_REAL);
  assert.equal((await mlItemFreight("MLB111111111", "123")).kind, "unavailable", "CEP inválido não consulta");
  assert.equal((await mlItemFreight("MLBU4682329236", "01310100")).kind, "unavailable", "id de catálogo não consulta");

  process.env.LIA_ML_LIVE_FREIGHT_OFF = "true";
  assert.equal((await mlItemFreight("MLB111111111", "01310100")).kind, "unavailable");
});

test("cesta do ML: 2 anúncios = 2 fretes somados, e a data é a do ÚLTIMO a chegar", async () => {
  mockFetch(200, RESPOSTA_REAL);
  const outcome = await mlBasketFreight(
    [
      { qty: 1, productUrl: "https://produto.mercadolivre.com.br/MLB-111111111-a-_JM" },
      { qty: 3, productUrl: "https://produto.mercadolivre.com.br/MLB-222222222-b-_JM" }
    ],
    "01310100"
  );
  assert.equal(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  // 14,99 + 14,99 — qty não multiplica frete (mesma remessa do mesmo anúncio).
  assert.equal(outcome.fee, 29.98);
  assert.equal(outcome.estimate, "25/08");
});

test("anúncio que estampa 'grátis' nunca vira frete cobrado — mas a data real é usada", async () => {
  // A consulta é feita como comprador anônimo (nível 1) e a conta do operador tem
  // benefício de frete: cobrar por cima do "Chegará grátis" que o cliente vê no ML seria a
  // taxa fantasma reprovada em 17/08. A data, sim, vem da consulta.
  mockFetch(200, RESPOSTA_REAL);
  const outcome = await mlBasketFreight(
    [{ qty: 2, productUrl: "https://produto.mercadolivre.com.br/MLB-111111111-a-_JM", freeShipping: true }],
    "01310100"
  );
  assert.deepEqual(outcome, { kind: "ok", fee: 0, estimate: "25/08" });
});

test("cesta do ML: item sem número real derruba a cotação automática (vai pro operador)", async () => {
  mockFetch(200, RESPOSTA_REAL);
  const semId = await mlBasketFreight([{ qty: 1, productUrl: "https://www.mercadolivre.com.br/x/p/MLB75605670" }], "01310100");
  assert.equal(semId.kind, "manual");

  // Exceção conservadora: anúncio que DECLARA frete grátis segue fechando na hora mesmo
  // sem conseguir consultar (grátis nunca cobra a menos).
  const gratisDeclarado = await mlBasketFreight(
    [{ qty: 1, productUrl: "https://www.mercadolivre.com.br/x/p/MLB75605670", freeShipping: true }],
    "01310100"
  );
  assert.deepEqual(gratisDeclarado, { kind: "ok", fee: 0, estimate: undefined });

  // Um anúncio bom + um sem número = manual (metade chutada é o mesmo erro do R$18).
  const misto = await mlBasketFreight(
    [
      { qty: 1, productUrl: "https://produto.mercadolivre.com.br/MLB-111111111-a-_JM" },
      { qty: 1, productUrl: "https://www.mercadolivre.com.br/x/p/MLB75605670" }
    ],
    "01310100"
  );
  assert.equal(misto.kind, "manual");
});
