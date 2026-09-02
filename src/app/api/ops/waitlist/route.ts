import { NextResponse } from "next/server";
import { requireOpsKey } from "@/lib/auth";
import { getWaitlist } from "@/lib/delivery-service";

export const dynamic = "force-dynamic";

// Guarda compartilhada (src/lib/auth.ts): fail-closed em deploy, tempo constante,
// cookie HMAC. `?key=` continua aceito só por compatibilidade com scripts do operador.
function authed(request: Request) {
  return requireOpsKey(request, { allowQuery: true }) === null;
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getWaitlist());
}
