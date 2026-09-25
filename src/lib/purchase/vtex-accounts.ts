// Habilitar as contas de compra das lojas VTEX por API de uma vez (25/09/2026), pelo servidor:
// o dono clica no /ops em vez de rodar script no Mac (o pooler do banco não respondia de lá).
// Mesma trava do script: se a automação COMPRARIA um pedido pago antigo sem número da loja
// (pago há ≤ 24h e sem job, ou com job na fila), recusa e lista, salvo `force`.
import { prisma } from "../prisma";
import { savePurchaseAccount } from "../purchase-execution";
import { VTEX_API_STORE_KEYS, VTEX_API_STORES } from "./vtex-checkout";
import { maxPaidAgeHours } from "./vtex-runner";

export const DEFAULT_BUYER_EMAIL = "contato@liadelivery.com.br";
type OpenOrder = { id: string; storeKey: string; total: number; paidAt: Date | null; jobs: string[]; wouldBuy: boolean };

function storeOf(o: { storeKey: string; items: unknown }) {
  const items = Array.isArray(o.items) ? (o.items as { storeKey?: string }[]) : [];
  const ks = new Set(items.map((i) => i?.storeKey).filter((k): k is string => typeof k === "string"));
  return ks.size === 1 ? [...ks][0] : o.storeKey;
}
export async function openVtexOrders(now = new Date()): Promise<OpenOrder[]> {
  const rows = await prisma.deliveryOrder.findMany({ where: { status: "paid", storeOrderNumber: null }, include: { purchaseJobs: { select: { status: true } } }, orderBy: { paidAt: "desc" } });
  const maxAge = maxPaidAgeHours();
  return rows.map((o) => {
    const storeKey = storeOf(o);
    const jobs = o.purchaseJobs.map((j) => j.status);
    const ageH = o.paidAt ? (now.getTime() - o.paidAt.getTime()) / 3_600_000 : 0;
    return { id: o.id, storeKey, total: o.total, paidAt: o.paidAt, jobs, wouldBuy: ageH <= maxAge && (jobs.length === 0 || jobs.some((s) => ["queued", "retrying"].includes(s))) };
  }).filter((o) => VTEX_API_STORE_KEYS.includes(o.storeKey));
}
export async function enableVtexApiAccounts(input: { email?: string; force?: boolean } = {}) {
  const open = await openVtexOrders();
  const risky = open.filter((o) => o.wouldBuy);
  if (risky.length && !input.force) return { ok: false as const, risky, open };
  const before = await prisma.purchaseAccount.findMany({ where: { storeKey: { in: VTEX_API_STORE_KEYS } } });
  const accounts = [];
  for (const storeKey of VTEX_API_STORE_KEYS) {
    const current = before.find((a) => a.storeKey === storeKey);
    accounts.push(await savePurchaseAccount({
      storeKey, email: current?.email?.trim() || input.email?.trim() || DEFAULT_BUYER_EMAIL,
      loginReady: true, paymentReady: true, enabled: true, authKind: "none", paymentKind: "pix_out",
    }));
  }
  return { ok: true as const, accounts: accounts.map((a) => ({ storeKey: a.storeKey, label: VTEX_API_STORES[a.storeKey]?.label ?? a.storeKey, email: a.email, paymentKind: a.paymentKind, enabled: a.enabled })), open };
}
