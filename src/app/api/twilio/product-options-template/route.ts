import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/auth";
import {
  createTwilioProductOptionsTemplate,
  twilioProductOptionsReadiness
} from "@/lib/adapters/twilio-content";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    provider: process.env.WHATSAPP_PROVIDER ?? "mock",
    productOptions: twilioProductOptionsReadiness()
  });
}

export async function POST(request: Request) {
  const unauthorized = requireApiToken(request);
  if (unauthorized) return unauthorized;

  try {
    const template = await createTwilioProductOptionsTemplate();
    return NextResponse.json({
      ok: true,
      template,
      nextEnv: {
        TWILIO_PRODUCT_OPTIONS_CONTENT_SID: template.sid
      }
    });
  } catch (error) {
    console.error("[twilio:product-options-template:error]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create Twilio product options template",
        productOptions: twilioProductOptionsReadiness()
      },
      { status: 502 }
    );
  }
}
