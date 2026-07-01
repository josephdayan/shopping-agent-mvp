"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Item = {
  sku: string;
  name: string;
  cost: number;
  price: number;
  unit: string;
  category: string;
  store: string;
  storeLabel: string;
  imageUrl: string | null;
};
type StoreInfo = { key: string; label: string; count: number };

const brl = (v: number) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
const PAGE = 60;

export default function CatalogBoard() {
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [store, setStore] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const offsetRef = useRef(0);

  // Exchange ?key= for the ops_session cookie once, then strip it (same as /ops).
  useEffect(() => {
    (async () => {
      const key = new URLSearchParams(window.location.search).get("key");
      if (key) {
        try {
          await fetch(`/api/ops/login?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        } catch {
          /* ignore */
        }
        window.history.replaceState({}, "", "/ops/catalogo");
      }
      setReady(true);
    })();
  }, []);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      const offset = reset ? 0 : offsetRef.current;
      try {
        const params = new URLSearchParams({ q, store, limit: String(PAGE), offset: String(offset) });
        const res = await fetch(`/api/ops/catalog?${params.toString()}`, { cache: "no-store" });
        if (res.status === 401) {
          setDenied(true);
          return;
        }
        setDenied(false);
        const data = await res.json();
        setTotal(data.total ?? 0);
        if (Array.isArray(data.stores)) setStores(data.stores);
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        offsetRef.current = offset + (data.items?.length ?? 0);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    [q, store]
  );

  // Debounced search: refetch (reset) when the query or store filter changes.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => fetchPage(true), 250);
    return () => clearTimeout(t);
  }, [ready, q, store, fetchPage]);

  const allCount = useMemo(() => stores.reduce((a, s) => a + s.count, 0), [stores]);

  if (!ready) return null;
  if (denied)
    return (
      <p style={{ marginTop: 24, color: "#b42318" }}>
        Acesso negado. Abra com <code>/ops/catalogo?key=SEU_TOKEN</code> uma vez (depois o link fica salvo).
      </p>
    );

  const chip = (active: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? "#e4002b" : "#d0d5dd"}`,
    background: active ? "#e4002b" : "#fff",
    color: active ? "#fff" : "#344054",
    fontSize: 13,
    cursor: "pointer"
  });

  return (
    <div style={{ marginTop: 18 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar produto (ex.: ração gato, arroz, areia, shampoo…)"
        style={{
          width: "100%",
          padding: "12px 14px",
          fontSize: 15,
          border: "1px solid #d0d5dd",
          borderRadius: 10,
          boxSizing: "border-box"
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
        <button style={chip(store === "")} onClick={() => setStore("")}>
          Todas {allCount ? `(${allCount})` : ""}
        </button>
        {stores.map((s) => (
          <button key={s.key} style={chip(store === s.key)} onClick={() => setStore(s.key)}>
            {s.label} ({s.count})
          </button>
        ))}
        <span style={{ marginLeft: "auto", color: "#667085", fontSize: 13 }}>
          {loading ? "carregando…" : `${total.toLocaleString("pt-BR")} produto(s)`}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 12
        }}
      >
        {items.map((it) => (
          <div
            key={it.store + it.sku}
            style={{ border: "1px solid #eaecf0", borderRadius: 12, overflow: "hidden", background: "#fff" }}
          >
            <div style={{ aspectRatio: "1 / 1", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imageUrl} alt={it.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ color: "#98a2b3", fontSize: 12 }}>sem foto</span>
              )}
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ display: "inline-block", fontSize: 11, color: "#475467", background: "#f2f4f7", padding: "1px 7px", borderRadius: 999, marginBottom: 6 }}>
                {it.storeLabel}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.3, minHeight: 34, color: "#101828" }}>
                {it.name.length > 62 ? it.name.slice(0, 60) + "…" : it.name}
              </div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "#667085" }}>Cliente paga</span>
                <span style={{ fontWeight: 700, color: "#101828" }}>{brl(it.price)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#98a2b3" }}>
                <span>Custo loja</span>
                <span>{brl(it.cost)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#12b76a" }}>
                <span>Margem</span>
                <span>{brl(Math.round((it.price - it.cost) * 100) / 100)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length < total && (
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            onClick={() => fetchPage(false)}
            disabled={loading}
            style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff", cursor: "pointer", fontSize: 14 }}
          >
            {loading ? "carregando…" : `Carregar mais (${items.length}/${total.toLocaleString("pt-BR")})`}
          </button>
        </div>
      )}
    </div>
  );
}
