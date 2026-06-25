import { NextResponse } from "next/server";
import twilio from "twilio";
import { requireApiToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
  const ready = Boolean(accountSid && authToken && whatsappFrom && webhookUrl);

  if (!accountSid || !authToken) {
    return NextResponse.json({
      ready,
      provider: process.env.WHATSAPP_PROVIDER ?? "mock",
      credentials: {
        accountSid: Boolean(accountSid),
        authToken: Boolean(authToken),
        whatsappFrom: Boolean(whatsappFrom),
        webhookUrl: Boolean(webhookUrl)
      }
    });
  }

  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.accounts(accountSid).fetch();

    return NextResponse.json({
      ready,
      provider: process.env.WHATSAPP_PROVIDER ?? "mock",
      account: {
        sid: maskSid(account.sid),
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type
      },
      credentials: {
        accountSid: true,
        authToken: true,
        whatsappFrom: Boolean(whatsappFrom),
        webhookUrl: Boolean(webhookUrl)
      }
    });
  } catch (error) {
    console.error("[twilio:status:error]", error);
    return NextResponse.json(
      {
        ready: false,
        provider: process.env.WHATSAPP_PROVIDER ?? "mock",
        error: "Twilio credentials could not be verified"
      },
      { status: 502 }
    );
  }
}

function maskSid(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
