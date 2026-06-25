import twilio from "twilio";
import type { Product } from "@prisma/client";

type RawInbound = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          text?: { body?: string };
          type?: string;
        }>;
      };
    }>;
  }>;
  from?: string;
  From?: string;
  phone?: string;
  body?: string;
  Body?: string;
  text?: string;
  name?: string;
  profileName?: string;
  ButtonText?: string;
  ButtonPayload?: string;
  [key: string]: unknown;
};

export type WhatsAppProductOption = {
  rank: number;
  reason: string;
  product: Product;
};

export type WhatsAppRichReply = {
  text: string;
  options?: WhatsAppProductOption[];
};

export const whatsappAdapter = {
  parseInbound(payload: RawInbound) {
    const metaChange = payload.entry?.[0]?.changes?.[0]?.value;
    const metaMessage = metaChange?.messages?.[0];
    const metaContact = metaChange?.contacts?.[0];

    return {
      phone:
        metaMessage?.from ??
        normalizeTwilioFrom(payload.From) ??
        payload.from ??
        payload.phone ??
        extractNestedString(payload, ["message", "from"]) ??
        "",
      text:
        payload.ButtonPayload ??
        payload.ButtonText ??
        metaMessage?.text?.body ??
        payload.body ??
        payload.Body ??
        payload.text ??
        extractNestedString(payload, ["message", "text"]) ??
        "",
      name:
        metaContact?.profile?.name ??
        payload.name ??
        payload.profileName ??
        extractNestedString(payload, ["profile", "name"]) ??
        undefined,
      messageId: metaMessage?.id,
      provider: metaMessage ? "meta" : payload.From || payload.Body ? "twilio" : "mock"
    };
  },

  async sendMessage(to: string, text: string, metadata?: unknown) {
    if (process.env.WHATSAPP_PROVIDER === "meta") {
      return sendMetaMessage(to, text);
    }

    if (process.env.WHATSAPP_PROVIDER === "twilio") {
      return sendTwilioWhatsAppMessage(to, text, metadata);
    }

    if (process.env.WHATSAPP_PROVIDER === "zapi") {
      // Plug Z-API here: POST /send-text with phone and message.
      return { provider: "zapi", mocked: true, to, text, metadata };
    }

    console.log("[whatsapp:mock]", { to, text, metadata });
    return { provider: "mock", to, text, metadata };
  },

  async sendInteractiveProductOptions(to: string, reply: WhatsAppRichReply) {
    if (!reply.options?.length) return null;
    if (process.env.WHATSAPP_PROVIDER !== "twilio") return null;
    return sendTwilioQuickReplyOptions(to, reply);
  }
};

async function sendMetaMessage(to: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWhatsAppPhone(to),
      type: "text",
      text: {
        preview_url: false,
        body: text.slice(0, 4000)
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    console.error("[whatsapp:meta:error]", payload);
    throw new Error("Failed to send WhatsApp message");
  }

  return { provider: "meta", to, payload };
}

async function sendTwilioWhatsAppMessage(to: string, text: string, metadata?: unknown) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    return {
      provider: "twilio",
      mocked: true,
      to,
      text,
      metadata,
      missingConfig: [
        !accountSid ? "TWILIO_ACCOUNT_SID" : null,
        !authToken ? "TWILIO_AUTH_TOKEN" : null,
        !from ? "TWILIO_WHATSAPP_FROM" : null
      ].filter(Boolean)
    };
  }

  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    from: normalizeTwilioWhatsAppAddress(from),
    to: normalizeTwilioWhatsAppAddress(to),
    body: text.slice(0, 1600)
  });

  return {
    provider: "twilio",
    to,
    sid: message.sid,
    status: message.status
  };
}

async function sendTwilioQuickReplyOptions(to: string, reply: WhatsAppRichReply) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_PRODUCT_OPTIONS_CONTENT_SID;

  if (!accountSid || !authToken || !from || !contentSid) return null;

  const variables = buildProductOptionVariables(reply);
  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    from: normalizeTwilioWhatsAppAddress(from),
    to: normalizeTwilioWhatsAppAddress(to),
    contentSid,
    contentVariables: JSON.stringify(variables)
  });

  return {
    provider: "twilio",
    mode: "quick_reply",
    to,
    sid: message.sid,
    status: message.status
  };
}

function buildProductOptionVariables(reply: WhatsAppRichReply) {
  const options = reply.options ?? [];
  const optionText = options
    .slice(0, 3)
    .map((option) => {
      const total = option.product.price + option.product.shippingPrice;
      return `${option.rank}) ${option.product.title} - R$ ${total.toFixed(2)} - ${option.product.deliveryEstimate}`;
    })
    .join("\n");

  return { "1": optionText ? `${shortIntro(reply.text)}\n\n${optionText}`.slice(0, 1000) : reply.text.slice(0, 1000) };
}

function shortIntro(text: string) {
  return text.split(/\n\n1\)/)[0] || text;
}

function normalizeWhatsAppPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizeTwilioWhatsAppAddress(phone: string) {
  const cleaned = phone.trim();
  if (cleaned.startsWith("whatsapp:")) return cleaned;
  if (cleaned.startsWith("+")) return `whatsapp:${cleaned}`;
  return `whatsapp:+${cleaned.replace(/\D/g, "")}`;
}

function normalizeTwilioFrom(phone?: string) {
  return phone?.replace(/^whatsapp:/, "");
}

function extractNestedString(payload: RawInbound, path: string[]) {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" ? cursor : undefined;
}
