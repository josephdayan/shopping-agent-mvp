// Harvest Imigrantes Bebidas' public catalog into a generated TS catalog file.
// Usage: node --import tsx scripts/harvest-imigrantes-catalog.mts <outFile> [maxItems]
//
// Imigrantes is NOT a VTEX store (no public catalog API), but its category pages are
// server-rendered, so a plain fetch + parse works — no Chrome/Browserbase needed. Only
// public pages are read and every field (name/price/image/URL) is written verbatim.
// To refresh: re-run this script.
import { writeFileSync } from "node:fs";

const [outFile, maxArg] = process.argv.slice(2);
if (!outFile) {
  console.error("usage: harvest-imigrantes-catalog.mts <outFile> [maxItems]");
  process.exit(1);
}
const MAX = Number(maxArg ?? 900);
const ORIGIN = "https://www.imigrantesbebidas.com.br";

// Real top-level category slugs, read from the store's own nav menu. Paginated with ?p=N.
const CATEGORIES = [
  "cervejas",
  "vinhos",
  "destilados",
  "bebidas-nao-alcoolicas",
  "outras-bebidas-alcoolicas",
  "promocoes"
];
const PAGES_PER_CATEGORY = 12;

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html"
};

type Row = {
  sku: string;
  name: string;
  brand?: string;
  unitPrice: number;
  unit: string;
  category: string;
  imageUrl?: string;
  productUrl: string;
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The listing renders one <article class="productItem"> per product; inside it the slug is
// on .productItem__link, the picture on the lazyload data-src, the name on .productItem__name
// and the unit price on .productItem__price--value. Cards are split first so a missing field
// in one card can never borrow a value from the next one.
const SLUG_RE = /<a href="\/([^"?]+)"\s+class="productItem__link"/;
const IMAGE_RE = /<img[^>]*data-src="([^"]+)"/;
const NAME_RE = /class="productItem__name"[^>]*>\s*([^<]+)</;
const PRICE_RE = /class="productItem__price--value"\s*>\s*R\$\s*([\d.]+,\d{2})/;

const out: Row[] = [];
const seen = new Set<string>();

for (const category of CATEGORIES) {
  for (let pageNum = 1; pageNum <= PAGES_PER_CATEGORY && out.length < MAX; pageNum += 1) {
    const url = pageNum === 1 ? `${ORIGIN}/${category}` : `${ORIGIN}/${category}?page=${pageNum}`;
    let html = "";
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        console.warn(`\n${category} p${pageNum}: HTTP ${res.status}`);
        break;
      }
      html = await res.text();
    } catch (error) {
      console.warn(`\n${category} p${pageNum}: ${error instanceof Error ? error.message : error}`);
      break;
    }

    const cards = html.split('<article class="productItem').slice(1);
    if (!cards.length) break;
    let addedOnPage = 0;
    for (const card of cards) {
      if (out.length >= MAX) break;
      const slug = card.match(SLUG_RE)?.[1];
      const name = card.match(NAME_RE)?.[1];
      const rawPrice = card.match(PRICE_RE)?.[1];
      const image = card.match(IMAGE_RE)?.[1];
      if (!slug || !name || !rawPrice || seen.has(slug)) continue;
      const price = Number(rawPrice.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(price) || price <= 0) continue;
      seen.add(slug);
      addedOnPage += 1;
      out.push({
        sku: `imigrantes-${slug}`.slice(0, 80),
        name: decode(name),
        unitPrice: price,
        unit: "un",
        category: category.replace(/-/g, " "),
        imageUrl: image ? (image.startsWith("http") ? image : `${ORIGIN}${image}`) : undefined,
        productUrl: `${ORIGIN}/${slug}`
      });
    }
    process.stdout.write(`\r${out.length} produtos…`);
    // Pagination past the last page repeats the first one; stop when nothing is new.
    if (!addedOnPage) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

const header = `// GERADO por scripts/harvest-imigrantes-catalog.mts em ${new Date().toISOString().slice(0, 10)} a partir
// das páginas públicas server-rendered de ${ORIGIN} (dados reais: nome/preço/URL/imagem
// verbatim). Preço é referência de vitrine — no concierge a autoridade é a cotação do operador.
// Para atualizar: node --import tsx scripts/harvest-imigrantes-catalog.mts ${outFile}
import type { CatalogItem } from "./types";

export const CATALOG: CatalogItem[] = `;

writeFileSync(outFile, header + JSON.stringify(out, null, 1).replace(/"([a-zA-Z]+)":/g, "$1:") + ";\n");
console.log(`\n${out.length} produtos → ${outFile}`);
