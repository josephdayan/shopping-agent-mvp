// "Mais vendido da loja" como desempate (05/09): entre itens de MESMA relevância, o que a
// loja mais vende vem antes; relevância maior continua vencendo qualquer popularidade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensurePopularity, popularityBonus, rankCatalog, type CatalogItem } from "../src/lib/stores/types";

const mk = (sku: string, name: string, unitPrice: number, popularity?: number): CatalogItem => ({ sku, name, unitPrice, unit: "un", ...(popularity ? { popularity } : {}) });

test("mesma relevância: o mais vendido vem primeiro, mesmo sendo mais caro", () => {
  const items = [mk("b", "Arroz Branco Tipo 1 Prato Fino 1kg", 7.9), mk("a", "Arroz Branco Tipo 1 Camil 1kg", 5.9)];
  ensurePopularity(items); // como o backfill faz nos catálogos VTEX
  const ranked = rankCatalog("arroz branco", items, 3);
  assert.deepEqual(ranked.map((i) => i.sku), ["b", "a"], "ordem do arquivo = ordem de vendas da loja");
  // Sem popularidade gravada (catálogo sem ordem de vendas), vale o preço: Camil primeiro.
  const plain = [mk("b2", "Arroz Branco Tipo 1 Prato Fino 1kg", 7.9), mk("a2", "Arroz Branco Tipo 1 Camil 1kg", 5.9)];
  assert.deepEqual(rankCatalog("arroz branco", plain, 3).map((i) => i.sku), ["a2", "b2"]);
});

test("relevância maior vence a popularidade: o bônus é menor que 1 ponto", () => {
  const items = [mk("pop", "Arroz Branco Prato Fino 1kg", 7.9, 1), mk("exact", "Arroz Integral Camil 1kg", 8.9, 500)];
  const ranked = rankCatalog("arroz integral", items, 3);
  assert.equal(ranked[0].sku, "exact");
  assert.equal(popularityBonus(1), 0.9);
  assert.equal(popularityBonus(10), 0.6);
  assert.equal(popularityBonus(30), 0.3);
  assert.equal(popularityBonus(31), 0);
  assert.equal(popularityBonus(undefined), 0);
});

test("popularidade explícita do harvest não é sobrescrita pela posição", () => {
  const items = [mk("x", "Detergente Ypê 500ml", 2.5, 7), mk("y", "Detergente Limpol 500ml", 2.4)];
  ensurePopularity(items);
  assert.equal(items[0].popularity, 7);
  assert.equal(items[1].popularity, 2);
});
