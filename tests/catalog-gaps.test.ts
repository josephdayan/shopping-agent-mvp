import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore, listStores, pickStoreForQueries } from "../src/lib/stores";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";

test("hortifruti básico: banana retorna opções de fruta fresca", async () => {
  const hits = await getStore("carrefour").searchItems("banana", 3);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((item) => /banana/i.test(item.name)));
  assert.ok(hits.every((item) => /hortifruti/i.test(item.category ?? "")));
  assert.ok(hits.every((item) => whatsappAdapter.canSendImage(item.imageUrl)));
});

test("hortifruti novo nunca oferece opção sem foto para o card da Meta", async () => {
  const store = getStore("carrefour");
  for (const query of ["maçã", "manga", "mamão", "limão", "uva", "laranja", "pera", "abacaxi", "maracujá", "melão"]) {
    const hits = await store.searchItems(query, 3);
    const fresh = hits.filter((item) => /hortifruti/i.test(item.category ?? ""));
    assert.ok(fresh.length > 0, `sem hortifruti para ${query}`);
    assert.ok(fresh.every((item) => whatsappAdapter.canSendImage(item.imageUrl)), `foto ausente para ${query}`);
  }
});

test("creatina é atendida pela Decathlon com retirada em loja", async () => {
  assert.ok(listStores().some((store) => store.key === "decathlon"));
  const store = await pickStoreForQueries(["creatina"]);
  assert.equal(store.key, "decathlon");
  const hits = await store.searchItems("creatina", 3);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((item) => item.productUrl?.startsWith("https://www.decathlon.com.br/")));
  assert.ok(hits.every((item) => whatsappAdapter.canSendImage(item.imageUrl)));
  assert.ok(store.listUnits().some((unit) => unit.cep === "01310-913"));
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
  assert.ok(total > 5_000, `catálogo ativo encolheu demais: ${total}`);
});
