import { NextResponse } from "next/server";
import { markProductUnavailable } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const product = await markProductUnavailable(params.id);
  return NextResponse.json(product);
}
