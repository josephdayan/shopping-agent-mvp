import { randomUUID } from "crypto";

// Pix money-in. Real Mercado Pago is wired but INERT until
// MERCADO_PAGO_ACCESS_TOKEN is set — until then it returns a mock copia-e-cola so
// the flow runs end-to-end in sandbox. external_reference = DeliveryOrder.id so the
// webhook can reconcile.

export type PixCharge = {
  pixId: string;
  copiaECola: string;
  qrBase64?: string;
  amount: number;
  mock: boolean;
};

export type PixStatus = "pending" | "approved" | "rejected" | "unknown";

function hasCreds() {
  return Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN);
}

export const pixAdapter = {
  async createPix(input: {
    orderId: string;
    amount: number;
    description?: string;
    payerEmail?: string;
  }): Promise<PixCharge> {
    if (hasCreds()) {
      try {
        return await realCreatePix(input);
      } catch (error) {
        console.warn("[pix:create:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    const pixId = `mockpix_${randomUUID()}`;
    return {
      pixId,
      copiaECola: `00020126MOCKPIX-${input.orderId}-${Math.round(input.amount * 100)}5204000053039865802BR6009SAO PAULO`,
      amount: input.amount,
      mock: true
    };
  },

  async getStatus(pixId: string): Promise<PixStatus> {
    if (hasCreds() && !pixId.startsWith("mock")) {
      try {
        return await realGetStatus(pixId);
      } catch (error) {
        console.warn("[pix:status:error]", error instanceof Error ? error.message : error);
        return "unknown";
      }
    }
    return "pending";
  }
};

async function realCreatePix(input: { orderId: string; amount: number; description?: string; payerEmail?: string }): Promise<PixCharge> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN as string;
  // Pix QR expires in 60 min so a stale charge can't be paid after the quote drifts.
  // MP wants an explicit offset (e.g. -03:00), not the "Z" that toISOString() emits —
  // shift the instant by -3h so the wall-clock digits match BRT, then label it -03:00.
  const expiration = new Date(Date.now() + 60 * 60 * 1000 - 3 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "-03:00");
  const body: Record<string, unknown> = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: input.description ?? `Pedido Lia ${input.orderId}`,
    payment_method_id: "pix",
    external_reference: input.orderId,
    date_of_expiration: expiration,
    payer: { email: input.payerEmail ?? "cliente@lia.app", first_name: "Cliente" }
  };
  // Per-payment notification_url is more reliable than the dashboard-only setting.
  if (process.env.MERCADO_PAGO_WEBHOOK_URL) body.notification_url = process.env.MERCADO_PAGO_WEBHOOK_URL;
  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": input.orderId
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!res.ok) {
    // Surface MP's actual error body (it names the offending field) so a 400 is
    // diagnosable from the logs instead of a bare status code.
    const errBody = await res.text().catch(() => "");
    throw new Error(`mercadopago createPix ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    id?: number | string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  };
  const td = data.point_of_interaction?.transaction_data;
  return {
    pixId: String(data.id ?? `q_${randomUUID()}`),
    copiaECola: td?.qr_code ?? "",
    qrBase64: td?.qr_code_base64,
    amount: input.amount,
    mock: false
  };
}

async function realGetStatus(pixId: string): Promise<PixStatus> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN as string;
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${pixId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!res.ok) return "unknown";
  const data = (await res.json()) as { status?: string };
  if (data.status === "approved") return "approved";
  if (data.status === "rejected" || data.status === "cancelled") return "rejected";
  return "pending";
}
