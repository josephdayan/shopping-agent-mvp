import { NextResponse } from "next/server";
import { purchaseWorkerAuthorized } from "@/lib/purchase-worker-auth";
import { pixAdapter } from "@/lib/payments/mercadopago";
import { asaasPixOut } from "@/lib/payments/pix-out/asaas";
import { parsePixEmv } from "@/lib/pix-emv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Gate E6 (14/09): prova real do Pix de SAÍDA com R$1, dentro do servidor (as credenciais
// de produção são sensíveis na Vercel e não saem dela). Cria uma cobrança Pix de R$1 na
// conta Mercado Pago da Lia, decodifica e paga pela conta Asaas, e devolve os dois status.
// O dinheiro sai do Asaas e entra no Mercado Pago da própria Lia. Valor fixo; sem job; só
// com o token do comprador; desligado por LIA_PIX_OUT_OFF.
const AMOUNT_CENTS = 100;
export async function POST(request: Request) {
  if (!purchaseWorkerAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.LIA_PIX_OUT_OFF === "true") return NextResponse.json({ error: "Pix de saída pausado (LIA_PIX_OUT_OFF)." }, { status: 409 });
  if (!process.env.ASAAS_API_KEY?.trim()) return NextResponse.json({ error: "ASAAS_API_KEY ausente." }, { status: 409 });
  if (process.env.ASAAS_ENV !== "production") return NextResponse.json({ error: "ASAAS_ENV precisa ser production para o E6." }, { status: 409 });
  const orderId = `e6-${Date.now()}`;
  const report: Record<string, unknown> = { orderId, amountCents: AMOUNT_CENTS, startedAt: new Date().toISOString() };
  try {
    const charge = await pixAdapter.createPix({ orderId, amount: AMOUNT_CENTS / 100, description: "Lia E6 Pix de saida", payerEmail: "lia@liadelivery.com.br" });
    const emv = parsePixEmv(charge.copiaECola);
    report.charge = { pixId: charge.pixId, valid: emv.valid, dynamic: emv.dynamic, merchant: emv.merchantName };
    // O MP emite copia-e-cola por chave (estático com txid); a regra "só dinâmica" vale para a loja.
    if (!emv.valid) throw new Error("Cobrança do Mercado Pago não é um Pix válido.");
    const decoded = await asaasPixOut.decode(charge.copiaECola);
    report.decoded = { ...decoded, receiverDoc: decoded.receiverDoc.replace(/^(\d{3})\d+(\d{2})$/, "$1…$2") };
    if (decoded.amountCents !== AMOUNT_CENTS) throw new Error(`Valor decodificado ${decoded.amountCents} ≠ ${AMOUNT_CENTS}.`);
    const t0 = Date.now();
    const paid = await asaasPixOut.pay({ code: charge.copiaECola, amountCents: AMOUNT_CENTS, idempotencyKey: orderId, description: "Lia E6" });
    report.pay = { ...paid, ms: Date.now() - t0 };
    let status = await asaasPixOut.status(paid.providerPayoutId);
    for (let i = 0; i < 8 && status.status === "submitted"; i += 1) {
      await new Promise((r) => setTimeout(r, 3_000));
      status = await asaasPixOut.status(paid.providerPayoutId);
    }
    report.asaasStatus = status;
    let mp = await pixAdapter.getStatus(charge.pixId);
    for (let i = 0; i < 5 && mp !== "approved"; i += 1) {
      await new Promise((r) => setTimeout(r, 3_000));
      mp = await pixAdapter.getStatus(charge.pixId);
    }
    report.mercadoPagoStatus = mp;
    report.ok = status.status === "paid" && mp === "approved";
    return NextResponse.json(report);
  } catch (error) {
    report.error = error instanceof Error ? error.message : "erro";
    return NextResponse.json(report, { status: 502 });
  }
}

// Consulta posterior do mesmo teste: ?payoutId=<Asaas>&pixId=<Mercado Pago>. Nunca paga de novo.
export async function GET(request: Request) {
  if (!purchaseWorkerAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const payoutId = url.searchParams.get("payoutId")?.trim();
  const pixId = url.searchParams.get("pixId")?.trim();
  const out: Record<string, unknown> = { checkedAt: new Date().toISOString() };
  try {
    if (payoutId) out.asaasStatus = await asaasPixOut.status(payoutId);
    if (pixId) out.mercadoPagoStatus = await pixAdapter.getStatus(pixId);
    return NextResponse.json(out);
  } catch (error) {
    out.error = error instanceof Error ? error.message : "erro";
    return NextResponse.json(out, { status: 502 });
  }
}
