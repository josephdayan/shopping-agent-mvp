import "./helpers/load-env";
import assert from "node:assert/strict";
import test from "node:test";
import { ObaBuyer } from "../src/lib/purchasing/stores/oba-buyer";
import { parseDeliveryFee, parseDeliveryPromise } from "../src/lib/purchasing/stores/browser-store-utils";
import { parseObaCatalog } from "../src/lib/stores/oba";
import type { BuyerInput, CartSnapshot } from "../src/lib/purchasing/types";

test("Oba: catálogo VTEX só expõe SKU vendável com URL e vendedor", () => {
  const items = parseObaCatalog([
    {
      productName: "Arroz Camil 1 Kg",
      link: "/arroz-camil-1-kg/p",
      items: [
        { itemId: "100004793", nameComplete: "Arroz Camil 1 Kg", sellers: [{ sellerId: "1", commertialOffer: { Price: 5.99, AvailableQuantity: 9 } }] },
        { itemId: "sem-estoque", sellers: [{ sellerId: "1", commertialOffer: { Price: 4.99, AvailableQuantity: 0 } }] }
      ]
    }
  ]);
  assert.deepEqual(items, [
    {
      sku: "oba-live-100004793-seller-1",
      name: "Arroz Camil 1 Kg",
      unitPrice: 5.99,
      unit: "un",
      category: "oba mercado",
      imageUrl: undefined,
      productUrl: "https://secure.obahortifruti.com.br/arroz-camil-1-kg/p"
    }
  ]);
});

test("frete e prazo só são aceitos quando o checkout os mostrou", () => {
  const text = "Subtotal R$ 18,98\nFrete\nR$ 9,90\nEntrega amanhã, 20/07\nTotal R$ 28,88";
  assert.equal(parseDeliveryFee(text), 9.9);
  assert.equal(parseDeliveryPromise(text), "Entrega amanhã, 20/07");
  assert.equal(parseDeliveryFee("Total R$ 28,88"), undefined);
  assert.equal(parseDeliveryPromise("Total R$ 28,88"), undefined);
  assert.equal(parseDeliveryFee("Com mais R$ 132,10 ganhe FRETE GRÁTIS"), undefined);
  assert.equal(parseDeliveryPromise("Consulte o frete e o prazo de entrega\nNão sei meu CEP\nRetire na loja em até 3 horas"), undefined);
});

const input: BuyerInput = {
  jobId: "job-test",
  deliveryOrderId: "order-test",
  deliveryCep: "01310-100",
  storeKey: "oba",
  storeLabel: "Oba Hortifruti",
  items: []
};

const snapshot: CartSnapshot = {
  storeKey: "oba",
  storeLabel: "Oba Hortifruti",
  items: [],
  itemsSubtotal: 0,
  deliveryFee: 0,
  deliveryPromise: "Entrega agendada",
  total: 0,
  currency: "BRL",
  capturedAt: "2026-07-19T00:00:00.000Z",
  status: "ready"
};

test("Oba: cart_only bloqueia finalização antes de qualquer sessão Browserbase", async () => {
  const enabled = process.env.PURCHASE_AUTOMATION_ENABLED;
  const mode = process.env.PURCHASE_AUTOMATION_MODE;
  try {
    process.env.PURCHASE_AUTOMATION_ENABLED = "true";
    process.env.PURCHASE_AUTOMATION_MODE = "cart_only";
    await assert.rejects(
      () => new ObaBuyer().placeOrder(input, snapshot, "idempotency-test"),
      (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "MANUAL_ACTION_REQUIRED")
    );
  } finally {
    if (enabled === undefined) delete process.env.PURCHASE_AUTOMATION_ENABLED;
    else process.env.PURCHASE_AUTOMATION_ENABLED = enabled;
    if (mode === undefined) delete process.env.PURCHASE_AUTOMATION_MODE;
    else process.env.PURCHASE_AUTOMATION_MODE = mode;
  }
});
