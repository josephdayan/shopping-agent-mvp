import { Browserbase } from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function authed(request: Request) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  if (!expected) return true;
  const url = new URL(request.url);
  const key =
    request.headers.get("x-ops-key") ??
    url.searchParams.get("key") ??
    (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)ops_session=([^;]+)/)?.[1];
  return key === expected;
}

export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.BROWSERBASE_API_KEY || !process.env.CARREFOUR_BROWSER_CONTEXT_ID) {
    return NextResponse.json({ error: "Browserbase Carrefour não configurado" }, { status: 409 });
  }

  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
  const session = await bb.sessions.create({
    keepAlive: true,
    browserSettings: {
      context: { id: process.env.CARREFOUR_BROWSER_CONTEXT_ID, persist: true },
      allowedDomains: ["carrefour.com.br", "mercado.carrefour.com.br", "carrinho.mercado.carrefour.com.br"],
      recordSession: true
    }
  });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://mercado.carrefour.com.br", { waitUntil: "domcontentloaded", timeout: 45_000 });
  } finally {
    await browser.close();
  }
  const live = await bb.sessions.debug(session.id);
  return NextResponse.json({ ok: true, sessionId: session.id, debuggerUrl: live.debuggerFullscreenUrl });
}
