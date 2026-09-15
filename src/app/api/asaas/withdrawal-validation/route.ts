import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Validação de saque via webhook do Asaas (docs.asaas.com/docs/mecanismo-para-validacao-de-
// saque-via-webhooks), 14/09: substitui o token SMS/app das "ações críticas" para saídas
// feitas pela API. O Asaas chama ~5 s após criar a operação; sem APPROVED/REFUSED válido em
// 3 tentativas ele cancela. Regra: só aprovamos o que a PRÓPRIA Lia iniciou — um Pix de QR
// com PixPayout em curso de mesmo valor (e id, quando houver), ou o teste E6 de R$1. Todo o
// resto (transferências, boletos, recargas, estornos) é recusado.
function tokenOk(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  const got = request.headers.get("asaas-access-token")?.trim() ?? "";
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
const refuse = (refuseReason: string) => NextResponse.json({ status: "REFUSED", refuseReason });

export async function POST(request: Request) {
  if (!tokenOk(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("corpo inválido");
  }
  const type = String(body.type ?? "");
  if (type !== "PIX_QR_CODE") {
    console.warn("[asaas:withdrawal] recusado por tipo", type);
    return refuse(`Lia só paga Pix de QR Code (recebido: ${type || "?"}).`);
  }
  const op = (body.pixQrCode ?? body.pixTransaction ?? body.transfer ?? {}) as Record<string, unknown>;
  const cents = Math.round(Number(op.value ?? op.amount ?? NaN) * 100);
  const id = typeof op.id === "string" ? op.id : null;
  const description = String(op.description ?? "");
  if (!Number.isFinite(cents) || cents <= 0) return refuse("valor ausente.");
  // Teste E6 (rota purchase-worker/pix-out-test): R$1 com descrição fixa.
  if (cents === 100 && description === "Lia E6") {
    console.log("[asaas:withdrawal] aprovado E6", id);
    return NextResponse.json({ status: "APPROVED" });
  }
  const since = new Date(Date.now() - 2 * 3_600_000);
  const payout = await prisma.pixPayout.findFirst({
    where: {
      provider: "asaas",
      amountCents: cents,
      status: { in: ["submitting", "submitted"] },
      createdAt: { gte: since },
      ...(id ? { OR: [{ providerPayoutId: id }, { providerPayoutId: null }] } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!payout) {
    console.warn("[asaas:withdrawal] recusado: sem PixPayout correspondente", { cents, id, description });
    return refuse("Nenhum pagamento da Lia corresponde a esta operação.");
  }
  const expectedTag = `Lia #${payout.deliveryOrderId.slice(-6).toUpperCase()}`;
  if (description && !description.startsWith(expectedTag)) {
    console.warn("[asaas:withdrawal] recusado: descrição não confere", { description, expectedTag });
    return refuse("Descrição não confere com o pedido da Lia.");
  }
  console.log("[asaas:withdrawal] aprovado", { payout: payout.id, cents, id });
  return NextResponse.json({ status: "APPROVED" });
}
