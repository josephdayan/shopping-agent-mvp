import { NextResponse } from "next/server";
import { prewarmCarrefour } from "@/lib/stores/carrefour";
import { CARREFOUR_QUERIES } from "@/lib/carrefour-queries";

export const dynamic = "force-dynamic";
// Each invocation scrapes a small batch of the stalest queries; give it room for
// a few cold Apify runs without hitting the default function timeout.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Carrefour scrapes are slow (~60-90s each), so keep the batch small to fit the
  // 300s budget. Manual runs may pass ?limit= (clamped). Default 3 per run.
  const requested = Number(
    new URL(request.url).searchParams.get("limit") ?? process.env.LIA_PREWARM_BATCH ?? 3
  );
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 3, 1), 6);
  const result = await prewarmCarrefour(CARREFOUR_QUERIES, { limit });

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
