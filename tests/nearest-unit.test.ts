import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { StoreUnit } from "../src/lib/stores/types";
import { nearestByCoords, nearestByCepProxy, pickNearestUnit } from "../src/lib/stores/nearest";
import { seedGeoCache } from "../src/lib/geo";

// Unidades de teste: duas com coords (leste x oeste), CEPs próximos numericamente pra
// provar que o caminho GEO discorda (e vence) o proxy de CEP quando há coordenadas.
const LESTE: StoreUnit = { id: "leste", label: "Loja Leste", address: "Aricanduva", cep: "03453-000", lat: -23.566, lng: -46.507 };
const OESTE: StoreUnit = { id: "oeste", label: "Loja Oeste", address: "Butantã", cep: "05512-300", lat: -23.571, lng: -46.72 };
const SEM_COORDS: StoreUnit = { id: "x", label: "Sem coords", address: "?", cep: "02701-000" };

test("nearestByCoords: escolhe a unidade geograficamente mais próxima", () => {
  const pontoOeste = { lat: -23.57, lng: -46.73 }; // coladinho na Oeste
  const r = nearestByCoords([LESTE, OESTE], pontoOeste);
  assert.equal(r?.unit.id, "oeste");
  assert.equal(r?.method, "geo");
  assert.ok((r?.distanceKm ?? 99) < 3, `esperava <3km, veio ${r?.distanceKm}`);
});

test("nearestByCoords: ignora unidades sem coords; null se nenhuma tem", () => {
  assert.equal(nearestByCoords([SEM_COORDS], { lat: -23.5, lng: -46.6 }), null);
  const r = nearestByCoords([SEM_COORDS, OESTE], { lat: -23.57, lng: -46.72 });
  assert.equal(r?.unit.id, "oeste");
});

test("nearestByCepProxy: reproduz o algoritmo antigo (CEP mais próximo)", () => {
  // CEP do cliente 05400-000 → mais perto numericamente de 05512-300 (Oeste) que de 03453-000.
  assert.equal(nearestByCepProxy([LESTE, OESTE], "05400-000")?.id, "oeste");
  assert.equal(nearestByCepProxy([LESTE, OESTE], "03400-000")?.id, "leste");
  assert.equal(nearestByCepProxy([LESTE, OESTE], undefined), null);
});

test("pickNearestUnit: caminho GEO quando cliente geocodifica e há coords", async () => {
  seedGeoCache("05400000", { lat: -23.57, lng: -46.72 }); // ponto oeste
  const r = await pickNearestUnit([LESTE, OESTE], "05400-000");
  assert.equal(r.method, "geo");
  assert.equal(r.unit.id, "oeste");
  assert.ok(r.distanceKm != null);
});

test("pickNearestUnit: sem coords em nenhuma unidade → cai no proxy de CEP (distanceKm null)", async () => {
  const semCoords = [
    { id: "a", label: "A", address: "", cep: "03453-000" },
    { id: "b", label: "B", address: "", cep: "05512-300" }
  ];
  const r = await pickNearestUnit(semCoords, "05400-000");
  assert.equal(r.method, "cep");
  assert.equal(r.unit.id, "b");
  assert.equal(r.distanceKm, null);
});

test("pickNearestUnit: geocode falha → fallback proxy de CEP", async () => {
  const realFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("geo down");
  }) as typeof fetch;
  try {
    // CEP não semeado + unidades COM coords: tenta geo (falha) → proxy de CEP.
    const r = await pickNearestUnit([LESTE, OESTE], "05400-111");
    assert.equal(r.method, "cep");
    assert.equal(r.unit.id, "oeste");
  } finally {
    global.fetch = realFetch;
  }
});

test("pickNearestUnit: sem CEP → default (units[0])", async () => {
  const r = await pickNearestUnit([LESTE, OESTE], undefined);
  assert.equal(r.method, "default");
  assert.equal(r.unit.id, "leste");
});

test("pickNearestUnit: lança se não há unidades", async () => {
  await assert.rejects(() => pickNearestUnit([], "01310-100"));
});
