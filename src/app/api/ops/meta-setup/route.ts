import { NextResponse } from "next/server";
import { requireOpsKey } from "@/lib/auth";
import { runMetaSetup, type MetaSetupAction } from "@/lib/meta-setup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Configuração do número na Meta (perfil, boas-vindas, Flow de endereço) executada de
// dentro da Vercel, onde o token vive. Só com a sessão do /ops (mesma guarda das outras
// rotas de operação). GET = status (leitura); POST { action } = grava.
const ACTIONS: MetaSetupAction[] = ["status", "profile", "picture", "welcome", "flow"];

export async function GET(request: Request) {
  const unauthorized = requireOpsKey(request, { allowQuery: true });
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json({ ok: true, result: await runMetaSetup("status") });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 600) : "failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const unauthorized = requireOpsKey(request, { allowQuery: true });
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action as MetaSetupAction | undefined;
  if (!action || !ACTIONS.includes(action)) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  try {
    const result = await runMetaSetup(action);
    console.log("[ops:meta-setup]", action, JSON.stringify(result).slice(0, 300));
    return NextResponse.json({ ok: true, action, result });
  } catch (error) {
    console.error("[ops:meta-setup:error]", action, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, action, error: error instanceof Error ? error.message.slice(0, 600) : "failed" }, { status: 502 });
  }
}
