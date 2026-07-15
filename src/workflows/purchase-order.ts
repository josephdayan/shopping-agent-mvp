import { createHook, getStepMetadata, sleep } from "workflow";
import { canAutoPurchase } from "@/lib/purchasing/policy";
import { autoApprovePurchaseJob, placeApprovedPurchaseJob, preflightPurchaseJob, revalidatePurchaseJob, requestPurchaseApproval } from "@/lib/purchasing/service";
import { purchaseApprovalToken } from "@/lib/purchasing/workflow-tokens";
import { PURCHASE_JOB_STATUS } from "@/lib/purchasing/types";

export async function preflightPurchaseWorkflow(jobId: string) {
  "use workflow";
  // A Browserbase Context is one physical retailer cart. Wait durably for the
  // previous approved cart to finish instead of racing and mixing two orders.
  for (let queueAttempt = 0; queueAttempt < 60; queueAttempt += 1) {
    const result = await runPreflight(jobId);
    if (result.status !== PURCHASE_JOB_STATUS.PREFLIGHT_QUEUED || result.lastErrorCode !== "RETAILER_BUSY") {
      if (result.status === PURCHASE_JOB_STATUS.CART_READY) await issueCustomerPaymentWhenOrderIsReady(jobId);
      return result;
    }
    await sleep("1m");
  }
  return { status: PURCHASE_JOB_STATUS.PREFLIGHT_QUEUED, cartHash: null, lastErrorCode: "RETAILER_BUSY" };
}

async function issueCustomerPaymentWhenOrderIsReady(jobId: string) {
  "use step";
  const [{ getPurchaseJobForOps }, { issueDeferredOrderPayment }] = await Promise.all([
    import("@/lib/purchasing/service"),
    import("@/lib/delivery-service")
  ]);
  const job = await getPurchaseJobForOps(jobId);
  if (!job) throw new Error("Purchase job not found while issuing deferred payment.");
  return issueDeferredOrderPayment(job.deliveryOrderId);
}

async function runPreflight(jobId: string) {
  "use step";
  console.log(`[purchase:preflight] start job=${jobId}`);
  const result = await preflightPurchaseJob(jobId);
  console.log(`[purchase:preflight] done job=${jobId} status=${result.status}`);
  return { status: result.status, cartHash: result.cartHash, lastErrorCode: result.lastErrorCode };
}

export async function purchaseOrderWorkflow(jobId: string) {
  "use workflow";
  const revalidated = await runRevalidation(jobId);
  if (revalidated.status !== PURCHASE_JOB_STATUS.CART_READY || !revalidated.cartHash) return { status: revalidated.status };

  const auto = await checkAutoPurchase(jobId);
  if (auto.allowed) {
    await approveAutomatically(jobId);
    return placePurchase(jobId);
  }

  const requested = await requestApproval(jobId);
  if (!requested.cartHash) return { status: requested.status };
  using hook = createHook<{ approvedBy: string }>({ token: purchaseApprovalToken(jobId, requested.cartHash) });
  const approval = await hook;
  if (!approval.approvedBy) return { status: "approval_rejected" };
  return placePurchase(jobId);
}

async function runRevalidation(jobId: string) {
  "use step";
  console.log(`[purchase:revalidate] start job=${jobId}`);
  const result = await revalidatePurchaseJob(jobId);
  console.log(`[purchase:revalidate] done job=${jobId} status=${result.status}`);
  return { status: result.status, cartHash: result.cartHash };
}

async function checkAutoPurchase(jobId: string) {
  "use step";
  const { getPurchaseJobForOps } = await import("@/lib/purchasing/service");
  const job = await getPurchaseJobForOps(jobId);
  if (!job?.cartSnapshot) return { allowed: false, reason: "snapshot_missing" };
  return canAutoPurchase({ snapshot: job.cartSnapshot as never, expectedTotal: job.expectedTotal });
}

async function requestApproval(jobId: string) {
  "use step";
  console.log(`[purchase:approval] request job=${jobId}`);
  return requestPurchaseApproval(jobId);
}

async function approveAutomatically(jobId: string) {
  "use step";
  console.log(`[purchase:approval] policy approval job=${jobId}`);
  return autoApprovePurchaseJob(jobId);
}

async function placePurchase(jobId: string) {
  "use step";
  const { stepId } = getStepMetadata();
  console.log(`[purchase:place] start job=${jobId} step=${stepId}`);
  const result = await placeApprovedPurchaseJob(jobId, `workflow:${stepId}`);
  console.log(`[purchase:place] done job=${jobId} status=${result.status}`);
  return { status: result.status, storeOrderNumber: result.storeOrderNumber };
}
