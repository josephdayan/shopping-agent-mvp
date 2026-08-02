import { NextResponse } from "next/server";
import { obaStore } from "@/lib/stores/oba";
import { OBA_QUERIES } from "@/lib/oba-queries";

export const dynamic = "force-dynamic";
// Each invocation scrapes a small batch of the stalest queries; give it room for
// a few cold Apify runs without hitting the default function timeout.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Browserbase search is rate-limited per persistent retailer context. Keep the
  // batch intentionally small; long-tail queries are fetched on demand.
  const requested = Number(
    new URL(request.url).searchParams.get("limit") ?? process.env.LIA_PREWARM_BATCH ?? 3
  );
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 3, 1), 6);
  let warmed = 0;
  for (const query of OBA_QUERIES.slice(0, limit)) {
    const items = await obaStore.searchItems(query, 4);
    if (items.length) warmed += 1;
  }
  const result = { ok: true, attempted: Math.min(limit, OBA_QUERIES.length), warmed, total: OBA_QUERIES.length };

  console.log("[lia:prewarm:run]", result);
  return NextResponse.json(result);
}

// Accept Vercel's scheduled invocation (Bearer CRON_SECRET when set, or its cron
// user-agent), plus a manual trigger with the app's API token for testing.
function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (/vercel-cron/i.test(userAgent)) return true;

  const url = new URL(request.url);
  const provided = url.searchParams.get("secret") ?? request.headers.get("x-api-token") ?? "";
  const apiSecret = process.env.API_TOKEN ?? process.env.WHATSAPP_WEBHOOK_SECRET;
  if (apiSecret && provided === apiSecret) return true;

  return false;
}
