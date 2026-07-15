import { prisma } from "@/lib/prisma";
import type { PaymentConfirmation } from "@/lib/adapters/whatsapp";

export async function startWhatsAppCardChargeWorkflow(confirmation: PaymentConfirmation) {
  const [{ start }, { chargeWhatsAppCardWorkflow }] = await Promise.all([
    import("workflow/api"),
    import("@/workflows/charge-whatsapp-card")
  ]);
  const run = await start(chargeWhatsAppCardWorkflow, [confirmation]);
  await prisma.paymentAttempt.updateMany({
    where: { id: confirmation.referenceId, status: { in: ["pending", "confirmed"] } },
    data: { workflowRunId: run.runId }
  });
  return run.runId;
}

export async function startConfirmedCardAttemptWorkflow(attemptId: string) {
  const [{ start }, { chargeConfirmedCardAttemptWorkflow }] = await Promise.all([
    import("workflow/api"),
    import("@/workflows/charge-whatsapp-card")
  ]);
  const run = await start(chargeConfirmedCardAttemptWorkflow, [attemptId]);
  await prisma.paymentAttempt.updateMany({
    where: { id: attemptId, status: "confirmed" },
    data: { workflowRunId: run.runId }
  });
  return run.runId;
}
