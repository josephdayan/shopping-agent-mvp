import "./helpers/load-env";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { requireMetaSignature } from "../src/lib/auth";

const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

test("Meta webhook signature: aceita assinatura HMAC correta", () => {
  const previous = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = "test-app-secret";
  const signature = createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(body).digest("hex");

  try {
    const request = new Request("https://lia.test/api/whatsapp/webhook", {
      headers: { "x-hub-signature-256": `sha256=${signature}` }
    });
    assert.equal(requireMetaSignature(request, body), null);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = previous;
  }
});

test("Meta webhook signature: rejeita assinatura invalida", async () => {
  const previous = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = "test-app-secret";

  try {
    const request = new Request("https://lia.test/api/whatsapp/webhook", {
      headers: { "x-hub-signature-256": "sha256=00" }
    });
    const response = requireMetaSignature(request, body);
    assert.ok(response);
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = previous;
  }
});
