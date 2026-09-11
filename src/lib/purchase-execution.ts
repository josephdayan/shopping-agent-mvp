import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { purchaseUrlAllowed, PURCHASE_DOMAINS } from "./purchase-preparation";
import {
  claimNextPurchaseJob,
  purchaseCartHash,
  workerPayload,
} from "./purchase-worker";
import { notifyOperator } from "./turn-runtime";
import { recordDeliveryEvent } from "./delivery-events";
import { Prisma } from "@prisma/client";
import { automaticPurchaseDecision, automaticPurchaseStores, AUTO_PURCHASE_POLICY, purchaseBudgetDay } from "./purchase-policy";

export const checkoutEvidenceSchema = z
  .object({
    checkoutUrl: z.string().url(),
    cartHash: z.string().length(64),
    recipientName: z.string().min(1).max(300),
    accountEmail: z.string().email(),
    destination: z.string().min(5).max(1000),
    postalCode: z.string().min(8).max(10),
    deliveryOption: z.string().min(1).max(300),
    deliveryPromise: z.string().max(300),
    // Meio de pagamento observado no checkout. pix_store: a loja gera o Pix e o servidor
    // paga por API bancária (Fase 3); ml_balance: saldo Mercado Pago confirmado pelo dono
    // no app (ML degrau C); card_saved: cartão corporativo salvo (legado, em aposentadoria).
    payment: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("pix_store"), paymentSystem: z.literal(125) }).strict(),
      z.object({ kind: z.literal("ml_balance") }).strict(),
      z.object({ kind: z.literal("card_saved"), reference: z.string().length(64) }).strict(),
    ]),
    observedAt: z.string().datetime(),
    items: z
      .array(
        z
          .object({
            sku: z.string().min(1),
            retailerSku: z.string().min(1),
            seller: z.string().min(1),
            name: z.string().min(1).max(300),
            qty: z.number().int().positive(),
            unitPriceCents: z.number().int().positive(),
            lineTotalCents: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    freightCents: z.number().int().nonnegative(),
    totalCents: z.number().int().positive(),
  })
  .strict();
export type CheckoutEvidence = z.infer<typeof checkoutEvidenceSchema>;
export type CheckoutPayment = CheckoutEvidence["payment"];
export const PAYMENT_KIND_LABEL: Record<CheckoutPayment["kind"], string> = {
  pix_store: "Pix da loja pago pela Lia",
  ml_balance: "Saldo Mercado Pago (confirmação no app)",
  card_saved: "Cartão corporativo salvo",
};
// Evidência gravada antes de 11/09 (paymentLabel literal) não é mais válida: o job vai
// para revisão com motivo legível em vez de derrubar a rota.
export function parseStoredEvidence(value: unknown): CheckoutEvidence {
  const parsed = checkoutEvidenceSchema.safeParse(value);
  if (!parsed.success) throw new Error("Conferência antiga; refaça o carrinho na loja.");
  return parsed.data;
}
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\W/g, "");
const dollars = (v: number) => Math.round(v * 100);
export function checkoutDigest(e: CheckoutEvidence) {
  const { observedAt: _observedAt, ...fixed } = e;
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...fixed,
        items: [...fixed.items].sort((a, b) => a.sku.localeCompare(b.sku)),
      }),
    )
    .digest("hex");
}
function promiseOf(value: unknown) {
  return Array.isArray(value)
    ? value
        .flatMap((v) =>
          typeof v?.deliveryPromise === "string" ? [v.deliveryPromise] : [],
        )
        .join(" · ")
    : "";
}
export function checkCheckout(
  order: {
    items: unknown;
    deliveryAddress: string | null;
    customerName?: string | null;
    cep: string | null;
    deliveryFee: number;
    itemsSubtotal: number;
    fulfillments: unknown;
  },
  e: CheckoutEvidence,
) {
  const items = order.items as {
    sku: string;
    qty: number;
    unitPrice: number;
    storeKey: string;
    productUrl?: string;
  }[];
  if (
    !Array.isArray(items) ||
    !items.length ||
    new Set(items.map((i) => i.storeKey)).size !== 1
  )
    throw new Error("Cesta exige conferência manual.");
  if (!purchaseUrlAllowed(items[0].storeKey, e.checkoutUrl))
    throw new Error("Checkout fora da loja do pedido.");
  const hash = purchaseCartHash(
    items.map((i) => ({ ...i, name: "", storeLabel: "" })),
    order.deliveryFee,
    promiseOf(order.fulfillments) || undefined,
    order,
  );
  if (!order.customerName || norm(e.recipientName) !== norm(order.customerName))
    throw new Error("Destinatário mudou.");
  if (
    e.cartHash !== hash ||
    norm(e.destination) !== norm(order.deliveryAddress ?? "") ||
    norm(e.postalCode) !== norm(order.cep ?? "")
  )
    throw new Error("Endereço ou cesta mudou.");
  if (
    new Set(e.items.map((i) => i.sku)).size !== e.items.length ||
    items.length !== e.items.length ||
    items.some((i) => !e.items.some((j) => j.sku === i.sku && j.qty === i.qty))
  )
    throw new Error("Produtos/quantidades divergentes.");
  if (e.items.some((i) => i.lineTotalCents !== i.unitPriceCents * i.qty))
    throw new Error("Preço por quantidade precisa de revisão.");
  if (
    e.totalCents !==
    e.items.reduce((a, i) => a + i.lineTotalCents, 0) + e.freightCents
  )
    throw new Error("Total do checkout não fecha.");
  if (e.totalCents > dollars(order.itemsSubtotal + order.deliveryFee))
    throw new Error("Total da loja acima do teto do pedido.");
  const expectedPromise = promiseOf(order.fulfillments);
  if (expectedPromise && norm(e.deliveryPromise) !== norm(expectedPromise))
    throw new Error("Modalidade/prazo diferente do escolhido.");
  const age = Date.now() - Date.parse(e.observedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 120_000)
    throw new Error("Conferência do checkout vencida.");
}
async function funding(tx: Prisma.TransactionClient, id: string) {
  const order = await tx.deliveryOrder.findUniqueOrThrow({
    where: { id },
    include: { payments: true, paymentAttempts: true },
  });
  const real = order.payments.filter((p) =>
    ["mercadopago", "pagarme"].includes(p.provider),
  );
  if (
    order.status !== "paid" ||
    order.storeOrderNumber ||
    /🛑|ESTORNO|CANCELAMENTO/.test(order.notes ?? "") ||
    !real.length ||
    real.some((p) => p.status !== "approved" || p.refundedCents !== 0) ||
    real.reduce((a, p) => a + p.amountCents, 0) !== dollars(order.total) ||
    order.paymentAttempts.some((p) => p.status === "unknown_outcome")
  )
    throw new Error("Pagamento/pedido exige revisão antes da compra.");
  return order;
}
async function owned(
  tx: Prisma.TransactionClient,
  jobId: string,
  workerId: string,
  token: string,
) {
  await tx.$queryRaw`SELECT id FROM "PurchaseJob" WHERE id = ${jobId} FOR UPDATE`;
  const job = await tx.purchaseJob.findUniqueOrThrow({ where: { id: jobId } });
  if (
    !token ||
    job.claimToken !== token ||
    job.browserSessionId !== workerId ||
    !job.lockedAt ||
    job.lockedAt.getTime() < Date.now() - 120_000
  )
    throw new Error("Reserva do comprador vencida ou inválida.");
  return job;
}
export const PURCHASE_AUTH_KINDS = ["none", "email_code", "totp"] as const;
export const PURCHASE_PAYMENT_KINDS = ["card", "pix_out", "ml_balance"] as const;
export async function savePurchaseAccount(input: {
  storeKey: string;
  email?: string;
  loginReady: boolean;
  paymentReady: boolean;
  enabled: boolean;
  authKind?: (typeof PURCHASE_AUTH_KINDS)[number];
  paymentKind?: (typeof PURCHASE_PAYMENT_KINDS)[number];
}) {
  if (!PURCHASE_DOMAINS[input.storeKey])
    throw new Error("Loja ainda não suportada pelo comprador.");
  if (
    input.enabled &&
    (!input.loginReady || !input.paymentReady || !input.email?.trim())
  )
    throw new Error("Conclua login e pagamento da empresa antes de ativar.");
  // O Mercado Livre paga com saldo Mercado Pago; nas VTEX o cartão salvo está em
  // aposentadoria — o meio novo é o Pix da loja pago pela Lia.
  const paymentKind = input.paymentKind ?? (input.storeKey === "mercadolivre" ? "ml_balance" : "card");
  if (input.storeKey === "mercadolivre" && paymentKind !== "ml_balance")
    throw new Error("Mercado Livre só paga com saldo Mercado Pago.");
  const data = { ...input, paymentKind, authKind: input.authKind ?? "none" };
  return prisma.purchaseAccount.upsert({
    where: { storeKey: input.storeKey },
    create: { ...data, label: input.storeKey },
    update: data,
  });
}
export async function claimPurchaseSession(workerId: string, stores: string[]) {
  const automaticStores = automaticPurchaseStores();
  const accounts = await prisma.purchaseAccount.findMany({
    where: {
      storeKey: { in: automaticStores.length ? stores.filter(s => automaticStores.includes(s)) : stores },
      enabled: true,
      loginReady: true,
      paymentReady: true,
    },
  });
  if (!accounts.length) return null;
  const job = await claimNextPurchaseJob(
    workerId,
    accounts.map((a) => a.storeKey),
  );
  if (!job) return null;
  const token = randomUUID();
  await prisma.purchaseJob.update({
    where: { id: job.id },
    data: { claimToken: token, lockedAt: new Date() },
  });
  await prisma.purchaseAccount.update({
    where: { storeKey: job.storeKey },
    data: { lastSeenAt: new Date() },
  });
  return {
    ...workerPayload(job),
    status: job.status,
    claimToken: token,
    accountEmail: accounts.find((a) => a.storeKey === job.storeKey)?.email,
  };
}
export async function purchaseHeartbeat(
  jobId: string,
  workerId: string,
  token: string,
) {
  return prisma.$transaction(async (tx) => {
    const job = await owned(tx, jobId, workerId, token);
    if (
      !["claimed", "awaiting_approval", "approved", "submitting"].includes(
        job.status,
      )
    )
      throw new Error("Compra pausada ou encerrada.");
    const updated = await tx.purchaseJob.update({
      where: { id: job.id },
      data: { lockedAt: new Date() },
    });
    return {
      status: updated.status,
      checkoutHash: updated.checkoutHash,
      approvalExpiresAt: updated.approvalExpiresAt,
    };
  });
}
export async function stageCheckout(
  jobId: string,
  workerId: string,
  token: string,
  e: CheckoutEvidence,
) {
  const base = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  const staged = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${base.deliveryOrderId} FOR UPDATE`;
    const job = await owned(tx, jobId, workerId, token);
    if (!["claimed", "awaiting_approval", "approved"].includes(job.status))
      throw new Error("Não é possível substituir uma conferência já aprovada.");
    const order = await funding(tx, job.deliveryOrderId);
    checkCheckout(order, e);
    const account = await tx.purchaseAccount.findUnique({
      where: { storeKey: job.storeKey },
    });
    if (
      !account?.enabled || !account.loginReady || !account.paymentReady ||
      account.email?.trim().toLowerCase() !==
        e.accountEmail.trim().toLowerCase()
    )
      throw new Error("Checkout não está na conta operacional configurada.");
    const digest = checkoutDigest(e);
    const automaticReason = await automaticPurchaseDecision(tx, job.storeKey, e.totalCents);
    if (!automaticReason) {
      await tx.purchaseJob.update({
        where: { id: job.id },
        data: {
          status: "approved", checkoutEvidence: e, checkoutHash: digest,
          checkoutExpiresAt: new Date(Date.now() + 120_000),
          approvalStatus: "approved", approvedBy: AUTO_PURCHASE_POLICY,
          approvedAt: new Date(), approvalCartHash: digest,
          approvalMaxTotal: e.totalCents / 100,
          approvalExpiresAt: new Date(Date.now() + 60_000), lockedAt: new Date(),
          lastErrorCode: null, lastErrorMessage: null,
        },
      });
      return { checkoutHash: digest, notify: false, readyToSubmit: true };
    }
    if (
      job.status === "approved" &&
      job.approvedBy !== AUTO_PURCHASE_POLICY &&
      job.approvalStatus === "approved" &&
      job.approvalCartHash === digest
    ) {
      // O tempo curto é da leitura atual da loja, nunca da resposta do operador.
      await tx.purchaseJob.update({
        where: { id: job.id },
        data: {
          checkoutEvidence: e,
          checkoutExpiresAt: new Date(Date.now() + 120_000),
          approvalExpiresAt: new Date(Date.now() + 60_000),
          lockedAt: new Date(),
        },
      });
      return { checkoutHash: digest, notify: false, readyToSubmit: true };
    }

    await tx.purchaseJob.update({
      where: { id: job.id },
      data: {
        status: "awaiting_approval",
        checkoutEvidence: e,
        checkoutHash: digest,
        checkoutExpiresAt: null,
        approvalStatus: "requested",
        approvalCartHash: null,
        approvedBy: null,
        approvedAt: null,
        approvalExpiresAt: null,
        lockedAt: new Date(),
        lastErrorMessage: automaticReason,
      },
    });
    return {
      checkoutHash: digest,
      readyToSubmit: false,
      notify: job.status !== "awaiting_approval" || job.checkoutHash !== digest,
    };
  });
  if (staged.notify)
    await notifyOperator(
      `Carrinho #${base.deliveryOrderId.slice(-6).toUpperCase()} pronto: R$ ${(e.totalCents / 100).toFixed(2).replace(".", ",")}. Confira e autorize em ${(process.env.LIA_PUBLIC_URL ?? "https://liadelivery.com.br").replace(/\/$/, "")}/ops. Você pode aprovar quando puder; vamos conferir novamente antes de comprar.`,
    );
  return {
    checkoutHash: staged.checkoutHash,
    readyToSubmit: staged.readyToSubmit,
  };
}

export async function approveCheckout(jobId: string, hash: string) {
  const base = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${base.deliveryOrderId} FOR UPDATE`;
    const job = await tx.purchaseJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    if (
      job.status !== "awaiting_approval" ||
      !hash ||
      job.checkoutHash !== hash
    )
      throw new Error("O carrinho mudou. Confira o resumo atualizado.");
    const order = await funding(tx, job.deliveryOrderId);
    const evidence = parseStoredEvidence(job.checkoutEvidence);
    checkCheckout(order, { ...evidence, observedAt: new Date().toISOString() });
    return tx.purchaseJob.update({
      where: { id: jobId },
      data: {
        status: "approved",
        approvalStatus: "approved",
        approvedBy: "ops_session",
        approvedAt: new Date(),
        approvalExpiresAt: null,
        approvalCartHash: hash,
        approvalMaxTotal: evidence.totalCents / 100,
      },
    });
  });
}
// Só chamado após o navegador esvaziar o próprio carrinho e fechar o perfil.
// O pedido/aprovação ficam persistidos; outra compra pode usar a conta enquanto espera.
export async function parkCheckout(
  jobId: string,
  workerId: string,
  token: string,
) {
  const base = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${base.deliveryOrderId} FOR UPDATE`;
    const job = await owned(tx, jobId, workerId, token);
    if (
      !["awaiting_approval", "approved"].includes(job.status) ||
      job.submissionId
    )
      throw new Error("Não é possível liberar esta compra.");
    await tx.purchaseJob.update({
      where: { id: jobId },
      data: {
        lockedAt: null,
        browserSessionId: null,
        claimToken: null,
        approvalExpiresAt: null,
      },
    });
    return { ok: true };
  });
}
export async function beginPurchase(
  jobId: string,
  workerId: string,
  token: string,
  evidence: CheckoutEvidence,
) {
  if (process.env.LIA_PURCHASE_SUBMIT_OFF === "true")
    throw new Error("Finalização de compras pausada.");
  const base = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${base.deliveryOrderId} FOR UPDATE`;
    const job = await owned(tx, jobId, workerId, token);
    const order = await funding(tx, job.deliveryOrderId);
    checkCheckout(order, evidence);
    const account = await tx.purchaseAccount.findUnique({
      where: { storeKey: job.storeKey },
    });
    if (
      !account?.enabled ||
      !account.loginReady ||
      !account.paymentReady ||
      account.email?.trim().toLowerCase() !==
        evidence.accountEmail.trim().toLowerCase()
    )
      throw new Error("Conta da loja pausada.");
    if (
      job.status !== "approved" ||
      job.submissionId ||
      job.approvalStatus !== "approved" ||
      !job.approvalExpiresAt ||
      job.approvalExpiresAt < new Date() ||
      checkoutDigest(evidence) !== job.approvalCartHash
    )
      throw new Error("Não há autorização atual para este checkout.");
    // Uma trava GLOBAL serializa a decisão e a reserva entre todas as lojas/processos.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('lia-purchase-daily-budget'))::text`;
    const now = new Date();
    if (job.approvedBy === AUTO_PURCHASE_POLICY) {
      const reason = await automaticPurchaseDecision(tx, job.storeKey, evidence.totalCents, now);
      if (reason) {
        await tx.purchaseJob.update({ where: { id: job.id }, data: {
          status: "awaiting_approval", approvalStatus: "requested", approvedBy: null,
          approvedAt: null, approvalCartHash: null, approvalExpiresAt: null,
          lastErrorMessage: reason,
        } });
        return { submissionId: null, reviewRequired: true, reason };
      }
    }
    const submissionId = randomUUID();
    // Inclusive aprovação individual consome o orçamento. Falha, estorno ou resultado
    // desconhecido não devolvem limite automaticamente nem apagam esta reserva.
    await tx.purchaseSpend.create({ data: {
      submissionId, purchaseJobId: job.id, budgetDay: purchaseBudgetDay(now),
      amountCents: evidence.totalCents, authorization: job.approvedBy ?? "ops_session",
    } });
    await tx.purchaseJob.update({
      where: { id: job.id },
      data: {
        status: "submitting",
        submissionId,
        submitStartedAt: new Date(),
        lockedAt: new Date(),
      },
    });
    await tx.purchaseAttempt.create({
      data: {
        purchaseJobId: job.id,
        step: "submit",
        status: "started",
        idempotencyKey: submissionId,
      },
    });
    return { submissionId };
  });
  if (result.reviewRequired)
    await notifyOperator(`Pedido #${base.deliveryOrderId.slice(-6).toUpperCase()}: ${result.reason} Confira no painel de operações.`);
  return result;
}
export async function executionUnknown(
  jobId: string,
  workerId: string,
  token: string,
  code: string,
) {
  // Nunca tornar resultado desconhecido elegível para nova execução. A conta permanece reservada.
  const result = await prisma.purchaseJob.updateMany({
    where: {
      id: jobId,
      browserSessionId: workerId,
      claimToken: token,
      status: {
        in: ["claimed", "awaiting_approval", "approved", "submitting"],
      },
    },
    data: {
      status: "outcome_unknown",
      lastErrorCode: code.slice(0, 80),
      lastErrorMessage:
        "Confira carrinho e histórico da loja antes de liberar a conta.",
    },
  });
  if (!result.count) throw new Error("Reserva inválida.");
  await notifyOperator(
    `Compra interrompida (${code.slice(0, 80)}). Confira o histórico e o carrinho da loja antes de tentar novamente: ${(process.env.LIA_PUBLIC_URL ?? "https://liadelivery.com.br").replace(/\/$/, "")}/ops. Nenhuma nova tentativa será feita automaticamente.`,
  );
}
export async function finishPurchase(
  jobId: string,
  workerId: string,
  token: string,
  input: {
    submissionId: string;
    storeOrderNumber: string;
    actualTotalCents: number;
    trackingUrl?: string;
  },
) {
  const job = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  if (
    job.browserSessionId !== workerId ||
    !token ||
    job.claimToken !== token ||
    job.submissionId !== input.submissionId ||
    !["submitting", "outcome_unknown", "completed"].includes(job.status)
  )
    throw new Error("Comprovante não pertence à tentativa.");
  const e = parseStoredEvidence(job.checkoutEvidence);
  if (input.actualTotalCents !== e.totalCents)
    throw new Error("Valor do comprovante diverge do checkout aprovado.");
  return recordDeliveryEvent(job.deliveryOrderId, {
    kind: "bought",
    source: "operator",
    sourceReference: `purchase:${job.submissionId}`,
    storeOrderNumber: input.storeOrderNumber,
    trackingUrl: input.trackingUrl,
    purchaseExecution: {
      jobId: job.id,
      submissionId: input.submissionId,
      actualTotal: input.actualTotalCents / 100,
    },
  });
}

// A confirmação humana é auditada. Não libera uma sessão ainda ativa no navegador.
export async function reconcileEmptyPurchase(jobId: string, note: string) {
  const base = await prisma.purchaseJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${base.deliveryOrderId} FOR UPDATE`;
    const job = await tx.purchaseJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    if (
      !["outcome_unknown", "needs_review"].includes(job.status) ||
      (job.lockedAt && job.lockedAt.getTime() > Date.now() - 120_000)
    )
      throw new Error(
        "Encerre o comprador e aguarde dois minutos antes de liberar.",
      );
    const order = await tx.deliveryOrder.findUniqueOrThrow({
      where: { id: job.deliveryOrderId },
    });
    if (order.storeOrderNumber)
      throw new Error(
        "Compra já registrada; não liberar para outra tentativa.",
      );
    await tx.purchaseAttempt.create({
      data: {
        purchaseJobId: job.id,
        step: "reconcile_empty",
        status: "completed",
        idempotencyKey: randomUUID(),
        details: {
          operator: "ops_session",
          note: note.slice(0, 500),
          previousSubmissionId: job.submissionId,
        },
      },
    });
    return tx.purchaseJob.update({
      where: { id: jobId },
      data: {
        status: order.status === "paid" ? "queued" : "canceled",
        lockedAt: null,
        browserSessionId: null,
        claimToken: null,
        submissionId: null,
        submitStartedAt: null,
        checkoutEvidence: Prisma.JsonNull,
        checkoutHash: null,
        checkoutExpiresAt: null,
        approvalStatus: "not_requested",
        approvalCartHash: null,
        approvalExpiresAt: null,
        approvedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  });
}
