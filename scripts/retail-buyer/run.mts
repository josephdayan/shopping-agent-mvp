// Processo contínuo separado da Vercel; nunca recebe o banco nem OPS_TOKEN.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  openProfile,
  VtexBuyer,
  VTEX_RECIPES,
  extractAddress,
  type BuyerJob,
  type StoreRecipe,
} from "./browser";
import { PURCHASE_DOMAINS, purchaseHostAllowed } from "../../src/lib/purchase-preparation";
import { trackingPageAllowed } from "../../src/lib/tracking-policy";
import { GmailCodeMailbox, registerStoreMail } from "./mailbox";
import { MercadoLivreBuyer, ML_RECIPE, type MercadoLivreRecipe } from "./mercadolivre";
import { classifyStoreMail, STORE_MAIL_RULES } from "../../src/lib/mailbox-policy";
import { parsePixEmv } from "../../src/lib/pix-emv";
type AnyRecipe = StoreRecipe | MercadoLivreRecipe;
const isMl = (r: AnyRecipe): r is MercadoLivreRecipe => (r as MercadoLivreRecipe).kind === "mercadolivre";

const root = resolve(process.env.LIA_BUYER_DIR ?? ".retail-buyer");
const configPath = resolve(root, "config.json");
const command = process.argv[2] ?? "run";
if (command === "init") {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        baseUrl: "https://liadelivery.com.br",
        headless: false,
        stores: { mercadolivre: ML_RECIPE, drogariasp: VTEX_RECIPES.drogariasp },
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Configuração inicial criada. Use setup NOME_DA_LOJA para entrar na conta e cadastrar o cartão diretamente no site.",
  );
  process.exit(0);
}
type ProbeAddress = {
  name: string;
  cep: string;
  text: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};
const config = JSON.parse(await readFile(configPath, "utf8")) as {
  baseUrl: string;
  headless?: boolean;
  stores: Record<string, AnyRecipe>;
  // Endereço operacional autorizado pelo dono para sondagens (nunca o de um cliente).
  probe?: ProbeAddress;
};
for (const [store, recipe] of Object.entries(config.stores)) {
  const mail = (isMl(recipe) ? undefined : recipe.mail ?? VTEX_RECIPES[store]?.mail) ??
    (STORE_MAIL_RULES[store] ? { label: store, domains: STORE_MAIL_RULES[store].domains } : undefined);
  if (mail) registerStoreMail(store, mail);
}
const base = new URL(config.baseUrl);
if (
  base.protocol !== "https:" &&
  !(
    base.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(base.hostname)
  )
)
  throw new Error("Servidor precisa de HTTPS.");
for (const [store, recipe] of Object.entries(config.stores)) {
  const u = new URL(recipe.origin);
  if (
    !PURCHASE_DOMAINS[store] ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !purchaseHostAllowed(store, u.hostname)
  )
    throw new Error("Origem da loja inválida.");
  if (isMl(recipe)) {
    if (store !== "mercadolivre") throw new Error("Receita do Mercado Livre só vale para a loja mercadolivre.");
    continue;
  }
  if (
    recipe.tracking &&
    !trackingPageAllowed(
      store,
      recipe.tracking.urlTemplate.replace("{orderNumber}", "example"),
    )
  )
    throw new Error("Página de pedidos fora da loja.");
}
if (command === "setup") {
  const store = process.argv[3];
  const recipe = config.stores[store];
  if (!recipe) throw new Error("Loja ausente da configuração.");
  const context = await openProfile(resolve(root, "profiles"), store);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(recipe.origin);
  console.log(
    "Entre na conta operacional e configure o cartão corporativo diretamente na loja. Feche esta janela quando terminar; depois registre a prontidão em Compras no /ops.",
  );
  await new Promise<void>((r) => context.once("close", () => r()));
  process.exit(0);
}
// Log privado de erros do comprador (Mac do dono, modo 0600): motivo completo, que pode conter
// endereço de cliente e URLs da loja — por isso nunca vai ao stderr nem ao servidor.
async function privateErrorLog(jobId: string, store: string, error: unknown) {
  try {
    const { homedir } = await import("node:os");
    const { appendFile } = await import("node:fs/promises");
    const dir = resolve(homedir(), "Library", "Logs", "lia");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const line = `${new Date().toISOString()} job=${jobId} store=${store} ${message.replace(/\s+/g, " ").slice(0, 2000)}\n`;
    await appendFile(resolve(dir, "purchase-errors.log"), line, { mode: 0o600 });
  } catch {}
}
function secret(name: string, service?: string) {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  if (service && process.platform === "darwin")
    try {
      return execFileSync(
        "security",
        [
          "find-generic-password",
          "-a",
          "lia-purchase-worker",
          "-s",
          service,
          "-w",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    } catch {}
  return undefined;
}
// Chave da IA que lê o endereço LIVRE do cliente (extractAddress). O serviço launchd não
// herda o .env (15/09: primeiro pedido real caiu em 9 s por "Configure a chave da IA");
// ordem: ambiente → Chaves ("Lia OpenAI Key") → OPENAI_API_KEY do .env do repositório.
if (!process.env.OPENAI_API_KEY?.trim()) {
  const fromKeychain = secret("OPENAI_API_KEY", "Lia OpenAI Key");
  if (fromKeychain) process.env.OPENAI_API_KEY = fromKeychain;
  else {
    try {
      const line = (await readFile(resolve(root, "..", ".env"), "utf8")).split("\n").find((l) => /^OPENAI_API_KEY=/.test(l));
      const value = line?.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
      if (value) process.env.OPENAI_API_KEY = value;
    } catch {}
  }
}
const purchaseToken = secret(
  "LIA_PURCHASE_WORKER_TOKEN",
  "Lia Purchase Worker",
);
const trackingToken = secret(
  "LIA_TRACKING_WORKER_TOKEN",
  "Lia Tracking Worker",
);
const gmailClientId = secret("LIA_GMAIL_CLIENT_ID", "Lia Gmail Client ID");
const gmailClientSecret = secret(
  "LIA_GMAIL_CLIENT_SECRET",
  "Lia Gmail Client Secret",
);
const gmailRefreshToken = secret(
  "LIA_GMAIL_REFRESH_TOKEN",
  "Lia Gmail Refresh Token",
);
const mailbox =
  gmailClientId && gmailClientSecret && gmailRefreshToken
    ? new GmailCodeMailbox({
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
        refreshToken: gmailRefreshToken,
      })
    : undefined;
if (command === "mailbox-check") {
  if (!mailbox)
    throw new Error(
      "Configure o OAuth somente leitura da caixa operacional no Chaves ou no ambiente local.",
    );
  await mailbox.check();
  console.log(JSON.stringify({ mailbox: "gmail", status: "ready" }));
  process.exit(0);
}
if (command === "probe" || command === "e3") {
  // Gate E2 (probe): até a tela de pagamento com Pix selecionado, sem finalizar, sem servidor.
  // Gate E3 (e3): o MESMO caminho e, só com LIA_E3_CONFIRM=sim e o dono aprovando o comando,
  // UM clique no botão final, captura do copia-e-cola e foto do comprovante. O Pix é pago
  // pelo dono no app do banco; o carrinho não é esvaziado (o pedido existe na loja).
  const e3 = command === "e3";
  const store = process.argv[3];
  const skuArg = process.argv[4];
  const recipe = config.stores[store];
  if (!recipe) throw new Error("Loja ausente da configuração.");
  if (!config.probe)
    throw new Error(
      "Defina `probe` no config.json (name, cep, text e o endereço estruturado autorizado pelo dono).",
    );
  if (isMl(recipe)) {
    // Sondagem do ML (gate E8): precisa da URL de um anúncio barato; monta o carrinho na
    // conta, fotografa e esvazia. Nunca clica em comprar.
    if (!skuArg || !/^https:\/\//.test(skuArg)) throw new Error("Passe a URL do anúncio: probe mercadolivre https://...MLB-...");
    const probesDir = resolve(root, "probes");
    await mkdir(probesDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const context = await openProfile(resolve(root, "profiles"), store, config.headless);
    const page = context.pages()[0] ?? (await context.newPage());
    const buyer = new MercadoLivreBuyer(page, recipe);
    const mlJob: BuyerJob = {
      jobId: `probe-${Date.now()}`, orderId: "probe", storeKey: store, cartHash: "0".repeat(64), claimToken: "probe",
      maximumTotal: 0, deliveryFeeCents: 0, accountEmail: process.env.LIA_PROBE_ACCOUNT_EMAIL?.trim() || "probe@example.test",
      customer: { name: config.probe.name, phone: "probe", cep: config.probe.cep, address: config.probe.text },
      items: [{ sku: "ml-probe", name: "sondagem", quantity: 1, expectedUnitPrice: 0, productUrl: skuArg }],
    };
    const report: Record<string, unknown> = { store, productUrl: skuArg, startedAt: new Date().toISOString() };
    try {
      try {
        const lines = await buyer.prepareCart(mlJob);
        report.prepared = true;
        report.cart = lines;
        report.evidence = await buyer.snapshot(mlJob);
      } catch (error) {
        report.prepared = false;
        report.prepareError = error instanceof Error ? error.message : "erro";
      }
      await page.screenshot({ path: resolve(probesDir, `${store}-${stamp}.png`), fullPage: true }).catch(() => {});
      if (report.prepared) {
        try { await buyer.clearPreparedCart(mlJob); report.cartCleared = true; } catch (error) { report.cartCleared = false; report.cartClearError = error instanceof Error ? error.message : "erro"; }
      }
    } finally {
      await context.close();
    }
    await writeFile(resolve(probesDir, `${store}-${stamp}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }
  const item = await probeItem(store, recipe, skuArg);
  const job: BuyerJob = {
    jobId: `probe-${Date.now()}`,
    orderId: "probe",
    storeKey: store,
    cartHash: "0".repeat(64),
    claimToken: "probe",
    maximumTotal: 0,
    accountEmail: process.env.LIA_PROBE_ACCOUNT_EMAIL?.trim() || undefined,
    customer: {
      name: config.probe.name,
      phone: "probe",
      cep: config.probe.cep,
      address: config.probe.text,
    },
    items: [item],
  };
  const { text: _text, name: _name, cep: _cep, ...address } = config.probe;
  const probesDir = resolve(root, "probes");
  await mkdir(probesDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const context = await openProfile(resolve(root, "profiles"), store, config.headless);
  const page = context.pages()[0] ?? (await context.newPage());
  const buyer = new VtexBuyer(page, {
    ...VTEX_RECIPES[store],
    ...recipe,
    auth: VTEX_RECIPES[store]?.auth,
    payment: "pix",
  });
  const report: Record<string, unknown> = { store, sku: item.sku, startedAt: new Date().toISOString() };
  try {
    try {
      await buyer.prepareCart(job, address, mailbox);
      report.prepared = true;
    } catch (error) {
      report.prepared = false;
      report.prepareError = error instanceof Error ? error.message : "erro";
    }
    // Leva a tela até o passo do clique final (clássico: #/payment; Cobasi: até a Revisão).
    try {
      await buyer.reachPaymentScreen();
    } catch (error) {
      report.paymentScreenError = error instanceof Error ? error.message : "erro";
    }
    Object.assign(report, await buyer.probeReport());
    await page.screenshot({ path: resolve(probesDir, `${store}-${stamp}.png`), fullPage: true }).catch(() => {});
    const ready =
      report.prepared === true && !report.paymentScreenError && report.pixSelected === true &&
      report.challengeVisible === false && report.finalizeButtons === 1 && report.finalizeEnabled === true;
    if (e3 && ready && process.env.LIA_E3_CONFIRM === "sim") {
      // Clique único e supervisionado. Captura primeiro (resposta do conector), DOM depois.
      const armed = buyer.armPixCapture();
      try {
        const button = page.getByRole("button", { name: /concluir pedido|finalizar compra|finalizar pedido/i });
        if ((await button.count()) !== 1) throw new Error("Botão final não identificado com segurança.");
        await button.click({ timeout: 15_000 });
        report.submittedAt = new Date().toISOString();
        try {
          const code = await buyer.capturePixCode(armed, 120_000);
          report.pixCaptured = true;
          report.pixAmountCents = parsePixEmv(code).amountCents;
          report.pixMerchant = parsePixEmv(code).merchantName;
          // O copia-e-cola vai só para a saída (o dono paga); nunca para o JSON em disco.
          console.log(`PIX_COPIA_E_COLA ${code}`);
        } catch (error) {
          report.pixCaptured = false;
          report.pixError = error instanceof Error ? error.message : "erro";
        }
      } finally {
        armed.dispose();
      }
      await page.waitForTimeout(8_000);
      report.afterUrl = page.url();
      const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      report.afterText = text.slice(0, 1_500);
      report.orderNumberCandidates = [...new Set(text.match(/\b\d{6,13}-\d{2}\b|#\s?\d{6,}/g) ?? [])].slice(0, 5);
      await page.screenshot({ path: resolve(probesDir, `${store}-${stamp}-e3.png`), fullPage: true }).catch(() => {});
      report.cartCleared = false;
    } else if (report.prepared) {
      if (e3) report.e3Skipped = !ready ? "tela final não confirmada" : "LIA_E3_CONFIRM ausente";
      try {
        await buyer.clearPreparedCart(job);
        report.cartCleared = true;
      } catch (error) {
        report.cartCleared = false;
        report.cartClearError = error instanceof Error ? error.message : "erro";
      }
    }
  } finally {
    await context.close();
  }
  await writeFile(resolve(probesDir, `${store}-${stamp}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
async function probeItem(store: string, recipe: StoreRecipe, skuArg?: string) {
  const catalog = (await import(`../../src/lib/stores/${store}-catalog`)) as {
    CATALOG: { sku: string; name: string; unitPrice: number; productUrl?: string }[];
  };
  const candidates = catalog.CATALOG.filter(
    (c) => c.sku.startsWith(recipe.skuPrefix) && c.productUrl && c.unitPrice > 0,
  );
  const chosen = skuArg
    ? candidates.find((c) => c.sku === skuArg || c.sku === `${recipe.skuPrefix}${skuArg}`)
    : [...candidates].sort((a, b) => a.unitPrice - b.unitPrice)[0];
  if (!chosen) throw new Error("SKU da sondagem não encontrado no catálogo da loja.");
  return {
    sku: chosen.sku,
    name: chosen.name,
    quantity: 1,
    expectedUnitPrice: chosen.unitPrice,
    productUrl: chosen.productUrl!,
  };
}
if (!purchaseToken && !trackingToken)
  throw new Error(
    "Configure credencial do comprador ou do leitor; nunca use OPS_TOKEN.",
  );
const workerId = `buyer-${hostname()}-${randomUUID()}`.slice(0, 120);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function api(path: string, token: string, body: unknown) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `Servidor ${response.status}: ${String(result.error ?? "indisponível").slice(0, 180)}`,
    );
  return result;
}
const purchase = (body: unknown) =>
  api("/api/purchase-worker/session", purchaseToken!, body);
// Mercado Livre degrau C: prepara o carrinho na conta e entrega ao dono (owner_confirm).
async function buyMl(job: BuyerJob, recipe: MercadoLivreRecipe) {
  const identity = { workerId, jobId: job.jobId, claimToken: job.claimToken };
  let context: Awaited<ReturnType<typeof openProfile>> | undefined;
  let buyer: MercadoLivreBuyer | undefined;
  try {
    await purchase({ action: "heartbeat", ...identity });
    context = await openProfile(resolve(root, "profiles"), job.storeKey, config.headless);
    const page = context.pages()[0] ?? (await context.newPage());
    buyer = new MercadoLivreBuyer(page, recipe);
    await buyer.prepareCart(job);
    const evidence = await buyer.snapshot(job);
    const result = await purchase({ action: "owner_confirm", ...identity, evidence });
    if (!result.ok) {
      await buyer.clearPreparedCart(job).catch(() => {});
      console.log(JSON.stringify({ job: job.jobId, store: job.storeKey, status: "needs_review", reason: result.reason }));
      return;
    }
    // O carrinho fica na conta (sincroniza para o app do dono); o navegador fecha.
    console.log(JSON.stringify({ job: job.jobId, store: job.storeKey, status: "awaiting_owner_confirm", sent: result.sent }));
  } catch (error) {
    await buyer?.clearPreparedCart(job).catch(() => {});
    await purchase({ action: "unknown", ...identity, code: "ML_CART_REVIEW_REQUIRED" }).catch(() => {});
    console.error(JSON.stringify({ job: job.jobId, store: job.storeKey, status: "needs_review", reason: error instanceof Error && error.message.startsWith("Servidor") ? error.message : "Confira a conta e o carrinho do Mercado Livre na janela operacional." }));
  } finally {
    await context?.close();
  }
}
async function buy(job: BuyerJob, recipe: StoreRecipe) {
  const identity = { workerId, jobId: job.jobId, claimToken: job.claimToken };
  let alive = true;
  let inHeartbeat = false;
  const heartbeat = setInterval(async () => {
    if (inHeartbeat) return;
    inHeartbeat = true;
    try {
      await purchase({ action: "heartbeat", ...identity });
    } catch {
      alive = false;
    } finally {
      inHeartbeat = false;
    }
  }, 25_000);
  let context: Awaited<ReturnType<typeof openProfile>> | undefined;
  try {
    await purchase({ action: "heartbeat", ...identity });
    context = await openProfile(
      resolve(root, "profiles"),
      job.storeKey,
      config.headless,
    );
    const page = context.pages()[0] ?? (await context.newPage());
    // Meio de pagamento vem da conta no /ops (pix_out → Pix da loja; card → cartão salvo).
    // 15/09: sem isso o comprador ia ao cartão salvo e caía em "cadastre o cartão".
    const merged: StoreRecipe = { ...VTEX_RECIPES[job.storeKey], ...recipe, auth: VTEX_RECIPES[job.storeKey]?.auth };
    const payment: StoreRecipe["payment"] =
      job.paymentKind === "pix_out" ? "pix" : job.paymentKind === "card" ? "saved_card" : merged.payment;
    const buyer = new VtexBuyer(page, { ...merged, ...(payment ? { payment } : {}) });
    const address = await extractAddress(job.customer.address);
    const evidence = await buyer.prepare(job, address, mailbox);
    if (!alive) throw new Error("Reserva interrompida.");
    const checked = await purchase({ action: "stage", ...identity, evidence });
    if (!checked.readyToSubmit) {
      // Não há relógio para a resposta humana nem navegador preso durante a espera.
      await buyer.clearPreparedCart(job);
      clearInterval(heartbeat);
      await context.close();
      context = undefined;
      await purchase({ action: "park", ...identity, cartEmpty: true });
      console.log(
        JSON.stringify({
          job: job.jobId,
          store: job.storeKey,
          status: "awaiting_approval",
        }),
      );
      return;
    }
    if (!merged.submitSelector || !(merged.receipt || merged.checkoutFlow))
      throw new Error(
        "Finalização/comprovante precisam ser homologados nesta loja.",
      );
    const fresh = await buyer.snapshot(job, address);
    if (!alive) throw new Error("Reserva interrompida.");
    const permit = await purchase({
      action: "begin",
      ...identity,
      evidence: fresh,
    });
    if (permit.reviewRequired && !permit.submissionId) {
      await buyer.clearPreparedCart(job);
      clearInterval(heartbeat);
      await context.close();
      context = undefined;
      await purchase({ action: "park", ...identity, cartEmpty: true });
      console.log(JSON.stringify({ job: job.jobId, status: "awaiting_approval" }));
      return;
    }
    if (!permit.submissionId) throw new Error("Servidor não autorizou a finalização.");
    // Não repetir begin/submit em catch. Permissão perdida na rede exige reconciliação.
    const last = await buyer.snapshot(job, address);
    if (
      !alive ||
      JSON.stringify({ ...last, observedAt: "" }) !==
        JSON.stringify({ ...fresh, observedAt: "" })
    )
      throw new Error("Checkout mudou antes do clique final.");
    // Pix da loja (Fase 3): o clique gera o copia-e-cola; o SERVIDOR confere e paga por API.
    // O navegador segura o modal aberto e pergunta o estado até a loja confirmar.
    const armed = payment === "pix" ? buyer.armPixCapture() : null;
    await buyer.submit();
    if (armed) {
      let code: string;
      // Desafio humano da loja: avisa o dono e espera ele resolver na janela (nunca resolve).
      const challengeWaitMs = Number(process.env.LIA_CHALLENGE_WAIT_MS ?? 5 * 60_000);
      try {
        code = await buyer.capturePixCode(armed, 90_000, {
          challengeWaitMs,
          onChallenge: async () => {
            console.log(JSON.stringify({ job: job.jobId, store: job.storeKey, status: "human_challenge" }));
            await purchase({ action: "human_challenge", ...identity, waitMinutes: Math.max(1, Math.round(challengeWaitMs / 60_000)) }).catch(() => {});
          },
        });
      } catch (error) {
        // Diagnóstico privado (Mac do dono): a tela e o texto após o clique final, para
        // saber o que a loja mostrou quando o Pix não veio (15/09, 10ª tentativa real).
        try {
          const dir = resolve(root, "probes");
          await mkdir(dir, { recursive: true, mode: 0o700 });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          await page.screenshot({ path: resolve(dir, `${job.storeKey}-${stamp}-after-submit.png`), fullPage: true }).catch(() => {});
          const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 1500);
          await privateErrorLog(job.jobId, job.storeKey, new Error(`após o clique final: url=${page.url()} texto=${text}`));
        } catch {}
        throw error;
      } finally {
        armed.dispose();
      }
      const captured = await purchase({ action: "pix_captured", ...identity, submissionId: permit.submissionId, code });
      console.log(JSON.stringify({ job: job.jobId, store: job.storeKey, status: `pix_${captured.status}` }));
      if (captured.status === "blocked") throw new Error("Recebedor bloqueado.");
      if (captured.status === "unknown") throw new Error("Banco sem resposta.");
      // Aguarda pago (ou recusado). Recebedor novo: o dono aprova por botão e o servidor paga.
      const waitUntil = Date.now() + Number(process.env.LIA_PIX_WAIT_MS ?? 20 * 60_000);
      let paid = captured.status === "paid";
      while (!paid && Date.now() < waitUntil) {
        await sleep(5_000);
        const state = await purchase({ action: "pix_status", ...identity, submissionId: permit.submissionId, code });
        if (state.status === "paid") paid = true;
        else if (["refused", "failed", "expired", "unknown"].includes(state.status)) throw new Error(`Pix da loja: ${state.status}.`);
        else if (["needs_review", "canceled"].includes(state.jobStatus)) throw new Error("Compra devolvida para revisão.");
      }
      if (!paid) throw new Error("Pix da loja não confirmou no prazo.");
    }
    const receipt = await buyer.receipt();
    // A finalização no backend é idempotente; nunca repetir o clique financeiro.
    const complete = {
      action: "complete",
      ...identity,
      submissionId: permit.submissionId,
      ...receipt,
    };
    try {
      await purchase(complete);
    } catch {
      await purchase(complete);
    }
    console.log(
      JSON.stringify({
        job: job.jobId,
        store: job.storeKey,
        status: "completed",
      }),
    );
  } catch (error) {
    await purchase({
      action: "unknown",
      ...identity,
      code: "BROWSER_REVIEW_REQUIRED",
    }).catch(() => {});
    // Erros do navegador podem conter endereço/URLs; não despejar o objeto bruto no stderr.
    // O motivo completo vai para um log privado do dono (só ele lê; nunca sobe ao servidor).
    console.error(
      JSON.stringify({
        job: job.jobId,
        store: job.storeKey,
        status: "needs_review",
        reason:
          error instanceof Error && error.message.startsWith("Servidor")
            ? error.message
            : "Confira a conta e o carrinho no site; detalhes no log privado (~/Library/Logs/lia/purchase-errors.log).",
      }),
    );
    await privateErrorLog(job.jobId, job.storeKey, error);
  } finally {
    clearInterval(heartbeat);
    await context?.close();
  }
}
async function track(store: string, recipe: StoreRecipe) {
  if (!trackingToken || !recipe.tracking) return;
  const { job } = await api("/api/tracking-worker", trackingToken, {
    action: "claim",
    workerId,
    stores: [store],
  });
  if (!job) return;
  const identity = {
    action: "report",
    id: job.id,
    workerId,
    claimToken: job.claimToken,
  };
  let context: Awaited<ReturnType<typeof openProfile>> | undefined;
  try {
    const r = recipe.tracking;
    const url = r.urlTemplate.replace(
      "{orderNumber}",
      encodeURIComponent(job.storeOrderNumber),
    );
    context = await openProfile(
      resolve(root, "profiles"),
      store,
      config.headless,
    );
    const page = context.pages()[0] ?? (await context.newPage());
    // Leitura de status: só navegação e extração; não há cliques de compra neste caminho.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!trackingPageAllowed(store, page.url(), job.trackingUrl))
      throw new Error("Página fora da origem.");
    const number = page.locator(r.orderNumberSelector),
      status = page.locator(r.statusSelector);
    if ((await number.count()) !== 1 || (await status.count()) !== 1)
      throw new Error("Status ambíguo.");
    await api("/api/tracking-worker", trackingToken, {
      ...identity,
      evidence: {
        pageUrl: page.url(),
        storeOrderNumber: (await number.innerText()).trim(),
        statusText: (await status.innerText()).trim(),
        observedAt: new Date().toISOString(),
        wholeOrder: r.wholeOrder,
      },
    });
  } catch {
    await api("/api/tracking-worker", trackingToken, {
      ...identity,
      evidence: {
        error:
          "Leitura da loja indisponível ou ambígua; nova consulta agendada.",
      },
    }).catch(() => {});
  } finally {
    await context?.close();
  }
}
for (const [store, raw] of Object.entries(config.stores)) {
  if (isMl(raw)) continue;
  const recipe = { ...VTEX_RECIPES[store], ...raw };
  if (!recipe.submitSelector || !(recipe.receipt || recipe.checkoutFlow))
    console.warn(
      JSON.stringify({
        store,
        status: "purchase_not_configured",
        message:
          "Comprador desativado até homologar botão final e comprovante.",
      }),
    );
  if (!recipe.tracking)
    console.warn(JSON.stringify({ store, status: "tracking_not_configured" }));
}
if (!["run", "once"].includes(command))
  throw new Error("Use init, setup LOJA, probe LOJA [SKU], mailbox-check, run ou once.");
// Leitor de e-mails transacionais (Fase 4): a cada 2 min lista os e-mails recentes das
// lojas configuradas, classifica localmente e manda só o veredito ao servidor. O corpo
// nunca sai do processo. Ids já reportados ficam em memória (o servidor deduplica também).
const reportedMail = new Set<string>();
async function mailLoop() {
  if (!mailbox || !trackingToken) return;
  const stores = Object.keys(config.stores).filter((s) => STORE_MAIL_RULES[s]);
  const since = Date.now() - 2 * 86_400_000;
  do {
    for (const store of stores) {
      try {
        const messages = await mailbox.listStoreMessages(store, since);
        for (const m of messages) {
          if (reportedMail.has(m.id)) continue;
          const verdict = classifyStoreMail(store, { from: m.from, subject: m.subject, text: m.text });
          reportedMail.add(m.id);
          if (!verdict) continue;
          await api("/api/tracking-worker", trackingToken, {
            action: "report_mail", storeKey: store, storeOrderNumber: verdict.storeOrderNumber, kind: verdict.kind,
            messageId: m.id, receivedAt: new Date(m.receivedAt).toISOString(), ...(verdict.trackingUrl ? { trackingUrl: verdict.trackingUrl } : {}), ...(verdict.deliveryCode ? { deliveryCode: verdict.deliveryCode } : {}),
          }).catch(() => {});
        }
      } catch {
        console.error(JSON.stringify({ store, status: "mailbox_unavailable" }));
      }
    }
    if (command === "once") break;
    await sleep(Number(process.env.LIA_MAIL_POLL_MS ?? 120_000));
  } while (!stopping);
}
void mailLoop();
// Processos podem rodar em hosts distintos; o banco é a autoridade da reserva por loja.
await Promise.all(
  Object.entries(config.stores).map(async ([store, recipe]) => {
    do {
      try {
        // Receita = padrão da loja (VTEX_RECIPES: checkoutFlow, auth…) + config privado (submitSelector).
        const merged = isMl(recipe) ? recipe : { ...VTEX_RECIPES[store], ...recipe };
        const executable = isMl(merged) || Boolean(merged.submitSelector && (merged.receipt || merged.checkoutFlow));
        const { job } =
          purchaseToken && executable
            ? await purchase({ action: "claim", workerId, stores: [store] })
            : { job: null };
        if (isMl(recipe)) {
          if (job) await buyMl(job, recipe);
        } else if (job) await buy(job, recipe);
        else await track(store, recipe);
      } catch {
        console.error(JSON.stringify({ store, status: "worker_unavailable" }));
      }
      if (command === "once") break;
      await sleep(15_000);
    } while (!stopping);
  }),
);
