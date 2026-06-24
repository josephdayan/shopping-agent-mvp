import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/auth";
import { approveConversationPayment, toChannelResponse } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  const conversation = await approveConversationPayment(params.id);
  return NextResponse.json(toChannelResponse(conversation));
}
