import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore, listStores } from "../src/lib/stores";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";

test("Boticário está registrada com catálogo real", () => {
  const keys = listStores().map((s) => s.key);
  assert.ok(keys.includes("boticario"), `lojas: ${keys.join(",")}`);
  const boti = getStore("boticario");
  assert.equal(boti.label, "O Boticário");
  assert.ok(boti.listCatalog().length > 1000, "catálogo deve ter >1000 itens");
});

test("busca de beleza acha na Boticário com productUrl real", async () => {
  const boti = getStore("boticario");
  for (const q of ["perfume masculino", "batom", "base", "shampoo"]) {
    const hits = await boti.searchItems(q, 3);
    assert.ok(hits.length > 0, `sem resultado para ${q}`);
  }
  const perfume = (await boti.searchItems("perfume", 1))[0];
  assert.ok(perfume.productUrl?.startsWith("https://www.boticario.com.br/"), "deve ter deep-link real");
});

test("roteamento: item de beleza vai pra Boticário, não pro Carrefour", async () => {
  const { pickStoreForQueries } = await import("../src/lib/stores");
  const store = await pickStoreForQueries(["perfume", "batom", "maquiagem"]);
  assert.equal(store.key, "boticario", `roteou pra ${store.key}`);
});

test("nearestUnit escolhe uma loja de SP por CEP", async () => {
  const unit = await getStore("boticario").nearestUnit("01310-100");
  assert.ok(unit.label.includes("Boticário"));
  assert.ok(unit.cep && unit.address.includes("São Paulo"));
});

test("catálogo tem fotos entregáveis no WhatsApp (Cloudinary, JPG)", () => {
  const catalog = getStore("boticario").listCatalog();
  const withImg = catalog.filter((i) => i.imageUrl);
  assert.ok(withImg.length / catalog.length > 0.9, `cobertura de foto baixa: ${withImg.length}/${catalog.length}`);
  // Every image must pass the WhatsApp media guard (https, host not blocked) and be JPG-forced.
  for (const i of withImg.slice(0, 50)) {
    assert.ok(whatsappAdapter.canSendImage(i.imageUrl), `imagem não entregável: ${i.imageUrl}`);
    assert.match(i.imageUrl!, /f_jpg/, "imagem deve ser forçada pra JPG (WhatsApp rejeita AVIF)");
  }
});
