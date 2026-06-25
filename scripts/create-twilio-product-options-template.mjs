import twilio from "twilio";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN.");
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const content = await client.content.v1.contents.create({
  friendlyName: "atlas_product_options_quick_reply",
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
});

console.log(`TWILIO_PRODUCT_OPTIONS_CONTENT_SID=${content.sid}`);
