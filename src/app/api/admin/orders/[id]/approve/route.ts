import { NextResponse } from "next/server";
import { approveOrder } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  await approveOrder(params.id);
  return NextResponse.json({ ok: true });
}
