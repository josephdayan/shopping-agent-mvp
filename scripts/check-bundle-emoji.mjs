// Guarda pós-build: o minificador SWC já corrompeu emoji de copy ao fundir strings em
// template literals — emitia "\\uD83D\\uDE42" (barra dupla) e o cliente via o texto
// literal no WhatsApp em vez de 🙂 (produção, 07/08). Com serverMinification desligado
// isso não deve mais acontecer; se alguma mudança de toolchain reintroduzir, o build
// FALHA aqui em vez de mandar lixo pro cliente.
//
// O padrão procurado é backslash duplo seguido de surrogate high (uD800-uDBFF) dentro
// dos chunks de servidor — a forma exata do bug. Sourcemaps ficam de fora (lá o escape
// duplo é legítimo, é JSON).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dirs = [".next/server/chunks", ".next/server/app"];
const bad = [];

for (const dir of dirs) {
  let entries = [];
  try {
    entries = readdirSync(dir, { recursive: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    const file = join(dir, String(entry));
    if (!file.endsWith(".js")) continue;
    let content = "";
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const hits = content.match(/\\\\uD[89AB][0-9A-F]{2}/g);
    if (hits) bad.push(`${file}: ${[...new Set(hits)].join(", ")}`);
  }
}

if (bad.length) {
  console.error("✖ Emoji corrompido no bundle (surrogate com barra dupla) — o cliente veria o texto literal no WhatsApp:");
  for (const line of bad) console.error("  " + line);
  process.exit(1);
}
console.log("✓ bundle sem emoji corrompido");
