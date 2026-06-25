import { NextResponse } from "next/server";
import { markOrderDelivered } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const order = await markOrderDelivered(params.id);
  return NextResponse.json(order);
}
