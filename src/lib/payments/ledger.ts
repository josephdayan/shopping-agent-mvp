// Livro-razão do dinheiro (revisão 02/09). Uma linha `Payment` por pagamento conhecido no
// provedor; o estorno por API grava aqui quanto voltou e com que referência. Este módulo
// não fala com o cliente nem com o operador — só provedor + banco. Quem avisa é o
// cérebro (delivery-service), que chama estas funções.
import { prisma } from "@/lib/prisma";
import { PaymentProviderError, refundMercadoPagoPayment } from "./mercadopago";
import { pagarmeAdapter } from "./pagarme";

export type LedgerProvider = "mercadopago" | "pagarme" | "mock";

export type RecordPaymentInput = {
  deliveryOrderId: string;
  provider: LedgerProvider;
  providerPaymentId: string;
  method: "pix" | "card";
  amountCents: number;
  status: "approved" | "unexpected";
  rawStatus?: string | null;
};

function toCents(value: number) {
  return Math.round(Number(value.toFixed(2)) * 100);
}

// Idempotente por (provedor, id): o replay do webhook não duplica linha.
export async function recordPayment(input: RecordPaymentInput) {
  return prisma.payment.upsert({
    where: { provider_providerPaymentId: { provider: input.provider, providerPaymentId: input.providerPaymentId } },
    create: {
      deliveryOrderId: input.deliveryOrderId,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      method: input.method,
      amountCents: input.amountCents,
      status: input.status,
      rawStatus: input.rawStatus ?? null
    },
    // Um "unexpected" que depois se confirma como o pagamento certo pode virar approved;
    // o contrário nunca (approved não regride).
    update: input.status === "approved" ? { status: "approved", rawStatus: input.rawStatus ?? null } : { rawStatus: input.rawStatus ?? null }
  });
}

export async function paymentsForOrder(deliveryOrderId: string) {
  return prisma.payment.findMany({ where: { deliveryOrderId }, orderBy: { createdAt: "desc" } });
}

export type RefundResult = {
  provider: LedgerProvider;
  providerPaymentId: string;
  amount: number;
  reference: string;
  total: boolean;
};

// Estorna pelo provedor o pagamento aprovado mais recente do pedido (total ou parcial) e
// atualiza o razão. Lança Error com mensagem legível quando não há o que estornar ou o
// provedor recusa — o /ops mostra a mensagem.
export async function refundOrderViaProvider(deliveryOrderId: string, amount?: number): Promise<RefundResult> {
  const payment = await prisma.payment.findFirst({
    where: { deliveryOrderId, status: { in: ["approved", "partially_refunded"] } },
    orderBy: { createdAt: "desc" }
  });
  if (!payment) {
    throw new Error("Nenhum pagamento aprovado registrado no provedor para este pedido — confirme o estorno manualmente.");
  }
  const remainingCents = payment.amountCents - payment.refundedCents;
  const requestedCents = amount == null ? remainingCents : toCents(amount);
  if (!Number.isFinite(requestedCents) || requestedCents <= 0) throw new Error("Valor do estorno inválido.");
  if (requestedCents > remainingCents) {
    throw new Error(`Valor acima do que resta estornar (R$ ${(remainingCents / 100).toFixed(2).replace(".", ",")}).`);
  }
  const total = requestedCents === remainingCents;

  let reference: string;
  if (payment.provider === "mercadopago") {
    const refund = await refundMercadoPagoPayment(payment.providerPaymentId, total && payment.refundedCents === 0 ? undefined : requestedCents / 100);
    reference = `MP refund ${refund.refundId || "?"} (pagamento ${payment.providerPaymentId})`;
  } else if (payment.provider === "pagarme") {
    const refund = await pagarmeAdapter.refundCharge(payment.providerPaymentId, total ? undefined : requestedCents);
    reference = `Pagar.me ${refund.reference} (${refund.status})`;
  } else if (payment.provider === "mock") {
    reference = `mock refund ${payment.providerPaymentId}`;
  } else {
    throw new PaymentProviderError(`provedor desconhecido: ${payment.provider}`);
  }

  const refundedCents = payment.refundedCents + requestedCents;
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedCents,
      refundReference: reference,
      status: refundedCents >= payment.amountCents ? "refunded" : "partially_refunded"
    }
  });
  return { provider: payment.provider as LedgerProvider, providerPaymentId: payment.providerPaymentId, amount: requestedCents / 100, reference, total };
}
