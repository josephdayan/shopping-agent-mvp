import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { canAutoPurchase, cartHash } from "../src/lib/purchasing/policy";
import type { CartSnapshot } from "../src/lib/purchasing/types";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] == null) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function snapshot(total = 45): CartSnapshot {
  return {
    storeKey: "carrefour",
    storeLabel: "Carrefour",
    storeUnitId: "crf-pinheiros",
    retailerCartId: "cart-1",
    items: [
      {
        requestedSku: "lia-1",
        requestedName: "Arroz 1kg",
        requestedQty: 1,
        status: "resolved",
        retailerProductId: "123",
        retailerSellerId: "1",
        actualUnitPrice: total
      }
    ],
    itemsSubtotal: total,
    deliveryFee: 4.99,
    deliveryPromise: "Entrega amanhã",
    total,
    currency: "BRL",
    capturedAt: "2026-07-13T12:00:00.000Z",
    status: "ready"
  };
}

test("cartHash is stable despite item order and capture timestamp", () => {
  const first = snapshot();
  const second = { ...snapshot(), capturedAt: "2026-07-13T14:00:00.000Z" };
  assert.equal(cartHash(first), cartHash(second));
});

test("cartHash changes when retailer freight or delivery promise changes", () => {
  const first = snapshot();
  const freightChanged = { ...snapshot(), deliveryFee: 7.99 };
  const promiseChanged = { ...snapshot(), deliveryPromise: "Entrega em dois dias" };
  assert.notEqual(cartHash(first), cartHash(freightChanged));
  assert.notEqual(cartHash(first), cartHash(promiseChanged));
});

test("policy never auto-buys while disabled or in cart_only", () => {
  withEnv({ PURCHASE_AUTOMATION_ENABLED: "false", PURCHASE_AUTOMATION_MODE: "policy", PURCHASE_AUTO_APPROVE_MAX_TOTAL: "100" }, () => {
    assert.equal(canAutoPurchase({ snapshot: snapshot(), expectedTotal: 45 }).allowed, false);
  });
  withEnv({ PURCHASE_AUTOMATION_ENABLED: "true", PURCHASE_AUTOMATION_MODE: "cart_only", PURCHASE_AUTO_APPROVE_MAX_TOTAL: "100" }, () => {
    assert.equal(canAutoPurchase({ snapshot: snapshot(), expectedTotal: 45 }).allowed, false);
  });
});

test("policy auto-buy guard rejects price deltas and unresolved products", () => {
  withEnv(
    {
      PURCHASE_AUTOMATION_ENABLED: "true",
      PURCHASE_AUTOMATION_MODE: "policy",
      PURCHASE_AUTO_APPROVE_MAX_TOTAL: "100",
      PURCHASE_MAX_PRICE_DELTA: "2",
      PURCHASE_MAX_PRICE_DELTA_PERCENT: "0.03"
    },
    () => {
      assert.equal(canAutoPurchase({ snapshot: snapshot(45), expectedTotal: 45 }).allowed, true);
      assert.equal(canAutoPurchase({ snapshot: snapshot(49), expectedTotal: 45 }).reason, "price_delta_above_policy");
      const cartNotReady = { ...snapshot(), status: "needs_human" as const };
      assert.equal(canAutoPurchase({ snapshot: cartNotReady, expectedTotal: 45 }).reason, "cart_not_ready");
      const unresolved = snapshot();
      unresolved.items[0].status = "ambiguous";
      assert.equal(canAutoPurchase({ snapshot: unresolved, expectedTotal: 45 }).reason, "item_not_resolved");
    }
  );
});
