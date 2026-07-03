import { NextResponse } from "next/server";
import { getWaitlist } from "@/lib/delivery-service";

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

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getWaitlist());
}
