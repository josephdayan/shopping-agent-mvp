import { NextResponse } from "next/server";
import { opsRole, requireOpsKey } from "@/lib/auth";
import { getOperatorQueue } from "@/lib/delivery-service";
import { ordersForOpsRole } from "@/lib/operator-queue-view";

export const dynamic = "force-dynamic";

// Guarda compartilhada (src/lib/auth.ts): fail-closed em deploy, tempo constante,
// cookie HMAC. `?key=` continua aceito só por compatibilidade com scripts do operador.
function authed(request: Request) {
  return requireOpsKey(request, { allowQuery: true }) === null;
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orders = await getOperatorQueue();
  const role = opsRole(request, { allowQuery: true }) ?? "owner";
  // O painel desenha por papel (15/09): o operador contratado vê a fila e as ações de
  // comprar/entregar; contas de loja e dinheiro ficam com o dono. A tela só esconde — a
  // negativa de verdade está em cada rota.
  return NextResponse.json({ orders: ordersForOpsRole(orders, role), role });
}
