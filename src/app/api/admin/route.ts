import { NextResponse } from "next/server";
import { getAdminSnapshot } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getAdminSnapshot());
}
