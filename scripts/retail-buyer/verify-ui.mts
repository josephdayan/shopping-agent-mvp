import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openProfile } from "./browser";
const script = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{PurchaseAccounts,PurchaseReview}from'./src/app/ops/PurchaseControl';const job={id:'fixture',status:'awaiting_approval',checkoutHash:'a'.repeat(64),checkoutExpiresAt:new Date(Date.now()-3600000).toISOString(),checkoutEvidence:{recipientName:'Cliente Teste',accountEmail:'compras@example.test',destination:'Rua Teste, 10, apto 2',deliveryOption:'NORMAL',deliveryPromise:'prazo da loja: 1 dia útil',paymentLabel:'Cartão corporativo salvo',totalCents:2800,freightCents:800,items:[{sku:'123',name:'Chocolate',qty:2,lineTotalCents:2000}]}};createRoot(document.getElementById('root')).render(<main style={{fontFamily:'sans-serif',maxWidth:800,margin:'32px auto'}}><h1>Compras da Lia</h1><PurchaseAccounts/><PurchaseReview job={job} refresh={()=>{document.title='Aprovado'}}/></main>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const root = await mkdtemp(join(tmpdir(), "lia-ops-ui-"));
const context = await openProfile(root, "fixture", true);
let approval: any;
try {
  await context.route("**/*", (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname === "/api/ops/purchase-accounts")
      return route.fulfill({
        json: {
          policy: { perOrderCents: 50000, dailyCents: 50000, usedCents: 47800, stores: [], paused: false },
          accounts: [
            {
              storeKey: "drogariasp",
              email: "compras@example.test",
              loginReady: true,
              paymentReady: true,
              enabled: true,
            },
          ],
        },
      });
    if (url.pathname === "/api/ops/purchase-jobs/fixture") {
      approval = req.postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === "/ui.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: script.outputFiles[0].text,
      });
    if (url.pathname === "/ops")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="pt-BR"><title>Teste local</title><body><div id="root"></div><script src="/ui.js"></script></body></html>',
      });
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto("https://fixture.example/ops");
  await page.getByRole("button", { name: "Contas de compra da Lia" }).click();
  await page.getByLabel("E-mail das compras").waitFor();
  await page.getByText(/Nenhuma loja liberada ainda/).waitFor();
  assert.match(await page.locator("body").innerText(), /478\.00/);
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>("input[type=email]")?.value ===
      "compras@example.test",
  );
  assert.equal(
    await page.getByLabel("Conta conectada na janela do comprador").isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByLabel("Cartão corporativo salvo e conferido nessa conta")
      .isChecked(),
    true,
  );
  await page.screenshot({
    path: "/tmp/lia-purchase-panel.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Autorizar compra de/ }).click();
  await page.waitForFunction(() => document.title === "Aprovado");
  assert.deepEqual(approval, {
    action: "approve",
    checkoutHash: "a".repeat(64),
  });
  console.log(
    "Painel aprovado: conta existente preservada e autorização vinculada ao carrinho exibido.",
  );
} finally {
  await context.close();
  await rm(root, { recursive: true, force: true });
}
