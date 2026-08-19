import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getAdminSnapshot } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  return NextResponse.json(await getAdminSnapshot());
}
