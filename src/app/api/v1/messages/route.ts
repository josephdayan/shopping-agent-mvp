import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/auth";
import { handleInboundMessage, toChannelResponse } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().min(6),
  text: z.string().min(1),
  name: z.string().optional(),
  email: z.string().email().optional(),
  defaultAddress: z.string().optional()
});

export async function POST(request: Request) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  const payload = schema.parse(await request.json());
  const conversation = await handleInboundMessage(payload);
  return NextResponse.json(toChannelResponse(conversation));
}
