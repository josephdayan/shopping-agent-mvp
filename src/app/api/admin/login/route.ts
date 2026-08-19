import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, adminAuthConfigured, adminSessionValue, validateAdminLogin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const schema = z.object({ user: z.string().min(1), password: z.string().min(1) });

export async function POST(request: Request) {
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "ADMIN_USER/ADMIN_PASSWORD não configurados" }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validateAdminLogin(parsed.data.user, parsed.data.password)) {
    return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminSessionValue()!, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30 // 30 dias
  });
  return res;
}
