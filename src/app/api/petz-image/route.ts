import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET (OPS_TOKEN auth): re-host progress. Returns how many images are stored + total
// bytes, and — when given ?ids=1,2,3 — which of those ids are still MISSING. Used to
// drive/verify the browser re-host loop and retry gaps.
export async function GET(request: Request) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  const url = new URL(request.url);
  if (expected && url.searchParams.get("key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const count = await prisma.petzImage.count();
  const agg = await prisma.petzImage.aggregate({ _sum: { bytes: true } });
  const idsParam = url.searchParams.get("ids");
  let missing: string[] | undefined;
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const have = await prisma.petzImage.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const haveSet = new Set(have.map((h) => h.id));
    missing = ids.filter((i) => !haveSet.has(i));
  }
  return NextResponse.json({ count, bytes: agg._sum.bytes ?? 0, missing });
}
