import { NextResponse } from "next/server";
import { z } from "zod";
import {
  trackingWorkerAuthorized,
  claimTracking,
  reportTracking,
  reportMail,
} from "@/lib/tracking-worker";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("claim"),
      workerId: z.string().min(1).max(120),
      stores: z.array(z.string()).min(1).max(20),
    })
    .strict(),
  z
    .object({
      action: z.literal("report_mail"),
      storeKey: z.string().min(1).max(80),
      storeOrderNumber: z.string().min(3).max(120),
      kind: z.enum(["created", "paid", "invoiced", "out_for_delivery", "delivered", "canceled"]),
      messageId: z.string().min(1).max(200),
      receivedAt: z.string().datetime(),
      trackingUrl: z.string().url().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("report"),
      id: z.string().min(1),
      workerId: z.string().min(1).max(120),
      claimToken: z.string().uuid(),
      evidence: z
        .object({
          pageUrl: z.string().url().optional(),
          storeOrderNumber: z.string().max(120).optional(),
          statusText: z.string().max(150).optional(),
          observedAt: z.string().datetime().optional(),
          wholeOrder: z.boolean().optional(),
          error: z.string().max(200).optional(),
        })
        .strict(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  if (!trackingWorkerAuthorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = schema.safeParse(await request.json().catch(() => null));
  if (!b.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  try {
    const x = b.data;
    if (x.action === "report_mail") return NextResponse.json(await reportMail(x));
    return NextResponse.json(
      x.action === "claim"
        ? { job: await claimTracking(x.workerId, x.stores) }
        : await reportTracking(x.id, x.workerId, x.claimToken, x.evidence),
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conciliar esta consulta" },
      { status: 409 },
    );
  }
}
