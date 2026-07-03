import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, geocode, seedGeoCache, type LatLng } from "../src/lib/geo";

const PAULISTA: LatLng = { lat: -23.5614, lng: -46.6559 }; // MASP, Av. Paulista
const TAMBORE: LatLng = { lat: -23.5012, lng: -46.8319 }; // Carrefour Tamboré, Barueri

test("haversineKm: identidade é 0", () => {
  assert.equal(haversineKm(PAULISTA, PAULISTA), 0);
});

test("haversineKm: Paulista↔Tamboré ≈ 18-20 km", () => {
  const km = haversineKm(PAULISTA, TAMBORE);
  assert.ok(km > 16 && km < 22, `esperava ~18-20km, veio ${km.toFixed(1)}`);
});

test("haversineKm: 1 grau de latitude ≈ 111 km", () => {
  const km = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(km - 111) < 1, `esperava ~111km, veio ${km.toFixed(1)}`);
});

test("seedGeoCache curto-circuita o fetch (aceita CEP com ou sem traço)", async () => {
  let fetchCalls = 0;
  const realFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalls++;
    throw new Error("não deveria bater na rede");
  }) as typeof fetch;
  try {
    seedGeoCache("06460-930", TAMBORE);
    const a = await geocode("06460930"); // sem traço → mesma chave
    assert.deepEqual(a, TAMBORE);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = realFetch;
  }
});

test("geocode retorna null em timeout/erro (nunca lança)", async () => {
  const realFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    const r = await geocode("99999123"); // CEP não semeado → tenta rede → falha → null
    assert.equal(r, null);
  } finally {
    global.fetch = realFetch;
  }
});

test("geocode sem cep nem address usável → null", async () => {
  assert.equal(await geocode(undefined, undefined), null);
  assert.equal(await geocode("123", ""), null);
});
