import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { approveConversationPayment } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const conversation = await approveConversationPayment(params.id);
  return NextResponse.json(conversation);
}
