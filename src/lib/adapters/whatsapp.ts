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
  phone?: string;
  body?: string;
  text?: string;
  name?: string;
  profileName?: string;
  [key: string]: unknown;
};

export const whatsappAdapter = {
  parseInbound(payload: RawInbound) {
    const metaChange = payload.entry?.[0]?.changes?.[0]?.value;
    const metaMessage = metaChange?.messages?.[0];
    const metaContact = metaChange?.contacts?.[0];

    return {
      phone: metaMessage?.from ?? payload.from ?? payload.phone ?? extractNestedString(payload, ["message", "from"]) ?? "",
      text:
        metaMessage?.text?.body ??
        payload.body ??
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
      provider: metaMessage ? "meta" : "mock"
    };
  },

  async sendMessage(to: string, text: string, metadata?: unknown) {
    if (process.env.WHATSAPP_PROVIDER === "meta") {
      return sendMetaMessage(to, text);
    }

    if (process.env.WHATSAPP_PROVIDER === "twilio") {
      // Plug Twilio here: POST /Messages with From, To and Body.
      return { provider: "twilio", mocked: true, to, text, metadata };
    }

    if (process.env.WHATSAPP_PROVIDER === "zapi") {
      // Plug Z-API here: POST /send-text with phone and message.
      return { provider: "zapi", mocked: true, to, text, metadata };
    }

    console.log("[whatsapp:mock]", { to, text, metadata });
    return { provider: "mock", to, text, metadata };
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

function normalizeWhatsAppPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function extractNestedString(payload: RawInbound, path: string[]) {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" ? cursor : undefined;
}
