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
// Frete ao vivo consulta a rede (checkout das lojas) — nos testes fica desligado para
// os E2E de cotação instantânea serem determinísticos (tabela semeada).
process.env.LIA_LIVE_FREIGHT_OFF = "true";
// Mercado Livre é vitrine AO VIVO (rede + custo por busca): fica desligado nos testes,
// como em produção por padrão. Seus próprios testes vivem em mercadolivre-store.test.ts.
process.env.LIA_ENABLE_MERCADOLIVRE = "false";
// The conversation evals assert NLU/choice/payment behavior, not the store roster, and
// were written for the world that passed 210/210: Carrefour (mercado, min R$30, arroz),
// Petz (pet), Boticário (beleza), Decathlon (creatina), plus Oba (the catalog-gaps Oba
// tests). Pin the test registry to that set so routing stays deterministic; production
// keeps all 18 vitrines. Every later vitrine is disabled so it can't shift routing —
// as provou a rodada de 02/08, em que a conveniência da Pague Menos passou a ganhar o
// item barato do Carrefour e derrubou os evals de pedido mínimo (as novas vitrines têm
// mínimo 0). Ao somar uma vitrine, acrescente a chave aqui.
for (const store of [
  "SWIFT",
  "KALUNGA",
  "RIHAPPY",
  "CACAUSHOW",
  "KOPENHAGEN",
  "DROGARAIA",
  "DROGARIASP",
  "PAGUEMENOS",
  "DIVVINO",
  "IMIGRANTES",
  "NATURALDATERRA",
  "COBASI",
  "GIULIANAFLORES"
]) {
  process.env[`LIA_ENABLE_${store}`] = "false";
}
// The catalog-choice conversation evals exercise the legacy auto-quote flow. The manual
// concierge flow (production default) is covered by tests/manual-concierge.test.ts, which
// re-enables the flag after importing this helper.
process.env.LIA_MANUAL_CONCIERGE = "false";
