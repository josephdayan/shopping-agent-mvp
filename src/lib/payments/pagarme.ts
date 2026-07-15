import { randomUUID } from "crypto";

export type PagarmeAddress = {
  line1: string;
  line2?: string;
  zipCode: string;
  city: string;
  state: string;
  country?: string;
};

export type PagarmeCustomerInput = {
  code: string;
  name: string;
  email: string;
  document: string;
  phone: string;
  address: PagarmeAddress;
};

export type PagarmeCard = {
  id: string;
  last4: string;
  brand?: string;
};

export type PagarmeSavedCardCharge = {
  status: "captured" | "declined" | "pending" | "unavailable";
  providerOrderId?: string;
  providerChargeId?: string;
  error?: string;
  mock: boolean;
};

type PagarmeOrder = {
  id?: string;
  status?: string;
  charges?: Array<{
    id?: string;
    status?: string;
    last_transaction?: { id?: string; status?: string; success?: boolean; acquirer_message?: string };
  }>;
};

export class PagarmeApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PagarmeApiError";
  }
}

function mockEnabled() {
  return process.env.PAGARME_MOCK === "true" || process.env.NODE_ENV === "test";
}

function config() {
  const secretKey = process.env.PAGARME_SECRET_KEY;
  const baseUrl = (process.env.PAGARME_BASE_URL ?? "https://api.pagar.me/core/v5").replace(/\/$/, "");
  return { secretKey, baseUrl };
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function phonePayload(phone: string) {
  const normalized = digits(phone).replace(/^55/, "");
  const areaCode = normalized.slice(0, 2);
  const number = normalized.slice(2);
  return {
    mobile_phone: {
      country_code: "55",
      area_code: areaCode,
      number
    }
  };
}

function addressPayload(address: PagarmeAddress) {
  return {
    line_1: address.line1,
    ...(address.line2 ? { line_2: address.line2 } : {}),
    zip_code: digits(address.zipCode),
    city: address.city,
    state: address.state.toUpperCase(),
    country: address.country ?? "BR"
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function request<T>(path: string, init: RequestInit = {}, idempotencyKey?: string): Promise<T> {
  const { secretKey, baseUrl } = config();
  if (!secretKey) throw new PagarmeApiError("PAGARME_SECRET_KEY is not configured");
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization);
  headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new PagarmeApiError(
      `Pagar.me ${init.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(payload).slice(0, 700)}`,
      response.status
    );
  }
  return payload as T;
}

function statusFromOrder(order: PagarmeOrder): PagarmeSavedCardCharge["status"] {
  const charge = order.charges?.[0];
  const transaction = charge?.last_transaction;
  const paid = order.status === "paid" || charge?.status === "paid" || transaction?.status === "captured" || transaction?.success === true;
  if (paid) return "captured";
  const failed = order.status === "failed" || order.status === "canceled" || charge?.status === "failed" || charge?.status === "canceled" || transaction?.status === "not_authorized";
  if (failed) return "declined";
  return "pending";
}

export const pagarmeAdapter = {
  isAvailable() {
    return Boolean(config().secretKey) || mockEnabled();
  },

  publicKey() {
    return process.env.PAGARME_PUBLIC_KEY ?? "";
  },

  async createCustomer(input: PagarmeCustomerInput) {
    if (mockEnabled() && !config().secretKey) return { id: `cus_mock_${randomUUID()}` };
    return request<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        code: input.code.slice(0, 52),
        name: input.name.slice(0, 64),
        email: input.email.slice(0, 64),
        document: digits(input.document),
        document_type: "CPF",
        type: "individual",
        phones: phonePayload(input.phone),
        address: addressPayload(input.address)
      })
    }, `customer:${input.code}`);
  },

  async createCard(input: { customerId: string; token: string; address: PagarmeAddress }) : Promise<PagarmeCard> {
    if (mockEnabled() && !config().secretKey) {
      return { id: `card_mock_${randomUUID()}`, last4: "4242", brand: "Visa" };
    }
    const card = await request<{ id: string; last_four_digits?: string; brand?: string }>(`/customers/${encodeURIComponent(input.customerId)}/cards`, {
      method: "POST",
      body: JSON.stringify({ token: input.token, billing_address: addressPayload(input.address) })
    }, `card:${input.customerId}:${input.token}`);
    return { id: card.id, last4: card.last_four_digits ?? "", brand: card.brand };
  },

  async chargeSavedCard(input: {
    orderId: string;
    attemptId: string;
    amountCents: number;
    customerId: string;
    cardId: string;
    description: string;
  }): Promise<PagarmeSavedCardCharge> {
    if (mockEnabled() && !config().secretKey) {
      return {
        status: "captured",
        providerOrderId: `or_mock_${randomUUID()}`,
        providerChargeId: `ch_mock_${randomUUID()}`,
        mock: true
      };
    }

    try {
      const order = await request<PagarmeOrder>("/orders", {
        method: "POST",
        body: JSON.stringify({
          code: input.orderId.slice(0, 52),
          customer_id: input.customerId,
          items: [{
            code: input.orderId.slice(0, 52),
            amount: input.amountCents,
            description: input.description.slice(0, 256),
            quantity: 1
          }],
          payments: [{
            payment_method: "credit_card",
            credit_card: {
              card_id: input.cardId,
              installments: 1,
              operation_type: "auth_and_capture"
            }
          }],
          metadata: { delivery_order_id: input.orderId, payment_attempt_id: input.attemptId }
        })
      }, input.attemptId);
      const charge = order.charges?.[0];
      return {
        status: statusFromOrder(order),
        providerOrderId: order.id,
        providerChargeId: charge?.id ?? charge?.last_transaction?.id,
        error: charge?.last_transaction?.acquirer_message,
        mock: false
      };
    } catch (error) {
      // A 409 means the same Idempotency-Key is still executing. It may become a
      // successful charge, so never tell the customer their card was declined.
      if (error instanceof PagarmeApiError && error.status && error.status >= 400 && error.status < 500 && error.status !== 409) {
        return { status: "declined", error: error.message, mock: false };
      }
      return { status: "unavailable", error: error instanceof Error ? error.message : "Pagar.me unavailable", mock: false };
    }
  },

  async getOrder(orderId: string): Promise<PagarmeSavedCardCharge> {
    const order = await request<PagarmeOrder>(`/orders/${encodeURIComponent(orderId)}`);
    const charge = order.charges?.[0];
    return {
      status: statusFromOrder(order),
      providerOrderId: order.id,
      providerChargeId: charge?.id ?? charge?.last_transaction?.id,
      error: charge?.last_transaction?.acquirer_message,
      mock: false
    };
  }
};
