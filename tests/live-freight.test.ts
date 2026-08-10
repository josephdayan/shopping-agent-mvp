import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { liveStoreFreight } from "../src/lib/live-freight";

// Frete ao vivo: a validação da RESPOSTA é segurança de cobrança — preço vem em
// centavos, retirada nunca pode virar frete, "sem entrega" tem que virar rota pro
// operador e qualquer erro cai na tabela. Fetch mockado; o caminho real é auditado em
// produção pelo log [instant-quote:live] e pela nota "(ao vivo)" no /ops.

const realFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env.LIA_LIVE_FREIGHT_OFF;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.LIA_LIVE_FREIGHT_OFF;
  delete process.env.LIA_LIVE_FREIGHT_MAX;
});

function mockResponse(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

const ITEMS = [{ sku: "paguemenos-1639750", qty: 2 }];

test("ao vivo: menor ENTREGA vence, retirada é ignorada, preço sai de centavos", async () => {
  mockResponse({
    items: [{ id: "1639750" }],
    logisticsInfo: [
      {
        slas: [
          { name: "Retire em Loja", price: 0, pickupStoreInfo: { isPickupStore: true } },
          { name: "Expressa", price: 690, shippingEstimate: "2h" },
          { name: "Econômica", price: 490, shippingEstimate: "1bd" }
        ]
      }
    ]
  });
  const out = await liveStoreFreight("paguemenos", ITEMS, "01310-100");
  assert.deepEqual(out, { kind: "ok", fee: 4.9, estimate: "1bd" });
});

test("ao vivo: resposta válida SEM entrega = site não atende o CEP (rota do operador)", async () => {
  mockResponse({
    items: [{ id: "1639750" }],
    logisticsInfo: [{ slas: [{ name: "Retirar na Loja", price: 0, pickupStoreInfo: { isPickupStore: true } }] }]
  });
  assert.deepEqual(await liveStoreFreight("paguemenos", ITEMS, "01310100"), { kind: "no-delivery" });
});

test("ao vivo: sku fora do padrão, loja fora da lista, erro HTTP e exceção caem na tabela", async () => {
  mockResponse({ items: [{}], logisticsInfo: [] });
  assert.equal((await liveStoreFreight("paguemenos", [{ sku: "estranho-1", qty: 1 }], "01310100")).kind, "unavailable");
  assert.equal((await liveStoreFreight("carrefour", [{ sku: "CRF-PAD-007", qty: 1 }], "01310100")).kind, "unavailable");
  mockResponse({ error: "blocked" }, 403);
  assert.equal((await liveStoreFreight("paguemenos", ITEMS, "01310100")).kind, "unavailable");
  globalThis.fetch = (async () => {
    throw new Error("timeout");
  }) as typeof fetch;
  assert.equal((await liveStoreFreight("paguemenos", ITEMS, "01310100")).kind, "unavailable");
});

test("ao vivo: teto de sanidade e kill-switch", async () => {
  mockResponse({
    items: [{ id: "1" }],
    logisticsInfo: [{ slas: [{ name: "Transportadora", price: 99000 }] }]
  });
  // R$990 estoura o teto (150 default) → tabela, não cobrança automática.
  assert.equal((await liveStoreFreight("paguemenos", ITEMS, "01310100")).kind, "unavailable");
  process.env.LIA_LIVE_FREIGHT_OFF = "true";
  globalThis.fetch = (async () => {
    throw new Error("não era pra chamar rede");
  }) as typeof fetch;
  assert.equal((await liveStoreFreight("paguemenos", ITEMS, "01310100")).kind, "unavailable");
});
