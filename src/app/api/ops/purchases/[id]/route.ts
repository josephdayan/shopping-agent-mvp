import { NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { approvePurchaseJob, getPurchaseJobForOps } from "@/lib/purchasing/service";
import { startPreflightPurchaseWorkflow, startPurchaseOrderWorkflow } from "@/lib/purchasing/workflow-dispatch";
import { purchaseApprovalToken } from "@/lib/purchasing/workflow-tokens";

export const dynamic = "force-dynamic";

function authed(request: Request) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  if (!expected) return true;
  const url = new URL(request.url);
  const key =
    request.headers.get("x-ops-key") ??
    url.searchParams.get("key") ??
    (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)ops_session=([^;]+)/)?.[1];
  return key === expected;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const jobId = params.id;
  try {
    switch (body.action) {
      case "preflight":
      case "retry": {
        const runId = await startPreflightPurchaseWorkflow(jobId);
        return NextResponse.json({ ok: true, runId });
      }
      case "request_approval": {
        const runId = await startPurchaseOrderWorkflow(jobId);
        return NextResponse.json({ ok: true, runId });
      }
      case "approve": {
        const approved = await approvePurchaseJob(jobId, "ops");
        if (!approved.cartHash) return NextResponse.json({ error: "cart missing" }, { status: 409 });
        await resumeHook(purchaseApprovalToken(jobId, approved.cartHash), { approvedBy: "ops" });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (error) {
    const job = await getPurchaseJobForOps(jobId).catch(() => null);
    console.error("[ops:purchase:error]", jobId, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "purchase action failed", status: job?.status }, { status: 500 });
  }
}
