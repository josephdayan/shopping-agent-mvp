import type { Prisma } from "@prisma/client";
import { PURCHASE_DOMAINS } from "./purchase-preparation";

// Autorização do dono em 07/09/2026. Aumentar exige nova autorização.
export const AUTO_PURCHASE_LIMIT_CENTS = 50_000;
export const AUTO_PURCHASE_POLICY = "owner-2026-09-07-brl500";
export const MERCADO_LIVRE_STORE_KEY = "mercadolivre";
// Como a compra é finalizada: auto_submit = o comprador clica sozinho (VTEX + Pix);
// owner_confirm = o dono confirma no app do celular (Mercado Livre, degrau C).
export type PurchaseChannel = "auto_submit" | "owner_confirm";
// Lojas explicitamente liberadas pelo dono (LIA_AUTO_PURCHASE_STORES). Desde 11/09 o
// Mercado Livre pode entrar na lista, mas só pelo canal owner_confirm (ver abaixo).
export function automaticPurchaseStores() {
  return [...new Set((process.env.LIA_AUTO_PURCHASE_STORES ?? "").split(",")
    .map(s => s.trim()).filter(s => Boolean(PURCHASE_DOMAINS[s])))];
}
export function purchaseBudgetDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
export async function reservedSpendCents(tx: Prisma.TransactionClient, now = new Date()) {
  const used = await tx.purchaseSpend.aggregate({
    where: { budgetDay: purchaseBudgetDay(now), status: { not: "released" } }, _sum: { amountCents: true },
  });
  return used._sum.amountCents ?? 0;
}
export async function automaticPurchaseDecision(
  tx: Prisma.TransactionClient, storeKey: string, cents: number, now = new Date(),
  channel: PurchaseChannel = "auto_submit",
) {
  if (process.env.LIA_AUTO_PURCHASE_OFF === "true" || !automaticPurchaseStores().includes(storeKey))
    return "Loja ainda não habilitada para compra sem aprovação individual.";
  // Decisão do dono (11/09): o ML nunca recebe clique automático; só confirmação dele.
  if (storeKey === MERCADO_LIVRE_STORE_KEY && channel !== "owner_confirm")
    return "Loja Mercado Livre só compra com confirmação do dono no app.";
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > AUTO_PURCHASE_LIMIT_CENTS)
    return "Compra acima do limite autorizado de R$ 500 por pedido.";
  if ((await reservedSpendCents(tx, now)) + cents > AUTO_PURCHASE_LIMIT_CENTS)
    return "Limite diário de R$ 500 insuficiente. É necessária uma autorização adicional.";
  return null;
}
