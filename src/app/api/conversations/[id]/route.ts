import { NextResponse } from "next/server";
import { getConversation } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const conversation = await getConversation(params.id);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json(conversation);
}
