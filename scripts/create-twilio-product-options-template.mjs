import { createTwilioProductOptionsTemplate } from "../src/lib/adapters/twilio-content.ts";

const content = await createTwilioProductOptionsTemplate();

console.log(`TWILIO_PRODUCT_OPTIONS_CONTENT_SID=${content.sid}`);
