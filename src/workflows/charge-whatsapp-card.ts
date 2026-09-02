import type { PaymentConfirmation } from "@/lib/adapters/whatsapp";
import { sleep } from "workflow";

// The confirmation webhook returns quickly. The actual PSP request is a durable
// sequence: if Vercel restarts after Meta's event but before Pagar.me responds, the
// same attempt id is retried and Pagar.me's Idempotency-Key returns the same order.
export async function chargeWhatsAppCardWorkflow(confirmation: PaymentConfirmation) {
  "use workflow";
  const claim = await claimConfirmation(confirmation);
  if (!claim.claimed) {
    // Reentrada do step (revisão 02/09): o claim persistiu no banco mas o resultado não
    // — a re-execução via "duplicate" e saía SEM cobrar, deixando a tentativa confirmada
    // órfã. A cobrança é idempotente pelo attemptId (Pagar.me), então seguir é seguro.
    if (claim.reason === "duplicate") return chargeAttemptWithRetry(confirmation.referenceId);
    return claim;
  }
  return chargeAttemptWithRetry(claim.attemptId);
}

// First purchase has no native Meta confirmation yet: the customer consented on the
// card-enrollment page, which creates an already-confirmed attempt and starts here.
export async function chargeConfirmedCardAttemptWorkflow(attemptId: string) {
  "use workflow";
  return chargeAttemptWithRetry(attemptId);
}

async function claimConfirmation(confirmation: PaymentConfirmation) {
  "use step";
  const { claimPaymentConfirmation } = await import("@/lib/payments/whatsapp-pay");
  console.log(`[whatsapp-card:claim] attempt=${confirmation.referenceId}`);
  return claimPaymentConfirmation(confirmation);
}

async function chargeAttempt(attemptId: string) {
  "use step";
  const { chargeConfirmedPaymentAttempt } = await import("@/lib/payments/whatsapp-pay");
  console.log(`[whatsapp-card:charge] attempt=${attemptId}`);
  return chargeConfirmedPaymentAttempt(attemptId);
}

async function flagUnknownOutcome(attemptId: string, detail: string) {
  "use step";
  const { reportCardChargeOutcomeUnknown } = await import("@/lib/payments/whatsapp-pay");
  console.error(`[whatsapp-card:unknown-outcome] attempt=${attemptId} ${detail}`);
  return reportCardChargeOutcomeUnknown(attemptId, detail);
}

async function chargeAttemptWithRetry(attemptId: string) {
  // A lost HTTP response is exactly when a PSP idempotency key matters. Retry the
  // same durable step and the same Pagar.me key a few times before surfacing an
  // operational failure; never create another PaymentAttempt for this order.
  for (let retry = 0; retry < 5; retry += 1) {
    try {
      return await chargeAttempt(attemptId);
    } catch (error) {
      if (retry === 4) {
        // Esgotou (revisão 02/09): antes só relançava e a tentativa ficava confirmada
        // em silêncio. Agora vira desfecho desconhecido com alerta humano.
        await flagUnknownOutcome(attemptId, `5 tentativas falharam: ${error instanceof Error ? error.message.slice(0, 200) : "erro"}`);
        throw error;
      }
      await sleep("30s");
    }
  }
  throw new Error("unreachable");
}
