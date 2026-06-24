import { NextResponse } from "next/server";
import { createConversation } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function POST() {
  const conversation = await createConversation();
  return NextResponse.json(conversation);
}
