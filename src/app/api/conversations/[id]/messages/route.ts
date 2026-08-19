import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { z } from "zod";
import { handleUserMessage } from "@/lib/chat-service";

export const dynamic = "force-dynamic";
// Real product search can take up to ~55s on an Apify cold start.
export const maxDuration = 300;

const schema = z.object({ text: z.string().min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdminSession(request);
  if (denied) return denied;
  const payload = schema.parse(await request.json());
  const conversation = await handleUserMessage(params.id, payload.text);
  return NextResponse.json(conversation);
}
