// Passo 3 de 25/09: habilita as contas de compra das lojas VTEX por API no /ops de produção.
//   OPS_TOKEN=<token do dono> npx tsx scripts/ops-enable-vtex-accounts.mts [--force] [--base https://…]
// Antes de habilitar, lista pedidos PAGOS sem número da loja nessas lojas: se houver algum,
// para (a compra automática compraria de novo o que já foi comprado à mão). --force ignora.
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const base = (flag("--base") ?? process.env.LIA_PUBLIC_URL ?? "https://liadelivery.com.br").replace(/\/$/, "");
const token = process.env.OPS_TOKEN?.trim();
if (!token) { console.error("Defina OPS_TOKEN (chave do dono do /ops de produção)."); process.exit(2); }
const STORES = ["drogariasp", "cobasi", "paguemenos"] as const;
const EMAIL = process.env.LIA_BUYER_EMAIL?.trim() || "contato@liadelivery.com.br";
async function api(path: string, body?: unknown) {
  const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { "x-ops-key": token!, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json as Record<string, unknown>;
}
type Order = { id: string; status: string; storeKey?: string; storeOrderNumber?: string | null; total?: number; paidAt?: string; items?: { storeKey?: string }[]; purchaseJobs?: { status: string }[] };
const storeOf = (o: Order) => { const ks = new Set((o.items ?? []).map((i) => i.storeKey).filter(Boolean)); return ks.size === 1 ? [...ks][0] : o.storeKey; };

const orders = await api("/api/ops/orders");
const rows = (Array.isArray(orders) ? orders : ((orders.orders ?? orders.items ?? []) as Order[])) as Order[];
const risky = rows.filter((o) => o.status === "paid" && !o.storeOrderNumber && STORES.includes(storeOf(o) as never));
console.log(`Pedidos no painel: ${rows.length}. Pagos sem número da loja em ${STORES.join("/")}: ${risky.length}`);
for (const o of risky) console.log(`  - #${o.id.slice(-6).toUpperCase()} ${storeOf(o)} R$${o.total} pago em ${(o.paidAt ?? "").slice(0, 16)} jobs=${(o.purchaseJobs ?? []).map((j) => j.status).join(",") || "nenhum"}`);
if (risky.length && !args.includes("--force")) {
  console.error("\nPARADO: registre essas compras no /ops (número da loja) ou estorne antes de ligar. Use --force só se tiver certeza de que nenhuma foi comprada.");
  process.exit(1);
}
const before = (await api("/api/ops/purchase-accounts")) as { accounts: { storeKey: string; email?: string | null; paymentKind?: string; enabled: boolean }[] };
console.log("\nContas antes:", before.accounts.map((a) => `${a.storeKey}(${a.enabled ? "ativa" : "inativa"},${a.paymentKind})`).join(" ") || "nenhuma");
for (const storeKey of STORES) {
  const current = before.accounts.find((a) => a.storeKey === storeKey);
  const email = current?.email?.trim() || EMAIL;
  const saved = await api("/api/ops/purchase-accounts", { storeKey, email, loginReady: true, paymentReady: true, enabled: true, authKind: "none", paymentKind: "pix_out" });
  const a = (saved as { account: { storeKey: string; email: string; paymentKind: string; enabled: boolean } }).account;
  console.log(`  ✓ ${a.storeKey}: ${a.email} · ${a.paymentKind} · ${a.enabled ? "ativa" : "inativa"}`);
}
const after = (await api("/api/ops/purchase-accounts")) as { policy: { stores: string[]; paused: boolean; perOrderCents: number } };
console.log("\nPolítica:", `lojas automáticas=${after.policy.stores.join(",") || "(vazio)"} · pausado=${after.policy.paused} · teto=R$${after.policy.perOrderCents / 100}`);
console.log(after.policy.paused ? "Ainda pausado pelos kill-switches (passo 5)." : "Compra automática LIGADA nessas lojas.");
