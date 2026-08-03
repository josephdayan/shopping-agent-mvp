import { test } from "node:test";
import assert from "node:assert/strict";

import { isMedicine, isVeterinaryMedicine, withoutMedicine } from "../src/lib/stores/anvisa";
import { drogariaSpStore } from "../src/lib/stores/drogariasp";
import { pagueMenosStore } from "../src/lib/stores/paguemenos";
import { drogaRaiaStore } from "../src/lib/stores/drogaraia";
import { cobasiStore } from "../src/lib/stores/cobasi";
import { petzStore } from "../src/lib/stores/petz";

// A Lia não pode vender medicamento (ANVISA). As vitrines de farmácia são colhidas com
// allowlist de categoria + deny-regex, mas a auditoria de 02/08 mostrou que a própria loja
// classifica medicamento dentro de categorias cosméticas. Estes testes travam a terceira
// guarda: se uma recolheita reintroduzir remédio, a suíte quebra antes do deploy.

const PHARMACIES = [drogariaSpStore, pagueMenosStore, drogaRaiaStore];

test("ANVISA: itens reais que já vazaram da colheita são reconhecidos como medicamento", () => {
  // Cada um destes apareceu de fato numa colheita e é medicamento registrado.
  const leaked = [
    "Esmalte Anti-fungíco Lakesia Medical Ciclopirox 80 Mg/g 3g",
    "Cetoconazol Anticaspa Shampoo 100ml",
    "Gel Galderma Rozex com Metronidazol 7,5mg/g 30g",
    "Dermodex Tratamento 100.000 U.I./g + 200 mg/g Pomada para Assadura 60g",
    "Gel Dermatológico Mantecorp Zella 150mg/g 30g"
  ];
  for (const name of leaked) {
    assert.equal(isMedicine({ name, category: "dermocosmetico" }), true, `deveria bloquear: ${name}`);
  }
});

test("ANVISA: cosmético e higiene comuns continuam liberados", () => {
  const allowed = [
    "Creme Dental Colgate Total Prevenção Ativa Fresh Mint 90g",
    "Fralda Pampers Confort Sec G 98 unidades",
    "Shampoo L'Oréal Elseve Hidra Hialurônico 400ml",
    "Protetor Solar Corporal FPS 70 La Roche-Posay Anthelios 200ml",
    "Desodorante Aerosol Rexona Clinical Classic Feminino 150ml",
    "Condicionador Pantene Pro-V Miracles Colágeno Hidrata & Resgata 510ml"
  ];
  for (const name of allowed) {
    assert.equal(isMedicine({ name, category: "higiene" }), false, `não deveria bloquear: ${name}`);
  }
});

test("ANVISA: nenhuma vitrine de farmácia serve medicamento", () => {
  for (const store of PHARMACIES) {
    const offending = store.listCatalog().filter((item) => isMedicine(item));
    assert.deepEqual(
      offending.map((i) => i.name),
      [],
      `${store.key} não pode servir medicamento`
    );
  }
});

test("ANVISA: as vitrines de farmácia continuam com catálogo útil após o filtro", () => {
  // Guarda contra o oposto do bug: um regex ganancioso demais esvaziaria a vitrine.
  assert.ok(drogariaSpStore.listCatalog().length > 3000, "Drogaria SP ficou pequena demais");
  assert.ok(pagueMenosStore.listCatalog().length > 1000, "Pague Menos ficou pequena demais");
  assert.ok(drogaRaiaStore.listCatalog().length >= 10, "Droga Raia ficou pequena demais");
});

test("MAPA: itens reais de medicamento veterinário são reconhecidos", () => {
  // Todos apareceram na colheita da Cobasi (02/08) e exigem receita/são regulados.
  const leaked = [
    "Antipulgas Simparic 20mg para Cães 5 a 10kg 1 comprimido",
    "Antipulgas e Carrapatos Bravecto > 4,5 a 10 kg para Cães 250mg 1 comprimido",
    "NexGard Spectra 15,1 a 30kg: Antipulgas, Carrapatos e Vermífugo 1 tablete",
    "Apoquel 5,4 mg - Tratamento para coceira em Cães 20 comprimidos",
    "Vermífugo Drontal Plus + Sabor para Cães 10kg 2 Comprimidos",
    "Prediderm 5 mg Anti-inflamatório para Cães 10 comprimidos",
    "Coleira Antipulgas Seresto Cães Acima de 8kg - 8 Meses de Proteção Único",
    "Ração Úmida Royal Canin Lata Veterinary Diet Gastrointestinal Low Fat para Cães Adultos 420g",
    "Ração Premier Nutrição Clínica Gastrointestinal Cães Raças Pequenas 2 kg"
  ];
  for (const name of leaked) {
    assert.equal(isVeterinaryMedicine({ name, category: "cachorro" }), true, `deveria bloquear: ${name}`);
  }
});

test("MAPA: ração, petisco e acessório comuns continuam liberados", () => {
  const allowed = [
    "Ração Golden Fórmula para Cães Adultos Frango e Carne 15kg",
    "Petisco Bilisko Palito Fino para Cães Carne 60g",
    "Areia Sanitária Pipicat Classic 4kg",
    "Brinquedo Kong Classic para Cães Grande",
    "Shampoo Sanol Dog Neutro para Cães e Gatos 500ml",
    "Coleira Peitoral para Cães Porte Médio Azul"
  ];
  for (const name of allowed) {
    assert.equal(isVeterinaryMedicine({ name, category: "cachorro" }), false, `não deveria bloquear: ${name}`);
  }
});

test("MAPA: nenhuma vitrine de pet serve medicamento veterinário ou dieta de prescrição", () => {
  for (const store of [cobasiStore, petzStore]) {
    const offending = store.listCatalog().filter((item) => isVeterinaryMedicine(item));
    assert.deepEqual(
      offending.map((i) => i.name),
      [],
      `${store.key} não pode servir medicamento veterinário`
    );
  }
});

test("MAPA: as vitrines de pet continuam com catálogo útil após o filtro", () => {
  assert.ok(cobasiStore.listCatalog().length > 700, "Cobasi ficou pequena demais");
  assert.ok(petzStore.listCatalog().length > 2000, "Petz ficou pequena demais");
});

test("ANVISA: withoutMedicine remove só o que é medicamento", () => {
  const items = [
    { sku: "a", name: "Sabonete Dove Original 90g", unitPrice: 4.5, unit: "un", category: "higiene" },
    { sku: "b", name: "Dipirona Monoidratada 1g 10 comprimidos", unitPrice: 7.99, unit: "un", category: "higiene" }
  ];
  const kept = withoutMedicine(items);
  assert.deepEqual(kept.map((i) => i.sku), ["a"]);
});
