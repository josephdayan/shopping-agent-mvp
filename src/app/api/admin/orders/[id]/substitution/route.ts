import { NextResponse } from "next/server";
import { requestOrderSubstitution } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const order = await requestOrderSubstitution(params.id);
  return NextResponse.json(order);
}
