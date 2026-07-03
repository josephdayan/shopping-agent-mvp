import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFreightGuard, maxDeliveryKm } from "../src/lib/freight-guard";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

const clean = {
  LIA_MAX_DELIVERY_KM: undefined,
  LIA_MAX_DELIVERY_FEE: undefined,
  LIA_FREIGHT_GUARD_OFF: undefined
};

test("distância dentro do raio → passa", () => {
  withEnv(clean, () => assert.equal(checkFreightGuard({ distanceKm: 8 }), null));
});

test("distância além do raio → too_far", () => {
  withEnv(clean, () => {
    const b = checkFreightGuard({ distanceKm: 45 });
    assert.equal(b?.reason, "too_far");
    assert.equal(b?.distanceKm, 45);
  });
});

test("distância null → fail-open na distância", () => {
  withEnv(clean, () => assert.equal(checkFreightGuard({ distanceKm: null }), null));
});

test("fee real acima do teto → fee_too_high", () => {
  withEnv(clean, () => {
    const b = checkFreightGuard({ distanceKm: null, fee: 60, feeIsMock: false });
    assert.equal(b?.reason, "fee_too_high");
    assert.equal(b?.fee, 60);
  });
});

test("fee mock é isento (não morde no sandbox)", () => {
  withEnv(clean, () => assert.equal(checkFreightGuard({ distanceKm: null, fee: 999, feeIsMock: true }), null));
});

test("distância é primária: barra mesmo com fee mock barato", () => {
  withEnv(clean, () => {
    const b = checkFreightGuard({ distanceKm: 50, fee: 3, feeIsMock: true });
    assert.equal(b?.reason, "too_far");
  });
});

test("LIA_MAX_DELIVERY_KM ajusta o raio", () => {
  withEnv({ ...clean, LIA_MAX_DELIVERY_KM: "30" }, () => {
    assert.equal(checkFreightGuard({ distanceKm: 25 }), null);
    assert.equal(checkFreightGuard({ distanceKm: 35 })?.reason, "too_far");
  });
});

test("LIA_MAX_DELIVERY_KM=0 desliga a checagem de distância", () => {
  withEnv({ ...clean, LIA_MAX_DELIVERY_KM: "0" }, () => {
    assert.equal(checkFreightGuard({ distanceKm: 999 }), null);
  });
});

test("LIA_MAX_DELIVERY_FEE ajusta o teto; 0 desliga", () => {
  withEnv({ ...clean, LIA_MAX_DELIVERY_FEE: "20" }, () =>
    assert.equal(checkFreightGuard({ distanceKm: null, fee: 25, feeIsMock: false })?.reason, "fee_too_high")
  );
  withEnv({ ...clean, LIA_MAX_DELIVERY_FEE: "0" }, () =>
    assert.equal(checkFreightGuard({ distanceKm: null, fee: 999, feeIsMock: false }), null)
  );
});

test("LIA_FREIGHT_GUARD_OFF=true passa tudo", () => {
  withEnv({ ...clean, LIA_FREIGHT_GUARD_OFF: "true" }, () => {
    assert.equal(checkFreightGuard({ distanceKm: 999, fee: 999, feeIsMock: false }), null);
  });
});

test("maxDeliveryKm default = 12", () => {
  withEnv(clean, () => assert.equal(maxDeliveryKm(), 12));
});
