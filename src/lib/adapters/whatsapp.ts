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
          button?: { payload?: string; text?: string };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
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
  actions?: Array<{ id: string; title: string }>;
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
        metaMessage?.interactive?.button_reply?.id ??
        metaMessage?.interactive?.button_reply?.title ??
        metaMessage?.interactive?.list_reply?.id ??
        metaMessage?.interactive?.list_reply?.title ??
        metaMessage?.button?.payload ??
        metaMessage?.button?.text ??
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
    if (process.env.WHATSAPP_PROVIDER === "meta") return sendMetaInteractiveProductOptions(to, reply);
    if (process.env.WHATSAPP_PROVIDER !== "twilio") return null;
    return sendTwilioQuickReplyOptions(to, reply);
  },

  async sendRichReplyMessages(to: string, reply: WhatsAppRichReply) {
    if (process.env.WHATSAPP_PROVIDER !== "twilio") {
      return this.sendMessage(to, reply.text);
    }

    return sendTwilioRichReplyMessages(to, reply);
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

async function sendMetaInteractiveProductOptions(to: string, reply: WhatsAppRichReply) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  }

  const normalizedTo = normalizeWhatsAppPhone(to);
  const optionMessages = await Promise.all(
    (reply.options ?? []).slice(0, 3).map((option) =>
      sendMetaProductImageMessage(phoneNumberId, token, normalizedTo, option)
    )
  );
  const buttons = await sendMetaProductButtons(phoneNumberId, token, normalizedTo, reply);

  return {
    provider: "meta",
    mode: "interactive_buttons",
    to,
    optionMessages,
    buttons
  };
}

async function sendMetaProductImageMessage(
  phoneNumberId: string,
  token: string,
  to: string,
  option: WhatsAppProductOption
) {
  const total = option.product.price + option.product.shippingPrice;
  const caption = [
    `${option.rank}) ${option.product.title}`,
    `Total: R$ ${total.toFixed(2)}`,
    `Entrega: ${option.product.deliveryEstimate}`,
    option.product.source === "mercado_livre" && option.product.automationLevel.startsWith("real_")
      ? `Link: ${option.product.productUrl}`
      : null
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1024);

  if (!isPublicMediaUrl(option.product.imageUrl)) {
    return sendMetaMessage(to, caption);
  }

  return sendMetaPayload(phoneNumberId, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: {
      link: option.product.imageUrl,
      caption
    }
  });
}

async function sendMetaProductButtons(phoneNumberId: string, token: string, to: string, reply: WhatsAppRichReply) {
  const options = (reply.options ?? []).slice(0, 3);
  return sendMetaPayload(phoneNumberId, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Escolha uma opção:".slice(0, 1024)
      },
      action: {
        buttons: options.map((option) => ({
          type: "reply",
          reply: {
            id: String(option.rank),
            title: String(option.rank)
          }
        }))
      }
    }
  });
}

async function sendMetaPayload(phoneNumberId: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    console.error("[whatsapp:meta:error]", payload);
    throw new Error("Failed to send WhatsApp message");
  }

  return payload;
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
  const normalizedFrom = normalizeTwilioWhatsAppAddress(from);
  const normalizedTo = normalizeTwilioWhatsAppAddress(to);
  const mediaMessages = [];
  const options = (reply.options ?? []).slice(0, 3);
  for (const [index, option] of options.entries()) {
    const body = buildTwilioProductCaption(option);
    const mediaUrl = isPublicMediaUrl(option.product.imageUrl) ? [option.product.imageUrl] : undefined;

    mediaMessages.push(
      await client.messages.create({
        from: normalizedFrom,
        to: normalizedTo,
        body,
        ...(mediaUrl ? { mediaUrl } : {})
      })
    );
    await delayBetweenProductMessages(index, options.length);
  }

  const message = await client.messages.create({
    from: normalizedFrom,
    to: normalizedTo,
    contentSid,
    contentVariables: JSON.stringify(variables)
  });

  return {
    provider: "twilio",
    mode: "quick_reply",
    to,
    mediaMessages: mediaMessages.map((mediaMessage) => ({
      sid: mediaMessage.sid,
      status: mediaMessage.status
    })),
    sid: message.sid,
    status: message.status
  };
}

async function sendTwilioRichReplyMessages(to: string, reply: WhatsAppRichReply) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    return sendTwilioWhatsAppMessage(to, reply.text);
  }

  const client = twilio(accountSid, authToken);
  const normalizedFrom = normalizeTwilioWhatsAppAddress(from);
  const normalizedTo = normalizeTwilioWhatsAppAddress(to);
  const messages = [];

  if (reply.options?.length) {
    const options = reply.options.slice(0, 3);
    for (const [index, option] of options.entries()) {
      const body = buildTwilioProductCaption(option);
      const mediaUrl = isPublicMediaUrl(option.product.imageUrl) ? [option.product.imageUrl] : undefined;

      messages.push(
        await client.messages.create({
          from: normalizedFrom,
          to: normalizedTo,
          body,
          ...(mediaUrl ? { mediaUrl } : {})
        })
      );
      await delayBetweenProductMessages(index, options.length);
    }

  } else if (reply.text) {
    const actionMessage = reply.actions?.length
      ? await sendTwilioActionMessage(client, normalizedFrom, normalizedTo, reply)
      : null;
    messages.push(
      actionMessage ??
        (await client.messages.create({
          from: normalizedFrom,
          to: normalizedTo,
          body: reply.text
        }))
    );
  }

  return {
    provider: "twilio",
    mode: "rich_reply_messages",
    to,
    messages: messages.map((message) => ({
      sid: message.sid,
      status: message.status
    }))
  };
}

function buildTwilioProductCaption(option: WhatsAppProductOption) {
  const total = option.product.price + option.product.shippingPrice;
  return [
    `${option.rank}) ${option.product.title}`,
    `Total: R$ ${total.toFixed(2)}`,
    `Entrega: ${option.product.deliveryEstimate}`,
    option.product.source === "mercado_livre" && option.product.automationLevel.startsWith("real_")
      ? `Link: ${option.product.productUrl}`
      : null,
    `Escolher este: responda ${option.rank}.`
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);
}

function buildProductOptionVariables(reply: WhatsAppRichReply) {
  return { "1": "Escolha uma opção:" };
}

async function sendTwilioActionMessage(
  client: ReturnType<typeof twilio>,
  from: string,
  to: string,
  reply: WhatsAppRichReply
) {
  const contentSid = process.env.TWILIO_CHECKOUT_ACTIONS_CONTENT_SID;
  if (!contentSid) return null;

  try {
    return await client.messages.create({
      from,
      to,
      contentSid,
      contentVariables: JSON.stringify({ "1": reply.text })
    });
  } catch (error) {
    console.warn("[whatsapp:twilio:checkout-actions:fallback]", error);
    return null;
  }
}

async function delayBetweenProductMessages(index: number, total: number) {
  if (index >= total - 1) return;
  const delayMs = Number(process.env.TWILIO_PRODUCT_MESSAGE_DELAY_MS ?? 2000);
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 4000)));
}

function isPublicMediaUrl(url: string) {
  return /^https:\/\/.+/i.test(url);
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
