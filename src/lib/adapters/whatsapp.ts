import twilio from "twilio";
import type { Product } from "@prisma/client";

type RawInbound = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        statuses?: Array<{ id?: string; status?: string; timestamp?: string; recipient_id?: string }>;
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

export type WhatsAppDeliveryChoice = {
  id: string;
  name: string;
  displayPrice: number;
  imageUrl?: string;
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
      messageId: metaMessage?.id ?? stringFromPayload(payload.MessageSid),
      eventType: metaMessage ? "message" : metaChange?.statuses?.length ? "status" : metaChange ? "meta_event" : "message",
      provider: metaChange ? "meta" : payload.From || payload.Body ? "twilio" : "mock"
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

  // Send a single image (public URL) with a caption. Used to show product photos in
  // the delivery flow. Falls back to a plain text message if media can't be sent, so
  // the customer always sees the caption.
  async sendMedia(to: string, text: string, mediaUrl: string) {
    if (!isPublicMediaUrl(mediaUrl)) return this.sendMessage(to, text);
    if (process.env.WHATSAPP_PROVIDER === "meta") return sendMetaImage(to, text, mediaUrl);
    if (process.env.WHATSAPP_PROVIDER === "twilio") return sendTwilioMedia(to, text, mediaUrl);
    console.log("[whatsapp:mock:media]", { to, text, mediaUrl });
    return { provider: "mock", to, text, mediaUrl };
  },

  // True only if this image URL can actually be delivered as WhatsApp media (https +
  // not an anti-bot-locked host like Petz's Akamai CDN). Lets callers pick the photo
  // layout vs. the single numbered-text list instead of sending broken/degraded media.
  canSendImage(url?: string) {
    return Boolean(url) && isPublicMediaUrl(url as string);
  },

  // Product choices used by the current delivery flow. On Meta each option becomes
  // its own card with a "Escolher este" reply button, so the button is visually tied
  // to the right photo/product. Other providers return null and keep the numbered
  // text fallback owned by delivery-service.
  async sendDeliveryChoices(to: string, options: WhatsAppDeliveryChoice[]) {
    if (process.env.WHATSAPP_PROVIDER !== "meta" || !options.length) return null;
    return sendMetaDeliveryChoices(to, options.slice(0, 3));
  },

  async sendQuantityChoices(to: string, productName: string) {
    if (process.env.WHATSAPP_PROVIDER !== "meta") return null;
    return sendMetaSimpleButtons(to, `Quantas unidades de *${productName}*?`, [
      { id: "qty:1", title: "1 unidade" },
      { id: "qty:2", title: "2 unidades" },
      { id: "qty:3", title: "3 unidades" }
    ], "Para outra quantidade, digite o número.");
  },

  async sendPaymentChoices(to: string, pixTotal: number, cardTotal: number) {
    if (process.env.WHATSAPP_PROVIDER !== "meta") return null;
    return sendMetaSimpleButtons(to, "Escolha como prefere pagar:", [
      { id: "pix", title: "Pagar com Pix" },
      { id: "cartao", title: "Pagar com cartão" }
    ], `Pix ${formatBRL(pixTotal)} · Cartão ${formatBRL(cardTotal)}`);
  },

  async sendCartActions(to: string) {
    if (process.env.WHATSAPP_PROVIDER !== "meta") return null;
    return sendMetaSimpleButtons(to, "Quer ajustar o pedido antes de pagar?", [
      { id: "adicionar_mais", title: "Adicionar mais" },
      { id: "cancelar", title: "Cancelar pedido" }
    ]);
  },

  async sendAddressSetup(to: string, text: string) {
    if (process.env.WHATSAPP_PROVIDER !== "meta") return null;
    return sendMetaSimpleButtons(to, text, [{ id: "cadastrar_endereco", title: "Cadastrar endereço" }]);
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

async function sendMetaSimpleButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  footer?: string
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  return sendMetaPayload(phoneNumberId, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeWhatsAppPhone(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) }
        }))
      }
    }
  });
}

async function sendMetaDeliveryChoices(to: string, options: WhatsAppDeliveryChoice[]) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  }
  if (options.some((option) => !isPublicMediaUrl(option.imageUrl ?? ""))) {
    throw new Error("Refusing to send a WhatsApp product card without a deliverable image");
  }

  const normalizedTo = normalizeWhatsAppPhone(to);
  const messages = [];
  // Each option is its own interactive card. The image header, product details and
  // reply button live in the SAME WhatsApp message, so there is no ambiguity about
  // which product "Escolher esse" selects.
  for (const option of options) {
    const interactive: Record<string, unknown> = {
      type: "button",
      body: { text: `${option.name}\n*${formatBRL(option.displayPrice)}*`.slice(0, 1024) },
      action: {
        buttons: [{
          type: "reply",
          reply: { id: option.id.slice(0, 256), title: "Escolher esse" }
        }]
      }
    };
    interactive.header = { type: "image", image: { link: option.imageUrl } };
    messages.push(await sendMetaPayload(phoneNumberId, token, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedTo,
      type: "interactive",
      interactive
    }));
  }
  return { provider: "meta", mode: "delivery_choice_cards", to, messages };
}

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
    throw new Error(`Failed to send WhatsApp message (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
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
    throw new Error(`Failed to send WhatsApp message (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
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

async function sendTwilioMedia(to: string, text: string, mediaUrl: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    return { provider: "twilio", mocked: true, to, text, mediaUrl };
  }
  const client = twilio(accountSid, authToken);
  try {
    const message = await client.messages.create({
      from: normalizeTwilioWhatsAppAddress(from),
      to: normalizeTwilioWhatsAppAddress(to),
      body: text.slice(0, 1500),
      mediaUrl: [mediaUrl]
    });
    return { provider: "twilio", to, sid: message.sid, status: message.status };
  } catch (error) {
    // If WhatsApp/Twilio rejects the image, still deliver the caption as text.
    console.warn("[whatsapp:twilio:media:fallback-text]", error instanceof Error ? error.message : error);
    return sendTwilioWhatsAppMessage(to, text);
  }
}

async function sendMetaImage(to: string, text: string, mediaUrl: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return sendMetaMessage(to, text);
  try {
    return await sendMetaPayload(phoneNumberId, token, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWhatsAppPhone(to),
      type: "image",
      image: { link: mediaUrl, caption: text.slice(0, 1024) }
    });
  } catch (error) {
    console.warn("[whatsapp:meta:media:fallback-text]", error instanceof Error ? error.message : error);
    return sendMetaMessage(to, text);
  }
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
    // Images on by default now that we serve a WhatsApp-deliverable .jpg. Set
    // TWILIO_SEND_PRODUCT_IMAGES=false to fall back to a single text message.
    const sendImages = process.env.TWILIO_SEND_PRODUCT_IMAGES !== "false";

    if (sendImages) {
      for (const [index, option] of options.entries()) {
        const body = buildTwilioProductCaption(option);
        const imageUrl = toWhatsAppImageUrl(option.product.imageUrl);
        const mediaUrl = isPublicMediaUrl(imageUrl) ? [imageUrl] : undefined;

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
    } else {
      // The Twilio WhatsApp Sandbox does not deliver the Mercado Livre .webp
      // product images, so by default send ONE reliable text message with all the
      // options. Set TWILIO_SEND_PRODUCT_IMAGES=true on an approved sender to bring
      // the image cards back.
      messages.push(
        await client.messages.create({
          from: normalizedFrom,
          to: normalizedTo,
          body: buildTwilioProductListText(options)
        })
      );
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

function toWhatsAppImageUrl(url: string) {
  // WhatsApp/Twilio don't deliver .webp images; Mercado Livre serves the very same
  // picture as JPEG when the extension is .jpg, which WhatsApp accepts.
  if (!url) return url;
  return url.replace(/\.webp(\?|$)/i, ".jpg$1");
}

function buildTwilioProductListText(options: WhatsAppProductOption[]) {
  const lines: string[] = ["Achei estas opções:", ""];
  for (const option of options) {
    const total = option.product.price + option.product.shippingPrice;
    lines.push(`*${option.rank}) ${option.product.title}*`);
    lines.push(`R$ ${total.toFixed(2)}`);
    if (option.product.source === "mercado_livre" && option.product.automationLevel.startsWith("real_")) {
      lines.push(option.product.productUrl);
    }
    lines.push("");
  }
  lines.push("Responda *1*, *2* ou *3* para escolher.");
  return lines.join("\n").slice(0, 1500);
}

function buildTwilioProductCaption(option: WhatsAppProductOption) {
  const product = option.product;
  return [
    `*${option.rank})*`,
    `🛒 *Produto:* ${product.title}`,
    `💰 *Preço:* ${formatBRL(product.price)}`,
    `🚚 *Entrega:* ${deliveryLabel(product)}`,
    "",
    `_Responda ${option.rank} para escolher este._`
  ]
    .join("\n")
    .slice(0, 1000);
}

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function deliveryLabel(product: Product) {
  const estimate = (product.deliveryEstimate ?? "").trim();
  // Prefer a real delivery time from the listing when it has one.
  if (estimate && /\b(chega|chegar|amanh|hoje|dias?|horas?|uteis|úteis)\b/i.test(estimate)) {
    return estimate;
  }
  // The exact per-item prazo depends on the buyer's CEP, which we don't have yet —
  // show an honest estimated range instead of a fake single number.
  const days = Math.max(2, Math.round((product.deliveryHours || 72) / 24));
  return `Estimado em ${days} a ${days + 3} dias úteis`;
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
  const delayMs = Number(process.env.TWILIO_PRODUCT_MESSAGE_DELAY_MS ?? 700);
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 4000)));
}

// Hosts that block server-side fetches (Akamai/anti-bot) — WhatsApp/Twilio can't load
// them, so we skip media and fall back to text (never ship a broken image). Petz
// self-hosts product photos behind Akamai: only a real browser that solved the JS sensor
// can fetch them, so their URLs 403 for Twilio (Carrefour's VTEX CDN is permissive and
// works). The Petz imageUrls stay in the catalog for the /ops dashboard and for a future
// re-host to a public CDN — once re-hosted, drop the host here. Override via
// LIA_MEDIA_BLOCK_HOSTS (comma-separated hostnames; empty string disables the blocklist).
const MEDIA_BLOCK_HOSTS = (process.env.LIA_MEDIA_BLOCK_HOSTS ?? "images.petz.com.br")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function isPublicMediaUrl(url: string) {
  if (!/^https:\/\/.+/i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (MEDIA_BLOCK_HOSTS.some((blocked) => host === blocked || host.endsWith("." + blocked))) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
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

function stringFromPayload(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function extractNestedString(payload: RawInbound, path: string[]) {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" ? cursor : undefined;
}
