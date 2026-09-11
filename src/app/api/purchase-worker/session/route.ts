import { NextResponse } from "next/server";
import { z } from "zod";
import { purchaseWorkerAuthorized } from "@/lib/purchase-worker-auth";
import {
  claimPurchaseSession,
  purchaseHeartbeat,
  stageCheckout,
  parkCheckout,
  beginPurchase,
  finishPurchase,
  executionUnknown,
  requestOwnerConfirm,
  checkoutEvidenceSchema,
} from "@/lib/purchase-execution";
export const dynamic = "force-dynamic";
const common = {
  workerId: z.string().min(1).max(120),
  jobId: z.string().min(1),
  claimToken: z.string().uuid(),
};
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("claim"),
      workerId: common.workerId,
      stores: z.array(z.string().min(1).max(80)).min(1).max(20),
    })
    .strict(),
  z.object({ action: z.literal("heartbeat"), ...common }).strict(),
  z
    .object({
      action: z.literal("park"),
      ...common,
      cartEmpty: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("stage"),
      ...common,
      evidence: checkoutEvidenceSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("begin"),
      ...common,
      evidence: checkoutEvidenceSchema,
    })
    .strict(),
  // Mercado Livre degrau C: carrinho montado na conta; o dono confirma no app.
  z
    .object({
      action: z.literal("owner_confirm"),
      ...common,
      evidence: checkoutEvidenceSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("unknown"),
      ...common,
      code: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      ...common,
      submissionId: z.string().uuid(),
      storeOrderNumber: z.string().min(1).max(120),
      actualTotalCents: z.number().int().positive(),
      trackingUrl: z.string().url().optional(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  if (!purchaseWorkerAuthorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dados do comprador inválidos" },
      { status: 400 },
    );
  const b = parsed.data;
  try {
    if (b.action === "claim")
      return NextResponse.json({
        job: await claimPurchaseSession(b.workerId, b.stores),
      });
    if (b.action === "heartbeat")
      return NextResponse.json(
        await purchaseHeartbeat(b.jobId, b.workerId, b.claimToken),
      );
    if (b.action === "park")
      return NextResponse.json(
        await parkCheckout(b.jobId, b.workerId, b.claimToken),
      );
    if (b.action === "stage")
      return NextResponse.json(
        await stageCheckout(b.jobId, b.workerId, b.claimToken, b.evidence),
      );
    if (b.action === "begin")
      return NextResponse.json(
        await beginPurchase(b.jobId, b.workerId, b.claimToken, b.evidence),
      );
    if (b.action === "owner_confirm")
      return NextResponse.json(
        await requestOwnerConfirm(b.jobId, b.workerId, b.claimToken, b.evidence),
      );
    if (b.action === "complete") {
      await finishPurchase(b.jobId, b.workerId, b.claimToken, b);
      return NextResponse.json({ ok: true });
    }
    await executionUnknown(b.jobId, b.workerId, b.claimToken, b.code);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha na operação" },
      { status: 409 },
    );
  }
}
