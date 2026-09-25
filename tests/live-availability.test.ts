// 03/09: "se ele quer um chá, tem que dar em um lugar que tenha chá, disponível e que
// chegue rápido". Antes dos cards, cada candidato de loja consultável é simulado no site
// para o CEP do cliente: sem estoque/sem entrega sai; confirmado vem antes e ordenado
// pelo prazo. Puro — a simulação é injetada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCandidatesLive, liveKey } from "../src/lib/live-availability";
import type { LiveItemCheck } from "../src/lib/live-freight";

type C = { storeKey: string; sku: string; name: string };
const cands: C[] = [
  { storeKey: "petz", sku: "PETZ-1", name: "Chá Petz (não verificável)" },
  { storeKey: "naturaldaterra", sku: "naturaldaterra-1", name: "Chá sem estoque" },
  { storeKey: "naturaldaterra", sku: "naturaldaterra-2", name: "Chá 2 dias" },
  { storeKey: "paguemenos", sku: "paguemenos-9", name: "Chá 1 dia" },
  { storeKey: "paguemenos", sku: "paguemenos-8", name: "Chá sem entrega no CEP" }
];
const supported = (k: string) => k === "naturaldaterra" || k === "paguemenos";
const simulate = async (storeKey: string, skus: string[]): Promise<Map<string, LiveItemCheck>> => {
  const m = new Map<string, LiveItemCheck>();
  for (const sku of skus) {
    if (sku === "naturaldaterra-1") m.set(sku, { sku, available: false });
    if (sku === "naturaldaterra-2") m.set(sku, { sku, available: true, fee: 9.9, estimate: "2bd", etaMinutes: 2 * 24 * 60 });
    if (sku === "paguemenos-9") m.set(sku, { sku, available: true, fee: 4.9, estimate: "1bd", etaMinutes: 24 * 60 });
    if (sku === "paguemenos-8") m.set(sku, { sku, available: false });
  }
  void storeKey;
  return m;
};

test("sem estoque e sem entrega saem; confirmados vêm antes, do mais rápido ao mais lento; não verificável fica por último", async () => {
  const { kept, dropped, checks } = await checkCandidatesLive(cands, "01229-000", simulate, supported);
  assert.deepEqual(dropped.map((c) => c.sku), ["naturaldaterra-1", "paguemenos-8"]);
  assert.deepEqual(kept.map((c) => c.sku), ["paguemenos-9", "naturaldaterra-2", "PETZ-1"]);
  assert.equal(checks.get(liveKey("paguemenos", "paguemenos-9"))?.estimate, "1bd");
  assert.equal(checks.get(liveKey("petz", "PETZ-1")), undefined, "loja não consultável não ganha veredito");
});

test("sem CEP nada é consultado; loja que não responde mantém os candidatos (nunca inventa indisponibilidade)", async () => {
  const noCep = await checkCandidatesLive(cands, undefined, simulate, supported);
  assert.deepEqual(noCep.kept, cands);
  assert.equal(noCep.checks.size, 0);
  const silent = await checkCandidatesLive(cands, "01229-000", async () => null, supported);
  assert.deepEqual(silent.kept, cands);
  assert.equal(silent.dropped.length, 0);
  const throwing = await checkCandidatesLive(cands, "01229-000", async () => { throw new Error("boom"); }, supported);
  assert.deepEqual(throwing.kept, cands);
});

test("ordem das opções: confirmado > cabe no mínimo da loja > chega antes > mais barato posto em casa", async () => {
  const { byVerifiedThenEta } = await import("../src/lib/delivery-service");
  const base = { name: "Água de coco", sku: "x" };
  const lento = { ...base, sku: "a", unitPrice: 5, storeKey: "cobasi", verified: true, etaMinutes: 24 * 60, freightFee: 7 };
  const rapidoCaro = { ...base, sku: "b", unitPrice: 5, storeKey: "drogariasp", verified: true, etaMinutes: 90, freightFee: 8.9 };
  const rapidoBarato = { ...base, sku: "c", unitPrice: 5, storeKey: "paguemenos", verified: true, etaMinutes: 90, freightFee: 6.9 };
  const semConfirmar = { ...base, sku: "d", unitPrice: 1, storeKey: "drogal" };
  const sorted = [lento, semConfirmar, rapidoCaro, rapidoBarato].sort(byVerifiedThenEta).map((o) => o.sku);
  assert.deepEqual(sorted, ["c", "b", "a", "d"]);
  // Loja com mínimo alto: item de R$5 lá vai depois, mesmo chegando antes.
  const { getStore } = await import("../src/lib/stores");
  const dsp = getStore("drogariasp") as { key: string; minOrder?: number };
  assert.equal(dsp.key, "drogariasp");
  const oldMin = dsp.minOrder;
  dsp.minOrder = 30;
  try {
    const noMinimo = { ...base, sku: "e", unitPrice: 5, storeKey: "drogariasp", verified: true, etaMinutes: 30, freightFee: 5 };
    assert.deepEqual([noMinimo, lento].sort(byVerifiedThenEta).map((o) => o.sku), ["a", "e"]);
  } finally {
    dsp.minOrder = oldMin;
  }
});
