// Harvest a VTEX store's public catalog into a generated TS catalog file.
// Usage: node --import tsx scripts/harvest-vtex-catalog.mts <origin> <storeKey> <outFile> [maxItems]
//          [--categories=<id,id,...>] [--deny=<regex>]
// Only public, unauthenticated endpoints are used (/api/catalog_system/pub/products/search
// paginated with _from/_to). Data is written verbatim (name/price/URL/image real); nothing
// is invented. Same recipe as the historic catalog generators.
//
// --categories restricts the harvest to those VTEX category ids (fq=C:/<id>/) instead of
// sweeping top sales. --deny drops any item whose name or category matches the regex.
// Both exist for the pharmacy vitrines: selling medicine is forbidden (ANVISA), and a
// pharmacy's top-sellers are mostly medicine, so we allowlist safe categories AND keep the
// deny regex as a second, independent guard.
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const [origin, storeKey, outFile, maxArg] = argv.filter((a) => !a.startsWith("--"));
if (!origin || !storeKey || !outFile) {
  console.error(
    "usage: harvest-vtex-catalog.mts <origin> <storeKey> <outFile> [maxItems] [--categories=id,id] [--deny=regex]"
  );
  process.exit(1);
}
const MAX = Number(maxArg ?? 1200);
const flagValue = (name: string) => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const CATEGORIES = (flagValue("categories") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const denyArg = flagValue("deny");
const DENY = denyArg ? new RegExp(denyArg, "i") : null;

type Seller = { sellerId?: string; commertialOffer?: { Price?: number; AvailableQuantity?: number } };
type Sku = { itemId?: string; nameComplete?: string; name?: string; images?: Array<{ imageUrl?: string }>; sellers?: Seller[] };
type Product = { productName?: string; brand?: string; link?: string; linkText?: string; categories?: string[]; items?: Sku[] };

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "application/json"
};

function slugCategory(categories: string[] | undefined): string {
  const first = categories?.[0] ?? "";
  return first
    .split("/")
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

async function page(from: number, to: number, category?: string): Promise<Product[]> {
  const fq = category ? `&fq=C:/${category}/` : "";
  const url = `${origin}/api/catalog_system/pub/products/search?_from=${from}&_to=${to}&O=OrderByTopSaleDESC${fq}`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 206 || res.ok) return (await res.json()) as Product[];
  throw new Error(`HTTP ${res.status} em ${url}`);
}

const out: { sku: string; name: string; brand?: string; unitPrice: number; unit: string; category: string; imageUrl?: string; productUrl: string }[] = [];
const seen = new Set<string>();
let denied = 0;

// One sweep per allowlisted category, or a single top-sales sweep when none was given.
for (const category of CATEGORIES.length ? CATEGORIES : [undefined]) {
  for (let from = 0; from < MAX; from += 50) {
    let products: Product[] = [];
    try {
      products = await page(from, Math.min(from + 49, MAX - 1), category);
    } catch (error) {
      console.warn(`\nparada em _from=${from}${category ? ` (cat ${category})` : ""}: ${error instanceof Error ? error.message : error}`);
      break;
    }
    if (!products.length) break;
    for (const product of products) {
      const item = product.items?.[0];
      const seller = item?.sellers?.find((s) => (s.commertialOffer?.AvailableQuantity ?? 0) > 0 && (s.commertialOffer?.Price ?? 0) > 0);
      const price = seller?.commertialOffer?.Price;
      const link = product.link ?? (product.linkText ? `${origin}/${product.linkText}/p` : undefined);
      const id = item?.itemId;
      if (!id || !price || !link || seen.has(id)) continue;
      const name = (item.nameComplete || item.name || product.productName || `Produto ${id}`).replace(/\s+/g, " ").trim();
      const categoryLabel = slugCategory(product.categories);
      if (DENY && (DENY.test(name) || DENY.test(categoryLabel) || DENY.test((product.categories ?? []).join(" ")))) {
        denied += 1;
        continue;
      }
      seen.add(id);
      out.push({
        sku: `${storeKey}-${id}`,
        name,
        brand: product.brand || undefined,
        unitPrice: Math.round(price * 100) / 100,
        unit: "un",
        category: categoryLabel,
        imageUrl: item.images?.[0]?.imageUrl,
        productUrl: new URL(link, origin).toString()
      });
    }
    process.stdout.write(`\r${out.length} produtos…`);
    // Be polite to the public API.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (DENY) console.log(`\n${denied} itens descartados pelo --deny`);

const header = `// GERADO por scripts/harvest-vtex-catalog.mts em ${new Date().toISOString().slice(0, 10)} a partir da
// API pública de ${origin} (dados reais: nome/preço/URL/imagem verbatim; disponíveis no momento
// da coleta). Preço é referência de vitrine — no concierge a autoridade é a cotação do operador.
// Para atualizar: node --import tsx scripts/harvest-vtex-catalog.mts ${origin} ${storeKey} ${outFile}
import type { CatalogItem } from "./types";

export const CATALOG: CatalogItem[] = `;

writeFileSync(outFile, header + JSON.stringify(out, null, 1).replace(/"([a-zA-Z]+)":/g, "$1:") + ";\n");
console.log(`\n${out.length} produtos → ${outFile}`);
