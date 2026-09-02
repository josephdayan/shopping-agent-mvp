// Reconciliação periódica do dinheiro (revisão 02/09). Antes, o único jeito de um
// pagamento aparecer era o webhook chegar (ou o cliente dizer "paguei"), e uma tentativa
// de cartão com desfecho desconhecido ficava `confirmed` para sempre. Este módulo é
// chamado pelo cron (/api/cron/reconcile-payments) e é seguro de repetir: cada efeito é
// idempotente (flip atômico do pedido, marcador em nota, status da tentativa).
import { prisma } from "@/lib/prisma";
import { getMercadoPagoPayment } from "./mercadopago";
import { reconcilePagarmeOrder, reportCardChargeOutcomeUnknown } from "./whatsapp-pay";

export type ReconcileReport = {
  attemptsChecked: number;
  attemptsUnknown: number;
  pixApproved: number;
  pixExpired: number;
  errors: string[];
};

const ATTEMPT_STALE_MS = 5 * 60_000;
const ATTEMPT_UNKNOWN_MS = 60 * 60_000;
const PIX_LOOKBACK_MS = 48 * 60 * 60_000;
export const PIX_EXPIRED_MARKER = "⏰ PIX EXPIROU";

export async function reconcilePayments(now = new Date()): Promise<ReconcileReport> {
  const report: ReconcileReport = { attemptsChecked: 0, attemptsUnknown: 0, pixApproved: 0, pixExpired: 0, errors: [] };
  const brain = await import("@/lib/delivery-service");

  // 1) Cartão salvo: tentativa confirmada há mais de 5 min sem desfecho.
  const stale = await prisma.paymentAttempt.findMany({
    where: { status: "confirmed", confirmedAt: { lt: new Date(now.getTime() - ATTEMPT_STALE_MS) } },
    orderBy: { confirmedAt: "asc" },
    take: 50
  });
  for (const attempt of stale) {
    report.attemptsChecked += 1;
    try {
      if (attempt.providerOrderId) {
        await reconcilePagarmeOrder({ attemptId: attempt.id });
        continue;
      }
      // Sem id no provedor depois de 1h = a cobrança pode ter saído sem resposta ou
      // nunca ter saído. Ninguém adivinha: vira desfecho desconhecido + alerta humano.
      if (attempt.confirmedAt && attempt.confirmedAt.getTime() < now.getTime() - ATTEMPT_UNKNOWN_MS) {
        await reportCardChargeOutcomeUnknown(attempt.id, "sem id do provedor 1h após a confirmação");
        report.attemptsUnknown += 1;
      }
    } catch (error) {
      report.errors.push(`attempt ${attempt.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 2) Pix aguardando: consulta o MP (aprovado sem webhook → paga com evidência; vencido →
  // avisa o cliente UMA vez e limpa o código pra "pix" gerar outro).
  const waiting = await prisma.deliveryOrder.findMany({
    where: { status: "awaiting_payment", pixId: { not: null }, updatedAt: { gt: new Date(now.getTime() - PIX_LOOKBACK_MS) } },
    orderBy: { updatedAt: "asc" },
    take: 50
  });
  for (const order of waiting) {
    const pixId = order.pixId ?? "";
    if (!/^\d{1,20}$/.test(pixId)) continue; // link de cartão (preferência) ou mock
    if ((order.notes ?? "").includes(`${PIX_EXPIRED_MARKER} (${pixId})`)) continue;
    try {
      const details = await getMercadoPagoPayment(pixId);
      if (!details) continue;
      if (details.status === "approved") {
        await brain.markDeliveryOrderPaid(order.id, { provider: "mercadopago", paymentId: details.id, amount: details.amount });
        report.pixApproved += 1;
      } else if (details.status === "cancelled" || details.status === "expired" || details.status === "rejected") {
        await brain.markPixExpired(order.id, pixId);
        report.pixExpired += 1;
      }
    } catch (error) {
      report.errors.push(`order ${order.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return report;
}
