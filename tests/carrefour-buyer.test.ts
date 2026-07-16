import assert from "node:assert/strict";
import test from "node:test";
import {
  CarrefourBuyer,
  classifyCarrefourBrowserbaseFailure,
  detectCarrefourHumanAction,
  parseCarrefourDeliveryFee,
  parseCarrefourDeliveryPromise,
  parseCarrefourCartTotal,
  parseCarrefourOrderNumber
} from "../src/lib/purchasing/stores/carrefour-buyer";
import type { BuyerInput, CartSnapshot } from "../src/lib/purchasing/types";

const buyerInput: BuyerInput = {
  jobId: "job-test",
  deliveryOrderId: "order-test",
  deliveryCep: "01310-100",
  storeKey: "carrefour",
  storeLabel: "Carrefour",
  items: []
};

const readySnapshot: CartSnapshot = {
  storeKey: "carrefour",
  storeLabel: "Carrefour",
  items: [],
  itemsSubtotal: 0,
  total: 0,
  currency: "BRL",
  capturedAt: "2026-07-15T00:00:00.000Z",
  status: "ready"
};

test("Carrefour: lê o total do checkout, não o primeiro preço de produto", () => {
  const text = "Arroz R$ 24,90\nFrete R$ 8,99\nTotal do pedido R$ 33,89";
  assert.equal(parseCarrefourCartTotal(text), 33.89);
});

test("Carrefour: só aceita frete e prazo que o checkout exibiu", () => {
  const text = "Frete R$ 8,99\nEntrega amanhã, 16/07\nTotal do pedido R$ 33,89";
  assert.equal(parseCarrefourDeliveryFee(text), 8.99);
  assert.equal(parseCarrefourDeliveryPromise(text), "Entrega amanhã, 16/07");
  assert.equal(parseCarrefourDeliveryFee("Total do pedido R$ 33,89"), undefined);
  assert.equal(parseCarrefourDeliveryPromise("Total do pedido R$ 33,89"), undefined);
});

test("Carrefour: identifica desafios que precisam de humano", () => {
  assert.equal(detectCarrefourHumanAction("Confirme no aplicativo do banco para concluir")?.code, "PAYMENT_ACTION_REQUIRED");
  assert.equal(detectCarrefourHumanAction("Verifique que você é humano para continuar")?.code, "CAPTCHA_REQUIRED");
  assert.equal(detectCarrefourHumanAction("Sua sessão expirou, faça login novamente")?.code, "LOGIN_REQUIRED");
  assert.equal(detectCarrefourHumanAction("Estamos temporariamente indisponíveis. Tente novamente mais tarde.")?.code, "RETAILER_UNAVAILABLE");
  assert.equal(detectCarrefourHumanAction("Pedido pronto")?.code, undefined);
});

test("Carrefour: falhas Browserbase são classificadas sem tentar checkout", () => {
  assert.equal(classifyCarrefourBrowserbaseFailure(Object.assign(new Error("Unauthorized"), { status: 401 })).code, "CONFIGURATION_REQUIRED");
  assert.equal(classifyCarrefourBrowserbaseFailure(Object.assign(new Error("gateway timeout"), { status: 503 })).code, "RETAILER_UNAVAILABLE");
  assert.equal(classifyCarrefourBrowserbaseFailure(new Error("erro desconhecido")).code, "MANUAL_ACTION_REQUIRED");
});

test("Carrefour: cart_only bloqueia finalização antes de acessar Browserbase", async () => {
  const enabled = process.env.PURCHASE_AUTOMATION_ENABLED;
  const mode = process.env.PURCHASE_AUTOMATION_MODE;
  const browserbaseKey = process.env.BROWSERBASE_API_KEY;
  const context = process.env.CARREFOUR_BROWSER_CONTEXT_ID;
  try {
    process.env.PURCHASE_AUTOMATION_ENABLED = "true";
    process.env.PURCHASE_AUTOMATION_MODE = "cart_only";
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.CARREFOUR_BROWSER_CONTEXT_ID;
    await assert.rejects(
      () => new CarrefourBuyer().placeOrder(buyerInput, readySnapshot, "idempotency-test"),
      (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "MANUAL_ACTION_REQUIRED")
    );
  } finally {
    if (enabled === undefined) delete process.env.PURCHASE_AUTOMATION_ENABLED;
    else process.env.PURCHASE_AUTOMATION_ENABLED = enabled;
    if (mode === undefined) delete process.env.PURCHASE_AUTOMATION_MODE;
    else process.env.PURCHASE_AUTOMATION_MODE = mode;
    if (browserbaseKey === undefined) delete process.env.BROWSERBASE_API_KEY;
    else process.env.BROWSERBASE_API_KEY = browserbaseKey;
    if (context === undefined) delete process.env.CARREFOUR_BROWSER_CONTEXT_ID;
    else process.env.CARREFOUR_BROWSER_CONTEXT_ID = context;
  }
});

test("Carrefour: extrai o número da confirmação sem aceitar um texto genérico", () => {
  assert.equal(parseCarrefourOrderNumber("Seu pedido nº ABCD-12345 foi confirmado"), "ABCD-12345");
  assert.equal(parseCarrefourOrderNumber("Compra em processamento"), undefined);
});
