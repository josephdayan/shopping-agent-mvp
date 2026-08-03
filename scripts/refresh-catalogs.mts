// Recolhe TODAS as vitrines automatizáveis e mostra o que mudou de preço.
// Uso:  npm run catalog:refresh          (recolhe tudo e escreve os arquivos)
//       npm run catalog:refresh -- --dry (só compara, não escreve)
//       npm run catalog:refresh -- oba divvino   (só essas lojas)
//
// Por que existe: os catálogos são arquivos .ts estáticos — rápidos, sem rede no turno da
// conversa e sem depender de navegador remoto. O preço de vitrine é referência (a autoridade
// é a cotação do operador), mas referência velha gera atrito: o cliente vê R$ 10 e o operador
// cota R$ 14. Rodar isto uma vez por mês mantém a distância pequena.
//
// Depois de rodar: revise o resumo, `git add src/lib/stores/*-catalog.ts`, commit e deploy.
// Lojas que NÃO entram aqui (colheita manual, sem API): giulianaflores (client-rendered,
// precisa de navegador), carrefour/petz/boticario (anti-bot), kalunga/cacaushow/decathlon/
// drogaraia (seeds pequenos escritos à mão).
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Source = {
  key: string;
  origin: string;
  max: number;
  /** Farmácia: allowlist de categorias seguras (ANVISA). Ver src/lib/stores/README.md. */
  categories?: string;
  deny?: string;
};

// O deny-regex de medicamento é o mesmo das duas farmácias. A terceira guarda
// (withoutMedicine, em runtime) continua valendo mesmo se este regex falhar.
const PHARMACY_DENY =
  "medicament|remedio|rem[eé]dio|vitamina|polivitam|suplement|vacina|manipula|generico|gen[eé]rico|" +
  "comprimido|c[aá]psula|dipirona|paracetamol|ibuprofeno|amoxicilina|antibi[oó]tico|xarope|" +
  "anti-inflamat|analg[eé]sico|antit[eé]rmico|insulina|soro fisiol|teste de|exame";

const SOURCES: Source[] = [
  { key: "oba", origin: "https://secure.obahortifruti.com.br", max: 1500 },
  { key: "divvino", origin: "https://www.divvino.com.br", max: 1000 },
  { key: "naturaldaterra", origin: "https://www.naturaldaterra.com.br", max: 1000 },
  { key: "cobasi", origin: "https://www.cobasi.com.br", max: 1000 },
  { key: "rihappy", origin: "https://www.rihappy.com.br", max: 1200 },
  { key: "swift", origin: "https://loja.swift.com.br", max: 1000 },
  { key: "kopenhagen", origin: "https://www.kopenhagen.com.br", max: 300 },
  {
    key: "paguemenos",
    origin: "https://www.paguemenos.com.br",
    max: 400,
    categories: "200,300,400,600",
    deny: PHARMACY_DENY
  },
  {
    key: "drogariasp",
    origin: "https://www.drogariasaopaulo.com.br",
    max: 200,
    categories:
      "873,1135,1161,1192,1160,893,1165,1123,1238,1240,1241,1242,1243,1244,1245,1246,1257,1267," +
      "1269,1273,1303,1304,1308,1318,1319,1328,1334,1496,1500,1528,1554",
    deny: PHARMACY_DENY
  }
];

// Imigrantes não é VTEX: tem coletor próprio (páginas server-rendered).
const CUSTOM: Array<{ key: string; script: string; args: (out: string) => string[] }> = [
  {
    key: "imigrantes",
    script: "scripts/harvest-imigrantes-catalog.mts",
    args: (out) => [out, "900"]
  }
];

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry");
const only = new Set(argv.filter((a) => !a.startsWith("--")));
const wanted = (key: string) => only.size === 0 || only.has(key);

function catalogPath(key: string): string {
  return `src/lib/stores/${key}-catalog.ts`;
}

/** sku -> preço, lido de um arquivo de catálogo gerado. */
function readPrices(file: string): Map<string, number> {
  const prices = new Map<string, number>();
  if (!existsSync(file)) return prices;
  const raw = readFileSync(file, "utf8");
  // Os arquivos gerados usam chaves sem aspas (sku: "x", ... unitPrice: 9.9).
  const re = /sku:\s*"([^"]+)"[\s\S]{0,400}?unitPrice:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) prices.set(m[1], Number(m[2]));
  return prices;
}

function run(script: string, args: string[]): boolean {
  try {
    execFileSync("node", ["--import", "tsx", script, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    return true;
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr?: Buffer }).stderr ?? "") : "";
    console.error(`   ✖ falhou: ${stderr.split("\n").slice(-3).join(" ").trim() || error}`);
    return false;
  }
}

type Report = {
  key: string;
  before: number;
  after: number;
  changed: number;
  added: number;
  removed: number;
  avgDeltaPct: number;
  biggest: Array<{ sku: string; from: number; to: number }>;
};

function compare(key: string, before: Map<string, number>, after: Map<string, number>): Report {
  let changed = 0;
  let deltaSum = 0;
  const moves: Array<{ sku: string; from: number; to: number }> = [];
  for (const [sku, newPrice] of after) {
    const oldPrice = before.get(sku);
    if (oldPrice == null) continue;
    if (Math.abs(oldPrice - newPrice) < 0.005) continue;
    changed += 1;
    deltaSum += (newPrice - oldPrice) / oldPrice;
    moves.push({ sku, from: oldPrice, to: newPrice });
  }
  moves.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  let added = 0;
  for (const sku of after.keys()) if (!before.has(sku)) added += 1;
  let removed = 0;
  for (const sku of before.keys()) if (!after.has(sku)) removed += 1;
  return {
    key,
    before: before.size,
    after: after.size,
    changed,
    added,
    removed,
    avgDeltaPct: changed ? (deltaSum / changed) * 100 : 0,
    biggest: moves.slice(0, 3)
  };
}

const reports: Report[] = [];
const failed: string[] = [];
// No modo --dry a colheita vai para um arquivo temporário e o catálogo real não é tocado.
const scratch = dryRun ? mkdtempSync(join(tmpdir(), "lia-catalog-")) : null;

for (const source of SOURCES) {
  if (!wanted(source.key)) continue;
  const target = catalogPath(source.key);
  const out = scratch ? join(scratch, `${source.key}.ts`) : target;
  const before = readPrices(target);
  process.stdout.write(`→ ${source.key.padEnd(16)}`);
  const args = [source.origin, source.key, out, String(source.max)];
  if (source.categories) args.push(`--categories=${source.categories}`);
  if (source.deny) args.push(`--deny=${source.deny}`);
  if (!run("scripts/harvest-vtex-catalog.mts", args)) {
    failed.push(source.key);
    continue;
  }
  const after = readPrices(out);
  // Uma colheita vazia normalmente é a loja bloqueando, não a loja sem produto:
  // nunca deixar isso apagar um catálogo bom.
  if (after.size === 0) {
    console.error(`   ✖ colheita vazia — catálogo anterior preservado`);
    if (!scratch && before.size > 0) writeFileSync(target, readFileSync(target, "utf8"));
    failed.push(source.key);
    continue;
  }
  const report = compare(source.key, before, after);
  reports.push(report);
  console.log(
    `${String(report.after).padStart(5)} itens · ${report.changed} preços mudaram · +${report.added}/-${report.removed}`
  );
}

for (const custom of CUSTOM) {
  if (!wanted(custom.key)) continue;
  const target = catalogPath(custom.key);
  const out = scratch ? join(scratch, `${custom.key}.ts`) : target;
  const before = readPrices(target);
  process.stdout.write(`→ ${custom.key.padEnd(16)}`);
  if (!run(custom.script, custom.args(out))) {
    failed.push(custom.key);
    continue;
  }
  const after = readPrices(out);
  if (after.size === 0) {
    console.error(`   ✖ colheita vazia — catálogo anterior preservado`);
    failed.push(custom.key);
    continue;
  }
  const report = compare(custom.key, before, after);
  reports.push(report);
  console.log(
    `${String(report.after).padStart(5)} itens · ${report.changed} preços mudaram · +${report.added}/-${report.removed}`
  );
}

console.log("\n" + "─".repeat(72));
console.log(dryRun ? "SIMULAÇÃO (nenhum arquivo alterado)" : "CATÁLOGOS ATUALIZADOS");
console.log("─".repeat(72));

const totalAfter = reports.reduce((sum, r) => sum + r.after, 0);
const totalChanged = reports.reduce((sum, r) => sum + r.changed, 0);
for (const r of reports) {
  const drift = r.changed ? ` · variação média ${r.avgDeltaPct >= 0 ? "+" : ""}${r.avgDeltaPct.toFixed(1)}%` : "";
  console.log(`${r.key.padEnd(16)} ${String(r.after).padStart(5)} itens${drift}`);
  for (const m of r.biggest) {
    console.log(`                 ${m.sku}: R$ ${m.from.toFixed(2)} → R$ ${m.to.toFixed(2)}`);
  }
}
console.log(`\n${totalAfter} itens nas lojas recolhidas · ${totalChanged} preços mudaram desde a última colheita`);
if (failed.length) console.log(`⚠️  falharam (catálogo antigo preservado): ${failed.join(", ")}`);

console.log(
  "\nLojas fora desta rotina (colheita manual): giulianaflores (navegador), carrefour, petz,\n" +
    "boticario (anti-bot), kalunga, cacaushow, decathlon, drogaraia (seeds pequenos)."
);
if (!dryRun) {
  console.log("\nPróximo passo: conferir o resumo, rodar `npm test`, commitar os *-catalog.ts e implantar.");
}
