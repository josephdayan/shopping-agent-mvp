import { NextResponse } from "next/server";
import { opsCancelRefund, opsDispatchCourier, opsMarkBought, opsMarkDelivered, opsNotifyCustomer } from "@/lib/delivery-service";
import { createPurchaseJobsForOrder } from "@/lib/purchasing/service";
import { startPreflightPurchaseWorkflow } from "@/lib/purchasing/workflow-dispatch";

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
  const body = (await request.json().catch(() => ({}))) as { action?: string; storeOrderNumber?: string; text?: string };
  const id = params.id;
  try {
    switch (body.action) {
      case "bought":
        await opsMarkBought(id, String(body.storeOrderNumber ?? "").trim());
        break;
      case "dispatch":
        await opsDispatchCourier(id);
        break;
      case "delivered":
        await opsMarkDelivered(id);
        break;
      case "cancel":
        await opsCancelRefund(id);
        break;
      case "notify": {
        const text = String(body.text ?? "").trim();
        // Client-input problem, not a server failure — answer 400, not 500.
        if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
        await opsNotifyCustomer(id, text);
        break;
      }
      case "prepare_purchase": {
        const jobs = await createPurchaseJobsForOrder(id);
        await Promise.all(jobs.map((job) => startPreflightPurchaseWorkflow(job.id)));
        break;
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ops:action:error]", error);
    return NextResponse.json({ ok: false, error: "action failed" }, { status: 500 });
  }
}
