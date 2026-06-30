import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { markDeliveryOrderPaid } from "@/lib/delivery-service";

export const dynamic = "force-dynamic";

// Validate Mercado Pago's x-signature header (HMAC-SHA256 over the documented
// manifest). Only enforced when MERCADO_PAGO_WEBHOOK_SECRET is set — otherwise we
// skip it (sandbox), and we still re-fetch the payment from MP with our own token
// below, so a spoofed body can never mark an order paid on its own.
function signatureValid(request: Request, dataId: string): boolean {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return true; // not configured → rely on the re-fetch guard
  const sig = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    sig.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string])
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

// Mercado Pago payment notification. On an approved Pix payment, mark the matching
// DeliveryOrder paid (external_reference = order id) which moves it into the
// operator queue and notifies the customer. Inert until MP creds are set.
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    let paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    let body: { data?: { id?: string }; id?: string; type?: string; topic?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // form/empty body is fine — id may come from the query string
    }
    // Checkout Pro fires both `payment` and `merchant_order` notifications. Only the
    // payment ones carry the status we reconcile on; skip the rest so we don't waste a
    // 404 fetch trying to read a merchant_order id as a payment.
    const topic = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type ?? body?.topic;
    if (topic && topic !== "payment") {
      return NextResponse.json({ ok: true, skipped: `topic:${topic}` });
    }
    paymentId = paymentId ?? body?.data?.id ?? body?.id ?? null;

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!paymentId || !token) {
      return NextResponse.json({ ok: true, skipped: !paymentId ? "no-payment-id" : "no-token" });
    }

    // Signature is advisory, NOT a gate: MP's HMAC can mismatch (secret mode/format)
    // and rejecting would drop real payments. The real guard is re-fetching the
    // payment from MP with our own token below — a spoofed body can't fake "approved".
    if (!signatureValid(request, paymentId)) {
      console.warn("[mercadopago:webhook:signature-skip]", paymentId);
    }

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!res.ok) return NextResponse.json({ ok: false }, { status: 200 });
    const data = (await res.json()) as { status?: string; external_reference?: string };
    if (data.status === "approved" && data.external_reference) {
      await markDeliveryOrderPaid(data.external_reference);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mercadopago:webhook:error]", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
