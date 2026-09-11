import type { Prisma } from "@prisma/client";
import { PURCHASE_DOMAINS } from "./purchase-preparation";

// Autorização do dono em 07/09/2026. Aumentar exige nova autorização.
export const AUTO_PURCHASE_LIMIT_CENTS = 50_000;
export const AUTO_PURCHASE_POLICY = "owner-2026-09-07-brl500";
export function automaticPurchaseStores() {
  return [...new Set((process.env.LIA_AUTO_PURCHASE_STORES ?? "").split(",")
    .map(s => s.trim()).filter(s => s !== "mercadolivre" && Boolean(PURCHASE_DOMAINS[s])))];
}
export function purchaseBudgetDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
export async function automaticPurchaseDecision(
  tx: Prisma.TransactionClient, storeKey: string, cents: number, now = new Date(),
) {
  if (process.env.LIA_AUTO_PURCHASE_OFF === "true" || !automaticPurchaseStores().includes(storeKey))
    return "Loja ainda não habilitada para compra sem aprovação individual.";
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > AUTO_PURCHASE_LIMIT_CENTS)
    return "Compra acima do limite autorizado de R$ 500 por pedido.";
  const used = await tx.purchaseSpend.aggregate({
    where: { budgetDay: purchaseBudgetDay(now) }, _sum: { amountCents: true },
  });
  if ((used._sum.amountCents ?? 0) + cents > AUTO_PURCHASE_LIMIT_CENTS)
    return "Limite diário de R$ 500 insuficiente. É necessária uma autorização adicional.";
  return null;
}
