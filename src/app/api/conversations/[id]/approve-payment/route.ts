import { NextResponse } from "next/server";
import { approveConversationPayment } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const conversation = await approveConversationPayment(params.id);
  return NextResponse.json(conversation);
}
