"use client";

import { useCallback, useEffect, useState } from "react";

type BasketItem = { qty: number; name: string; lineTotal: number };

type DeliveryOrder = {
  id: string;
  phone: string;
  customerName?: string | null;
  deliveryAddress?: string | null;
  cep?: string | null;
  storeLabel: string;
  storeUnit?: string | null;
  storeAddress?: string | null;
  storeOrderNumber?: string | null;
  items: BasketItem[];
  itemsSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  status: string;
  courierKey?: string | null;
  courierTrackingUrl?: string | null;
  createdAt: string;
};

const COURIER_LABEL: Record<string, string> = {
  uber_direct: "Uber Direct",
  lalamove: "Lalamove",
  loggi: "Loggi"
};

const STATUS_LABEL: Record<string, string> = {
  paid: "💳 Pago — comprar no Carrefour",
  operator_buying: "🛒 Comprado — aguardando pronto",
  ready_for_pickup: "📦 Pronto — despachar motoboy",
  dispatched: "🛵 Saiu pra entrega"
};

const brl = (v: number) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;

export default function OpsBoard() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // On first load, if the URL carries ?key=, exchange it for a long-lived cookie and
  // strip it from the URL — after that the operator just opens /ops (no token in link).
  useEffect(() => {
    (async () => {
      const key = new URLSearchParams(window.location.search).get("key");
      if (key) {
        try {
          await fetch(`/api/ops/login?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        } catch {
          /* ignore — load() will surface auth failures */
        }
        window.history.replaceState({}, "", "/ops");
      }
      setReady(true);
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/orders`, { cache: "no-store" });
      if (res.status === 401) {
        setDenied(true);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { orders?: DeliveryOrder[] };
        setOrders(data.orders ?? []);
        setDenied(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [ready, load]);

  async function act(id: string, action: string, storeOrderNumber?: string) {
    setBusy(`${id}:${action}`);
    try {
      await fetch(`/api/ops/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, storeOrderNumber })
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;
  if (denied) {
    return (
      <p style={{ marginTop: 24, color: "#b42318" }}>
        Acesso negado. Abra <strong>uma vez</strong> com <code>/ops?key=SEU_TOKEN</code> (valor de
        OPS_TOKEN/API_TOKEN) — depois disso a chave fica salva e você abre só <code>/ops</code>.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
      {loading && <p style={{ color: "#667085" }}>Carregando…</p>}
      {!loading && orders.length === 0 && <p style={{ color: "#667085" }}>Nenhum pedido na fila. 🎉</p>}
      {orders.map((o) => (
        <div key={o.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong>#{o.id.slice(-6).toUpperCase()}</strong>
            <span style={badge}>{STATUS_LABEL[o.status] ?? o.status}</span>
          </div>
          <div style={{ color: "#475467", fontSize: 14, marginTop: 6 }}>
            {o.customerName ?? o.phone} · {o.deliveryAddress ?? o.cep ?? "endereço pendente"}
          </div>
          <ul style={{ margin: "10px 0", paddingLeft: 18 }}>
            {(o.items ?? []).map((it, i) => (
              <li key={i} style={{ fontSize: 14 }}>
                {it.qty}x {it.name} — {brl(it.lineTotal)}{" "}
                <a
                  href={`https://mercado.carrefour.com.br/busca/${encodeURIComponent(it.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "#0f3d3a" }}
                  title="Conferir preço/estoque real no Carrefour"
                >
                  🔎 ver
                </a>
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 13, color: "#475467" }}>
            Custo Carrefour {brl(o.itemsSubtotal)} · Frete {brl(o.deliveryFee)}
            {o.courierKey ? ` (${COURIER_LABEL[o.courierKey] ?? o.courierKey})` : ""} · Margem {brl(o.serviceFee)} ·{" "}
            <strong>Cliente pagou {brl(o.total)}</strong>
          </div>
          <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>
            🏬 Retirar em: <strong>{o.storeUnit ?? o.storeLabel}</strong>
            {o.storeAddress ? ` — ${o.storeAddress}` : ""}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            {o.status === "paid" && (
              <>
                <input
                  placeholder="nº do pedido Carrefour"
                  value={numbers[o.id] ?? ""}
                  onChange={(e) => setNumbers((n) => ({ ...n, [o.id]: e.target.value }))}
                  style={input}
                />
                <button
                  style={primary}
                  disabled={busy === `${o.id}:bought`}
                  onClick={() => act(o.id, "bought", numbers[o.id] ?? "")}
                >
                  Marquei como comprado
                </button>
              </>
            )}
            {(o.status === "operator_buying" || o.status === "ready_for_pickup") && (
              <button style={primary} disabled={busy === `${o.id}:dispatch`} onClick={() => act(o.id, "dispatch")}>
                🛵 Despachar motoboy
              </button>
            )}
            {o.status === "dispatched" && (
              <>
                {o.courierTrackingUrl && (
                  <a href={o.courierTrackingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                    rastreio
                  </a>
                )}
                <button style={primary} disabled={busy === `${o.id}:delivered`} onClick={() => act(o.id, "delivered")}>
                  Marcar entregue
                </button>
              </>
            )}
            <button style={ghost} disabled={busy === `${o.id}:cancel`} onClick={() => act(o.id, "cancel")}>
              Cancelar/estornar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid #e4e7ec", borderRadius: 12, padding: 16, background: "#fff" };
const badge: React.CSSProperties = { fontSize: 12, color: "#0f3d3a", background: "#d6fbf4", borderRadius: 999, padding: "2px 10px" };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 8, fontSize: 14, minWidth: 180 };
const primary: React.CSSProperties = { padding: "8px 14px", background: "#0f3d3a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const ghost: React.CSSProperties = { padding: "8px 12px", background: "transparent", color: "#b42318", border: "1px solid #fda29b", borderRadius: 8, fontSize: 13, cursor: "pointer" };
