import twilio from "twilio";

const PRODUCT_OPTIONS_TEMPLATE_NAME = "atlas_product_options_quick_reply";

export type TwilioContentReadiness = {
  ready: boolean;
  mode: "quick_reply" | "media_fallback";
  contentSid: boolean;
  canCreateTemplate: boolean;
  missing: string[];
};

export function twilioProductOptionsReadiness(): TwilioContentReadiness {
  const missing = [
    !process.env.TWILIO_ACCOUNT_SID ? "TWILIO_ACCOUNT_SID" : null,
    !process.env.TWILIO_AUTH_TOKEN ? "TWILIO_AUTH_TOKEN" : null,
    !process.env.TWILIO_WHATSAPP_FROM ? "TWILIO_WHATSAPP_FROM" : null,
    !process.env.TWILIO_PRODUCT_OPTIONS_CONTENT_SID ? "TWILIO_PRODUCT_OPTIONS_CONTENT_SID" : null
  ].filter((item): item is string => Boolean(item));

  return {
    ready: missing.length === 0,
    mode: missing.length === 0 ? "quick_reply" : "media_fallback",
    contentSid: Boolean(process.env.TWILIO_PRODUCT_OPTIONS_CONTENT_SID),
    canCreateTemplate: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    missing
  };
}

export async function createTwilioProductOptionsTemplate() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }

  const client = twilio(accountSid, authToken);
  const content = await client.content.v1.contents.create(productOptionsTemplatePayload() as never);

  return {
    sid: content.sid,
    friendlyName: content.friendlyName
  };
}

function productOptionsTemplatePayload() {
  return {
    friendlyName: PRODUCT_OPTIONS_TEMPLATE_NAME,
    language: "pt_BR",
    variables: {
      "1": "Encontrei estas opcoes.\n\n1) Escova Dental - R$ 16.10\n2) Escova Premium - R$ 19.59\n3) Mercado Livre - R$ 27.80"
    },
    types: {
      "twilio/text": {
        body: "{{1}}\n\nResponda 1, 2 ou 3."
      },
      "twilio/quick-reply": {
        body: "{{1}}",
        actions: [
          {
            type: "QUICK_REPLY",
            id: "1",
            title: "1"
          },
          {
            type: "QUICK_REPLY",
            id: "2",
            title: "2"
          },
          {
            type: "QUICK_REPLY",
            id: "3",
            title: "3"
          }
        ]
      }
    }
  };
}
