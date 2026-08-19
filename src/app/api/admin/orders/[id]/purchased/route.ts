import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { markOrderPurchased } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const order = await markOrderPurchased(params.id);
  return NextResponse.json(order);
}
