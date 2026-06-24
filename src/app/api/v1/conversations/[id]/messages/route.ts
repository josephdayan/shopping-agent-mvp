import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/auth";
import { handleUserMessage, toChannelResponse } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1)
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  const payload = schema.parse(await request.json());
  const conversation = await handleUserMessage(params.id, payload.text);
  return NextResponse.json(toChannelResponse(conversation));
}
