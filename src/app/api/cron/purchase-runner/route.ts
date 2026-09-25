import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runVtexApiPurchases } from "@/lib/purchase/vtex-runner";
import { settlePixPayouts } from "@/lib/purchase-execution";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Comprador VTEX no servidor (25/09). A Vercel manda `Authorization: Bearer <CRON_SECRET>`;
// fail-closed em deploy sem CRON_SECRET; localmente pode ser chamado à mão.
function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return !process.env.VERCEL;
  const received = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await runVtexApiPurchases({ maxJobs: 3 });
  const settled = process.env.LIA_PIX_OUT_PROVIDER ? await settlePixPayouts().catch((error) => ({ error: error instanceof Error ? error.message : String(error) })) : null;
  console.log("[cron:purchase-runner]", { enabled: report.enabled, runs: report.runs.map((r) => `${r.storeKey}:${r.status}`), finishedPending: report.finishedPending, refunded: (report as { refunded?: number }).refunded ?? 0, errors: report.errors.length });
  if (report.errors.length) console.warn("[cron:purchase-runner:errors]", report.errors);
  return NextResponse.json({ ...report, settled });
}
