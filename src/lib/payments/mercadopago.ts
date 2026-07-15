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

export type SavedCardCharge = {
  status: "approved" | "declined" | "unavailable";
  providerPaymentId?: string;
  mock: boolean;
  error?: string;
};

// Checkout Pro link: one hosted MP page per order where the customer pays with
// CARD or Pix. We only create a "preference" and send the init_point URL — the card
// never touches us (MP hosts everything; zero PCI on our side). Reconciliation is the
// SAME as Pix: MP fires the payment webhook with external_reference = DeliveryOrder.id.
export type CheckoutLink = {
  preferenceId: string;
  initPoint: string;
  amount: number;
  mock: boolean;
};

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

// The no-CVV credential-on-file product must be enabled by Mercado Pago before a
// real charge can be made. Their public saved-card flow requires a fresh CVV token,
// so a providerCardId must never be treated as a payment token here. In a local/mock
// environment we approve deterministically so the WhatsApp state machine can be
// tested end-to-end without a gateway account.
export const savedCardAdapter = {
  isAvailableForOneClick() {
    return !hasCreds();
  },

  async chargeSavedCard(input: {
    orderId: string;
    attemptId: string;
    amount: number;
    customerId: string;
    cardId: string;
    description?: string;
  }): Promise<SavedCardCharge> {
    if (!hasCreds()) {
      return {
        status: "approved",
        providerPaymentId: `mockcard_${randomUUID()}`,
        mock: true
      };
    }

    const requested = process.env.LIA_MP_SAVED_CARD_NO_CVV === "true";
    return {
      status: "unavailable",
      mock: false,
      error: requested
        ? "Mercado Pago no-CVV charge is not implemented until its approved API contract is supplied"
        : "Mercado Pago has not approved saved-card charging without a fresh CVV"
    };
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

// Checkout Pro: create a payment preference and return its hosted link (init_point).
// One link covers BOTH card and Pix — the customer chooses on MP's page. INERT until
// MERCADO_PAGO_ACCESS_TOKEN is set (mock link in sandbox so the flow runs end-to-end).
export type CheckoutMethod = "pix" | "card" | "any";

export const checkoutAdapter = {
  async createLink(input: {
    orderId: string;
    amount: number;
    description?: string;
    payerEmail?: string;
    method?: CheckoutMethod;
  }): Promise<CheckoutLink> {
    if (hasCreds()) {
      try {
        return await realCreateCheckout(input);
      } catch (error) {
        console.warn("[checkout:create:fallback-mock]", error instanceof Error ? error.message : error);
      }
    }
    return {
      preferenceId: `mockpref_${randomUUID()}`,
      initPoint: `https://mock.lia/pay/${input.orderId}`,
      amount: input.amount,
      mock: true
    };
  }
};

// Lock the hosted link to ONE payment type so the fee pass-through is honest: a Pix
// link can't be paid by card (which would cost us the MDR at the no-fee price), and a
// card link can't be paid by Pix (which would overcharge the customer the card fee).
function excludedTypesFor(method?: CheckoutMethod): Array<{ id: string }> {
  if (method === "pix") {
    return [{ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" }, { id: "ticket" }, { id: "atm" }];
  }
  if (method === "card") {
    return [{ id: "bank_transfer" }, { id: "ticket" }, { id: "atm" }]; // bank_transfer = Pix
  }
  return [];
}

async function realCreateCheckout(input: { orderId: string; amount: number; description?: string; payerEmail?: string; method?: CheckoutMethod }): Promise<CheckoutLink> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN as string;
  // Link expires in 60 min so a stale total can't be paid after the quote drifts. MP
  // wants an explicit offset (-03:00), not the "Z" toISOString() emits — same trick as Pix.
  const expiration = new Date(Date.now() + 60 * 60 * 1000 - 3 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "-03:00");
  const body: Record<string, unknown> = {
    items: [
      {
        id: input.orderId,
        title: input.description ?? `Pedido Lia ${input.orderId}`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(input.amount.toFixed(2))
      }
    ],
    external_reference: input.orderId,
    // à vista only — parcelamento costs more and isn't passed through. excluded_payment_types
    // locks the link to Pix-only or card-only when a method was chosen (fee pass-through).
    payment_methods: {
      installments: 1,
      default_installments: 1,
      excluded_payment_types: excludedTypesFor(input.method)
    },
    expires: true,
    expiration_date_to: expiration
  };
  // Per-preference notification_url is more reliable than the dashboard-only setting.
  if (process.env.MERCADO_PAGO_WEBHOOK_URL) body.notification_url = process.env.MERCADO_PAGO_WEBHOOK_URL;
  if (input.payerEmail) body.payer = { email: input.payerEmail };
  const base = process.env.LIA_PUBLIC_URL ?? "https://shopping-agent-mvp.vercel.app";
  if (base) body.back_urls = { success: base, pending: base, failure: base };
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pref_${input.orderId}`
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!res.ok) {
    // Surface MP's actual error body (it names the offending field) so a 400 is
    // diagnosable from the logs instead of a bare status code.
    const errBody = await res.text().catch(() => "");
    throw new Error(`mercadopago createPreference ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const data = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
  const initPoint = data.init_point ?? data.sandbox_init_point ?? "";
  if (!initPoint) throw new Error("mercadopago createPreference: no init_point in response");
  return {
    preferenceId: String(data.id ?? `pref_${randomUUID()}`),
    initPoint,
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
