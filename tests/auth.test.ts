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

// ---- painel /ops (revisão 01/09): fail-closed em deploy, tempo constante, cookie HMAC ----
import { opsSessionCookieValue, requireOpsKey } from "../src/lib/auth";

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return run();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("ops auth: header, query (quando permitida) e cookie HMAC entram; token cru no cookie não", () => {
  withEnv({ OPS_TOKEN: "segredo-ops", API_TOKEN: "api-token", VERCEL: "1" }, () => {
    const ok = new Request("https://lia.test/api/ops/orders", { headers: { "x-ops-key": "segredo-ops" } });
    assert.equal(requireOpsKey(ok), null);

    const wrong = new Request("https://lia.test/api/ops/orders", { headers: { "x-ops-key": "api-token" } });
    assert.equal(requireOpsKey(wrong)?.status, 401, "API_TOKEN não vale mais como chave do /ops");

    const viaQuery = new Request("https://lia.test/api/ops/orders?key=segredo-ops");
    assert.equal(requireOpsKey(viaQuery, { allowQuery: true }), null);
    assert.equal(requireOpsKey(viaQuery)?.status, 401, "query só quando a rota permite");

    const hmac = opsSessionCookieValue("segredo-ops");
    const cookieOk = new Request("https://lia.test/api/ops/orders", { headers: { cookie: `x=1; ops_session=${hmac}` } });
    assert.equal(requireOpsKey(cookieOk), null);

    const rawCookie = new Request("https://lia.test/api/ops/orders", { headers: { cookie: "ops_session=segredo-ops" } });
    assert.equal(requireOpsKey(rawCookie)?.status, 401, "o cookie antigo (token cru) deixa de valer");

    const nothing = new Request("https://lia.test/api/ops/orders");
    assert.equal(requireOpsKey(nothing)?.status, 401);
  });
});

test("ops auth: sem OPS_TOKEN nega em deploy (VERCEL) e libera só localmente", () => {
  withEnv({ OPS_TOKEN: undefined, API_TOKEN: "api-token", VERCEL: "1" }, () => {
    const request = new Request("https://lia.test/api/ops/orders", { headers: { "x-ops-key": "api-token" } });
    assert.equal(requireOpsKey(request)?.status, 401, "Preview sem OPS_TOKEN não pode expor a fila");
  });
  withEnv({ OPS_TOKEN: undefined, VERCEL: undefined }, () => {
    const request = new Request("https://lia.test/api/ops/orders");
    assert.equal(requireOpsKey(request), null, "dev local sem token continua liberado (dev:demo)");
  });
});
