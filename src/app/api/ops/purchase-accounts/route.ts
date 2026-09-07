import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { savePurchaseAccount } from "@/lib/purchase-execution";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = requireOpsKey(request);
  if (denied) return denied;
  return NextResponse.json({
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
