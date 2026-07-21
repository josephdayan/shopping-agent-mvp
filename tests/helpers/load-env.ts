// Loads .env into process.env BEFORE any prisma/adapter module is imported (Next.js
// does this automatically; the plain node test runner does not). Import this FIRST in
// every test file that touches the database. Also pins the flags that make the
// conversation deterministic: mock WhatsApp provider, no OpenAI (heuristic fallback),
// no live scraping.
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const raw = readFileSync(join(__dirname, "..", "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // no .env — tests that need the DB will fail loudly on connect
}

process.env.WHATSAPP_PROVIDER = "mock";
process.env.OPENAI_API_KEY = "";
process.env.LIA_RETAILER_TEST_SEED = "true";
process.env.LIA_SEND_PHOTOS = "false";
// The catalog-choice conversation evals exercise the legacy auto-quote flow. The manual
// concierge flow (production default) is covered by tests/manual-concierge.test.ts, which
// re-enables the flag after importing this helper.
process.env.LIA_MANUAL_CONCIERGE = "false";
