import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { createConversation } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const conversation = await createConversation();
  return NextResponse.json(conversation);
}
