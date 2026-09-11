import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { savePurchaseAccount } from "@/lib/purchase-execution";
import { AUTO_PURCHASE_LIMIT_CENTS, automaticPurchaseStores, purchaseBudgetDay } from "@/lib/purchase-policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = requireOpsKey(request);
  if (denied) return denied;
  return NextResponse.json({
    policy: {
      perOrderCents: AUTO_PURCHASE_LIMIT_CENTS,
      dailyCents: AUTO_PURCHASE_LIMIT_CENTS,
      usedCents: (await prisma.purchaseSpend.aggregate({
        where: { budgetDay: purchaseBudgetDay() }, _sum: { amountCents: true },
      }))._sum.amountCents ?? 0,
      stores: automaticPurchaseStores(),
      paused: process.env.LIA_AUTO_PURCHASE_OFF === "true" || process.env.LIA_PURCHASE_SUBMIT_OFF === "true",
    },
    accounts: await prisma.purchaseAccount.findMany({
      orderBy: { storeKey: "asc" },
    }),
  });
}
const schema = z
  .object({
    storeKey: z.string().min(1),
    email: z.string().email().optional(),
    loginReady: z.boolean(),
    paymentReady: z.boolean(),
    enabled: z.boolean(),
  })
  .strict();
export async function POST(request: Request) {
  const denied = requireOpsKey(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Configuração inválida" },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      account: await savePurchaseAccount(parsed.data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar" },
      { status: 409 },
    );
  }
}
