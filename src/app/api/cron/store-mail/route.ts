import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readStoreMailOnce } from "@/lib/store-mail-reader";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return !process.env.VERCEL;
  const received = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Leitor de e-mails das lojas (25/09): confirma pagamento/faturamento/entrega sem humano.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await readStoreMailOnce();
  console.log("[cron:store-mail]", { ...report, errors: report.errors.length });
  if (report.errors.length) console.warn("[cron:store-mail:errors]", report.errors);
  return NextResponse.json(report);
}
