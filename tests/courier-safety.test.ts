import "./helpers/load-env";
import assert from "node:assert/strict";
import test from "node:test";
import { assertDispatchIsAllowed } from "../src/lib/couriers";

test("produção Meta rejeita despacho mockado", () => {
  const previousProvider = process.env.WHATSAPP_PROVIDER;
  const previousGuard = process.env.LIA_REQUIRE_REAL_COURIER_DISPATCH;
  try {
    process.env.WHATSAPP_PROVIDER = "meta";
    delete process.env.LIA_REQUIRE_REAL_COURIER_DISPATCH;
    assert.throws(
      () => assertDispatchIsAllowed({ dispatchId: "mock", trackingUrl: "https://track.mock/x", mock: true }),
      /despacho real/i
    );
  } finally {
    if (previousProvider === undefined) delete process.env.WHATSAPP_PROVIDER;
    else process.env.WHATSAPP_PROVIDER = previousProvider;
    if (previousGuard === undefined) delete process.env.LIA_REQUIRE_REAL_COURIER_DISPATCH;
    else process.env.LIA_REQUIRE_REAL_COURIER_DISPATCH = previousGuard;
  }
});

test("ambiente de teste continua permitindo despacho mockado", () => {
  const previousProvider = process.env.WHATSAPP_PROVIDER;
  try {
    process.env.WHATSAPP_PROVIDER = "mock";
    assert.doesNotThrow(() =>
      assertDispatchIsAllowed({ dispatchId: "mock", trackingUrl: "https://track.mock/x", mock: true })
    );
  } finally {
    if (previousProvider === undefined) delete process.env.WHATSAPP_PROVIDER;
    else process.env.WHATSAPP_PROVIDER = previousProvider;
  }
});
