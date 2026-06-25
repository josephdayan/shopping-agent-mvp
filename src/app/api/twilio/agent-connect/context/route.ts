import { NextResponse } from "next/server";
import { twilioAgentConnectAdapter } from "@/lib/adapters/twilio-agent-connect";
import { requireApiToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone") ?? undefined;
  const userId = url.searchParams.get("userId") ?? undefined;

  if (!phone && !userId) {
    return NextResponse.json({ error: "Missing phone or userId" }, { status: 400 });
  }

  const context = await twilioAgentConnectAdapter.buildLocalMemoryContext({ phone, userId });
  return NextResponse.json({
    readiness: twilioAgentConnectAdapter.readiness(),
    context
  });
}
