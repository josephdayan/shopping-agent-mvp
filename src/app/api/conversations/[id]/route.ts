import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getConversation } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const conversation = await getConversation(params.id);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json(conversation);
}
