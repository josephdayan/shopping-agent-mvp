import { prisma } from "@/lib/prisma";

// Dynamic imports avoid a module cycle: workflows call the purchase service, while
// normal request handlers only need to enqueue a workflow after committing the job.
export async function startPreflightPurchaseWorkflow(jobId: string) {
  const [{ start }, { preflightPurchaseWorkflow }] = await Promise.all([import("workflow/api"), import("@/workflows/purchase-order")]);
  const run = await start(preflightPurchaseWorkflow, [jobId]);
  await prisma.purchaseJob.update({ where: { id: jobId }, data: { workflowRunId: run.runId } });
  return run.runId;
}

export async function startPurchaseOrderWorkflow(jobId: string) {
  const [{ start }, { purchaseOrderWorkflow }] = await Promise.all([import("workflow/api"), import("@/workflows/purchase-order")]);
  const run = await start(purchaseOrderWorkflow, [jobId]);
  await prisma.purchaseJob.update({ where: { id: jobId }, data: { workflowRunId: run.runId } });
  return run.runId;
}
