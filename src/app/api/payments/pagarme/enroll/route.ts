import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeCardEnrollmentSession, isCardEnrollmentAvailable } from "@/lib/payments/card-enrollment";
import { pagarmeAdapter } from "@/lib/payments/pagarme";
import { chargeConfirmedPaymentAttempt, expireOpenPaymentAttempts } from "@/lib/payments/whatsapp-pay";
import { startConfirmedCardAttemptWorkflow } from "@/lib/payments/whatsapp-pay-dispatch";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(20),
  cardToken: z.string().min(6),
  name: z.string().trim().min(3).max(64),
  email: z.string().trim().email().max(64),
  cpf: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 11, "CPF inválido"),
  address: z.object({
    line1: z.string().trim().min(5).max(256),
    line2: z.string().trim().max(128).optional(),
    zipCode: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 8, "CEP inválido"),
    city: z.string().trim().min(2).max(64),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    country: z.literal("BR").default("BR")
  }),
  consent: z.literal(true)
});

export async function POST(request: Request) {
  if (!isCardEnrollmentAvailable()) {
    return NextResponse.json({ ok: false, error: "Pagamento por cartão ainda não está disponível." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Dados do cartão incompletos." }, { status: 400 });
  const input = parsed.data;

  const session = await consumeCardEnrollmentSession(input.sessionId, input.sessionToken);
  if (!session || session.deliveryOrder.status !== "awaiting_payment") {
    return NextResponse.json({ ok: false, error: "Esse link expirou. Volte ao WhatsApp e peça o pagamento novamente." }, { status: 410 });
  }

  try {
    const customer = await pagarmeAdapter.createCustomer({
      code: `lia_${session.userId}`,
      name: input.name,
      email: input.email,
      document: input.cpf,
      phone: session.deliveryOrder.phone,
      address: input.address
    });
    const card = await pagarmeAdapter.createCard({ customerId: customer.id, token: input.cardToken, address: input.address });
    if (!card.id || !card.last4) throw new Error("Pagar.me não retornou a credencial do cartão");

    const existing = await prisma.paymentCredential.findUnique({
      where: { provider_providerCardId: { provider: "pagarme", providerCardId: card.id } }
    });
    if (existing && existing.userId !== session.userId) {
      throw new Error("Esse cartão já está associado a outro cliente");
    }
    const credential = existing
      ? await prisma.paymentCredential.update({
          where: { id: existing.id },
          data: {
            providerCustomerId: customer.id,
            last4: card.last4,
            brand: card.brand,
            status: "active",
            consentAt: new Date(),
            consentVersion: "wa-one-click-v1"
          }
        })
      : await prisma.paymentCredential.create({
          data: {
            userId: session.userId,
            provider: "pagarme",
            providerCustomerId: customer.id,
            providerCardId: card.id,
            last4: card.last4,
            brand: card.brand,
            consentAt: new Date(),
            consentVersion: "wa-one-click-v1"
          }
        });

    await prisma.user.update({
      where: { id: session.userId },
      data: { name: input.name, email: input.email }
    });
    await expireOpenPaymentAttempts(session.deliveryOrderId);
    const attempt = await prisma.paymentAttempt.create({
      data: {
        deliveryOrderId: session.deliveryOrderId,
        credentialId: credential.id,
        amountCents: Math.round(session.deliveryOrder.total * 100),
        status: "confirmed",
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    try {
      const runId = await startConfirmedCardAttemptWorkflow(attempt.id);
      return NextResponse.json({ ok: true, status: "processing", attemptId: attempt.id, runId });
    } catch (workflowError) {
      // Starting a workflow is normally instantaneous. If its control plane is
      // temporarily unavailable, make one idempotent attempt rather than losing the
      // customer's first purchase after their single-use card token was accepted.
      console.error("[pagarme:enroll:workflow-start]", workflowError);
      try {
        const result = await chargeConfirmedPaymentAttempt(attempt.id);
        if ("charged" in result && result.charged === false) {
          return NextResponse.json({ ok: false, error: "Não consegui aprovar esse cartão. Confira a mensagem no WhatsApp para escolher outra forma de pagamento." }, { status: 422 });
        }
        return NextResponse.json({ ok: true, status: "processing", attemptId: attempt.id, fallback: true, result });
      } catch (chargeError) {
        // The request may have reached Pagar.me even though the response was lost.
        // The one-use session must never invite a second submission in this case;
        // reconciliation via webhook will settle this same PaymentAttempt.
        console.error("[pagarme:enroll:charge-outcome-unknown]", chargeError);
        return NextResponse.json({ ok: true, status: "processing", attemptId: attempt.id, fallback: true, pendingReconciliation: true });
      }
    }
  } catch (error) {
    console.error("[pagarme:enroll]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Não consegui cadastrar esse cartão. Volte ao WhatsApp e tente novamente." }, { status: 422 });
  }
}
