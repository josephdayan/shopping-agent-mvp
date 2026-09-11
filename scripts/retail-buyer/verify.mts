// Loja inteiramente simulada: intercepta TODA requisição, sem contato com varejistas.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openProfile,
  VtexBuyer,
  verifyAddress,
  type BuyerJob,
  type StoreRecipe,
} from "./browser";
const root = await mkdtemp(join(tmpdir(), "lia-buyer-test-"));
const context = await openProfile(root, "fixture", true);
const address = {
  street: "Rua Teste",
  number: "10",
  complement: "apto 2",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
};
const original = "Rua Teste, 10, apto 2, Centro, São Paulo - SP";
const recipe: StoreRecipe = {
  origin: "https://www.kopenhagen.com.br",
  skuPrefix: "kopenhagen-",
  submitSelector: "#buy",
  receipt: {
    successSelector: "#receipt",
    orderNumberSelector: "#number",
    totalSelector: "#total",
  },
};
const job: BuyerJob = {
  jobId: "fixture",
  orderId: "fixture",
  claimToken: "fixture",
  cartHash: "a".repeat(64),
  maximumTotal: 28,
  storeKey: "kopenhagen",
  accountEmail: "compras@example.test",
  customer: {
    name: "Cliente Teste",
    phone: "+550000000000",
    cep: "01310-100",
    address: original,
  },
  items: [
    {
      sku: "kopenhagen-123",
      name: "Chocolate",
      quantity: 2,
      expectedUnitPrice: 10,
      productUrl: recipe.origin + "/chocolate/p",
    },
  ],
};
let clicks = 0;
let mutations = 0;
let form: any = {
  orderFormId: "fixture",
  clientProfileData: { email: job.accountEmail },
  items: [],
  value: 2800,
  totalizers: [{ id: "Shipping", value: 800 }],
  shippingData: { selectedAddresses: [], logisticsInfo: [] },
  paymentData: {
    availableAccounts: [
      { accountId: "saved-company-account", paymentSystem: "2" },
    ],
    payments: [],
  },
};
const html =
  "<!doctype html><button id=\"buy\" onclick=\"fetch('/fixture-confirm').then(()=>{document.body.innerHTML='<div id=receipt><span id=number>FIXTURE-123</span><span id=total>R$ 28,00</span></div>'})\">Comprar</button>";
try {
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== recipe.origin) return route.abort();
    const path = url.pathname;
    if (path === "/checkout/")
      return route.fulfill({ contentType: "text/html", body: html });
    if (path === "/fixture-confirm") {
      clicks++;
      return route.fulfill({ json: { ok: true } });
    }
    if (path.startsWith("/api/catalog_system/"))
      return route.fulfill({
        json: [
          {
            items: [
              {
                itemId: "123",
                sellers: [
                  { sellerId: "1", commertialOffer: { AvailableQuantity: 5 } },
                ],
              },
            ],
          },
        ],
      });
    if (path.startsWith("/api/checkout/pub/orderForm")) {
      if (request.method() === "POST") {
        mutations++;
        const body = request.postDataJSON();
        if (path.endsWith("/items"))
          form.items = body.orderItems
            .filter((i: any) => i.quantity > 0)
            .map((i: any) => ({
              ...i,
              name: "Chocolate",
              sellingPrice: 1000,
              availability: "available",
              priceDefinition: { total: 2000 },
            }));
        else if (path.endsWith("/shippingData"))
          form.shippingData = {
            ...body,
            logisticsInfo: [
              {
                itemIndex: 0,
                selectedSla: body.logisticsInfo?.[0]?.selectedSla,
                selectedDeliveryChannel:
                  body.logisticsInfo?.[0]?.selectedDeliveryChannel,
                slas: [
                  {
                    id: "NORMAL",
                    deliveryChannel: "delivery",
                    shippingEstimate: "1bd",
                    price: 800,
                  },
                ],
              },
            ],
          };
        else if (path.endsWith("/paymentData")) form.paymentData = body;
        else throw new Error("Mutação inesperada");
      }
      return route.fulfill({ json: form });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const buyer = new VtexBuyer(page, recipe);
  assert.throws(
    () => verifyAddress({ ...address, complement: "" }, original),
    /complemento/,
  );
  const evidence = await buyer.prepare(job, address);
  assert.equal(evidence.totalCents, 2800);
  assert.equal(evidence.items[0].qty, 2);
  assert.equal(evidence.paymentLabel, "Cartão corporativo salvo");
  assert.equal(clicks, 0, "Preparar nunca compra");
  assert.equal(mutations, 4);
  await assert.rejects(buyer.prepare(job, address), /carrinho/);
  form.items.push({ id: "999", quantity: 1 });
  await assert.rejects(buyer.clearPreparedCart(job), /Carrinho mudou/);
  form.items.pop();
  await buyer.clearPreparedCart(job);
  assert.equal(form.items.length, 0);
  assert.equal(clicks, 0);
  await buyer.prepare(job, address);

  form.shippingData.selectedAddresses[0].complement = "apto 3";
  await assert.rejects(buyer.snapshot(job, address), /Endereço/);
  form.shippingData.selectedAddresses[0].complement = "apto 2";
  await buyer.submit();
  assert.deepEqual(await buyer.receipt(), {
    storeOrderNumber: "FIXTURE-123",
    actualTotalCents: 2800,
  });
  assert.equal(clicks, 1);
  await page.goto("https://invalid.example/").catch(() => {});
  await assert.rejects(buyer.submit());
  // Pix: seleciona o paymentSystem 125 sem finalizar; sondagem lê o estado sem clicar.
  form.items = [];
  form.paymentData.payments = [];
  form.paymentData.paymentSystems = [
    { id: 2, name: "Visa", groupName: "creditCardPaymentGroup" },
    { id: 125, name: "Pix", groupName: "instantPaymentPaymentGroup" },
  ];
  const pixPage = await context.newPage();
  const pixBuyer = new VtexBuyer(pixPage, { ...recipe, payment: "pix" });
  await pixBuyer.prepareCart(job, address);
  assert.equal(form.paymentData.payments[0].paymentSystem, "125");
  assert.equal(form.paymentData.payments[0].value, 2800);
  const probe = await pixBuyer.probeReport();
  assert.equal(probe.pixAvailable, true);
  assert.equal(probe.pixSelected, true);
  assert.equal(probe.challengeVisible, false);
  assert.equal(clicks, 1, "Sondagem nunca clica");
  form.paymentData.paymentSystems = [{ id: 2, name: "Visa", groupName: "creditCardPaymentGroup" }];
  await assert.rejects(pixBuyer.selectPix(form), /não oferece Pix/);
  console.log(
    "Navegador aprovado: preparação sem compra, carrinho ocupado, complemento divergente, clique único, comprovante, bloqueio de origem e seleção de Pix sem finalizar.",
  );
} finally {
  await context.close();
  await rm(root, { recursive: true, force: true });
}
