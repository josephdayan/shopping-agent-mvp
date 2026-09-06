// Grava `popularity` (posição no "mais vendidos" da loja) nos catálogos VTEX já
// coletados com O=OrderByTopSaleDESC — sem rede, pela ordem do arquivo. O harvest novo
// já emite o campo; este script é para os arquivos existentes. Uso: npx tsx scripts/backfill-popularity.mts
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const STORES = ["paguemenos", "drogariasp", "cobasi", "oba", "swift", "divvino", "kopenhagen", "rihappy", "naturaldaterra"];
for (const key of STORES) {
  const file = `src/lib/stores/${key}-catalog.ts`;
  const mod = (await import(pathToFileURL(file).href)) as { CATALOG: Array<Record<string, unknown>> };
  const items = mod.CATALOG.map((item, i) => ({ ...item, popularity: (item.popularity as number | undefined) ?? i + 1 }));
  const src = readFileSync(file, "utf8");
  const head = src.slice(0, src.indexOf("export const CATALOG"));
  const body = "export const CATALOG: CatalogItem[] = " + JSON.stringify(items, null, 1).replace(/"([a-zA-Z]+)":/g, "$1:") + ";\n";
  writeFileSync(file, head + body);
  console.log(`${key}: ${items.length} itens com popularity`);
}
