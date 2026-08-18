import assert from "node:assert/strict";
import test from "node:test";

import { mercadoLivreAuthorizeUrl, mercadoLivreClientConfig, MERCADO_LIVRE_REDIRECT_URI } from "../src/lib/mercadolivre-oauth";

test("Mercado Livre OAuth uses the production callback and keeps state in the authorization URL", () => {
  const previous = { clientId: process.env.ML_CLIENT_ID, legacyClientId: process.env.MERCADO_LIVRE_CLIENT_ID, redirect: process.env.ML_REDIRECT_URI };
  process.env.ML_CLIENT_ID = "123456";
  delete process.env.MERCADO_LIVRE_CLIENT_ID;
  delete process.env.ML_REDIRECT_URI;
  try {
    assert.equal(mercadoLivreClientConfig().redirectUri, MERCADO_LIVRE_REDIRECT_URI);
    const url = new URL(mercadoLivreAuthorizeUrl("state-test")!);
    assert.equal(url.origin, "https://auth.mercadolivre.com.br");
    assert.equal(url.searchParams.get("client_id"), "123456");
    assert.equal(url.searchParams.get("redirect_uri"), MERCADO_LIVRE_REDIRECT_URI);
    assert.equal(url.searchParams.get("state"), "state-test");
  } finally {
    process.env.ML_CLIENT_ID = previous.clientId;
    process.env.MERCADO_LIVRE_CLIENT_ID = previous.legacyClientId;
    process.env.ML_REDIRECT_URI = previous.redirect;
  }
});
