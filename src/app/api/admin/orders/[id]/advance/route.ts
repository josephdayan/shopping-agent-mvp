import { NextResponse } from "next/server";
import { advanceOrder } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const order = await advanceOrder(params.id);
  return NextResponse.json(order);
}
