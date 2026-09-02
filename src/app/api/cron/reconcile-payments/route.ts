import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcilePayments } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron da Vercel (vercel.json) — a Vercel manda `Authorization: Bearer <CRON_SECRET>`.
// Fail-closed em deploy sem CRON_SECRET; localmente pode ser chamado à mão.
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
  const report = await reconcilePayments();
  if (report.errors.length) console.warn("[cron:reconcile-payments:errors]", report.errors);
  console.log("[cron:reconcile-payments]", { ...report, errors: report.errors.length });
  return NextResponse.json(report);
}
