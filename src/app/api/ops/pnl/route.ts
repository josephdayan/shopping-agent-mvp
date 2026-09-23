import { NextResponse } from "next/server";
import { opsRole, requireOpsKey } from "@/lib/auth";
import { loadPnl, pnlCsv, summarizePnl } from "@/lib/pnl";

export const dynamic = "force-dynamic";

// Financeiro por pedido (23/09). Dinheiro é do dono (15/09): o operador contratado recebe
// 403 aqui mesmo com sessão válida — a tela só esconde, a negativa é a rota.
export async function GET(request: Request) {
  if (requireOpsKey(request, { allowQuery: true }) !== null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const role = opsRole(request, { allowQuery: true }) ?? "owner";
  if (role !== "owner") return NextResponse.json({ error: "Financeiro é do dono da operação." }, { status: 403 });

  const url = new URL(request.url);
  const csv = url.searchParams.get("format") === "csv";
  const requested = Number(url.searchParams.get("months") ?? (csv ? 12 : 3));
  const months = Number.isFinite(requested) ? Math.max(1, Math.min(36, Math.round(requested))) : csv ? 12 : 3;
  const rows = await loadPnl({ months });
  if (csv) {
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(pnlCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lia-financeiro-${stamp}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  }
  return NextResponse.json({ generatedAt: new Date().toISOString(), months, rows, summary: summarizePnl(rows) });
}
