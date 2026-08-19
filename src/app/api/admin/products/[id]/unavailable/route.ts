import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { markProductUnavailable } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const product = await markProductUnavailable(params.id);
  return NextResponse.json(product);
}
