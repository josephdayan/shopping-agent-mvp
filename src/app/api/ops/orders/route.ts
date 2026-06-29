import { NextResponse } from "next/server";
import { getOperatorQueue } from "@/lib/delivery-service";

export const dynamic = "force-dynamic";

function authed(request: Request) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  if (!expected) return true;
  const url = new URL(request.url);
  const key = request.headers.get("x-ops-key") ?? url.searchParams.get("key");
  return key === expected;
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orders = await getOperatorQueue();
  return NextResponse.json({ orders });
}
