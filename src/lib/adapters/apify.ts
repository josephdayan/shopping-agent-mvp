// Cliente mínimo do Apify (revisão 02/09): extraído de `adapters/suppliers.ts` (o motor
// de busca ML de junho, removido) porque a vitrine do Mercado Livre continua usando o
// actor. Só o que o fluxo vivo precisa: iniciar o run, esperar, ler o dataset.
export type ApifyProduct = Record<string, unknown>;

// Drive the Apify actor run explicitly: start the run, poll until it finishes,
// then read the dataset. The synchronous run-sync-get-dataset-items endpoint is
// unreliable for the Mercado Livre scraper — on a cold start it returns 502 or a
// 200 with an EMPTY dataset (the run is aborted before it scrapes), which is what
// made production return "Não encontrei uma opção boa para essa busca".
//
// `waitForFinish` no START (até 60s) faz o POST bloquear até o run terminar: o loop de
// polling abaixo vira só fallback, cortando os ~2-4s de quantização do poll. E
// `memoryMbytes` sobe a CPU do actor (na Apify CPU escala com memória): medido em
// 17/08 no scraper do ML, 1GB = 28,5s vs 4GB = 21,1s — e em actor pay-per-event o
// compute é conta do desenvolvedor, então a memória extra não custa nada pra nós.
type RunApifyOptions = { maxWaitMs?: number; memoryMbytes?: number };

const TERMINAL = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMING-OUT"];

export async function runApifyActor(
  actorId: string,
  token: string,
  input: unknown,
  maxWaitOverride?: number | RunApifyOptions
): Promise<ApifyProduct[] | null> {
  const options: RunApifyOptions =
    typeof maxWaitOverride === "number" ? { maxWaitMs: maxWaitOverride } : maxWaitOverride ?? {};
  const maxWaitMs = options.maxWaitMs ?? Number(process.env.APIFY_MERCADO_LIVRE_MAX_WAIT_MS ?? 90000);
  const startUrl = new URL(`https://api.apify.com/v2/acts/${actorId}/runs`);
  startUrl.searchParams.set("token", token);
  startUrl.searchParams.set("waitForFinish", String(Math.min(60, Math.max(0, Math.floor(maxWaitMs / 1000)))));
  if (options.memoryMbytes) startUrl.searchParams.set("memory", String(options.memoryMbytes));
  const startResponse = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "lia/0.1" },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!startResponse.ok) {
    console.warn("[mercado-livre:apify:start-failed]", startResponse.status, await startResponse.text().catch(() => ""));
    return null;
  }

  const startPayload = (await startResponse.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  const runId = startPayload.data?.id;
  const datasetId = startPayload.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    console.warn("[mercado-livre:apify:no-run-id]");
    return null;
  }

  const pollEveryMs = Number(process.env.APIFY_MERCADO_LIVRE_POLL_MS ?? 2500);
  const deadline = Date.now() + (Number.isFinite(maxWaitMs) ? maxWaitMs : 45000);
  let status = startPayload.data?.status ?? "READY";

  while (!TERMINAL.includes(status) && Date.now() < deadline) {
    await delay(pollEveryMs);
    const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, { cache: "no-store" });
    if (!runResponse.ok) continue;
    const runPayload = (await runResponse.json()) as { data?: { status?: string } };
    status = runPayload.data?.status ?? status;
    if (TERMINAL.includes(status)) break;
  }
  if (!TERMINAL.includes(status)) {
    // Desistimos de um run que ainda está rodando (o resultado chega e ninguém lê).
    // 20/08: era invisível — o diagnóstico só saiu porque o run foi reproduzido à mão.
    console.warn("[ml:apify:wait-timeout]", runId, `status=${status} após ${Math.round(maxWaitMs / 1000)}s`);
  }

  if (status !== "SUCCEEDED") {
    // Still read whatever landed in the dataset — partial real results beat none.
    console.warn("[mercado-livre:apify:run-not-ready]", { runId, status });
  }

  return fetchApifyDatasetItems(datasetId, token);
}

async function fetchApifyDatasetItems(datasetId: string, token: string) {
  const itemsResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true`,
    { cache: "no-store" }
  );
  if (!itemsResponse.ok) {
    console.warn("[mercado-livre:apify:dataset-failed]", itemsResponse.status);
    return null;
  }
  const items = (await itemsResponse.json()) as ApifyProduct[];
  return Array.isArray(items) ? items : [];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
