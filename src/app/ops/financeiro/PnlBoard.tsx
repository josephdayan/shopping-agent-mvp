"use client";

import { useCallback, useEffect, useState } from "react";
import { parseMoneyInput } from "@/lib/pricing";

type Row = {
  orderId: string;
  shortId: string;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  status: string;
  statusLabel: string;
  customer: string;
  store: string;
  storeOrderNumber: string | null;
  method: "pix" | "card" | null;
  purchased: boolean;
  open: boolean;
  customerPaid: number;
  refunded: number;
  refundEstimated: boolean;
  providerFee: number;
  providerFeeEstimated: boolean;
  netReceived: number;
  storeCostQuoted: number;
  storeCost: number;
  storeCostEstimated: boolean;
  deliveryFee: number;
  markup: number;
  cardSurcharge: number;
  profit: number;
  profitPct: number | null;
};

type Month = {
  month: string;
  orders: number;
  customerPaid: number;
  refunded: number;
  providerFee: number;
  storeCost: number;
  profit: number;
  estimated: number;
};

type Data = { generatedAt: string; months: number; rows: Row[]; summary: Month[] };

const brl = (v: number) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[(month ?? 1) - 1] ?? key}/${year}`;
}

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function PnlBoard() {
  const [months, setMonths] = useState(3);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/pnl?months=${months}`, { cache: "no-store" });
      if (res.status === 401) {
        setError("Sessão expirada. Mande \"ops\" pra Lia no WhatsApp e toque no link que ela responder.");
        return;
      }
      if (res.status === 403) {
        setError("O financeiro é só do dono da operação.");
        return;
      }
      if (!res.ok) {
        setError(`Não deu pra carregar (${res.status}).`);
        return;
      }
      setData((await res.json()) as Data);
      setError(null);
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCost(orderId: string) {
    const raw = costs[orderId] ?? "";
    const value = parseMoneyInput(raw);
    if (value == null || value < 0) {
      alert("Valor inválido (ex.: 87,90).");
      return;
    }
    setBusy(orderId);
    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_store_cost", paidTotal: raw })
      });
      if (!res.ok) {
        const detail = await res.json().then((b: { error?: string }) => b?.error).catch(() => undefined);
        alert(detail ? `Não deu: ${detail}` : `A ação falhou (${res.status}).`);
        return;
      }
      setCosts((c) => ({ ...c, [orderId]: "" }));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p style={{ marginTop: 24, color: "#b42318" }}>{error}</p>;

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? [];
  const totals = summary.reduce(
    (acc, m) => ({
      orders: acc.orders + m.orders,
      customerPaid: acc.customerPaid + m.customerPaid,
      refunded: acc.refunded + m.refunded,
      providerFee: acc.providerFee + m.providerFee,
      storeCost: acc.storeCost + m.storeCost,
      profit: acc.profit + m.profit,
      estimated: acc.estimated + m.estimated
    }),
    { orders: 0, customerPaid: 0, refunded: 0, providerFee: 0, storeCost: 0, profit: 0, estimated: 0 }
  );

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a href="/ops" style={{ color: "#e4002b", fontSize: 13, textDecoration: "none" }}>← fila</a>
        <span style={{ fontSize: 12, color: "#667085" }}>Período:</span>
        {[1, 3, 6, 12].map((n) => (
          <button key={n} style={n === months ? chipOn : chip} onClick={() => setMonths(n)}>
            {n === 1 ? "este mês" : `${n} meses`}
          </button>
        ))}
        <a href={`/api/ops/pnl?format=csv&months=12`} style={{ ...chip, textDecoration: "none", marginLeft: "auto" }} title="Abre no Excel, Numbers ou Google Sheets (importar → separador ;)">
          ⬇️ Baixar CSV (12 meses)
        </a>
      </div>

      {loading && !data ? <p style={{ color: "#667085" }}>Carregando…</p> : null}

      {summary.length > 0 && (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {summary.map((m) => (
            <div key={m.month} style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f3d3a" }}>
                {monthLabel(m.month)} · {m.orders} pedido{m.orders === 1 ? "" : "s"}
              </div>
              <div style={line}><span>Clientes pagaram</span><strong>{brl(m.customerPaid)}</strong></div>
              {m.refunded > 0 ? <div style={line}><span>Estornado</span><span>− {brl(m.refunded)}</span></div> : null}
              <div style={line}><span>Taxa Mercado Pago</span><span>− {brl(m.providerFee)}</span></div>
              <div style={line}><span>Custo nas lojas</span><span>− {brl(m.storeCost)}</span></div>
              <div style={{ ...line, borderTop: "1px solid #e4e7ec", paddingTop: 6, marginTop: 4 }}>
                <span>Sobrou</span>
                <strong style={{ color: m.profit >= 0 ? "#027a48" : "#b42318" }}>{brl(m.profit)}</strong>
              </div>
              {m.estimated > 0 ? (
                <div style={{ fontSize: 11, color: "#93370d", marginTop: 4 }}>≈ {m.estimated} com valor ainda estimado</div>
              ) : null}
            </div>
          ))}
          {summary.length > 1 && (
            <div style={{ ...card, background: "#fbffe9", borderColor: "#b7d838" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f3d3a" }}>Período todo · {totals.orders} pedidos</div>
              <div style={line}><span>Clientes pagaram</span><strong>{brl(totals.customerPaid)}</strong></div>
              {totals.refunded > 0 ? <div style={line}><span>Estornado</span><span>− {brl(totals.refunded)}</span></div> : null}
              <div style={line}><span>Taxa Mercado Pago</span><span>− {brl(totals.providerFee)}</span></div>
              <div style={line}><span>Custo nas lojas</span><span>− {brl(totals.storeCost)}</span></div>
              <div style={{ ...line, borderTop: "1px solid #e4e7ec", paddingTop: 6, marginTop: 4 }}>
                <span>Sobrou</span>
                <strong style={{ color: totals.profit >= 0 ? "#027a48" : "#b42318" }}>{brl(totals.profit)}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {data && rows.length === 0 ? (
        <p style={{ color: "#667085" }}>Nenhum pedido com pagamento no período.</p>
      ) : null}

      {rows.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#f9fafb", color: "#475467", textAlign: "left" }}>
                <th style={th}>Pedido</th>
                <th style={th}>Pago em</th>
                <th style={th}>Situação</th>
                <th style={th}>Cliente</th>
                <th style={th}>Loja</th>
                <th style={thRight}>Pagou</th>
                <th style={thRight}>Taxa MP</th>
                <th style={thRight}>Custo loja</th>
                <th style={thRight}>Sobrou</th>
                <th style={thRight}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} style={{ borderTop: "1px solid #e4e7ec" }}>
                  <td style={td}>
                    <strong>#{r.shortId}</strong>
                    <div style={{ fontSize: 11, color: "#98a2b3" }}>{r.method === "card" ? "cartão" : r.method === "pix" ? "Pix" : "—"}{r.storeOrderNumber ? ` · nº ${r.storeOrderNumber}` : ""}</div>
                  </td>
                  <td style={td}>{when(r.paidAt)}</td>
                  <td style={td}>{r.statusLabel}</td>
                  <td style={td}>{r.customer}</td>
                  <td style={td}>{r.store}</td>
                  <td style={tdRight}>
                    {brl(r.customerPaid)}
                    {r.refunded > 0 ? (
                      <div style={{ fontSize: 11, color: "#b42318" }} title={r.refundEstimated ? "Estorno pedido e ainda não executado" : "Estornado"}>
                        − {r.refundEstimated ? "≈ " : ""}{brl(r.refunded)} {r.refundEstimated ? "a estornar" : "estornado"}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdRight} title={r.providerFeeEstimated ? "Estimado pela alíquota — o MP ainda não informou a taxa real (o cron preenche)." : "Lido do Mercado Pago"}>
                    {r.providerFeeEstimated ? "≈ " : ""}{brl(r.providerFee)}
                  </td>
                  <td style={tdRight} title={r.storeCostEstimated ? (r.purchased ? "Estimado pela cotação — ninguém registrou o comprovante da loja ainda." : "Ainda não comprado: a cotação entra como custo previsto.") : r.purchased ? "Registrado do comprovante" : "Sem compra"}>
                    {r.purchased || r.open ? (
                      <>
                        {r.storeCostEstimated ? "≈ " : ""}{brl(r.storeCost)}
                        <div style={{ fontSize: 11, color: "#98a2b3" }}>{r.purchased ? `frete ${brl(r.deliveryFee)}` : "previsto (cotação)"}</div>
                        {r.purchased && <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                          <input
                            placeholder="real R$"
                            inputMode="decimal"
                            value={costs[r.orderId] ?? ""}
                            onChange={(e) => setCosts((c) => ({ ...c, [r.orderId]: e.target.value }))}
                            style={miniInput}
                            title="Total do comprovante da loja (produtos + frete)"
                          />
                          <button style={miniBtn} disabled={busy === r.orderId || !(costs[r.orderId] ?? "").trim()} onClick={() => void saveCost(r.orderId)}>
                            salvar
                          </button>
                        </div>}
                      </>
                    ) : (
                      <span style={{ color: "#98a2b3" }}>sem compra</span>
                    )}
                  </td>
                  <td style={{ ...tdRight, fontWeight: 700, color: r.profit >= 0 ? "#027a48" : "#b42318" }}>{brl(r.profit)}</td>
                  <td style={tdRight}>{r.profitPct == null ? "—" : `${r.profitPct.toFixed(1).replace(".", ",")}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#667085", margin: 0 }}>
        <strong>Sobrou</strong> = cliente pagou − estorno − taxa do Mercado Pago − custo na loja (produtos + frete do
        comprovante). <strong>≈</strong> = valor estimado: a taxa até o MP informar (o cron preenche sozinho), o custo
        da loja até alguém registrar o comprovante (aqui ou no card da compra), a cotação enquanto o pedido pago
        ainda não foi comprado e o estorno pedido ainda não executado. Custos fixos (operador, Vercel, Meta,
        anúncios) não entram por pedido.
      </p>
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid #e4e7ec", borderRadius: 12, padding: 14, background: "#fff" };
const line: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475467", marginTop: 4 };
const chip: React.CSSProperties = { fontSize: 12, padding: "4px 10px", border: "1px solid #d0d5dd", borderRadius: 999, background: "#fff", cursor: "pointer", color: "#0f3d3a" };
const chipOn: React.CSSProperties = { ...chip, background: "#0f3d3a", color: "#fff", borderColor: "#0f3d3a" };
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" };
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
const tdRight: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const miniInput: React.CSSProperties = { width: 84, padding: "3px 6px", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 12 };
const miniBtn: React.CSSProperties = { fontSize: 11, padding: "3px 8px", border: "1px solid #d0d5dd", borderRadius: 6, background: "#fff", cursor: "pointer" };
