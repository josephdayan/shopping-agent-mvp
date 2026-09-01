// Unidade do compositor de cesta (P1.8): sem IO, sem DB — só a matemática de juntar
// entregas quando compensa e de NÃO mexer quando não compensa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeBasket, type ComposeLine } from "../src/lib/basket-composer";

const display = (v: number) => Math.round(v * 100) / 100;

// Frete de brinquedo: A = R$5 fixo; X = R$15 fixo; B = grátis acima de R$50, senão R$10.
const freightFor = (storeKey: string, _label: string | undefined, subtotal: number) => {
  if (storeKey === "a") return 5;
  if (storeKey === "x") return 15;
  if (storeKey === "b") return subtotal >= 50 ? 0 : 10;
  return 18;
};

const opt = (sku: string, name: string, price: number, store: string) => ({
  sku,
  name,
  unitPrice: price,
  storeKey: store,
  storeLabel: store.toUpperCase()
});

test("item sozinho em loja cara migra pra loja do resto da cesta quando compensa", () => {
  const lines: ComposeLine[] = [
    { qty: 1, options: [opt("a1", "Arroz A", 10, "a")] },
    { qty: 1, options: [opt("a2", "Feijão A", 8, "a")] },
    { qty: 1, options: [opt("a3", "Café A", 12, "a")] },
    // leite: 1º do ranking na loja X (R$10 + frete 15 só dele); alternativa na A por R$12
    { qty: 1, options: [opt("x1", "Leite X", 10, "x"), opt("a4", "Leite A", 12, "a")] }
  ];
  const out = composeBasket(lines, display, freightFor);
  assert.equal(out.picks[3], 1, JSON.stringify(out));
  assert.equal(out.moves.length, 1);
  assert.equal(out.moves[0].toName, "Leite A");
  assert.equal(out.before.stores, 2);
  assert.equal(out.after.stores, 1);
  // antes: 40 produtos + 20 frete = 60; depois: 42 + 5 = 47
  assert.equal(out.before.total, 60);
  assert.equal(out.after.total, 47);
});

test("quando a alternativa é cara demais, nada muda", () => {
  const lines: ComposeLine[] = [
    { qty: 1, options: [opt("a1", "Arroz A", 10, "a")] },
    { qty: 1, options: [opt("x1", "Leite X", 10, "x"), opt("a4", "Leite A caro", 40, "a")] }
  ];
  const out = composeBasket(lines, display, freightFor);
  assert.deepEqual(out.picks, [0, 0]);
  assert.equal(out.moves.length, 0);
  assert.equal(out.before.total, out.after.total);
});

test("cruzar o limiar de frete grátis conta a favor da troca", () => {
  // 3 itens na B somando 45 (frete 10); o 4º item na A (R$10 + frete 5) tem gêmeo na B
  // por R$11 — movê-lo faz a B cruzar R$50 e zera o frete dela.
  const lines: ComposeLine[] = [
    { qty: 1, options: [opt("b1", "Item B1", 15, "b")] },
    { qty: 1, options: [opt("b2", "Item B2", 15, "b")] },
    { qty: 1, options: [opt("b3", "Item B3", 15, "b")] },
    { qty: 1, options: [opt("a1", "Sabão A", 10, "a"), opt("b4", "Sabão B", 11, "b")] }
  ];
  const out = composeBasket(lines, display, freightFor);
  // antes: 55 produtos + (10 + 5) frete = 70; depois: 56 + 0 = 56
  assert.equal(out.picks[3], 1, JSON.stringify(out));
  assert.equal(out.after.freight, 0);
  assert.equal(out.after.total, 56);
});

test("quantidade multiplica o preço da linha na conta", () => {
  const lines: ComposeLine[] = [
    { qty: 3, options: [opt("a1", "Leite A", 5, "a")] },
    // 4x do item: na X custa 4×2=8 + frete 15; na A custa 4×4=16 e some o frete extra
    { qty: 4, options: [opt("x1", "Pão X", 2, "x"), opt("a2", "Pão A", 4, "a")] }
  ];
  const out = composeBasket(lines, display, freightFor);
  // antes: 15+8 produtos + 5+15 frete = 43; mover: 15+16 + 5 = 36 → move
  assert.equal(out.picks[1], 1, JSON.stringify(out));
  assert.equal(out.after.total, 36);
});

test("frete grátis usa subtotal real da loja, não preço exibido com margem", () => {
  const withMarkup = (value: number) => Math.round(value * 1.1 * 100) / 100;
  const thresholdFreight = (_storeKey: string, _label: string | undefined, rawSubtotal: number) =>
    rawSubtotal >= 100 ? 0 : 20;
  const lines: ComposeLine[] = [
    // Preço exibido = R$104,50, mas o checkout da loja ainda vê R$95 e cobra frete.
    { qty: 1, options: [opt("a1", "Produto A", 95, "a")] }
  ];
  const out = composeBasket(lines, withMarkup, thresholdFreight);
  assert.equal(out.before.products, 104.5);
  assert.equal(out.before.freight, 20);
  assert.equal(out.before.total, 124.5);
});

test("uma economia de produto nunca cria uma entrega adicional", () => {
  const zeroFreight = () => 0;
  const lines: ComposeLine[] = [
    { qty: 1, options: [opt("a1", "Arroz A", 10, "a")] },
    { qty: 1, options: [opt("a2", "Café A", 100, "a"), opt("b2", "Café B", 10, "b")] }
  ];
  const out = composeBasket(lines, display, zeroFreight);
  assert.deepEqual(out.picks, [0, 0]);
  assert.equal(out.before.stores, 1);
  assert.equal(out.after.stores, 1);
});
