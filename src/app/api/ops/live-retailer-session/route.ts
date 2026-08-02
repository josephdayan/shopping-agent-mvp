import { NextResponse } from "next/server";
import { Browserbase } from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

export const dynamic = "force-dynamic";

type Store = "petz" | "boticario";
type Action = "open" | "release";

function requestedStore(value: unknown): Store | null {
  return value === "petz" || value === "boticario" ? value : null;
}

function requestedAction(value: unknown): Action | null {
  return value === undefined || value === "open" ? "open" : value === "release" ? "release" : null;
}

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

// Opens a retailer's persisted Context for an operator to perform retailer-owned UI
// steps (such as enabling delivery). It does not create a cart, send a message,
// collect a payment, or expose the Browserbase API key/connect URL.
export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { store?: unknown; action?: unknown };
  const store = requestedStore(body.store);
  const action = requestedAction(body.action);
  if (!store || !action) return NextResponse.json({ error: "store must be petz or boticario; action must be open or release" }, { status: 400 });

  const apiKey = process.env.BROWSERBASE_API_KEY;
  const contextId = store === "petz" ? process.env.PETZ_BROWSER_CONTEXT_ID : process.env.BOTICARIO_BROWSER_CONTEXT_ID;
  if (!apiKey || !contextId) return NextResponse.json({ error: "Browserbase Context is not configured for this retailer" }, { status: 409 });

  const country = store === "petz" ? (process.env.PETZ_BROWSER_PROXY_COUNTRY ?? process.env.BROWSERBASE_PROXY_COUNTRY ?? "BR").trim().toUpperCase() : "";
  const browserbase = new Browserbase({ apiKey });
  if (action === "release") {
    // Context changes (such as retailer login/address selection) are made durable only
    // after its live Browserbase session ends. Restrict release to this exact Context.
    const liveSessions = await browserbase.sessions.list({ status: "RUNNING" });
    const matching = liveSessions.filter((session) => session.contextId === contextId);
    await Promise.all(matching.map((session) => browserbase.sessions.update(session.id, { status: "REQUEST_RELEASE" })));
    return NextResponse.json({ ok: true, store, released: matching.length });
  }
  const session = await browserbase.sessions.create({
    keepAlive: true,
    timeout: 3_600,
    browserSettings: {
      context: { id: contextId, persist: true },
      allowedDomains: [store === "petz" ? "petz.com.br" : "boticario.com.br"],
      recordSession: true,
      solveCaptchas: false
    },
    ...(country && /^[A-Z]{2}$/.test(country) ? { proxies: [{ type: "browserbase" as const, geolocation: { country } }] } : {})
  });
  // A live debugger otherwise opens on an empty tab. Opening only the retailer home
  // gives the operator a usable starting point without selecting an item or touching checkout.
  const remoteBrowser = await chromium.connectOverCDP(session.connectUrl);
  const context = remoteBrowser.contexts()[0];
  const page = context?.pages()[0] ?? await context?.newPage();
  if (!page) return NextResponse.json({ error: "Browserbase did not expose a usable page" }, { status: 502 });
  await page.goto(store === "petz" ? "https://www.petz.com.br/" : "https://www.boticario.com.br/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000
  });
  const liveUrls = await browserbase.sessions.debug(session.id);

  return NextResponse.json({ ok: true, store, debuggerFullscreenUrl: liveUrls.debuggerFullscreenUrl });
}
