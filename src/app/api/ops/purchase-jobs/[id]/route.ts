import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsKey } from "@/lib/auth";
import {
  approveCheckout,
  reconcileEmptyPurchase,
  ownerConfirmCartBought,
  ownerDeclineCart,
  ownerStoreNumber,
} from "@/lib/purchase-execution";
import { prisma } from "@/lib/prisma";
import { consumePendingActionForJob, mirrorOpsAction } from "@/lib/ops-actions";
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
      // Espelho dos botões do WhatsApp (ML degrau C): consome a mesma OpsAction pendente.
      z
        .object({
          action: z.literal("owner_bought"),
          storeOrderNumber: z.string().min(6).max(40),
        })
        .strict(),
      z.object({ action: z.literal("owner_declined") }).strict(),
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
    else if (b.data.action === "owner_bought") {
      const action = await prisma.$transaction(async (tx) => {
        const a = (await consumePendingActionForJob(tx, params.id, "ml_cart_ready", "bought")) ??
          (await consumePendingActionForJob(tx, params.id, "await_store_number", "number"));
        if (a) await mirrorOpsAction(tx, a, "bought+number", "ops_session");
        return a;
      });
      const job = await prisma.purchaseJob.findUniqueOrThrow({ where: { id: params.id } });
      if (job.status === "awaiting_owner_confirm") await ownerConfirmCartBought(params.id, action?.id ?? "ops_session");
      await ownerStoreNumber(params.id, b.data.storeOrderNumber, action?.id ?? "ops_session");
    } else if (b.data.action === "owner_declined") {
      const action = await prisma.$transaction(async (tx) => {
        const a = await consumePendingActionForJob(tx, params.id, "ml_cart_ready", "failed");
        if (a) await mirrorOpsAction(tx, a, "failed", "ops_session");
        return a;
      });
      await ownerDeclineCart(params.id, action?.id ?? "ops_session");
    } else await reconcileEmptyPurchase(params.id, b.data.note);
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
