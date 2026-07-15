import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBoticarioSearchCards } from "../src/lib/stores/boticario";
import { parsePetzSearchCards } from "../src/lib/stores/petz";
import { getBuyer } from "../src/lib/purchasing";
import { parseLabelledTotal, retailMatch } from "../src/lib/purchasing/stores/browser-store-utils";

test("Petz live search keeps sellable products at the regular price", () => {
    const items = parsePetzSearchCards([
      {
        href: "https://www.petz.com.br/busca?q=racao",
        text: "Ração para cães",
      },
      {
        href: "https://www.petz.com.br/produto/racao-premier-caes-adultos-3kg-191626",
        text: "Ração Premier para Cães Adultos 3 kg R$ 60,99 R$ 54,89 para assinantes",
        imageUrl: "https://images.petz.com.br/fotos/191626.jpg",
        imageAlt: "Ração Premier para Cães Adultos 3 kg",
      },
    ]);

    assert.equal(items.length, 1);
    assert.deepEqual(items[0], {
      name: "Ração Premier para Cães Adultos 3 kg",
      unitPrice: 60.99,
      productUrl: "https://www.petz.com.br/produto/racao-premier-caes-adultos-3kg-191626",
      sku: "petz-live-191626",
      unit: "un",
      category: "petz",
      imageUrl: "https://images.petz.com.br/fotos/191626.jpg",
    });
});

test("Boticário live search uses the promotional price and cart SKU", () => {
    const items = parseBoticarioSearchCards([
      {
        href: "https://www.boticario.com.br/busca?q=perfume",
        text: "Perfumes",
      },
      {
        href: "https://www.boticario.com.br/egeo-bomb-black-desodorante-colonia-90ml/",
        text: "Egeo Bomb Black Desodorante Colônia 90ml de R$219,90, por R$109,90",
        imageUrl: "https://res.cloudinary.com/boticario/image/upload/egeo.jpg",
        sku: "B52029",
      },
    ]);

    assert.equal(items.length, 1);
    assert.deepEqual(items[0], {
      name: "Egeo Bomb Black Desodorante Colônia 90ml",
      unitPrice: 109.9,
      productUrl: "https://www.boticario.com.br/egeo-bomb-black-desodorante-colonia-90ml/",
      sku: "B52029",
      unit: "un",
      category: "boticario",
      imageUrl: "https://res.cloudinary.com/boticario/image/upload/egeo.jpg",
    });
});

test("retailer cart validation reads the labelled subtotal, not an offer card", () => {
  const body = "Oferta R$ 39,95 Produto R$ 339,90 Subtotal R$ 679,80";
  assert.equal(parseLabelledTotal(body, "subtotal"), 679.8);
  assert.ok(retailMatch("Lily Le Parfum Perfume 30ml", "Lily — Le Parfum Perfume 30 ml") >= 0.7);
});

test("purchase registry exposes Petz and Boticário buyers", () => {
  assert.equal(getBuyer("petz").key, "petz");
  assert.equal(getBuyer("boticario").key, "boticario");
});
