// Ciclo de vida operado pelo /ops (revisão 02/09): cotação manual, comprado, saiu,
// entregue, cancelar/estornar, fila e lista de espera.
import { whatsappAdapter } from "@/lib/adapters/whatsapp";
import { normalizeCity } from "@/lib/coverage";
import { normalizeMsg } from "@/lib/lia-intents";
import { AWAITING_OPERATOR_QUOTE_STATUS, CONCIERGE_STORE_KEY, CONCIERGE_STORE_LABEL, OPS_QUEUE_STATUSES, PAID_OR_IN_FULFILLMENT_STATUSES, REFUND_CONFIRMED_PREFIX, REFUND_PENDING_FLAG, RETAILER_OUT_FOR_DELIVERY_STATUS, appendOrderNote, isOrderOutForDelivery, isRetailerDeliveryOrder, statusAfterStorePurchase } from "@/lib/order-flags";
import { refundOrderViaProvider } from "@/lib/payments/ledger";
import { serviceFeeForSubtotal } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import * as copy from "@/lib/lia-copy";
import { PURCHASE_BLOCKED_PREFIX } from "@/lib/order-monitor";
import { BasketItem, FreightChoiceState, cardTotal, display, orderDateLabel, quoteTtlMinutes, roundMoney } from "./conversation-types";
import { TurnSupersededError, addressOnlyCtx, deliverNotice, markTurnReplied, normalizePhone, notifyOperator, readCtx, reply, resetConversationForClosedOrder, writeCtx } from "./turn-runtime";
import { issueValidatedRetailerQuotePayment } from "./order-payments";

export async function sendFreightChoice(phone: string, choice: FreightChoiceState) {
  const totalFor = (fee: number) =>
    roundMoney(choice.itemsSubtotal + (choice.serviceFee ?? serviceFeeForSubtotal(choice.itemsSubtotal)) + fee);
  const barato = { total: totalFor(choice.barato.fee), estimate: choice.barato.estimate };
  const rapido = { total: totalFor(choice.rapido.fee), estimate: choice.rapido.estimate };
  const body = copy.shippingSpeedChoice(barato, rapido);
  try {
    markTurnReplied();
    const interactive = await whatsappAdapter.sendShippingChoices(phone, body, choice.barato, choice.rapido);
    if (interactive) return;
  } catch (error) {
    console.warn("[whatsapp:shipping-choice:fallback-text]", error instanceof Error ? error.message : error);
  }
  await reply(phone, body);
}

// Estorno pelo provedor (revisão 02/09): o operador não precisa mais ir ao painel do MP/
// Pagar.me e voltar com a referência — a API estorna e a referência entra sozinha.
// Continua exigindo o pedido em `refund_pending` (o operador abriu o estorno de propósito).
export async function opsRefundViaProvider(orderId: string, amount?: number) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status !== "refund_pending") throw new Error("O pedido não está aguardando estorno.");
  const result = await refundOrderViaProvider(orderId, amount);
  return opsConfirmRefund(orderId, result.reference, result.amount);
}

// O operador publica a cotação feita à mão no /ops: grava custo real dos produtos +
// frete + modalidade, move o pedido para awaiting_quote_confirmation e manda ao cliente
// o resumo com os botões de pagamento — a cobrança em si é issueValidatedRetailerQuotePayment.
export async function opsPublishManualQuote(
  orderId: string,
  input: {
    itemsSubtotal: number;
    deliveryFee: number;
    deliveryMode?: "operator_courier" | "retailer_delivery";
    deliveryPromise?: string;
    etaMinutes?: number;
    // Margem exata por item (cotação instantânea). Ausente = cotação manual do /ops,
    // onde só existe o subtotal — as faixas progressivas valem sobre ele inteiro.
    serviceFee?: number;
    items?: { qty: number; name: string; unitPrice?: number }[];
  }
) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.status !== AWAITING_OPERATOR_QUOTE_STATUS) {
    throw new Error("Só é possível cotar um pedido que está aguardando cotação do operador.");
  }
  const itemsSubtotal = roundMoney(Math.max(0, Number(input.itemsSubtotal) || 0));
  const deliveryFee = roundMoney(Math.max(0, Number(input.deliveryFee) || 0));
  if (itemsSubtotal <= 0) throw new Error("Informe o custo dos produtos (maior que zero).");
  const serviceFee = input.serviceFee != null ? roundMoney(input.serviceFee) : serviceFeeForSubtotal(itemsSubtotal);
  // "produtos" shown to the customer already includes the markup.
  const produtos = roundMoney(itemsSubtotal + serviceFee);
  const total = roundMoney(produtos + deliveryFee);
  // Só entrega do varejista (revisão 02/09): o motoboy da base do operador saiu do
  // produto em 09/08 e do código agora.
  const deliveryMode = "retailer_delivery" as const;
  const sameHour = false;
  const courierKey = "retailer_delivery";

  const items: BasketItem[] = input.items?.length
    ? input.items.map((entry) => {
        const qty = Math.max(1, Math.round(Number(entry.qty) || 1));
        const unitPrice = Math.max(0, Number(entry.unitPrice) || 0);
        return {
          sku: `concierge:${normalizeMsg(entry.name)}`,
          name: entry.name,
          qty,
          unitPrice,
          lineTotal: roundMoney(unitPrice * qty),
          storeKey: CONCIERGE_STORE_KEY,
          storeLabel: CONCIERGE_STORE_LABEL
        };
      })
    : ((order.items as unknown as BasketItem[]) ?? []);

  const quoteExpiresAt = new Date(Date.now() + quoteTtlMinutes() * 60_000);
  const fulfillment = {
    storeKey: order.storeKey,
    storeLabel: order.storeLabel,
    deliveryMode,
    deliveryPromise: input.deliveryPromise,
    deliveryFee,
    retailerTotal: produtos,
    etaMinutes: input.etaMinutes
  };
  // Flip ATÔMICO: a condição de status vai no próprio UPDATE. Sem isso, um cancelamento
  // concorrente (cliente mandando "cancelar", ou a expiração de abandono) era
  // sobrescrito e o pedido "ressuscitava" indo pedir pagamento.
  const claimed = await prisma.deliveryOrder.updateMany({
    where: { id: order.id, status: AWAITING_OPERATOR_QUOTE_STATUS },
    data: {
      status: "awaiting_quote_confirmation",
      items: items as unknown as object,
      fulfillments: [fulfillment] as unknown as object,
      itemsSubtotal,
      serviceFee,
      deliveryFee,
      total,
      courierKey,
      quoteExpiresAt,
      notes: appendOrderNote(order.notes, `Cotação manual enviada (${sameHour ? "motoboy na hora" : "entrega do varejista"}).`)
    }
  });
  if (!claimed.count) {
    throw new Error("O pedido mudou de estado antes da cotação sair (cancelado ou já cotado). Recarregue o /ops.");
  }

  // Se a conversa JÁ seguiu em frente (outro pedido/outra cesta), o contexto novo vale
  // mais: a cotação sai rotulada com o pedido a que pertence e NADA é sobrescrito —
  // sem isso, uma cotação atrasada apagava a compra em andamento e despejava o resumo
  // de outra sessão no meio do papo (27/08 S19, resumo do PS5 na sessão do arroz).
  let conversationMovedOn = false;
  if (order.conversationId) {
    const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
    if (convo) {
      const ctx = readCtx(convo.context);
      conversationMovedOn =
        (Boolean(ctx.deliveryOrderId) && ctx.deliveryOrderId !== order.id) ||
        ((ctx.basket?.length ?? 0) > 0 && ctx.deliveryOrderId !== order.id) ||
        ((ctx.pending?.length ?? 0) > 0 && ctx.deliveryOrderId !== order.id);
      if (!conversationMovedOn) {
        try {
          await writeCtx(convo.id, {
            ...addressOnlyCtx(ctx),
            deliveryOrderId: order.id,
            step: "awaiting_quote_confirmation",
            // "mais barato"/"entrega mais rápida" DEPOIS do total dependem dos dois
            // (27/08 S12/S14).
            ...(ctx.lastChoice ? { lastChoice: ctx.lastChoice } : {}),
            ...(ctx.freightChoice?.orderId === order.id ? { freightChoice: ctx.freightChoice } : {})
          });
        } catch (error) {
          // Turno superado no meio da publicação: o pedido volta pra fila e o turno
          // morre SEM falar — quem escreveu por baixo é o dono da conversa agora.
          if (error instanceof TurnSupersededError) {
            await prisma.deliveryOrder.updateMany({
              where: { id: order.id, status: "awaiting_quote_confirmation" },
              data: {
                status: AWAITING_OPERATOR_QUOTE_STATUS,
                quoteExpiresAt: null,
                notes: appendOrderNote(order.notes, "⚠️ Cotação revertida: a conversa avançou durante a publicação. Cote de novo pelo /ops.")
              }
            });
          }
          throw error;
        }
      }
    }
  }

  const summaryInput = {
    // Preço por linha SEMPRE que a margem exata por item existe: sem ele, o cliente
    // somava os preços de mensagens antigas e achava o subtotal "errado" (27/08 S1).
    items: items.map((item) => ({
      qty: item.qty,
      name: item.name,
      ...(input.serviceFee != null && item.unitPrice > 0
        ? { lineTotal: roundMoney(display(item.unitPrice) * item.qty) }
        : {})
    })),
    produtos,
    frete: deliveryFee,
    deliveryPromise: input.deliveryPromise,
    etaMinutes: input.etaMinutes,
    total,
    deliveryAddress: order.deliveryAddress ?? undefined,
    sameHour
  };
  // O pedido JÁ saiu de "aguardando cotação". Se o RESUMO (a peça essencial) falhar, o
  // cliente fica sem total nenhum e o operador sem poder recotar → rollback pra fila.
  // Depois que o resumo saiu, NÃO se faz rollback: menu e aviso de validade são
  // acessórios ("pix"/"cartão" por texto funcionam), e reverter aqui desalinharia
  // pedido e conversa — o cliente pode já ter tocado num botão e o pedido avançado.
  try {
    // Conversa em outro assunto: o resumo chega ROTULADO com o pedido a que pertence,
    // pra nunca parecer a cesta da compra atual (27/08 S19).
    if (conversationMovedOn) {
      await reply(
        order.phone,
        copy.quoteForOrderLabel(order.id.slice(-6).toUpperCase(), orderDateLabel(order.createdAt))
      );
    }
    // Resumo com botão "Trocar endereço" (dono, 11/08). Corpo interativo tem teto de 1024
    // chars na Meta — resumo comprido (ou canal sem botão) cai no texto com a dica escrita.
    let summarySent = false;
    const buttonBody = copy.manualQuoteSummary({ ...summaryInput, addressButton: true });
    if (summaryInput.deliveryAddress && buttonBody.length <= 1024) {
      try {
        summarySent = Boolean(await whatsappAdapter.sendQuoteSummary(order.phone, buttonBody));
      } catch (error) {
        console.warn("[whatsapp:quote-summary:fallback-text]", error instanceof Error ? error.message : error);
      }
    }
    if (!summarySent) await reply(order.phone, copy.manualQuoteSummary(summaryInput));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[ops:publish-quote:send-failed]", detail);
    const rolled = await prisma.deliveryOrder.updateMany({
      where: { id: order.id, status: "awaiting_quote_confirmation" },
      data: {
        status: AWAITING_OPERATOR_QUOTE_STATUS,
        quoteExpiresAt: null,
        notes: appendOrderNote(order.notes, `⚠️ Cotação revertida: falha ao enviar no WhatsApp (${detail.slice(0, 120)}). Tente cotar de novo.`)
      }
    });
    // A conversa só volta pra "aguardando cotação" se o PEDIDO de fato voltou — se ele
    // já avançou (corrida com um toque de pagamento), reescrever o contexto aqui
    // desalinharia os dois.
    if (rolled.count && order.conversationId) {
      const convo = await prisma.conversation.findUnique({ where: { id: order.conversationId } });
      if (convo) {
        const ctx = readCtx(convo.context);
        await writeCtx(convo.id, { ...addressOnlyCtx(ctx), deliveryOrderId: order.id, step: AWAITING_OPERATOR_QUOTE_STATUS });
      }
    }
    throw error;
  }
  try {
    const interactive = await whatsappAdapter.sendPaymentChoices(order.phone, total, cardTotal(total));
    if (!interactive) await reply(order.phone, copy.paymentMethod(total, cardTotal(total)));
    await reply(order.phone, copy.quoteValidFor(quoteTtlMinutes()));
  } catch (error) {
    // Resumo já chegou: o cliente tem o total e "pix"/"cartão" por texto funcionam.
    console.warn("[ops:publish-quote:followup-send-failed]", error instanceof Error ? error.message : error);
  }
  return prisma.deliveryOrder.findUnique({ where: { id: order.id } });
}

export async function opsMarkBought(orderId: string, storeOrderNumber: string, trackingUrl?: string) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status !== "paid") throw new Error("Somente um pedido pago pode ser marcado como comprado.");
  // Link de acompanhamento do pedido NA LOJA (ML e afins), colado já na compra — que é
  // quando o operador tem a página aberta. Sem isso o cliente só recebia rastreio no
  // "saiu pra entrega", instante que nos pedidos entregues pela loja o operador não tem
  // como saber (dono, 17/08: "ele tem que poder ver e acompanhar").
  const safeTrackingUrl = (trackingUrl ?? "").trim();
  if (safeTrackingUrl && !/^https:\/\//i.test(safeTrackingUrl)) {
    throw new Error("O link de acompanhamento precisa ser uma URL https.");
  }
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    // Blank input stays null so legacy pickupInstructions' "—" fallback works if
    // this is an authorized-courier order.
    data: {
      status: statusAfterStorePurchase(current),
      storeOrderNumber: storeOrderNumber.trim() || null,
      // Coluna legada de courier = link de rastreio genérico voltado ao cliente (mesma
      // usada por opsMarkRetailerOutForDelivery). Só sobrescreve quando veio link novo.
      ...(safeTrackingUrl ? { courierTrackingUrl: safeTrackingUrl } : {}),
      notes: appendOrderNote(current.notes, `🧾 Compra marcada pelo operador em ${new Date().toISOString()}.`)
    }
  });
  // Keep the durable purchase queue aligned when the operator finishes a claimed
  // job through /ops. This also makes recovery safe if the worker loses its HTTP
  // response after the retailer accepted the order.
  await prisma.purchaseJob.updateMany({
    where: {
      deliveryOrderId: orderId,
      status: { in: ["queued", "retrying", "claimed", "awaiting_approval", "approved"] }
    },
    data: {
      status: "completed",
      storeOrderNumber: storeOrderNumber.trim() || null,
      lockedAt: null,
      nextAttemptAt: null,
      completedAt: new Date()
    }
  });
  // O cliente era o único que não sabia da compra (17/08): entre "pagamento confirmado" e
  // "saiu pra entrega" ele ficava no silêncio, que num pedido de loja pode durar horas —
  // e silêncio depois de pagar é onde nasce o "cadê meu pedido?". Falha de envio não
  // desfaz a compra: o status já mudou e o /ops é a fonte da verdade.
  try {
    await reply(
      updated.phone,
      copy.orderStatusLine({
        shortId: updated.id.slice(-6).toUpperCase(),
        status: updated.status,
        trackingUrl: updated.courierTrackingUrl
      })
    );
  } catch (error) {
    console.warn("[ops:mark-bought:notify-failed]", error instanceof Error ? error.message : error);
  }
  return updated;
}

export async function opsMarkRetailerOutForDelivery(orderId: string, trackingUrl?: string) {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (!isRetailerDeliveryOrder(order)) {
    throw new Error("Esta ação é exclusiva de pedidos entregues pelo varejista.");
  }
  if (!["retailer_preparing", "operator_buying"].includes(order.status)) {
    throw new Error("O pedido precisa estar comprado e em preparação antes de sair para entrega.");
  }
  const safeTrackingUrl = (trackingUrl ?? "").trim();
  if (safeTrackingUrl && !/^https:\/\//i.test(safeTrackingUrl)) {
    throw new Error("O rastreio precisa ser uma URL https.");
  }
  const updated = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: RETAILER_OUT_FOR_DELIVERY_STATUS,
      // This legacy column is now the generic customer-facing tracking URL. Keeping
      // it avoids a risky production migration during the controlled pilot.
      courierTrackingUrl: safeTrackingUrl || null,
      courierDispatchedAt: new Date(),
      notes: appendOrderNote(order.notes, `🧾 Varejista saiu para entrega em ${new Date().toISOString()}.`)
    }
  });
  await reply(order.phone, copy.retailerOutForDelivery(safeTrackingUrl || null));
  return updated;
}

export async function opsMarkDelivered(orderId: string) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (!isOrderOutForDelivery(current.status)) {
    throw new Error("O pedido precisa estar em rota antes de ser marcado como entregue.");
  }
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
      notes: appendOrderNote(current.notes, `🧾 Entrega marcada pelo operador em ${new Date().toISOString()}.`)
    }
  });
  await reply(order.phone, copy.delivered());
  return order;
}

export async function opsCancelRefund(orderId: string) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status === "refund_pending") return current;
  const paymentReceived = Boolean(current.paidAt) || PAID_OR_IN_FULFILLMENT_STATUSES.includes(current.status);
  const [order] = await prisma.$transaction([
    prisma.deliveryOrder.update({
      where: { id: orderId },
      data: paymentReceived
        ? {
            status: "refund_pending",
            notes: appendOrderNote(
              appendOrderNote(current.notes, REFUND_PENDING_FLAG),
              `🧾 Estorno solicitado pelo operador em ${new Date().toISOString()}.`
            )
          }
        : { status: "canceled", notes: appendOrderNote(current.notes, `🧾 Pedido cancelado sem pagamento em ${new Date().toISOString()}.`) }
    }),
    // Cancel every pre-purchase step so a released/abandoned cart never blocks the
    // next customer. A job already in purchasing/ordered is intentionally preserved
    // for reconciliation; the late store result cannot resurrect the DeliveryOrder.
    prisma.purchaseJob.updateMany({
      where: {
        deliveryOrderId: orderId,
        status: { in: ["preflight_queued", "preflighting", "cart_ready", "awaiting_approval", "approved"] }
      },
      data: {
        status: "canceled",
        lastErrorCode: "ORDER_CANCELED",
        lastErrorMessage: "Pedido cancelado antes da finalização na loja.",
        nextAttemptAt: null
      }
    })
  ]);
  // O pedido fechou: a conversa não pode continuar presa nele (revisão 18/08 — cliente
  // ouvia "ainda estou cotando" de pedido cancelado e, em `choosing_freight`, o botão de
  // frete não tinha saída).
  await resetConversationForClosedOrder(order, paymentReceived ? "refund" : "cancel");
  await reply(order.phone, paymentReceived ? copy.refundRequested() : copy.canceledUnpaid());
  return order;
}

export async function opsConfirmRefund(orderId: string, reference: string, amount?: number) {
  const safeReference = reference.replace(/[\r\n]/g, " ").trim().slice(0, 120);
  if (!safeReference) throw new Error("Informe a referência do estorno para auditoria.");
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (current.status !== "refund_pending") throw new Error("O pedido não está aguardando estorno.");
  const refundAmount = amount == null ? current.total : roundMoney(Number(amount));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > current.total + 0.01) {
    throw new Error("O valor do estorno deve ser maior que zero e não pode ultrapassar o total pago.");
  }
  const amountLabel = Math.abs(refundAmount - current.total) <= 0.01 ? "integral" : `parcial R$ ${refundAmount.toFixed(2).replace(".", ",")}`;
  const notesWithoutPending = (current.notes ?? "")
    .split("\n")
    .filter((line) => line !== REFUND_PENDING_FLAG)
    .join("\n");
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "refunded",
      notes: appendOrderNote(
        notesWithoutPending,
        `${REFUND_CONFIRMED_PREFIX} ${amountLabel} — ${safeReference}`
      )
    }
  });
  await reply(order.phone, copy.refundConfirmed());
  return order;
}

// Free-text note from the operator to the customer (out-of-stock, item refund,
// delay…) — sent as Lia, logged in the conversation. Substitutions are disabled.
export async function opsNotifyCustomer(orderId: string, text: string) {
  const message = (text ?? "").trim();
  if (!message) throw new Error("Empty message");
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  await reply(order.phone, message);
  if (order.conversationId) {
    try {
      await prisma.message.create({
        data: { conversationId: order.conversationId, sender: "operator", text: message }
      });
    } catch (error) {
      console.warn("[ops:notify:log]", error instanceof Error ? error.message : error);
    }
  }
  return order;
}

// Ordem da fila (04/09): o pedido do amigo do dono, pago e travado, estava no FIM da
// página atrás de cotações abandonadas de teste ("não tá lá esse pedido"). Agora quem
// precisa de ação humana vem primeiro e, dentro do grupo, o mais novo em cima.
const OPS_QUEUE_PRIORITY: Record<string, number> = {
  refund_pending: 0,
  paid: 1,
  awaiting_operator_quote: 2,
  operator_buying: 3,
  retailer_preparing: 4,
  ready_for_pickup: 4,
  retailer_out_for_delivery: 5,
  dispatched: 5,
  awaiting_quote_confirmation: 6,
  awaiting_payment: 6
};

export async function getOperatorQueue() {
  const orders = await prisma.deliveryOrder.findMany({
    where: { status: { in: OPS_QUEUE_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: { purchaseJobs: { include: { items: true }, orderBy: { createdAt: "asc" } } }
  });
  return orders.sort((a, b) => (OPS_QUEUE_PRIORITY[a.status] ?? 9) - (OPS_QUEUE_PRIORITY[b.status] ?? 9) || b.createdAt.getTime() - a.createdAt.getTime());
}

// Someone asked from outside the delivery area. Deduped by (phone, cep); repeats bump
// `hits` so the /ops demand map reflects real intensity. Never throws into the chat flow.
export async function recordWaitlistLead(input: {
  phone: string;
  cep: string;
  city?: string;
  uf?: string;
  reason?: "outside_coverage" | "too_far" | "fee_too_high";
}) {
  const phone = normalizePhone(input.phone);
  const reason = input.reason ?? "outside_coverage";
  try {
    await prisma.waitlistLead.upsert({
      where: { phone_cep: { phone, cep: input.cep } },
      create: { phone, cep: input.cep, city: input.city ?? null, uf: input.uf ?? null, reason },
      update: { hits: { increment: 1 }, city: input.city ?? undefined, uf: input.uf ?? undefined, reason }
    });
  } catch (err) {
    console.error("[waitlist] failed to record lead", err);
  }
}

// Demand map for /ops: leads grouped by city (most-wanted first) + the latest raw entries.
export async function getWaitlist() {
  const leads = await prisma.waitlistLead.findMany({ orderBy: { updatedAt: "desc" }, take: 300 });
  const byRegion = new Map<string, { city: string; uf?: string; leads: number; hits: number; lastAt: Date }>();
  for (const l of leads) {
    const key = `${normalizeCity(l.city ?? "")}|${l.uf ?? ""}`;
    const cur = byRegion.get(key);
    if (cur) {
      cur.leads += 1;
      cur.hits += l.hits;
      if (l.updatedAt > cur.lastAt) cur.lastAt = l.updatedAt;
    } else {
      byRegion.set(key, { city: l.city ?? "—", uf: l.uf ?? undefined, leads: 1, hits: l.hits, lastAt: l.updatedAt });
    }
  }
  const regions = [...byRegion.values()].sort((a, b) => b.leads - a.leads || b.hits - a.hits);
  return { total: leads.length, regions, recent: leads.slice(0, 40) };
}

// ---- pedido PAGO sem compra (revisão 02/09) ----
// O cliente pagou e ninguém comprou: ou o operador ainda não agiu, ou a compra foi
// bloqueada (sem estoque / sem entrega no CEP / mínimo da loja) e a nota "🛑 COMPRA
// BLOQUEADA" ficou só no /ops. Chamado pelo cron a cada 10 min; idempotente por marcador.
const STUCK_BUCKETS_H = [2, 6, 12, 24, 48, 72];

// ---- estorno AUTOMÁTICO (decisão do dono, 04/09) ----
// "Nunca é pra não dar certo, mas às vezes não vai, e aí tem que ir sem mim e sem /ops."
// Pedido PAGO sem número de compra na loja: (a) com "🛑 COMPRA BLOQUEADA" há
// LIA_AUTO_REFUND_BLOCKED_HOURS (6) → estorna sozinho; (b) sem bloqueio mas sem compra há
// LIA_AUTO_REFUND_STALE_HOURS (24) → idem. Só status `paid`: pedido que o operador moveu
// para "comprando"/"preparando" nunca é tocado. Kill-switch: LIA_AUTO_REFUND_OFF=true.
// Puro (testável); o efeito fica em watchPaidOrder, que o cron chama a cada 10 min.
export type AutoRefundDecision =
  | { refund: false }
  | { refund: true; kind: "blocked" | "stale"; reason: string; customerReason: string };

function autoRefundBlockedHours(): number {
  return Number(process.env.LIA_AUTO_REFUND_BLOCKED_HOURS ?? 6);
}
function autoRefundStaleHours(): number {
  return Number(process.env.LIA_AUTO_REFUND_STALE_HOURS ?? 24);
}

// O bloqueio é escrito em jargão de operação; o cliente recebe uma frase simples.
export function customerReasonFromBlock(block: string): string {
  const b = block.toLowerCase();
  if (/estoque|indispon|esgot/.test(b)) return "a loja ficou sem o item para o seu endereço";
  if (/entrega|cep|frete|m[ií]nimo/.test(b)) return "a loja não entrega esse pedido no seu endereço";
  if (/pre[çc]o|acima|teto|maximum|mais caro/.test(b)) return "o preço na loja subiu acima do combinado";
  return "a loja não confirmou a compra";
}

export function autoRefundDecision(
  input: { status: string; storeOrderNumber?: string | null; paidAt?: Date | null; notes?: string | null },
  now = new Date()
): AutoRefundDecision {
  if (process.env.LIA_AUTO_REFUND_OFF === "true") return { refund: false };
  if (input.status !== "paid" || input.storeOrderNumber || !input.paidAt) return { refund: false };
  const hours = (now.getTime() - input.paidAt.getTime()) / 3_600_000;
  const blocked = (input.notes ?? "")
    .split("\n")
    .filter((line) => line.startsWith(PURCHASE_BLOCKED_PREFIX))
    .pop()
    ?.slice(PURCHASE_BLOCKED_PREFIX.length)
    .trim();
  if (blocked && hours >= autoRefundBlockedHours()) {
    return { refund: true, kind: "blocked", reason: blocked, customerReason: customerReasonFromBlock(blocked) };
  }
  if (hours >= autoRefundStaleHours()) {
    return { refund: true, kind: "stale", reason: `sem compra confirmada ${Math.floor(hours)}h depois do pagamento`, customerReason: "não consegui confirmar a compra a tempo" };
  }
  return { refund: false };
}

const AUTO_REFUND_FAILED_MARKER = "⚠️ ESTORNO AUTOMÁTICO FALHOU";

export async function watchPaidOrder(
  orderId: string,
  now = new Date()
): Promise<"none" | "operator" | "operator+customer" | "auto_refunded" | "auto_refund_failed"> {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "paid" || order.storeOrderNumber || !order.paidAt) return "none";

  // Estorno automático vem ANTES de qualquer alerta: não faz sentido avisar "pendente 6h"
  // e devolver o dinheiro no mesmo tick.
  const decision = autoRefundDecision(order, now);
  if (decision.refund) {
    const shortId = order.id.slice(-6).toUpperCase();
    try {
      await opsPurchaseFailedRefund(orderId, decision.customerReason, { origin: "auto", internalReason: decision.reason });
      await notifyOperator(copy.operatorAutoRefundAlert(shortId, Number(order.total), decision.reason), order.phone);
      return "auto_refunded";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[auto-refund:failed]", orderId, message);
      // Nota + alerta UMA vez; o cron tenta de novo a cada 10 min sem repetir o aviso.
      if (!(order.notes ?? "").includes(AUTO_REFUND_FAILED_MARKER)) {
        await prisma.deliveryOrder.update({
          where: { id: orderId },
          data: {
            notes: appendOrderNote(
              order.notes,
              `${AUTO_REFUND_FAILED_MARKER}: ${message.replace(/[\r\n]/g, " ").slice(0, 160)} (${now.toISOString()}) — tenta de novo a cada 10 min; se persistir, estornar à mão no /ops.`
            )
          }
        });
        await notifyOperator(copy.operatorAutoRefundFailedAlert(shortId, message), order.phone);
      }
      return "auto_refund_failed";
    }
  }

  const hours = Math.floor((now.getTime() - order.paidAt.getTime()) / 3_600_000);
  const bucket = [...STUCK_BUCKETS_H].reverse().find((h) => hours >= h);
  if (!bucket) return "none";
  const marker = `⏰ COMPRA PENDENTE ${bucket}h`;
  if ((order.notes ?? "").includes(marker)) return "none";
  const blockedLine = (order.notes ?? "")
    .split("\n")
    .filter((line) => line.startsWith(PURCHASE_BLOCKED_PREFIX))
    .pop();
  const blockedReason = blockedLine?.slice(PURCHASE_BLOCKED_PREFIX.length).trim();
  await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { notes: appendOrderNote(order.notes, `${marker}: alerta enviado em ${now.toISOString()}.`) }
  });
  const shortId = order.id.slice(-6).toUpperCase();
  await notifyOperator(copy.operatorPaidStuckAlert(shortId, hours, blockedReason), order.phone);
  // Cliente: bloqueio conhecido avisa já no 1º alerta; sem bloqueio, só a partir de 6h e
  // depois em 24h/48h/72h — nunca a cada 10 min.
  const tellCustomer = blockedReason ? bucket === 2 || bucket >= 24 : bucket >= 6;
  if (!tellCustomer) return "operator";
  const delivered = await deliverNotice(order.phone, copy.purchaseDelayedCustomer(shortId, Boolean(blockedReason)), { shortId });
  if (delivered === "skipped") {
    await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { notes: appendOrderNote((await prisma.deliveryOrder.findUnique({ where: { id: orderId }, select: { notes: true } }))?.notes ?? null, "⚠️ Aviso ao cliente NÃO enviado: fora da janela de 24h e sem template (LIA_TEMPLATE_ORDER_UPDATE). Avisar por outro canal.") }
    });
    return "operator";
  }
  return "operator+customer";
}

// "Não consegui comprar → estornar": um clique no /ops que estorna pelo provedor,
// fecha o pedido e explica ao cliente, com o motivo. Sem razão no pagamento
// (pedido antigo), lança a mensagem legível e o caminho manual continua valendo.
export async function opsPurchaseFailedRefund(
  orderId: string,
  reason?: string,
  opts: { origin?: "ops" | "auto"; internalReason?: string } = {}
) {
  const current = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!current) throw new Error("Order not found");
  if (!["paid", "refund_pending"].includes(current.status)) {
    throw new Error("Só um pedido pago (ou com estorno pendente) pode ser estornado por compra não realizada.");
  }
  const result = await refundOrderViaProvider(orderId);
  const safeReason = (reason ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 160);
  const notesWithoutPending = (current.notes ?? "")
    .split("\n")
    .filter((line) => line !== REFUND_PENDING_FLAG)
    .join("\n");
  const order = await prisma.deliveryOrder.update({
    where: { id: orderId },
    data: {
      status: "refunded",
      notes: appendOrderNote(
        appendOrderNote(
          notesWithoutPending,
          opts.origin === "auto"
            ? `🤖 Estorno automático (regra 04/09): compra não realizada — ${(opts.internalReason ?? safeReason).replace(/[\r\n]/g, " ").slice(0, 200)} — pelo provedor em ${new Date().toISOString()}.`
            : `🧾 Compra não realizada${safeReason ? ` (${safeReason})` : ""} — estorno pelo provedor em ${new Date().toISOString()}.`
        ),
        `${REFUND_CONFIRMED_PREFIX} integral — ${result.reference}`
      )
    }
  });
  await resetConversationForClosedOrder(order, "refund");
  const items = ((order.items as unknown as { qty: number; name: string }[]) ?? []).map((i) => (i.qty > 1 ? `${i.qty}x ${i.name}` : i.name));
  const delivered = await deliverNotice(order.phone, copy.purchaseFailedRefunded(items, result.amount, safeReason || undefined), { shortId: order.id.slice(-6).toUpperCase() });
  if (delivered === "skipped") {
    return prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { notes: appendOrderNote(order.notes, "⚠️ Aviso do estorno NÃO enviado: cliente fora da janela de 24h e sem template (LIA_TEMPLATE_ORDER_UPDATE). Avisar por outro canal.") }
    });
  }
  return order;
}
