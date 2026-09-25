// Passo 3 de 25/09: habilita as contas de compra das lojas VTEX por API em PRODUÇÃO.
//   npx tsx scripts/ops-enable-vtex-accounts.mts --db [--force]        # direto no banco (DATABASE_URL do .env)
//   OPS_TOKEN=<chave do dono> npx tsx scripts/ops-enable-vtex-accounts.mts [--force] [--base https://…]
// Antes de habilitar, lista pedidos PAGOS sem número da loja nessas lojas: se houver algum,
// para (a compra automática compraria de novo o que já foi comprado à mão). --force ignora.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
import { VTEX_API_STORE_KEYS } from "../src/lib/purchase/vtex-checkout";
const STORES = (flag("--stores")?.split(",").map((s) => s.trim()).filter(Boolean) ?? VTEX_API_STORE_KEYS) as readonly string[];
const EMAIL = process.env.LIA_BUYER_EMAIL?.trim() || "contato@liadelivery.com.br";
type Account = { storeKey: string; email?: string | null; paymentKind?: string; enabled: boolean };
type Order = { id: string; status: string; storeKey?: string | null; storeOrderNumber?: string | null; total?: number; paidAt?: string | Date | null; items?: unknown; purchaseJobs?: { status: string }[] };
const storeOf = (o: Order) => { const items = Array.isArray(o.items) ? (o.items as { storeKey?: string }[]) : []; const ks = new Set(items.map((i) => i?.storeKey).filter(Boolean)); return ks.size === 1 ? [...ks][0] : o.storeKey; };

// ---- dois backends: banco direto (--db) ou API do /ops (OPS_TOKEN) ----
type Backend = {
  paidWithoutNumber(): Promise<Order[]>;
  accounts(): Promise<Account[]>;
  save(a: { storeKey: string; email: string }): Promise<Account>;
  policy(): Promise<{ stores: string[]; paused: boolean; perOrderCents: number }>;
};
async function dbBackend(): Promise<Backend> {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente no .env");
  const { prisma } = await import("../src/lib/prisma");
  const { savePurchaseAccount } = await import("../src/lib/purchase-execution");
  const { automaticPurchaseStores, AUTO_PURCHASE_LIMIT_CENTS } = await import("../src/lib/purchase-policy");
  return {
    paidWithoutNumber: async () => prisma.deliveryOrder.findMany({ where: { status: "paid", storeOrderNumber: null }, include: { purchaseJobs: { select: { status: true } } }, orderBy: { paidAt: "desc" } }) as unknown as Order[],
    accounts: async () => prisma.purchaseAccount.findMany({ orderBy: { storeKey: "asc" } }),
    save: async (a) => savePurchaseAccount({ storeKey: a.storeKey, email: a.email, loginReady: true, paymentReady: true, enabled: true, authKind: "none", paymentKind: "pix_out" }),
    policy: async () => ({ stores: automaticPurchaseStores(), paused: process.env.LIA_AUTO_PURCHASE_OFF === "true" || process.env.LIA_PURCHASE_SUBMIT_OFF === "true", perOrderCents: AUTO_PURCHASE_LIMIT_CENTS }),
  };
}
function apiBackend(): Backend {
  const base = (flag("--base") ?? process.env.LIA_PUBLIC_URL ?? "https://liadelivery.com.br").replace(/\/$/, "");
  const token = process.env.OPS_TOKEN?.trim();
  if (!token) throw new Error("Defina OPS_TOKEN (chave do dono do /ops de produção) ou use --db.");
  const api = async (path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { "x-ops-key": token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${JSON.stringify(json).slice(0, 200)}`);
    return json as Record<string, unknown>;
  };
  return {
    paidWithoutNumber: async () => { const o = await api("/api/ops/orders"); const rows = (Array.isArray(o) ? o : (o.orders ?? o.items ?? [])) as Order[]; return rows.filter((r) => r.status === "paid" && !r.storeOrderNumber); },
    accounts: async () => ((await api("/api/ops/purchase-accounts")) as { accounts: Account[] }).accounts,
    save: async (a) => ((await api("/api/ops/purchase-accounts", { storeKey: a.storeKey, email: a.email, loginReady: true, paymentReady: true, enabled: true, authKind: "none", paymentKind: "pix_out" })) as { account: Account }).account,
    policy: async () => ((await api("/api/ops/purchase-accounts")) as { policy: { stores: string[]; paused: boolean; perOrderCents: number } }).policy,
  };
}

const backend = args.includes("--db") ? await dbBackend() : apiBackend();
const MAX_AGE_H = Number(process.env.LIA_SERVER_BUYER_MAX_AGE_HOURS ?? 24);
const open = (await backend.paidWithoutNumber()).filter((o) => STORES.includes(storeOf(o) as never));
console.log(`Pedidos pagos sem número da loja em ${STORES.join("/")}: ${open.length}`);
// O comprador do servidor só compra pedido pago há menos de MAX_AGE_H e com job na fila (ou
// sem job). Pedido mais velho vira revisão no /ops; job já pago (pix_paid) nunca é recomprado.
const wouldBuy = (o: Order) => {
  const ageH = o.paidAt ? (Date.now() - new Date(o.paidAt).getTime()) / 3_600_000 : 0;
  const jobs = (o.purchaseJobs ?? []).map((j) => j.status);
  return ageH <= MAX_AGE_H && (jobs.length === 0 || jobs.some((st) => ["queued", "retrying"].includes(st)));
};
const risky = open.filter(wouldBuy);
for (const o of open) console.log(`  - #${o.id.slice(-6).toUpperCase()} ${storeOf(o)} R$${o.total} pago em ${String(o.paidAt ?? "").slice(0, 16)} jobs=${(o.purchaseJobs ?? []).map((j) => j.status).join(",") || "nenhum"} → ${wouldBuy(o) ? "A AUTOMAÇÃO COMPRARIA" : "vai para revisão no /ops; não compra"}`);
if (risky.length && !args.includes("--force")) {
  console.error("\nPARADO: registre essas compras no /ops (número da loja) ou estorne antes de ligar. Use --force só se tiver certeza de que nenhuma foi comprada.");
  process.exit(1);
}
const before = await backend.accounts();
console.log("\nContas antes:", before.map((a) => `${a.storeKey}(${a.enabled ? "ativa" : "inativa"},${a.paymentKind})`).join(" ") || "nenhuma");
for (const storeKey of STORES) {
  const current = before.find((a) => a.storeKey === storeKey);
  const a = await backend.save({ storeKey, email: current?.email?.trim() || EMAIL });
  console.log(`  ✓ ${a.storeKey}: ${a.email} · ${a.paymentKind} · ${a.enabled ? "ativa" : "inativa"}`);
}
const policy = await backend.policy();
console.log("\nPolítica:", `lojas automáticas=${policy.stores.join(",") || "(vazio — env LIA_AUTO_PURCHASE_STORES do servidor)"} · pausado=${policy.paused} · teto=R$${policy.perOrderCents / 100}`);
console.log(args.includes("--db") ? "Contas gravadas em produção. Os kill-switches (passo 5) são envs da Vercel; o servidor decide." : policy.paused ? "Ainda pausado pelos kill-switches (passo 5)." : "Compra automática LIGADA nessas lojas.");
process.exit(0);
