import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, provider: "mercado_livre" });
}

export async function POST(request: Request) {
  const payload = await readJson(request);
  console.info("[mercado-livre:notification]", payload);

  return NextResponse.json({ ok: true });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
