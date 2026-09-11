// Ações pendentes do operador (11/09): um botão assinado no WhatsApp ou o espelho no /ops.
// A linha OpsAction é a autoridade de expiração e de anti-replay: consumir é um único
// UPDATE condicional pending→consumed; só quem conseguir count===1 executa o efeito.
// Este módulo não decide dinheiro: as funções de compra vivem em purchase-execution.
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { signOpsAction, verifyOpsActionSignature } from "./auth";
import { whatsappAdapter } from "./adapters/whatsapp";
import { notifyOperator } from "./turn-runtime";
import { appendOrderNote } from "./order-flags";

export type OpsActionKind =
  | "ml_cart_ready"
  | "await_store_number"
  | "receiver_new"
  | "over_limit"
  | "pix_failed"
  | "store_silent"
  | "item_missing"
  | "buyer_silent";
export const OPS_ACTION_TTL_MS: Record<OpsActionKind, number> = {
  ml_cart_ready: 24 * 3_600_000,
  await_store_number: 30 * 60_000,
  receiver_new: 24 * 3_600_000,
  over_limit: 24 * 3_600_000,
  pix_failed: 24 * 3_600_000,
  store_silent: 24 * 3_600_000,
  item_missing: 72 * 3_600_000,
  buyer_silent: 60 * 60_000,
};
export const OPS_ACTION_BUTTON_RE = /^op1\.([a-z0-9]{10,40})\.([a-z_]{1,20})\.([a-f0-9]{32})$/;
type Tx = Prisma.TransactionClient;

export async function createOpsAction(
  tx: Tx,
  input: { kind: OpsActionKind; purchaseJobId?: string; deliveryOrderId?: string; payload?: Prisma.InputJsonValue; ttlMs?: number },
  now = new Date(),
) {
  // Uma ação viva por tipo e por job/pedido: a anterior é cancelada, nunca duplicada.
  await tx.opsAction.updateMany({
    where: {
      kind: input.kind, status: "pending",
      ...(input.purchaseJobId ? { purchaseJobId: input.purchaseJobId } : { deliveryOrderId: input.deliveryOrderId ?? "" }),
    },
    data: { status: "canceled" },
  });
  return tx.opsAction.create({
    data: {
      kind: input.kind,
      purchaseJobId: input.purchaseJobId,
      deliveryOrderId: input.deliveryOrderId,
      payload: input.payload,
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? OPS_ACTION_TTL_MS[input.kind])),
    },
  });
}

export function opsActionButtonId(action: { id: string; kind: string }, choice: string): string | null {
  if (!/^[a-z_]{1,20}$/.test(choice)) throw new Error("Escolha de botão inválida.");
  const sig = signOpsAction(action.id, action.kind);
  return sig ? `op1.${action.id}.${choice}.${sig}` : null;
}
export function parseOpsActionButton(text: string): { id: string; choice: string; sig: string } | null {
  const m = text.trim().match(OPS_ACTION_BUTTON_RE);
  return m ? { id: m[1], choice: m[2], sig: m[3] } : null;
}

// Consumo atômico. `sig` ausente = espelho do /ops (sessão já autenticada pela rota).
export async function consumeOpsAction(
  tx: Tx,
  input: { id: string; choice: string; sig?: string; by: string; expectKind?: OpsActionKind },
  now = new Date(),
) {
  const action = await tx.opsAction.findUnique({ where: { id: input.id } });
  if (!action) throw new Error("Ação não encontrada.");
  if (input.expectKind && action.kind !== input.expectKind) throw new Error("Ação de outro tipo.");
  if (input.sig !== undefined && !verifyOpsActionSignature(action.id, action.kind, input.sig))
    throw new Error("Botão inválido.");
  const consumed = await tx.opsAction.updateMany({
    where: { id: action.id, status: "pending", expiresAt: { gt: now } },
    data: { status: "consumed", consumedAt: now, consumedBy: `${input.by}:${input.choice}` },
  });
  if (consumed.count !== 1) throw new Error("Ação já usada ou vencida.");
  return action;
}

// Espelho no /ops: consome a ação pendente de um job sem assinatura (sessão do painel).
export async function consumePendingActionForJob(tx: Tx, purchaseJobId: string, kind: OpsActionKind, choice: string, by = "ops_session") {
  const pending = await tx.opsAction.findFirst({ where: { purchaseJobId, kind, status: "pending" }, orderBy: { createdAt: "desc" } });
  if (!pending) return null;
  return consumeOpsAction(tx, { id: pending.id, choice, by, expectKind: kind });
}

export async function cancelPendingActions(tx: Tx, purchaseJobId: string, kinds?: OpsActionKind[]) {
  await tx.opsAction.updateMany({
    where: { purchaseJobId, status: "pending", ...(kinds ? { kind: { in: kinds } } : {}) },
    data: { status: "canceled" },
  });
}

// Trilha: toda ação consumida vira nota no pedido e tentativa auditável no job.
export async function mirrorOpsAction(tx: Tx, action: { id: string; kind: string; purchaseJobId: string | null; deliveryOrderId: string | null }, choice: string, by: string) {
  if (action.deliveryOrderId) {
    const order = await tx.deliveryOrder.findUnique({ where: { id: action.deliveryOrderId }, select: { notes: true } });
    if (order) await tx.deliveryOrder.update({
      where: { id: action.deliveryOrderId },
      data: { notes: appendOrderNote(order.notes, `🔘 ${action.kind}: ${choice} por ${by} (${new Date().toISOString()})`) },
    });
  }
  if (action.purchaseJobId) await tx.purchaseAttempt.create({
    data: { purchaseJobId: action.purchaseJobId, step: "ops_action", status: "completed", idempotencyKey: `ops-action:${action.id}:${choice}`, details: { kind: action.kind, choice, by } },
  }).catch(() => undefined);
}

// Envia os botões ao operador. Sem Meta (mock/dev) ou sem OPS_TOKEN, cai em texto + link.
export async function sendOperatorButtons(
  action: { id: string; kind: string },
  body: string,
  buttons: { choice: string; title: string }[],
) {
  const to = process.env.LIA_OPERATOR_PHONE?.trim();
  if (!to) return "skipped" as const;
  const ids = buttons.map((b) => ({ id: opsActionButtonId(action, b.choice), title: b.title }));
  const opsLink = `${(process.env.LIA_PUBLIC_URL ?? "https://liadelivery.com.br").replace(/\/$/, "")}/ops`;
  if (process.env.LIA_OPS_BUTTONS_OFF === "true" || process.env.WHATSAPP_PROVIDER !== "meta" || ids.some((b) => !b.id)) {
    await notifyOperator(`${body}\nResponda no painel: ${opsLink}`);
    return "text" as const;
  }
  try {
    await whatsappAdapter.sendOperatorButtons(to, body, ids as { id: string; title: string }[]);
    return "buttons" as const;
  } catch (error) {
    console.warn("[ops-action:buttons-failed]", error instanceof Error ? error.message : error);
    await notifyOperator(`${body}\nResponda no painel: ${opsLink}`);
    return "text" as const;
  }
}

export async function pendingOpsActions(purchaseJobId: string) {
  return prisma.opsAction.findMany({ where: { purchaseJobId, status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
}
