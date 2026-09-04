// Login do /ops pelo WhatsApp (04/09): token de 10 min assinado com OPS_TOKEN.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPS_TOKEN = "unit-ops-token";
import { OPS_LOGIN_TTL_MS, createOpsLoginToken, opsLoginUrl, verifyOpsLoginToken } from "../src/lib/auth";

test("token válido verifica; expirado, adulterado ou de outro segredo não", () => {
  const now = 1_800_000_000_000;
  const token = createOpsLoginToken(now);
  assert.ok(token);
  assert.equal(verifyOpsLoginToken(token, now + 60_000), true);
  assert.equal(verifyOpsLoginToken(token, now + OPS_LOGIN_TTL_MS + 1), false, "expirado");
  assert.equal(verifyOpsLoginToken(token!.slice(0, -1) + "0", now), false, "assinatura adulterada");
  const [exp, nonce, sig] = token!.split(".");
  assert.equal(verifyOpsLoginToken(`${Number(exp) + 999_999}.${nonce}.${sig}`, now), false, "validade adulterada");
  assert.equal(verifyOpsLoginToken("", now), false);
  assert.equal(verifyOpsLoginToken("a.b", now), false);
  const before = process.env.OPS_TOKEN;
  process.env.OPS_TOKEN = "outro";
  try {
    assert.equal(verifyOpsLoginToken(token, now), false, "outro segredo");
  } finally {
    process.env.OPS_TOKEN = before;
  }
});

test("url aponta para a rota de login no domínio público", () => {
  const token = createOpsLoginToken()!;
  const url = opsLoginUrl(token);
  assert.ok(url.startsWith("https://liadelivery.com.br/api/ops/login?login="), url);
  assert.ok(url.includes(encodeURIComponent(token)));
});

test("sem OPS_TOKEN não existe link", () => {
  const before = process.env.OPS_TOKEN;
  delete process.env.OPS_TOKEN;
  try {
    assert.equal(createOpsLoginToken(), null);
  } finally {
    process.env.OPS_TOKEN = before;
  }
});
