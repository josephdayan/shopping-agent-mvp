import { NextResponse } from "next/server";
import { requireOpsKey } from "@/lib/auth";
import { parseMoneyInput } from "@/lib/pricing";
import {
  opsCancelRefund,
  opsConfirmRefund,
  opsMarkBought,
  opsMarkDelivered,
  opsMarkRetailerOutForDelivery,
  opsNotifyCustomer,
  opsPublishManualQuote,
  opsRefundViaProvider,
  opsPurchaseFailedRefund
} from "@/lib/delivery-service";

export const dynamic = "force-dynamic";

// Guarda compartilhada (src/lib/auth.ts): fail-closed em deploy, tempo constante,
// cookie HMAC. `?key=` continua aceito só por compatibilidade com scripts do operador.
function authed(request: Request) {
  return requireOpsKey(request, { allowQuery: true }) === null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    storeOrderNumber?: string;
    text?: string;
    trackingUrl?: string;
    refundReference?: string;
    refundAmount?: number | string;
    itemsSubtotal?: number | string;
    deliveryFee?: number | string;
    deliveryMode?: "operator_courier" | "retailer_delivery";
    deliveryPromise?: string;
    etaMinutes?: number | string;
  };
  const id = params.id;
  try {
    switch (body.action) {
      case "publish_quote": {
        // Dinheiro digitado ("27,90") é validado aqui também — o servidor nunca confia
        // no Number() do cliente (revisão 01/09: vírgula virava frete zero).
        const itemsSubtotal = parseMoneyInput(body.itemsSubtotal);
        const deliveryFee = body.deliveryFee == null || body.deliveryFee === "" ? 0 : parseMoneyInput(body.deliveryFee);
        if (itemsSubtotal == null || itemsSubtotal <= 0) {
          return NextResponse.json({ error: "Custo dos produtos inválido (ex.: 27,90)." }, { status: 400 });
        }
        if (deliveryFee == null || deliveryFee < 0) {
          return NextResponse.json({ error: "Frete inválido (ex.: 12,90)." }, { status: 400 });
        }
        await opsPublishManualQuote(id, {
          itemsSubtotal,
          deliveryFee,
          deliveryMode: body.deliveryMode,
          deliveryPromise: body.deliveryPromise?.toString().trim() || undefined,
          etaMinutes: body.etaMinutes != null && body.etaMinutes !== "" ? Number(body.etaMinutes) : undefined
        });
        break;
      }
      case "bought":
        await opsMarkBought(id, String(body.storeOrderNumber ?? "").trim(), body.trackingUrl);
        break;
      case "retailer_out_for_delivery":
        await opsMarkRetailerOutForDelivery(id, body.trackingUrl);
        break;
      case "delivered":
        await opsMarkDelivered(id);
        break;
      case "cancel":
        await opsCancelRefund(id);
        break;
      case "purchase_failed_refund": {
        await opsPurchaseFailedRefund(id, String(body.text ?? "").trim() || undefined);
        break;
      }
      case "refund_provider": {
        const refundAmount = body.refundAmount == null || body.refundAmount === "" ? undefined : parseMoneyInput(body.refundAmount);
        if (refundAmount === null) return NextResponse.json({ error: "Valor do estorno inválido (ex.: 12,90)." }, { status: 400 });
        await opsRefundViaProvider(id, refundAmount);
        break;
      }
      case "confirm_refund": {
        const refundAmount = body.refundAmount == null || body.refundAmount === "" ? undefined : parseMoneyInput(body.refundAmount);
        if (refundAmount === null) return NextResponse.json({ error: "Valor do estorno inválido (ex.: 12,90)." }, { status: 400 });
        await opsConfirmRefund(id, String(body.refundReference ?? ""), refundAmount);
        break;
      }
      case "notify": {
        const text = String(body.text ?? "").trim();
        // Client-input problem, not a server failure — answer 400, not 500.
        if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
        await opsNotifyCustomer(id, text);
        break;
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ops:action:error]", id, body.action, error);
    // Erros de domínio ("o pedido mudou de estado", "informe a referência") são a
    // orientação que o operador precisa LER — não um 500 mudo (revisão 01/09).
    const message =
      error instanceof Error && error.message && !/prisma|ECONN|timed? ?out|ETIMEDOUT/i.test(error.message)
        ? error.message.slice(0, 200)
        : "action failed";
    return NextResponse.json({ ok: false, error: message }, { status: message === "action failed" ? 500 : 409 });
  }
}
