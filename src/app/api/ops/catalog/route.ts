import { NextResponse } from "next/server";
import { listStores } from "@/lib/stores";
import { scoreCatalogMatch } from "@/lib/stores/types";

export const dynamic = "force-dynamic";

// Same auth as the rest of /ops: ?key=, x-ops-key header, or the ops_session cookie.
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

const MARKUP = Number(process.env.LIA_PRICE_MARKUP ?? 1.1);

// Browse/search every store's catalog (what Lia can actually offer). Server-side search +
// pagination so the client never loads all ~4k items at once.
export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const store = url.searchParams.get("store") ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 60), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const stores = listStores();
  const labelOf: Record<string, string> = Object.fromEntries(stores.map((s) => [s.key, s.label]));

  const rows = stores
    .filter((s) => !store || s.key === store)
    .flatMap((s) => s.listCatalog().map((item) => ({ store: s.key, item })));

  let ranked: { store: string; item: (typeof rows)[number]["item"] }[];
  if (q) {
    ranked = rows
      .map((r) => ({ ...r, score: scoreCatalogMatch(q, r.item) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice);
  } else {
    ranked = rows
      .slice()
      .sort((a, b) => a.store.localeCompare(b.store) || a.item.name.localeCompare(b.item.name));
  }

  const total = ranked.length;
  const items = ranked.slice(offset, offset + limit).map((r) => ({
    sku: r.item.sku,
    name: r.item.name,
    cost: r.item.unitPrice,
    price: Math.round(r.item.unitPrice * MARKUP * 100) / 100,
    unit: r.item.unit,
    category: r.item.category,
    store: r.store,
    storeLabel: labelOf[r.store] ?? r.store,
    imageUrl: r.item.imageUrl ?? null,
    productUrl: r.item.productUrl ?? null
  }));

  return NextResponse.json({
    total,
    items,
    stores: stores.map((s) => ({ key: s.key, label: s.label, count: s.listCatalog().length }))
  });
}
