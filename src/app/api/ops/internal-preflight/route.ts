import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPurchaseJobsForOrder } from "@/lib/purchasing/service";
import { getPurchasePolicy } from "@/lib/purchasing/policy";
import { startPreflightPurchaseWorkflow } from "@/lib/purchasing/workflow-dispatch";
import { getStore } from "@/lib/stores";

export const dynamic = "force-dynamic";

const TEST_NOTE = "INTERNAL_PREFLIGHT_CART_ONLY";
type TestedStore = "oba" | "petz" | "boticario";

const TEST_STORES: Record<TestedStore, { label: string; query: string }> = {
  oba: { label: "Oba Hortifruti", query: "arroz camil 1kg" },
  petz: { label: "Petz", query: "areia para gatos" },
  boticario: { label: "O Boticário", query: "sabonete" }
};
// Confirmed through the public Oba catalog and delivery simulation on 2026-07-19.
// Keeping the test SKU explicit makes this endpoint exercise the Browserbase cart
// and regional freight flow rather than depend on search ranking.
const TEST_ITEM = {
  sku: "oba-live-100004793-seller-1",
  name: "Arroz Camil 1 Kg",
  unitPrice: 5.99,
  productUrl: "https://secure.obahortifruti.com.br/arroz-camil-1kg-100004793/p"
} as const;

function testedStore(value: unknown): TestedStore {
  return value === "petz" || value === "boticario" ? value : "oba";
}

function testNote(store: TestedStore) {
  return `${TEST_NOTE}:${store}`;
}

async function resolveTestItem(store: TestedStore) {
  if (store === "oba") return TEST_ITEM;
  // Do not carry a stale SKU into a live checkout test. Petz and Boticário can change
  // their catalog identifiers, so discover a real product URL (and Boticário bag SKU)
  // through the same Browserbase-backed catalog path used by customer requests.
  const hits = await getStore(store).searchItems(TEST_STORES[store].query, 8);
  const item = hits.find((candidate) => {
    if (!candidate.productUrl?.startsWith("https://")) return false;
    if (store === "petz") return /^petz-live-\d+$/i.test(candidate.sku);
    return /^B[A-Z0-9]+$/i.test(candidate.sku);
  });
  if (!item) throw new Error(`A busca ao vivo da ${TEST_STORES[store].label} não devolveu um SKU exato para o preflight técnico.`);
  return {
    sku: item.sku,
    name: item.name,
    unitPrice: item.unitPrice,
    productUrl: item.productUrl
  };
}

function authed(request: Request) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  if (!expected) return true;
  const url = new URL(request.url);
  const key =
    request.headers.get("x-ops-key") ??
    url.searchParams.get("key") ??
    (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)ops_session=([^;]+)/)?.[1];
  return key === expected;
}

async function recentInternalPreflight(store: TestedStore) {
  return prisma.deliveryOrder.findFirst({
    where: { notes: { contains: testNote(store) }, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
    include: { purchaseJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" }
  });
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const store = testedStore(new URL(request.url).searchParams.get("store"));
  const recent = await recentInternalPreflight(store);
  const job = recent?.purchaseJobs[0];
  if (!recent || !job) return NextResponse.json({ ok: true, status: "not_started" });
  return NextResponse.json({
    ok: true,
    store,
    orderId: recent.id,
    jobId: job.id,
    status: job.status,
    actualTotal: job.actualTotal,
    errorCode: job.lastErrorCode,
    errorMessage: job.lastErrorMessage
  });
}

// A controlled live gate for the retailer Context. This endpoint deliberately has no
// customer inputs: it creates a synthetic order, never sends WhatsApp or a charge, and
// only queues the existing cart_only preflight workflow.
export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { store?: unknown; fresh?: unknown };
  const store = testedStore(body.store);
  const fresh = body.fresh === true;
  const test = TEST_STORES[store];

  const policy = getPurchasePolicy();
  if (!policy.enabled || policy.mode !== "cart_only") {
    return NextResponse.json({ error: "internal preflight requires enabled cart_only mode" }, { status: 409 });
  }

  const recent = await recentInternalPreflight(store);
  if (recent?.purchaseJobs[0]) {
    const job = recent.purchaseJobs[0];
    // Never fork a running Context lease. A completed synthetic run can however
    // be deliberately replaced with a fresh cart so parser/retailer changes are
    // verified against new live evidence rather than an old snapshot.
    if (fresh && job.status !== "preflight_queued" && job.status !== "preflighting") {
      // Fall through and create a new synthetic order below.
    } else {
    // POST is the explicit "run test" action. Reuse and restart a failed recent
    // synthetic job even when an older cached /ops bundle sends no JSON body.
    if (job.status === "needs_human" || job.status === "failed") {
      if (!recent.cep) {
        await prisma.deliveryOrder.update({ where: { id: recent.id }, data: { cep: "01310-100" } });
      }
      const runId = await startPreflightPurchaseWorkflow(job.id);
      console.info("[ops:internal-preflight:retry]", { store, orderId: recent.id, jobId: job.id, runId });
      return NextResponse.json({ ok: true, store, reused: true, retried: true, orderId: recent.id, jobId: job.id, runId });
    }
    console.info("[ops:internal-preflight:status]", {
      store, jobId: job.id,
      status: job.status,
      actualTotal: job.actualTotal,
      errorCode: job.lastErrorCode,
      errorMessage: job.lastErrorMessage
    });
    return NextResponse.json({
      ok: true,
      store, reused: true,
      orderId: recent.id,
      jobId: job.id,
      status: job.status,
      actualTotal: job.actualTotal,
      errorCode: job.lastErrorCode,
      errorMessage: job.lastErrorMessage
    });
    }
  }

  const item = await resolveTestItem(store);
  const phone = `+550099${String(Date.now()).slice(-7)}`;
  const user = await prisma.user.create({ data: { phone, name: "TESTE INTERNO — NÃO COBRAR", cep: "01310-100" } });
  const order = await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      phone,
      customerName: "TESTE INTERNO — NÃO COBRAR",
      // Public test CEP, used only to regionalize the cart. No personal address is
      // stored in this synthetic order.
      cep: "01310-100",
      storeKey: store,
      storeLabel: test.label,
      items: [{ ...item, qty: 1, storeKey: store, storeLabel: test.label }],
      fulfillments: [{ storeKey: store, storeLabel: test.label, deliveryMode: "retailer_delivery" }],
      itemsSubtotal: item.unitPrice,
      courierKey: "retailer_delivery",
      total: 0,
      status: "awaiting_supplier_validation",
      notes: `${testNote(store)}: sem WhatsApp, cobrança ou compra.`
    }
  });
  const [job] = await createPurchaseJobsForOrder(order.id);
  if (!job) return NextResponse.json({ error: "internal order did not create a purchase job" }, { status: 500 });

  const runId = await startPreflightPurchaseWorkflow(job.id);
  console.info("[ops:internal-preflight]", { store, orderId: order.id, jobId: job.id, runId });
  return NextResponse.json({ ok: true, store, orderId: order.id, jobId: job.id, runId });
}
