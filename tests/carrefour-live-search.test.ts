import assert from "node:assert/strict";
import test from "node:test";
import { parseCarrefourSearchCards } from "../src/lib/stores/carrefour";

test("Carrefour live search: only real product pages become sellable options", () => {
  const items = parseCarrefourSearchCards([
    { href: "https://mercado.carrefour.com.br/busca/coca-cola", text: "Coca-Cola" },
    {
      href: "https://mercado.carrefour.com.br/produto/coca-cola-pet-2-l-3132",
      text: "Coca-Cola Pet 2 L R$ 10,99 Adicionar",
      imageUrl: "https://cdn.example.com/coca.jpg"
    }
  ]);

  assert.deepEqual(items, [
    {
      sku: "crf-live-3132",
      name: "Coca-Cola Pet 2 L",
      unitPrice: 10.99,
      unit: "un",
      category: "carrefour",
      imageUrl: "https://cdn.example.com/coca.jpg",
      productUrl: "https://mercado.carrefour.com.br/produto/coca-cola-pet-2-l-3132"
    }
  ]);
});
