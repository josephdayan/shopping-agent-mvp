import { NextResponse } from "next/server";
import { markDeliveryOrderPaid } from "@/lib/delivery-service";

export const dynamic = "force-dynamic";

// Mercado Pago payment notification. On an approved Pix payment, mark the matching
// DeliveryOrder paid (external_reference = order id) which moves it into the
// operator queue and notifies the customer. Inert until MP creds are set.
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    let paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    let body: { data?: { id?: string }; id?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // form/empty body is fine — id may come from the query string
    }
    paymentId = paymentId ?? body?.data?.id ?? body?.id ?? null;

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!paymentId || !token) {
      return NextResponse.json({ ok: true, skipped: !paymentId ? "no-payment-id" : "no-token" });
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
