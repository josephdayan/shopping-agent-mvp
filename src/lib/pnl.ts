// Financeiro por pedido (23/09/2026): a "planilha" do dono, gerada do banco em vez de
// digitada. Por pedido: o que o cliente pagou, taxa do provedor, custo real na loja
// (produtos + frete), margem embutida e quanto sobrou. Três camadas:
//   computeOrderPnl  — puro, unit-testado; recebe pedido + razão de pagamentos.
//   loadPnl          — lê o banco (pedidos com dinheiro) e aplica o cálculo.
//   pnlCsv           — exporta em CSV pt-BR (";" e vírgula decimal) pra Excel/Sheets.
// Toda estimativa vem marcada: taxa do MP antes do backfill e custo da loja antes do
// operador digitar o valor pago. Zero nunca é chutado no lugar de "não sei".
import { prisma } from "@/lib/prisma";
import { CARD_MDR } from "@/lib/conversation-types";
import { isCardCharge } from "@/lib/order-flags";

export type PnlPaymentRow = {
  provider: string;
  method: string;
  status: string;
  amountCents: number;
  refundedCents: number;
  feeCents: number | null;
};

export type PnlOrderInput = {
  id: string;
  createdAt: Date;
  paidAt: Date | null;
  deliveredAt: Date | null;
  status: string;
  customerName: string | null;
  phone: string;
  storeLabel: string;
  storeOrderNumber: string | null;
  itemsSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  storePaidTotal: number | null;
  notes?: string | null;
  pixCopiaECola?: string | null;
  payments: PnlPaymentRow[];
  purchaseJobs: { status: string; actualTotal: number | null }[];
};

export type OrderPnl = {
  orderId: string;
  shortId: string;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  status: string;
  statusLabel: string;
  customer: string;
  store: string;
  storeOrderNumber: string | null;
  method: "pix" | "card" | null;
  purchased: boolean;
  // Em aberto: pago sem compra ainda, ou estorno pedido e não executado. O resultado
  // desses ainda vai mudar — a tela e o resumo tratam como estimativa.
  open: boolean;
  // Entrada
  customerPaid: number;
  refunded: number;
  refundEstimated: boolean;
  providerFee: number;
  providerFeeEstimated: boolean;
  netReceived: number;
  // Saída
  storeCostQuoted: number;
  storeCost: number;
  storeCostEstimated: boolean;
  deliveryFee: number;
  markup: number;
  cardSurcharge: number;
  // Resultado
  profit: number;
  profitPct: number | null;
};

export type PnlMonth = {
  month: string; // YYYY-MM (America/Sao_Paulo)
  orders: number;
  customerPaid: number;
  refunded: number;
  providerFee: number;
  storeCost: number;
  profit: number;
  estimated: number; // pedidos com algum valor ainda estimado
};

const PURCHASED_STATUSES = new Set([
  "retailer_preparing",
  "retailer_out_for_delivery",
  "delivered",
  "operator_buying",
  "ready_for_pickup",
  "dispatched"
]);

const COUNTED_PAYMENT_STATUSES = new Set(["approved", "partially_refunded", "refunded"]);

export const PNL_STATUS_LABEL: Record<string, string> = {
  paid: "pago, aguardando compra",
  retailer_preparing: "comprado, loja preparando",
  retailer_out_for_delivery: "saiu para entrega",
  operator_buying: "comprado",
  ready_for_pickup: "pronto para retirada",
  dispatched: "saiu para entrega",
  delivered: "entregue",
  refund_pending: "estorno pendente",
  refunded: "estornado",
  canceled: "cancelado"
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rate(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : fallback;
}

// Alíquotas usadas SÓ enquanto o MP não informou a taxa real. Pix do MP cobra 0,99% do
// recebedor; cartão pelo Checkout Pro fica na casa do MDR que repassamos ao cliente.
export function estimatedProviderFee(amount: number, method: "pix" | "card", provider: string): number {
  if (provider === "mock" || amount <= 0) return 0;
  const r = method === "card" ? rate("LIA_MP_CARD_FEE_RATE", CARD_MDR) : rate("LIA_MP_PIX_FEE_RATE", 0.0099);
  return round2(amount * r);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : phone;
}

export function computeOrderPnl(order: PnlOrderInput): OrderPnl {
  const payments = order.payments.filter((p) => COUNTED_PAYMENT_STATUSES.has(p.status));
  const cardCharge = isCardCharge({ notes: order.notes ?? null, pixCopiaECola: order.pixCopiaECola ?? null });
  const method: "pix" | "card" | null = payments[0]
    ? payments[0].method === "card" ? "card" : "pix"
    : order.paidAt ? (cardCharge ? "card" : "pix") : null;

  // Razão em primeiro lugar; pedido pago sem linha (mock antigo) usa o total cobrado.
  const ledgerPaid = payments.reduce((sum, p) => sum + p.amountCents, 0) / 100;
  const customerPaid = round2(payments.length ? ledgerPaid : order.paidAt ? order.total : 0);
  const ledgerRefunded = payments.reduce((sum, p) => sum + p.refundedCents, 0) / 100;
  // Estorno pedido e ainda não executado: o dinheiro VAI voltar — contar como devolvido
  // (estimado) em vez de mostrar o valor inteiro como "sobrou".
  const pendingRefund = order.status === "refund_pending" && ledgerRefunded === 0;
  const refunded = round2(
    payments.length ? (pendingRefund ? customerPaid : ledgerRefunded) : order.status === "refunded" || pendingRefund ? customerPaid : 0
  );

  // Taxa por pagamento: real quando lida do MP, estimada pela alíquota enquanto não. Num
  // estorno total o MP devolve a tarifa; parcial, proporcional — a parte estornada não
  // paga taxa.
  let providerFee = 0;
  let providerFeeEstimated = false;
  if (payments.length) {
    for (const p of payments) {
      const amount = p.amountCents / 100;
      const refundedCents = pendingRefund ? p.amountCents : p.refundedCents;
      const kept = amount > 0 ? Math.max(0, amount - refundedCents / 100) / amount : 0;
      const m: "pix" | "card" = p.method === "card" ? "card" : "pix";
      let fee: number;
      if (p.feeCents != null) fee = p.feeCents / 100;
      else {
        fee = estimatedProviderFee(amount, m, p.provider);
        if (p.provider !== "mock" && amount > 0) providerFeeEstimated = true;
      }
      providerFee += fee * kept;
    }
  } else if (customerPaid > 0 && method) {
    providerFee = estimatedProviderFee(customerPaid, method, "unknown") * (customerPaid > 0 ? (customerPaid - refunded) / customerPaid : 0);
    providerFeeEstimated = true;
  }
  providerFee = round2(providerFee);
  const netReceived = round2(customerPaid - refunded - providerFee);

  const purchased = PURCHASED_STATUSES.has(order.status) || Boolean(order.storeOrderNumber);
  // Pago e ainda sem compra: o custo AINDA vai sair — a cotação entra como estimativa,
  // senão o pedido inteiro pareceria lucro até o operador comprar.
  const awaitingPurchase = order.status === "paid" && !purchased;
  const storeCostQuoted = round2(order.itemsSubtotal + order.deliveryFee);
  const jobsActual = order.purchaseJobs
    .filter((j) => j.status === "completed" && j.actualTotal != null && Number.isFinite(j.actualTotal))
    .reduce((sum, j) => sum + (j.actualTotal as number), 0);
  const storeCostActual = order.storePaidTotal != null ? order.storePaidTotal : jobsActual > 0 ? jobsActual : null;
  const storeCost = round2(storeCostActual != null ? storeCostActual : purchased || awaitingPurchase ? storeCostQuoted : 0);
  const storeCostEstimated = storeCostActual == null && (purchased || awaitingPurchase);

  const markup = round2(order.serviceFee);
  const cardSurcharge = round2(Math.max(0, order.total - (order.itemsSubtotal + order.serviceFee + order.deliveryFee)));
  const profit = round2(netReceived - storeCost);
  const profitPct = customerPaid > 0 ? round2((profit / customerPaid) * 100) : null;

  return {
    orderId: order.id,
    shortId: order.id.slice(-6).toUpperCase(),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    status: order.status,
    statusLabel: PNL_STATUS_LABEL[order.status] ?? order.status,
    customer: order.customerName ? `${order.customerName} (${maskPhone(order.phone)})` : maskPhone(order.phone),
    store: order.storeLabel,
    storeOrderNumber: order.storeOrderNumber,
    method,
    purchased,
    open: awaitingPurchase || pendingRefund,
    customerPaid,
    refunded,
    refundEstimated: pendingRefund,
    providerFee,
    providerFeeEstimated,
    netReceived,
    storeCostQuoted,
    storeCost,
    storeCostEstimated,
    deliveryFee: round2(order.deliveryFee),
    markup,
    cardSurcharge,
    profit,
    profitPct
  };
}

const monthFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });

export function pnlMonthKey(iso: string): string {
  // en-CA dá "2026-09" direto (ano-mês); sem depender do locale da máquina.
  return monthFormatter.format(new Date(iso)).slice(0, 7);
}

export function summarizePnl(rows: OrderPnl[]): PnlMonth[] {
  const months = new Map<string, PnlMonth>();
  for (const row of rows) {
    const key = pnlMonthKey(row.paidAt ?? row.createdAt);
    const month = months.get(key) ?? { month: key, orders: 0, customerPaid: 0, refunded: 0, providerFee: 0, storeCost: 0, profit: 0, estimated: 0 };
    month.orders += 1;
    month.customerPaid = round2(month.customerPaid + row.customerPaid);
    month.refunded = round2(month.refunded + row.refunded);
    month.providerFee = round2(month.providerFee + row.providerFee);
    month.storeCost = round2(month.storeCost + row.storeCost);
    month.profit = round2(month.profit + row.profit);
    if (row.providerFeeEstimated || row.storeCostEstimated || row.refundEstimated) month.estimated += 1;
    months.set(key, month);
  }
  return [...months.values()].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

// Pedidos com dinheiro envolvido: pagos (ou com linha no razão), nos últimos N meses.
export async function loadPnl(input: { months?: number; now?: Date } = {}): Promise<OrderPnl[]> {
  const months = Math.max(1, Math.min(36, Math.round(input.months ?? 3)));
  const now = input.now ?? new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      createdAt: { gte: since },
      OR: [{ paidAt: { not: null } }, { payments: { some: {} } }]
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, createdAt: true, paidAt: true, deliveredAt: true, status: true, customerName: true, phone: true,
      storeLabel: true, storeOrderNumber: true, itemsSubtotal: true, deliveryFee: true, serviceFee: true, total: true,
      storePaidTotal: true, notes: true, pixCopiaECola: true,
      payments: { select: { provider: true, method: true, status: true, amountCents: true, refundedCents: true, feeCents: true } },
      purchaseJobs: { select: { status: true, actualTotal: true } }
    }
  });
  return orders.map(computeOrderPnl);
}

// CSV pt-BR: separador ";" e vírgula decimal, que é o que o Excel/Numbers em português e o
// Google Sheets abrem direto. BOM pro Excel reconhecer UTF-8 (acentos).
const CSV_COLUMNS: [string, (r: OrderPnl) => string | number | null | boolean][] = [
  ["Pedido", (r) => r.shortId],
  ["Pago em", (r) => r.paidAt],
  ["Entregue em", (r) => r.deliveredAt],
  ["Situação", (r) => r.statusLabel],
  ["Cliente", (r) => r.customer],
  ["Loja", (r) => r.store],
  ["Nº na loja", (r) => r.storeOrderNumber],
  ["Forma", (r) => r.method],
  ["Cliente pagou", (r) => r.customerPaid],
  ["Estornado", (r) => r.refunded],
  ["Estorno estimado?", (r) => r.refundEstimated],
  ["Taxa provedor", (r) => r.providerFee],
  ["Taxa estimada?", (r) => r.providerFeeEstimated],
  ["Líquido recebido", (r) => r.netReceived],
  ["Custo loja cotado", (r) => r.storeCostQuoted],
  ["Custo loja", (r) => r.storeCost],
  ["Custo estimado?", (r) => r.storeCostEstimated],
  ["Frete", (r) => r.deliveryFee],
  ["Margem embutida", (r) => r.markup],
  ["Acréscimo cartão", (r) => r.cardSurcharge],
  ["Sobrou", (r) => r.profit],
  ["% sobre o pago", (r) => r.profitPct]
];

function csvCell(value: string | number | null | boolean): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number") return value.toFixed(2).replace(".", ",");
  const text = /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false })
    : value;
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function pnlCsv(rows: OrderPnl[]): string {
  const header = CSV_COLUMNS.map(([name]) => name).join(";");
  const lines = rows.map((row) => CSV_COLUMNS.map(([, pick]) => csvCell(pick(row))).join(";"));
  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}
