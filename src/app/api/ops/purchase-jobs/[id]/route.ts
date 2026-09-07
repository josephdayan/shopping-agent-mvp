import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsKey } from "@/lib/auth";
import {
  approveCheckout,
  reconcileEmptyPurchase,
} from "@/lib/purchase-execution";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const denied = requireOpsKey(request);
  if (denied) return denied;
  const b = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("approve"),
          checkoutHash: z.string().length(64),
        })
        .strict(),
      z
        .object({
          action: z.literal("reconcile_empty"),
          confirmedNoOrder: z.literal(true),
          confirmedEmptyCart: z.literal(true),
          note: z.string().min(10).max(500),
        })
        .strict(),
    ])
    .safeParse(await request.json().catch(() => null));
  if (!b.success)
    return NextResponse.json(
      { error: "Conferência inválida" },
      { status: 400 },
    );
  try {
    if (b.data.action === "approve")
      await approveCheckout(params.id, b.data.checkoutHash);
    else await reconcileEmptyPurchase(params.id, b.data.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Aprovação indisponível",
      },
      { status: 409 },
    );
  }
}
