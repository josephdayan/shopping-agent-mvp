// Diagnóstico agregado somente leitura. O razão local não substitui conciliação bancária.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { prisma } = await import("../src/lib/prisma");
try {
  const orders = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.deliveryOrder.findMany({ select: {
      status: true, createdAt: true, paidAt: true, deliveredAt: true, storeOrderNumber: true,
      storeKey: true, total: true, itemsSubtotal: true, serviceFee: true, deliveryFee: true,
      payments: { select: { provider: true, providerPaymentId: true, amountCents: true, refundedCents: true, status: true } }
    } });
  }, { timeout: 30_000 });
  const ledgerOrders = orders.filter(o => o.payments.some(p => ["mercadopago", "pagarme"].includes(p.provider) && !p.providerPaymentId.includes("mock")));
  const payments = ledgerOrders.flatMap(o => o.payments.filter(p => ["mercadopago", "pagarme"].includes(p.provider) && !p.providerPaymentId.includes("mock")));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), totalOrdersIncludingTests: orders.length,
    ordersWithProviderLedger: ledgerOrders.length, recordedPayments: payments.length,
    recordedAmountCents: payments.reduce((s,p)=>s+p.amountCents,0), refundedCents: payments.reduce((s,p)=>s+p.refundedCents,0),
    byStatus: ledgerOrders.reduce<Record<string, number>>((a,o)=>{a[o.status]=(a[o.status]??0)+1;return a;},{}),
    byStore: ledgerOrders.reduce<Record<string, number>>((a,o)=>{a[o.storeKey]=(a[o.storeKey]??0)+1;return a;},{}),
    withRetailerOrderNumber: ledgerOrders.filter(o=>o.storeOrderNumber).length,
    withDeliveredAt: ledgerOrders.filter(o=>o.deliveredAt).length,
    totalQuotedServiceFee: Math.round(ledgerOrders.reduce((s,o)=>s+o.serviceFee,0)*100)/100,
    caveat: "Somente registros do banco; não valida liquidação externa, não separa dono de cliente e não inclui pagamentos históricos sem razão. Taxa cotada não é lucro."
  },null,2));
} catch {
  console.error("Não foi possível ler as métricas; nenhuma conclusão de fila vazia."); process.exitCode=1;
} finally { await prisma.$disconnect(); }
