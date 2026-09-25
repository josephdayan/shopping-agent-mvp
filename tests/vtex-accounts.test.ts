import "./helpers/load-env";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { recordPayment } from "../src/lib/payments/ledger";
import { enableVtexApiAccounts, openVtexOrders } from "../src/lib/purchase/vtex-accounts";
import { VTEX_API_STORE_KEYS } from "../src/lib/purchase/vtex-checkout";

const users: string[] = [];
let seq = 0;
async function paid(storeKey: string, paidAt: Date) {
  const user = await prisma.user.create({ data: { phone: `+55090977${process.pid}${++seq}` } });
  users.push(user.id);
  const order = await prisma.deliveryOrder.create({ data: {
    userId: user.id, phone: user.phone, status: "paid", storeKey, storeLabel: storeKey, customerName: "Cliente",
    items: [{ sku: `${storeKey}-1`, name: "Item", qty: 1, unitPrice: 10, lineTotal: 10, storeKey, storeLabel: storeKey, productUrl: `https://www.${storeKey}.com.br/item/p` }],
    itemsSubtotal: 10, deliveryFee: 5, serviceFee: 1, total: 16, cep: "01233-020", deliveryAddress: "Rua X, 1", paidAt, courierKey: "retailer_delivery",
  } });
  await recordPayment({ deliveryOrderId: order.id, provider: "mercadopago", providerPaymentId: `acc-${process.pid}-${seq}`, amountCents: 1600, status: "approved", method: "pix" });
  return order;
}
after(async () => {
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.purchaseAccount.deleteMany({ where: { storeKey: { in: VTEX_API_STORE_KEYS } } });
  await prisma.$disconnect();
});

test("habilitar lojas por API: recusa se a automação compraria pedido pago sem número; pedido velho não bloqueia; cria as contas", async () => {
  const fresh = await paid("mambo", new Date());
  const refused = await enableVtexApiAccounts();
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.risky.some((o) => o.id === fresh.id));
  assert.equal(await prisma.purchaseAccount.count({ where: { storeKey: "mambo" } }), 0, "nada criado ao recusar");
  await prisma.deliveryOrder.update({ where: { id: fresh.id }, data: { storeOrderNumber: "v1-01", status: "retailer_preparing" } });
  const stale = await paid("drogal", new Date(Date.now() - 3 * 86_400_000));
  const open = await openVtexOrders();
  assert.equal(open.find((o) => o.id === stale.id)?.wouldBuy, false, "pedido velho vai para revisão, não compra");
  const ok = await enableVtexApiAccounts({ email: "compras@example.test" });
  assert.equal(ok.ok, true);
  assert.ok(ok.ok && ok.accounts.length === VTEX_API_STORE_KEYS.length);
  const acc = await prisma.purchaseAccount.findUniqueOrThrow({ where: { storeKey: "kopenhagen" } });
  assert.equal(acc.enabled, true); assert.equal(acc.paymentKind, "pix_out"); assert.equal(acc.email, "compras@example.test");
  // Conta já existente mantém o e-mail dela.
  await prisma.purchaseAccount.update({ where: { storeKey: "cobasi" }, data: { email: "cobasi@example.test" } });
  const again = await enableVtexApiAccounts({ email: "outro@example.test" });
  assert.ok(again.ok && again.accounts.find((a) => a.storeKey === "cobasi")?.email === "cobasi@example.test");
});
