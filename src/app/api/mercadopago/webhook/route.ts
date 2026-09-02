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

// Mercado Pago payment notification. On an approved payment, hand the evidence
// (payment id + amount) to the brain, which only flips the order when it matches the
// charge currently on the table — a paid-but-superseded Pix becomes an operator alert,
// never a silent approval (revisão 01/09). Inert until MP creds are set.
//
// Status codes matter here: 200 = processed or deliberately ignored; 5xx = transient
// failure on OUR side (MP retries with backoff, and the flip is atomic so a replay is
// safe). Before 01/09 every failure answered 200 and a DB hiccup lost the payment
// until the customer typed "paguei".
export async function POST(request: Request) {
  let paymentId: string | null = null;
  try {
    const url = new URL(request.url);
    paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    let body: { data?: { id?: string | number }; id?: string | number; type?: string; topic?: string } = {};
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
    const rawId = paymentId ?? body?.data?.id ?? body?.id ?? null;
    paymentId = rawId == null ? null : String(rawId);

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!paymentId || !token) {
      return NextResponse.json({ ok: true, skipped: !paymentId ? "no-payment-id" : "no-token" });
    }
    // The id is interpolated into a URL we call WITH our access token: anything that is
    // not a plain payment id is dropped here, never forwarded to MP.
    if (!/^\d{1,20}$/.test(paymentId)) {
      return NextResponse.json({ ok: true, skipped: "invalid-payment-id" });
    }

    // Signature is advisory, NOT a gate: MP's HMAC can mismatch (secret mode/format)
    // and rejecting would drop real payments. The real guard is re-fetching the
    // payment from MP with our own token below — a spoofed body can't fake "approved".
    if (!signatureValid(request, paymentId)) {
      console.warn("[mercadopago:webhook:signature-skip]", paymentId);
    }

    let res: Response;
    try {
      res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(Number(process.env.LIA_MP_TIMEOUT_MS ?? 10000))
      });
    } catch (error) {
      console.error("[mercadopago:webhook:fetch-failed]", paymentId, error instanceof Error ? error.message : error);
      return NextResponse.json({ ok: false, retry: true }, { status: 503 });
    }
    if (res.status === 404) return NextResponse.json({ ok: true, skipped: "payment-not-found" });
    if (!res.ok) {
      console.error("[mercadopago:webhook:fetch-status]", paymentId, res.status);
      return NextResponse.json({ ok: false, retry: res.status >= 500 }, { status: res.status >= 500 ? 503 : 200 });
    }
    const data = (await res.json()) as {
      id?: number | string;
      status?: string;
      external_reference?: string;
      transaction_amount?: number;
    };
    if (data.status === "approved" && data.external_reference) {
      await markDeliveryOrderPaid(data.external_reference, {
        provider: "mercadopago",
        paymentId: String(data.id ?? paymentId),
        amount: typeof data.transaction_amount === "number" ? data.transaction_amount : null
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mercadopago:webhook:error]", paymentId, error);
    return NextResponse.json({ ok: false, retry: true }, { status: 500 });
  }
}
