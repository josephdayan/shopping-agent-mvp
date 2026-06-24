type RawInbound = {
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
    return {
      phone: payload.from ?? payload.phone ?? extractNestedString(payload, ["message", "from"]) ?? "",
      text: payload.body ?? payload.text ?? extractNestedString(payload, ["message", "text"]) ?? "",
      name: payload.name ?? payload.profileName ?? extractNestedString(payload, ["profile", "name"]) ?? undefined
    };
  },

  async sendMessage(to: string, text: string, metadata?: unknown) {
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

function extractNestedString(payload: RawInbound, path: string[]) {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" ? cursor : undefined;
}
