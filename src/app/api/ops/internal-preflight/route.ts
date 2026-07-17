import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPurchaseJobsForOrder } from "@/lib/purchasing/service";
import { getPurchasePolicy } from "@/lib/purchasing/policy";
import { startPreflightPurchaseWorkflow } from "@/lib/purchasing/workflow-dispatch";

export const dynamic = "force-dynamic";

const TEST_NOTE = "INTERNAL_PREFLIGHT_CART_ONLY";
const TEST_STORE_LABEL = "Carrefour";
// Confirmed on the live Carrefour search page on 2026-07-16. Keeping the test SKU
// explicit makes this endpoint exercise checkout rather than depend on search ranking.
const TEST_ITEM = {
  sku: "crf-live-3053",
  name: "Detergente Líquido com Glicerina Cristal Limpol Squeeze 500ml",
  unitPrice: 1.99,
  productUrl: "https://mercado.carrefour.com.br/produto/detergente-liquido-com-glicerina-cristal-limpol-squeeze-500ml-3053"
} as const;

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

async function recentInternalPreflight() {
  return prisma.deliveryOrder.findFirst({
    where: { notes: { contains: TEST_NOTE }, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
    include: { purchaseJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" }
  });
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const recent = await recentInternalPreflight();
  const job = recent?.purchaseJobs[0];
  if (!recent || !job) return NextResponse.json({ ok: true, status: "not_started" });
  return NextResponse.json({
    ok: true,
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
  await request.json().catch(() => ({}));

  const policy = getPurchasePolicy();
  if (!policy.enabled || policy.mode !== "cart_only") {
    return NextResponse.json({ error: "internal preflight requires enabled cart_only mode" }, { status: 409 });
  }

  const recent = await recentInternalPreflight();
  if (recent?.purchaseJobs[0]) {
    const job = recent.purchaseJobs[0];
    // POST is the explicit "run test" action. Reuse and restart a failed recent
    // synthetic job even when an older cached /ops bundle sends no JSON body.
    if (job.status === "needs_human" || job.status === "failed") {
      if (!recent.cep) {
        await prisma.deliveryOrder.update({ where: { id: recent.id }, data: { cep: "01310-100" } });
      }
      const runId = await startPreflightPurchaseWorkflow(job.id);
      console.info("[ops:internal-preflight:retry]", { orderId: recent.id, jobId: job.id, runId });
      return NextResponse.json({ ok: true, reused: true, retried: true, orderId: recent.id, jobId: job.id, runId });
    }
    console.info("[ops:internal-preflight:status]", {
      jobId: job.id,
      status: job.status,
      actualTotal: job.actualTotal,
      errorCode: job.lastErrorCode,
      errorMessage: job.lastErrorMessage
    });
    return NextResponse.json({
      ok: true,
      reused: true,
      orderId: recent.id,
      jobId: job.id,
      status: job.status,
      actualTotal: job.actualTotal,
      errorCode: job.lastErrorCode,
      errorMessage: job.lastErrorMessage
    });
  }

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
      storeKey: "carrefour",
      storeLabel: TEST_STORE_LABEL,
      items: [{ ...TEST_ITEM, qty: 1, storeKey: "carrefour", storeLabel: TEST_STORE_LABEL }],
      fulfillments: [{ storeKey: "carrefour", storeLabel: TEST_STORE_LABEL, deliveryMode: "retailer_delivery" }],
      itemsSubtotal: TEST_ITEM.unitPrice,
      courierKey: "retailer_delivery",
      total: 0,
      status: "awaiting_supplier_validation",
      notes: `${TEST_NOTE}: sem WhatsApp, cobrança ou compra.`
    }
  });
  const [job] = await createPurchaseJobsForOrder(order.id);
  if (!job) return NextResponse.json({ error: "internal order did not create a purchase job" }, { status: 500 });

  const runId = await startPreflightPurchaseWorkflow(job.id);
  console.info("[ops:internal-preflight]", { orderId: order.id, jobId: job.id, runId });
  return NextResponse.json({ ok: true, orderId: order.id, jobId: job.id, runId });
}
