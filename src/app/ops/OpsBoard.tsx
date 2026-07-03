"use client";

import { useCallback, useEffect, useState } from "react";
import { hasCancelRequest, isCardCharge } from "@/lib/order-flags";

type BasketItem = { qty: number; name: string; lineTotal: number; storeKey?: string; productUrl?: string };

type DeliveryOrder = {
  id: string;
  phone: string;
  customerName?: string | null;
  deliveryAddress?: string | null;
  cep?: string | null;
  storeKey?: string | null;
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
  notes?: string | null;
  pixCopiaECola?: string | null;
  courierKey?: string | null;
  courierTrackingUrl?: string | null;
  createdAt: string;
  paidAt?: string | null;
};

type WaitlistRegion = { city: string; uf?: string | null; leads: number; hits: number; lastAt: string };
type WaitlistLead = { id: string; phone: string; cep: string; city?: string | null; uf?: string | null; hits: number; updatedAt: string };
type WaitlistData = { total: number; regions: WaitlistRegion[]; recent: WaitlistLead[] };

const COURIER_LABEL: Record<string, string> = {
  uber_direct: "Uber Direct",
  lalamove: "Lalamove",
  loggi: "Loggi"
};

const STATUS_LABEL: Record<string, string> = {
  paid: "💳 Pago — comprar na loja",
  operator_buying: "🛒 Comprado — aguardando pronto",
  ready_for_pickup: "📦 Pronto — despachar motoboy",
  dispatched: "🛵 Saiu pra entrega"
};

// Where the operator double-checks the live price/stock before buying, per store.
// Prefer a real deep link to the exact product (Boticário has these); otherwise search.
function storeItemUrl(it: BasketItem, orderStoreKey?: string | null): string {
  if (it.productUrl) return it.productUrl;
  const storeKey = it.storeKey ?? orderStoreKey ?? undefined;
  if (storeKey === "petz") return `https://www.petz.com.br/busca?q=${encodeURIComponent(it.name)}`;
  if (storeKey === "boticario") return `https://www.boticario.com.br/busca/?q=${encodeURIComponent(it.name)}`;
  return `https://mercado.carrefour.com.br/busca/${encodeURIComponent(it.name)}`;
}

// One-click purchase prep: open every item of the order on the store's search page
// (one tab each — the operator only clicks "adicionar" per tab). A true pre-filled
// cart link is blocked by both stores' anti-bot edge (tested live 2026-07-01), so
// tabs + clipboard is the fastest SAFE path today.
function openAllItems(order: DeliveryOrder) {
  for (const it of order.items ?? []) {
    window.open(storeItemUrl(it, order.storeKey), "_blank", "noopener");
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function shoppingListText(order: DeliveryOrder): string {
  return (order.items ?? []).map((it) => `${it.qty}x ${it.name}`).join("\n");
}

const brl = (v: number) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;

function ageLabel(iso?: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  return `há ${h}h${String(mins % 60).padStart(2, "0")}`;
}

export default function OpsBoard() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistData | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [notify, setNotify] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copyWithFeedback(key: string, text: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }
  }

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
      // Waitlist is best-effort: a failure here must never blank the order queue.
      try {
        const wr = await fetch(`/api/ops/waitlist`, { cache: "no-store" });
        if (wr.ok) setWaitlist((await wr.json()) as WaitlistData);
      } catch {
        /* ignore */
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

  async function act(id: string, action: string, extra?: { storeOrderNumber?: string; text?: string }): Promise<boolean> {
    setBusy(`${id}:${action}`);
    try {
      const res = await fetch(`/api/ops/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra })
      });
      if (!res.ok) {
        // A silent failure here means the operator believes something happened that
        // didn't (e.g. "the customer was warned") — always surface it.
        alert(`A ação falhou (${res.status}). Confira a sessão (/ops?key=…) e tente de novo.`);
        return false;
      }
      await load();
      return true;
    } catch {
      alert("A ação falhou (sem conexão?). Tente de novo.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sendNotify(id: string) {
    const text = (notify[id] ?? "").trim();
    if (!text) return;
    const ok = await act(id, "notify", { text });
    // Keep the typed message on failure so the operator can retry.
    if (ok) setNotify((n) => ({ ...n, [id]: "" }));
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
      {orders.map((o) => {
        const cancelRequested = hasCancelRequest(o.notes);
        const isCard = isCardCharge(o);
        return (
          <div key={o.id} style={{ ...card, ...(cancelRequested ? cancelCard : {}) }}>
            {cancelRequested && (
              <div style={cancelBanner}>⚠️ O cliente pediu CANCELAMENTO — falar com ele antes de comprar/despachar.</div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong>
                #{o.id.slice(-6).toUpperCase()}{" "}
                <span style={{ color: "#98a2b3", fontWeight: 400, fontSize: 12 }}>{ageLabel(o.paidAt ?? o.createdAt)}</span>
              </strong>
              <span>
                <span style={badge}>{STATUS_LABEL[o.status] ?? o.status}</span>{" "}
                <span style={payBadge}>{isCard ? "💳 cartão" : "⚡ Pix"}</span>
              </span>
            </div>
            <div style={{ color: "#475467", fontSize: 14, marginTop: 6 }}>
              {o.customerName ?? o.phone}{" "}
              <a
                href={`https://wa.me/${o.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: "#0f3d3a" }}
                title="Abrir conversa no WhatsApp"
              >
                💬 WhatsApp
              </a>{" "}
              · {o.deliveryAddress ?? o.cep ?? "endereço pendente"}
            </div>
            <ul style={{ margin: "10px 0", paddingLeft: 18 }}>
              {(o.items ?? []).map((it, i) => (
                <li key={i} style={{ fontSize: 14 }}>
                  {it.qty}x {it.name} — {brl(it.lineTotal)}{" "}
                  <a
                    href={storeItemUrl(it, o.storeKey)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: "#0f3d3a" }}
                    title={it.productUrl ? "Abrir o produto exato na loja" : "Conferir preço/estoque real na loja"}
                  >
                    🔎 ver
                  </a>
                </li>
              ))}
            </ul>
            <div style={{ fontSize: 13, color: "#475467" }}>
              Custo {o.storeLabel} {brl(o.itemsSubtotal)} · Frete {brl(o.deliveryFee)}
              {o.courierKey ? ` (${COURIER_LABEL[o.courierKey] ?? o.courierKey})` : ""} · Margem {brl(o.serviceFee)} ·{" "}
              <strong>Cliente pagou {brl(o.total)}</strong>
            </div>
            <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>
              🏬 Retirar em: <strong>{o.storeUnit ?? o.storeLabel}</strong>
              {o.storeAddress ? ` — ${o.storeAddress}` : ""}
            </div>
            {o.notes && <div style={{ fontSize: 12, color: "#98a2b3", marginTop: 4, whiteSpace: "pre-wrap" }}>{o.notes}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              {o.status === "paid" && (
                <>
                  <button
                    style={secondary}
                    onClick={() => openAllItems(o)}
                    title="Abre uma aba por item, já na busca da loja — é só clicar em adicionar em cada uma. Se só abrir 1 aba, permita pop-ups deste site."
                  >
                    🛒 Abrir itens na loja ({(o.items ?? []).length})
                  </button>
                  <button style={secondary} onClick={() => void copyWithFeedback(`${o.id}:list`, shoppingListText(o))}>
                    {copied === `${o.id}:list` ? "✅ copiado" : "📋 Copiar lista"}
                  </button>
                  {(o.deliveryAddress || o.cep) && (
                    <button
                      style={secondary}
                      onClick={() =>
                        void copyWithFeedback(`${o.id}:addr`, [o.deliveryAddress, o.cep].filter(Boolean).join(" — "))
                      }
                      title="Endereço do cliente (para lojas que entregam direto, ex.: Petz)"
                    >
                      {copied === `${o.id}:addr` ? "✅ copiado" : "📍 Copiar endereço"}
                    </button>
                  )}
                </>
              )}
              {o.status === "paid" && (
                <>
                  <input
                    placeholder="nº do pedido na loja"
                    value={numbers[o.id] ?? ""}
                    onChange={(e) => setNumbers((n) => ({ ...n, [o.id]: e.target.value }))}
                    style={input}
                  />
                  <button
                    style={primary}
                    disabled={busy === `${o.id}:bought`}
                    onClick={() => act(o.id, "bought", { storeOrderNumber: numbers[o.id] ?? "" })}
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

            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder='avisar cliente (ex.: "o arroz acabou, troco pela marca X?")'
                value={notify[o.id] ?? ""}
                onChange={(e) => setNotify((n) => ({ ...n, [o.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendNotify(o.id);
                }}
                style={{ ...input, flex: 1, minWidth: 240 }}
              />
              <button style={secondary} disabled={busy === `${o.id}:notify`} onClick={() => void sendNotify(o.id)}>
                Enviar 💬
              </button>
            </div>
          </div>
        );
      })}

      {waitlist && waitlist.total > 0 && (
        <div style={waitCard}>
          <button style={waitHeader} onClick={() => setShowWaitlist((v) => !v)}>
            <span>
              📍 Lista de espera — <strong>{waitlist.total}</strong> fora da área
              {waitlist.regions[0] && waitlist.regions[0].city !== "—" ? ` · +pedida: ${waitlist.regions[0].city} (${waitlist.regions[0].leads})` : ""}
            </span>
            <span style={{ color: "#98a2b3" }}>{showWaitlist ? "▲ ocultar" : "▼ ver demanda"}</span>
          </button>

          {showWaitlist && (
            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              <div>
                <div style={waitSubtitle}>Onde tem gente pedindo (expanda por aqui)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {waitlist.regions.map((r, i) => (
                    <span key={i} style={regionChip}>
                      {r.city === "—" ? "cidade?" : r.city}
                      {r.uf ? `/${r.uf}` : ""} · <strong>{r.leads}</strong>
                      {r.hits > r.leads ? ` (${r.hits} pedidos)` : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={waitSubtitle}>Últimos contatos</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {waitlist.recent.map((l) => (
                    <div key={l.id} style={{ fontSize: 13, color: "#475467" }}>
                      {l.city ?? "cidade?"}
                      {l.uf ? `/${l.uf}` : ""} · {l.cep} ·{" "}
                      <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "#0f3d3a" }}>
                        💬 {l.phone}
                      </a>
                      {l.hits > 1 ? ` · ${l.hits}×` : ""} · {ageLabel(l.updatedAt)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid #e4e7ec", borderRadius: 12, padding: 16, background: "#fff" };
const cancelCard: React.CSSProperties = { border: "2px solid #f04438", background: "#fffbfa" };
const cancelBanner: React.CSSProperties = {
  background: "#fee4e2",
  color: "#b42318",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  marginBottom: 10,
  fontWeight: 600
};
const badge: React.CSSProperties = { fontSize: 12, color: "#0f3d3a", background: "#d6fbf4", borderRadius: 999, padding: "2px 10px" };
const payBadge: React.CSSProperties = { fontSize: 12, color: "#475467", background: "#f2f4f7", borderRadius: 999, padding: "2px 10px" };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 8, fontSize: 14, minWidth: 180 };
const primary: React.CSSProperties = { padding: "8px 14px", background: "#0f3d3a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const secondary: React.CSSProperties = { padding: "8px 14px", background: "#eef2f1", color: "#0f3d3a", border: "1px solid #d0d5dd", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const waitCard: React.CSSProperties = { border: "1px dashed #d0d5dd", borderRadius: 12, padding: 16, background: "#fcfcfd" };
const waitHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", padding: 0, fontSize: 14, color: "#344054", cursor: "pointer", textAlign: "left" };
const waitSubtitle: React.CSSProperties = { fontSize: 12, color: "#98a2b3", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" };
const regionChip: React.CSSProperties = { fontSize: 13, color: "#0f3d3a", background: "#eef2f1", border: "1px solid #e4e7ec", borderRadius: 999, padding: "3px 10px" };
const ghost: React.CSSProperties = { padding: "8px 12px", background: "transparent", color: "#b42318", border: "1px solid #fda29b", borderRadius: 8, fontSize: 13, cursor: "pointer" };
