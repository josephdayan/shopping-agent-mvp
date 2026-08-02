import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVE_DELIVERY_ORDER_STATUSES,
  OPS_QUEUE_STATUSES,
  RETAILER_OUT_FOR_DELIVERY_STATUS,
  RETAILER_PREPARING_STATUS,
  REFUND_PENDING_FLAG,
  appendOrderNote,
  hasPendingRefund,
  isOrderOutForDelivery,
  isRetailerDeliveryOrder,
  statusAfterStorePurchase
} from "../src/lib/order-flags";

test("retailer delivery is detected from the canonical key or fulfillment mode", () => {
  assert.equal(isRetailerDeliveryOrder({ courierKey: "retailer_delivery" }), true);
  assert.equal(
    isRetailerDeliveryOrder({
      courierKey: "uber_direct",
      fulfillments: [
        { storeKey: "oba", deliveryMode: "retailer_delivery" },
        { storeKey: "petz", deliveryMode: "retailer_delivery" }
      ]
    }),
    true
  );
  assert.equal(
    isRetailerDeliveryOrder({
      courierKey: "uber_direct",
      fulfillments: [{ storeKey: "oba", deliveryMode: "authorized_courier" }]
    }),
    false
  );
});

test("a confirmed direct purchase enters retailer preparation, not pickup", () => {
  assert.equal(statusAfterStorePurchase({ courierKey: "retailer_delivery" }), RETAILER_PREPARING_STATUS);
  assert.equal(statusAfterStorePurchase({ courierKey: "uber_direct" }), "operator_buying");
  assert.ok(ACTIVE_DELIVERY_ORDER_STATUSES.includes(RETAILER_PREPARING_STATUS));
  assert.ok(OPS_QUEUE_STATUSES.includes(RETAILER_OUT_FOR_DELIVERY_STATUS));
});

test("both retailer and authorized-courier delivery are too late for chat cancellation", () => {
  assert.equal(isOrderOutForDelivery(RETAILER_OUT_FOR_DELIVERY_STATUS), true);
  assert.equal(isOrderOutForDelivery("dispatched"), true);
  assert.equal(isOrderOutForDelivery(RETAILER_PREPARING_STATUS), false);
});

test("refund audit notes are append-only and deduplicated", () => {
  const first = appendOrderNote("Pagamento: Pix", REFUND_PENDING_FLAG);
  const repeated = appendOrderNote(first, REFUND_PENDING_FLAG);
  assert.equal(first, repeated);
  assert.equal(hasPendingRefund(repeated), true);
  assert.ok(OPS_QUEUE_STATUSES.includes("refund_pending"));
});
