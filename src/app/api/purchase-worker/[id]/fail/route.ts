import { NextResponse } from "next/server";
import { purchaseWorkerAuthorized } from "@/lib/purchase-worker-auth";
import { reportPurchaseJobFailure } from "@/lib/purchase-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!purchaseWorkerAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { workerId?: string; code?: string; message?: string; retryable?: boolean };
  if (!body.workerId?.trim() || !body.code?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: "workerId, code and message are required" }, { status: 400 });
  }
  try {
    await reportPurchaseJobFailure(params.id, body.workerId.trim(), { code: body.code.trim(), message: body.message.trim(), retryable: body.retryable });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "failure update failed" }, { status: 409 });
  }
}
