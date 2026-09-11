import "./helpers/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractStoreAccessCode,
  GmailCodeMailbox,
  registerStoreMail,
} from "../scripts/retail-buyer/mailbox";

const encoded = (value: string) => Buffer.from(value).toString("base64url");
const message = (input: {
  from?: string;
  subject?: string;
  body?: string;
  internalDate?: number;
}) => ({
  internalDate: String(input.internalDate ?? Date.now()),
  snippet: "",
  payload: {
    headers: [
      { name: "From", value: input.from ?? "conta@swift.com.br" },
      { name: "Subject", value: input.subject ?? "Código de acesso Swift" },
    ],
    mimeType: "text/html",
    body: { data: encoded(input.body ?? "Seu código de acesso é <b>483921</b>") },
  },
});

test("leitor aceita um único código recente somente do domínio da loja", () => {
  assert.equal(extractStoreAccessCode("swift", message({})), "483921");
  assert.equal(
    extractStoreAccessCode(
      "swift",
      message({ from: "golpe@example.test", body: "Código Swift 483921" }),
    ),
    null,
  );
  assert.equal(
    extractStoreAccessCode(
      "cobasi",
      message({ from: "conta@swift.com.br", body: "Código Cobasi 483921" }),
    ),
    null,
  );
  assert.equal(
    extractStoreAccessCode(
      "swift",
      message({ body: "Swift: códigos 483921 e 111222 para acesso" }),
    ),
    null,
  );
});

test("Gmail usa OAuth refresh, filtra pelo instante do pedido e não altera mensagens", async () => {
  const requestedAt = Date.now();
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({ access_token: "access-secret", expires_in: 3600 });
    if (url.includes("/messages?") && !url.includes("/messages/"))
      return Response.json({ messages: [{ id: "new" }, { id: "old" }] });
    if (url.includes("/messages/new"))
      return Response.json(
        message({ body: "Sua chave de acesso Swift: A7B9C2", internalDate: requestedAt }),
      );
    if (url.includes("/messages/old"))
      return Response.json(
        message({ body: "Código de acesso Swift 000000", internalDate: requestedAt - 60_000 }),
      );
    throw new Error(`URL inesperada: ${url}`);
  };
  const mailbox = new GmailCodeMailbox(
    { clientId: "client", clientSecret: "secret", refreshToken: "refresh" },
    fetcher,
  );
  assert.equal(
    await mailbox.waitForCode({ storeKey: "swift", requestedAt, timeoutMs: 1_000 }),
    "A7B9C2",
  );
  assert.equal(calls.filter((call) => call.url.includes("oauth2")).length, 1);
  assert.equal(calls.some((call) => call.init?.method && call.url.includes("gmail")), false);
  const auth = calls.find((call) => call.url.includes("gmail"))?.init?.headers as {
    authorization?: string;
  };
  assert.equal(auth.authorization, "Bearer access-secret");
});

test("loja registrada pelo config ganha regra de e-mail; loja desconhecida nunca devolve código", () => {
  assert.equal(
    extractStoreAccessCode(
      "rihappy",
      message({ from: "conta@rihappy.com.br", body: "Ri Happy: seu código de acesso é 552211" }),
    ),
    null,
  );
  registerStoreMail("rihappy", { label: "ri happy", domains: ["rihappy.com.br"] });
  assert.equal(
    extractStoreAccessCode(
      "rihappy",
      message({ from: "conta@rihappy.com.br", body: "Ri Happy: seu código de acesso é 552211" }),
    ),
    "552211",
  );
  assert.throws(() => registerStoreMail("x y", { label: "x", domains: ["x.com"] }), /inválida/);
  assert.throws(() => registerStoreMail("loja", { label: "loja", domains: ["semdominio"] }), /inválida/);
});

test("credenciais incompletas são recusadas antes de acessar a rede", () => {
  assert.throws(
    () =>
      new GmailCodeMailbox({
        clientId: "client",
        clientSecret: "",
        refreshToken: "refresh",
      }),
    /incompleta/,
  );
});
