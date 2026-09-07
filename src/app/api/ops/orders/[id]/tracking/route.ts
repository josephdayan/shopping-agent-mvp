import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsKey } from "@/lib/auth";
import { recordDeliveryEvent } from "@/lib/delivery-events";

export const dynamic = "force-dynamic";
const schema = z.object({
  kind: z.enum(["out_for_delivery", "delivered"]),
  storeKey: z.string().min(1).max(80),
  storeOrderNumber: z.string().min(1).max(120),
  sourceReference: z.string().min(1).max(300),
  occurredAt: z.string().datetime({ offset: true }),
  trackingUrl: z.string().url().optional()
}).strict();

// Ingestão INTERNA: o leitor autorizado já verificou a página/API da loja.
// Não é um webhook público nem aceita inferência de data prevista como status real.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const unauthorized = requireOpsKey(request);
  if (unauthorized) return unauthorized;
  if (process.env.LIA_TRACKING_INGEST_ENABLED !== "true") return NextResponse.json({ error: "tracking ingestion disabled" }, { status: 409 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "evidência inválida" }, { status: 400 });
  try {
    const order = await recordDeliveryEvent(params.id, { ...input.data, source: "tracking_reader", occurredAt: new Date(input.data.occurredAt) });
    return NextResponse.json({ ok: true, status: order.status });
  } catch (error) {
    console.warn("[tracking:rejected]", params.id, error instanceof Error ? error.message : "failed");
    return NextResponse.json({ error: "Não foi possível aplicar a evidência; confira pedido, loja, data e etapa." }, { status: 409 });
  }
}
