import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { markOrderDelivered } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const order = await markOrderDelivered(params.id);
  return NextResponse.json(order);
}
