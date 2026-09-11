// Ramificação do webhook para o telefone do operador (11/09): botões `op1.…` e, quando há
// uma pergunta pendente de número do pedido, a próxima mensagem numérica. Qualquer outra
// mensagem do operador segue o fluxo normal (ele também é cliente da Lia).
import { prisma } from "./prisma";
import { isAdminPhone } from "./turn-runtime";
import { whatsappAdapter } from "./adapters/whatsapp";
import { parseOpsActionButton, consumeOpsAction, mirrorOpsAction } from "./ops-actions";
import { ownerConfirmCartBought, ownerDeclineCart, ownerStoreNumber } from "./purchase-execution";
import * as copy from "./lia-copy";

const STORE_NUMBER_RE = /^#?\s*(\d{6,20})\s*$/;

export async function handleOperatorInbound(phone: string, text: string): Promise<"handled" | "ignored"> {
  if (!isAdminPhone(phone)) return "ignored";
  const button = parseOpsActionButton(text);
  if (button) {
    await runOperatorButton(phone, button);
    return "handled";
  }
  const number = text.trim().match(STORE_NUMBER_RE);
  if (!number) return "ignored";
  const pending = await prisma.opsAction.findFirst({
    where: { kind: "await_store_number", status: "pending", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!pending?.purchaseJobId) return "ignored";
  try {
    const action = await prisma.$transaction(async (tx) => {
      const consumed = await consumeOpsAction(tx, { id: pending.id, choice: "number", by: `wa:${phone}`, expectKind: "await_store_number" });
      await mirrorOpsAction(tx, consumed, `number ${number[1]}`, `wa:${phone}`);
      return consumed;
    });
    const job = await ownerStoreNumber(pending.purchaseJobId, number[1], action.id);
    await reply(phone, copy.operatorStoreNumberSaved(job.deliveryOrderId.slice(-6).toUpperCase(), number[1]));
  } catch (error) {
    await reply(phone, copy.operatorActionFailed(error instanceof Error ? error.message : "falha"));
  }
  return "handled";
}

async function runOperatorButton(phone: string, button: { id: string; choice: string; sig: string }) {
  try {
    const action = await prisma.$transaction(async (tx) => {
      const consumed = await consumeOpsAction(tx, { id: button.id, choice: button.choice, sig: button.sig, by: `wa:${phone}` });
      await mirrorOpsAction(tx, consumed, button.choice, `wa:${phone}`);
      return consumed;
    });
    if (action.kind === "ml_cart_ready" && action.purchaseJobId) {
      if (button.choice === "bought") {
        const job = await ownerConfirmCartBought(action.purchaseJobId, action.id);
        await reply(phone, copy.operatorAskStoreNumber(job.deliveryOrderId.slice(-6).toUpperCase()));
        return;
      }
      if (button.choice === "failed") {
        const job = await ownerDeclineCart(action.purchaseJobId, action.id);
        await reply(phone, copy.operatorCartDeclined(job.deliveryOrderId.slice(-6).toUpperCase()));
        return;
      }
    }
    await reply(phone, copy.operatorActionUnknown());
  } catch (error) {
    await reply(phone, copy.operatorActionFailed(error instanceof Error ? error.message : "falha"));
  }
}

async function reply(phone: string, text: string) {
  try {
    await whatsappAdapter.sendMessage(phone, text);
  } catch (error) {
    console.warn("[ops-action:reply-failed]", error instanceof Error ? error.message : error);
  }
}
