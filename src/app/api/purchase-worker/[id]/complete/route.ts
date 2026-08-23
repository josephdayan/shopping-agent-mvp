import { NextResponse } from "next/server";
import { opsMarkBought } from "@/lib/delivery-service";
import { purchaseWorkerAuthorized } from "@/lib/purchase-worker-auth";
import { markPurchaseJobCompleted, validatePurchaseCompletion } from "@/lib/purchase-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!purchaseWorkerAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    workerId?: string;
    actualTotal?: number;
    cartHash?: string;
    storeOrderNumber?: string;
    trackingUrl?: string;
  };
  try {
    const validated = await validatePurchaseCompletion(params.id, body.workerId?.trim() ?? "", {
      actualTotal: Number(body.actualTotal),
      cartHash: body.cartHash?.trim() ?? "",
      storeOrderNumber: body.storeOrderNumber?.trim() ?? ""
    });
    await opsMarkBought(validated.job.deliveryOrderId, body.storeOrderNumber?.trim() ?? "", body.trackingUrl?.trim());
    await markPurchaseJobCompleted(params.id, validated.actualTotal, body.storeOrderNumber?.trim() ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "completion failed" }, { status: 409 });
  }
}
