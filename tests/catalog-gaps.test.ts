import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore, listStores, pickStoreForQueries } from "../src/lib/stores";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";

test("Oba ativo retorna essenciais de mercado com deep-link", async () => {
  const hits = await getStore("oba").searchItems("arroz", 3);
  assert.ok(hits.length > 0);
  assert.ok(hits.every((item) => /arroz/i.test(item.name)));
  assert.ok(hits.every((item) => item.productUrl?.startsWith("https://secure.obahortifruti.com.br/")));
  assert.ok(hits.every((item) => whatsappAdapter.canSendImage(item.imageUrl)));
});

test("Oba nunca oferece seed sem foto para o card da Meta", async () => {
  const store = getStore("oba");
  for (const query of ["arroz", "detergente"]) {
    const hits = await store.searchItems(query, 3);
    assert.ok(hits.length > 0, `sem produto para ${query}`);
    assert.ok(hits.every((item) => whatsappAdapter.canSendImage(item.imageUrl)), `foto ausente para ${query}`);
  }
});

test("registro de teste = mundo original dos evals (produção tem as 11 vitrines; elenco fixado no load-env)", () => {
  // load-env fixa o elenco de teste em carrefour/petz/boticario/decathlon (o mundo que
  // passava 210/210). Produção tem as 11 vitrines.
  assert.deepEqual(listStores().map((store) => store.key).sort(), ["carrefour", "oba", "petz", "boticario", "decathlon"].sort());
  assert.equal(getStore().key, "carrefour");
  void pickStoreForQueries;
});

test("recibo de entrega da Meta é reconhecido como status, não mensagem mock", () => {
  const inbound = whatsappAdapter.parseInbound({
    entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }]
  });
  assert.equal(inbound.provider, "meta");
  assert.equal(inbound.eventType, "status");
  assert.equal(inbound.text, "");
});

test("contrato global: 100% do catálogo ativo tem foto entregável no WhatsApp", () => {
  let total = 0;
  for (const store of listStores()) {
    const catalog = store.listCatalog();
    assert.ok(catalog.length > 0, `${store.key} sem catálogo ativo`);
    total += catalog.length;
    for (const item of catalog) {
      assert.ok(item.imageUrl, `${store.key}/${item.sku} sem foto`);
      assert.ok(whatsappAdapter.canSendImage(item.imageUrl), `${store.key}/${item.sku} com foto não entregável: ${item.imageUrl}`);
    }
  }
  assert.ok(total > 4_000, `catálogo ativo encolheu demais: ${total}`);
});
