import { NextResponse } from "next/server";
import { purchaseWorkerAuthorized } from "@/lib/purchase-worker-auth";
import { claimNextPurchaseJob, workerPayload } from "@/lib/purchase-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!purchaseWorkerAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { workerId?: string };
  const workerId = body.workerId?.trim().slice(0, 120);
  if (!workerId) return NextResponse.json({ error: "workerId is required" }, { status: 400 });
  // DEPRECADO (11/09): caminho da tarefa horária do ChatGPT (cart_only). Substituído pelo
  // comprador local (/api/purchase-worker/session) e pelo degrau C do Mercado Livre.
  // Será removido na Fase 7 do plano de implementação.
  console.warn("[purchase-worker:claim] rota legada; use /api/purchase-worker/session");
  const job = await claimNextPurchaseJob(workerId);
  return NextResponse.json({ job: job ? workerPayload(job) : null });
}
