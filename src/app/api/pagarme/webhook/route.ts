import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcilePagarmeOrder } from "@/lib/payments/whatsapp-pay";

export const dynamic = "force-dynamic";

type PagarmeWebhook = {
  type?: string;
  event?: string;
  data?: {
    id?: string;
    order?: { id?: string; metadata?: { payment_attempt_id?: string } };
    metadata?: { payment_attempt_id?: string };
  };
};

function validToken(request: Request) {
  const configured = process.env.PAGARME_WEBHOOK_TOKEN;
  if (!configured) return false;
  const url = new URL(request.url);
  return url.searchParams.get("token") === configured || request.headers.get("x-pagarme-webhook-token") === configured;
}

// Pagar.me's webhook body is a delivery notification, not proof that an order is
// paid. We use it solely as a wake-up signal, then fetch the order with our secret
// API key before marking an order paid.
export async function POST(request: Request) {
  if (!validToken(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as PagarmeWebhook | null;
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  const event = body.type ?? body.event ?? "";
  const providerOrderId = body.data?.order?.id ?? (event.startsWith("order.") ? body.data?.id : undefined);
  const attemptId = body.data?.order?.metadata?.payment_attempt_id ?? body.data?.metadata?.payment_attempt_id;

  if (body.data?.id && /card\.(deleted|expired|disabled)/.test(event)) {
    await prisma.paymentCredential.updateMany({
      where: { provider: "pagarme", providerCardId: body.data.id },
      data: { status: "inactive" }
    });
    return NextResponse.json({ ok: true });
  }

  // We reconcile all payment terminal/pending events. Returning 2xx for unrelated
  // events prevents needless retries (for example a customer/card profile update).
  if (!/(^|\.)(order|charge)\.(paid|payment_failed|failed|pending|created|updated)$/.test(event) && !attemptId) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (!providerOrderId && !attemptId) return NextResponse.json({ ok: true, ignored: true });

  try {
    const result = await reconcilePagarmeOrder({ providerOrderId, attemptId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[pagarme:webhook]", error instanceof Error ? error.message : error);
    // A non-2xx response lets Pagar.me retry a transient API/database failure.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
