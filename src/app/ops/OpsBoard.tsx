"use client";

import { useCallback, useEffect, useState } from "react";
import { hasCancelRequest, hasPendingRefund, isCardCharge, isOperatorCourierOrder, isRetailerDeliveryOrder } from "@/lib/order-flags";

type BasketItem = { qty: number; name: string; lineTotal: number; storeKey?: string; productUrl?: string };
type Fulfillment = {
  storeKey: string;
  storeLabel: string;
  unitLabel?: string;
  unitAddress?: string;
  deliveryFee: number;
  deliveryMode?: string;
  deliveryPromise?: string;
  retailerTotal?: number;
};
type PurchaseJob = {
  id: string;
  storeLabel: string;
  status: string;
  actualTotal?: number | null;
  cartHash?: string | null;
  storeOrderNumber?: string | null;
  browserSessionId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  items: Array<{ requestedName: string; requestedQty: number; status: string }>;
};

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
  fulfillments?: Fulfillment[] | null;
  itemsSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  status: string;
  notes?: string | null;
  pixCopiaECola?: string | null;
  courierKey?: string | null;
  courierTrackingUrl?: string | null;
  purchaseJobs?: PurchaseJob[];
  createdAt: string;
  paidAt?: string | null;
  quoteExpiresAt?: string | null;
};

type WaitlistRegion = { city: string; uf?: string | null; leads: number; hits: number; lastAt: string };
type WaitlistLead = { id: string; phone: string; cep: string; city?: string | null; uf?: string | null; reason?: string | null; hits: number; updatedAt: string };
type WaitlistData = { total: number; regions: WaitlistRegion[]; recent: WaitlistLead[] };

const COURIER_LABEL: Record<string, string> = {
  retailer_delivery: "entrega do varejista",
  concierge: "motoboy da Lia",
  uber_direct: "Uber Direct",
  lalamove: "Lalamove",
  loggi: "Loggi"
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_operator_quote: "🧮 Cotar (concierge)",
  awaiting_supplier_validation: "🔎 Confirmando carrinho na loja",
  awaiting_quote_confirmation: "⏱️ Cotação enviada — aguardando pagamento",
  payment_issuing: "💳 Gerando pagamento para cliente",
  paid: "💳 Pago — comprar na loja",
  retailer_preparing: "📦 Loja preparando a entrega",
  retailer_out_for_delivery: "🚚 Saiu para entrega pela loja",
  operator_buying: "🛒 Comprado — em preparação",
  ready_for_pickup: "📦 Pronto — courier autorizado",
  dispatched: "🛵 Saiu pra entrega",
  refund_pending: "↩️ Estorno pendente"
};

const PURCHASE_STATUS_LABEL: Record<string, string> = {
  preflight_queued: "⏳ carrinho na fila",
  preflighting: "🔎 validando loja",
  cart_ready: "🛒 carrinho pronto",
  awaiting_approval: "✋ aguardando aprovação",
  approved: "💳 compra aprovada",
  purchasing: "🛍️ finalizando",
  ordered: "✅ pedido confirmado no varejista",
  ready_for_pickup: "📦 pronto para retirada autorizada",
  needs_human: "⚠️ precisa de humano",
  failed: "❌ falhou",
  canceled: "cancelado"
};

// Where the operator double-checks the live price/stock before buying, per store.
// Prefer a real deep link to the exact product (Boticário has these); otherwise search.
function storeItemUrl(it: BasketItem, orderStoreKey?: string | null): string {
  if (it.productUrl) return it.productUrl;
  const storeKey = it.storeKey ?? orderStoreKey ?? undefined;
  if (storeKey === "petz") return `https://www.petz.com.br/busca?q=${encodeURIComponent(it.name)}`;
  if (storeKey === "boticario") return `https://www.boticario.com.br/busca/?q=${encodeURIComponent(it.name)}`;
  return `https://secure.obahortifruti.com.br/busca?ft=${encodeURIComponent(it.name)}`;
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
  const [quotes, setQuotes] = useState<
    Record<string, { itemsSubtotal: string; deliveryFee: string; deliveryMode: string; deliveryPromise: string; etaMinutes: string }>
  >({});
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [refundReferences, setRefundReferences] = useState<Record<string, string>>({});
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

  async function act(
    id: string,
    action: string,
    extra?: {
      storeOrderNumber?: string;
      text?: string;
      trackingUrl?: string;
      refundReference?: string;
      itemsSubtotal?: number;
      deliveryFee?: number;
      deliveryMode?: string;
      deliveryPromise?: string;
      etaMinutes?: number;
    }
  ): Promise<boolean> {
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

  async function purchaseAct(job: PurchaseJob, action: "preflight" | "retry" | "request_approval" | "approve"): Promise<boolean> {
    if (
      action === "approve" &&
      !window.confirm(
        `Aprovar compra de ${brl(job.actualTotal ?? 0)} na ${job.storeLabel}? O fluxo fará uma última validação antes de tentar finalizar.`
      )
    ) {
      return false;
    }
    const key = `${job.id}:${action}`;
    setBusy(key);
    try {
      const res = await fetch(`/api/ops/purchases/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? `A ação de compra falhou (${res.status}).`);
        return false;
      }
      await load();
      return true;
    } catch {
      alert("A ação de compra falhou (sem conexão?). Tente de novo.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function runInternalPreflight(store: "oba" | "petz" | "boticario"): Promise<void> {
    const key = `internal-preflight:${store}`;
    setBusy(key);
    try {
      const res = await fetch("/api/ops/internal-preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry: true, fresh: true, store })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reused?: boolean;
        retried?: boolean;
        status?: string;
        actualTotal?: number | null;
        errorCode?: string | null;
        errorMessage?: string | null;
      };
      if (!res.ok) {
        alert(data.error ?? `O preflight interno falhou (${res.status}).`);
        return;
      }
      if (data.retried) {
        alert(`O último preflight interno da ${store} foi reiniciado em cart_only.`);
      } else if (data.reused) {
        const outcome = data.errorCode
          ? `${data.status ?? "needs_human"}: ${data.errorCode} — ${data.errorMessage ?? "sem detalhe"}`
          : `${data.status ?? "em andamento"}${data.actualTotal != null ? ` · total R$ ${data.actualTotal.toFixed(2).replace(".", ",")}` : ""}`;
        alert(`Resultado do último preflight interno da ${store}: ${outcome}`);
      } else {
        alert(`Preflight interno da ${store} iniciado em cart_only.`);
      }
      await load();
    } catch {
      alert("O preflight interno falhou (sem conexão?). Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function openRetailerSession(store: "petz" | "boticario"): Promise<void> {
    const key = `live-session:${store}`;
    setBusy(key);
    try {
      const res = await fetch("/api/ops/live-retailer-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store })
      });
      const data = await res.json().catch(() => ({})) as { debuggerFullscreenUrl?: string; error?: string };
      if (!res.ok || !data.debuggerFullscreenUrl) {
        alert(data.error ?? `Não foi possível abrir a sessão ${store}.`);
        return;
      }
      // A abertura em popup é bloqueada em alguns navegadores embutidos. Navegar
      // na própria aba mantém a sessão visível para o operador sem expor o URL no chat.
      window.location.assign(data.debuggerFullscreenUrl);
    } catch {
      alert("Não foi possível abrir a sessão da loja.");
    } finally {
      setBusy(null);
    }
  }

  async function releaseRetailerSession(store: "petz" | "boticario"): Promise<void> {
    const key = `release-session:${store}`;
    setBusy(key);
    try {
      const res = await fetch("/api/ops/live-retailer-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, action: "release" })
      });
      const data = await res.json().catch(() => ({})) as { released?: number; error?: string };
      if (!res.ok) {
        alert(data.error ?? `Não foi possível encerrar a sessão ${store}.`);
        return;
      }
      alert(`${data.released ?? 0} sessão(ões) da ${store} foi(ram) encerrada(s). O Context foi salvo; agora pode rodar o preflight.`);
    } catch {
      alert("Não foi possível encerrar a sessão da loja.");
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          style={secondary}
          disabled={busy === "internal-preflight:oba"}
          onClick={() => void runInternalPreflight("oba")}
          title="Cria um pedido técnico de um SKU Oba e só valida carrinho, frete e prazo. Não envia mensagem, não cobra e não compra."
        >
          {busy === "internal-preflight:oba" ? "🔎 Iniciando teste…" : "🧪 Testar cotação Oba"}
        </button>
        <button
          style={secondary}
          disabled={busy === "internal-preflight:petz"}
          onClick={() => void runInternalPreflight("petz")}
          title="Busca um SKU Petz ao vivo e só valida carrinho, frete e prazo. Não envia mensagem, não cobra e não compra."
        >
          {busy === "internal-preflight:petz" ? "🔎 Iniciando teste…" : "🧪 Testar cotação Petz"}
        </button>
        <button
          style={secondary}
          disabled={busy === "internal-preflight:boticario"}
          onClick={() => void runInternalPreflight("boticario")}
          title="Busca um SKU Boticário ao vivo e só valida carrinho, frete e prazo. Não envia mensagem, não cobra e não compra."
        >
          {busy === "internal-preflight:boticario" ? "🔎 Iniciando teste…" : "🧪 Testar cotação Boticário"}
        </button>
        <button
          style={secondary}
          disabled={busy === "live-session:petz"}
          onClick={() => void openRetailerSession("petz")}
          title="Abre o Context persistente Petz para a etapa de entrega. Não monta carrinho, não cobra e não compra."
        >
          {busy === "live-session:petz" ? "🌐 Abrindo Petz…" : "🌐 Abrir sessão Petz"}
        </button>
        <button
          style={secondary}
          disabled={busy === "release-session:petz"}
          onClick={() => void releaseRetailerSession("petz")}
          title="Encerra somente as sessões vivas do Context Petz para salvar login/endereço. Não monta carrinho, não cobra e não compra."
        >
          {busy === "release-session:petz" ? "💾 Salvando Petz…" : "💾 Salvar sessão Petz"}
        </button>
        <button
          style={secondary}
          disabled={busy === "live-session:boticario"}
          onClick={() => void openRetailerSession("boticario")}
          title="Abre o Context persistente Boticário para a etapa de entrega. Não monta carrinho, não cobra e não compra."
        >
          {busy === "live-session:boticario" ? "🌐 Abrindo Boticário…" : "🌐 Abrir sessão Boticário"}
        </button>
        <span style={{ fontSize: 12, color: "#667085" }}>Teste interno em cart_only: sem cobrança ou compra.</span>
      </div>
      {loading && <p style={{ color: "#667085" }}>Carregando…</p>}
      {!loading && orders.length === 0 && <p style={{ color: "#667085" }}>Nenhum pedido na fila. 🎉</p>}
      {orders.map((o) => {
        const cancelRequested = hasCancelRequest(o.notes);
        const refundPending = hasPendingRefund(o.notes) || o.status === "refund_pending";
        const isCard = isCardCharge(o);
        const retailerDelivery = isRetailerDeliveryOrder(o);
        const primaryFulfillment = o.fulfillments?.[0];
        const paymentReceived =
          Boolean(o.paidAt) ||
          ["paid", "retailer_preparing", "retailer_out_for_delivery", "operator_buying", "ready_for_pickup", "dispatched"].includes(o.status);
        const operatorCourier = isOperatorCourierOrder(o);
        const quote =
          quotes[o.id] ?? { itemsSubtotal: "", deliveryFee: "", deliveryMode: "operator_courier", deliveryPromise: "", etaMinutes: "" };
        const setQuote = (patch: Partial<typeof quote>) => setQuotes((prev) => ({ ...prev, [o.id]: { ...quote, ...patch } }));
        return (
          <div key={o.id} style={{ ...card, ...(cancelRequested ? cancelCard : {}) }}>
            {cancelRequested && (
              <div style={cancelBanner}>⚠️ O cliente pediu CANCELAMENTO — falar com ele antes de comprar/despachar.</div>
            )}
            {refundPending && <div style={refundBanner}>↩️ ESTORNO PENDENTE — só confirmar ao cliente após registrar a referência.</div>}
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
            {retailerDelivery && (
              <div style={{ fontSize: 13, color: "#475467", marginTop: 4 }}>
                🚚 <strong>{o.storeLabel} entrega diretamente ao cliente</strong>
                {primaryFulfillment?.deliveryPromise ? ` · ${primaryFulfillment.deliveryPromise}` : " · prazo pendente"}
                {o.quoteExpiresAt && o.status === "awaiting_quote_confirmation"
                  ? ` · cotação válida até ${new Date(o.quoteExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </div>
            )}
            {(o.fulfillments?.length ?? 0) > 1 ? (
              <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>
                {o.fulfillments!.map((f) => (
                  <div key={`${f.storeKey}:${f.unitLabel ?? f.deliveryMode ?? "primary"}`}>
                    🏬 <strong>{f.storeLabel}</strong>
                    {f.deliveryMode === "retailer_delivery"
                      ? ` entrega · ${f.deliveryPromise ?? "prazo pendente"}`
                      : `: ${f.unitLabel ?? "unidade pendente"}${f.unitAddress ? ` — ${f.unitAddress}` : ""}`}
                    {` · frete ${brl(f.deliveryFee)}`}
                  </div>
                ))}
              </div>
            ) : !retailerDelivery ? (
              <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>
                🏬 Retirada autorizada em: <strong>{o.storeUnit ?? o.storeLabel}</strong>
                {o.storeAddress ? ` — ${o.storeAddress}` : ""}
              </div>
            ) : null}
            {o.notes && <div style={{ fontSize: 12, color: "#98a2b3", marginTop: 4, whiteSpace: "pre-wrap" }}>{o.notes}</div>}

            {o.status === "awaiting_operator_quote" && (
              <div style={quoteBox}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f3d3a" }}>🧮 Cotar e enviar ao cliente</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    placeholder="custo produtos R$"
                    inputMode="decimal"
                    value={quote.itemsSubtotal}
                    onChange={(e) => setQuote({ itemsSubtotal: e.target.value })}
                    style={{ ...input, minWidth: 140 }}
                  />
                  <input
                    placeholder="frete R$"
                    inputMode="decimal"
                    value={quote.deliveryFee}
                    onChange={(e) => setQuote({ deliveryFee: e.target.value })}
                    style={{ ...input, minWidth: 110 }}
                  />
                  <select value={quote.deliveryMode} onChange={(e) => setQuote({ deliveryMode: e.target.value })} style={{ ...input, minWidth: 180 }}>
                    <option value="operator_courier">🛵 motoboy na hora</option>
                    <option value="retailer_delivery">🚚 entrega do varejista</option>
                  </select>
                  <input
                    placeholder="prazo (ex.: hoje até 19h)"
                    value={quote.deliveryPromise}
                    onChange={(e) => setQuote({ deliveryPromise: e.target.value })}
                    style={{ ...input, minWidth: 200 }}
                  />
                  <input
                    placeholder="ETA min"
                    inputMode="numeric"
                    value={quote.etaMinutes}
                    onChange={(e) => setQuote({ etaMinutes: e.target.value })}
                    style={{ ...input, minWidth: 90 }}
                  />
                  <button
                    style={primary}
                    disabled={busy === `${o.id}:publish_quote` || !(Number(quote.itemsSubtotal) > 0)}
                    onClick={() =>
                      act(o.id, "publish_quote", {
                        itemsSubtotal: Number(quote.itemsSubtotal),
                        deliveryFee: Number(quote.deliveryFee) || 0,
                        deliveryMode: quote.deliveryMode,
                        deliveryPromise: quote.deliveryPromise.trim() || undefined,
                        etaMinutes: quote.etaMinutes ? Number(quote.etaMinutes) : undefined
                      })
                    }
                  >
                    Enviar cotação ao cliente
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "#667085" }}>
                  Produtos recebem +10% de margem automático. O cliente aprova e paga por Pix/cartão; nada é cobrado antes.
                </div>
              </div>
            )}

            {(o.purchaseJobs?.length ?? 0) > 0 && (
              <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                {o.purchaseJobs!.map((job) => (
                  <div key={job.id} style={{ border: "1px solid #d0d5dd", borderRadius: 8, padding: 9, background: "#fcfcfd" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 13 }}>{job.storeLabel}</strong>
                      <span style={{ fontSize: 12, color: "#475467" }}>{PURCHASE_STATUS_LABEL[job.status] ?? job.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#667085", marginTop: 4 }}>
                      {job.items.map((item) => `${item.requestedQty}x ${item.requestedName} (${item.status})`).join(" · ")}
                      {job.actualTotal != null ? ` · loja: ${brl(job.actualTotal)}` : ""}
                    </div>
                    {job.lastErrorCode && (
                      <div style={{ fontSize: 12, color: "#b42318", marginTop: 4 }}>
                        {job.lastErrorCode}: {job.lastErrorMessage}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {(job.status === "preflight_queued" || job.status === "needs_human" || job.status === "failed") && (
                        <button style={secondary} disabled={busy === `${job.id}:preflight` || busy === `${job.id}:retry`} onClick={() => void purchaseAct(job, job.status === "preflight_queued" ? "preflight" : "retry")}>
                          🔎 Montar carrinho
                        </button>
                      )}
                      {o.status === "paid" && job.status === "cart_ready" && (
                        <button style={primary} disabled={busy === `${job.id}:request_approval`} onClick={() => void purchaseAct(job, "request_approval")}>
                          Pedir aprovação
                        </button>
                      )}
                      {o.status === "paid" && job.status === "awaiting_approval" && (
                        <button style={primary} disabled={busy === `${job.id}:approve`} onClick={() => void purchaseAct(job, "approve")}>
                          Aprovar compra
                        </button>
                      )}
                      {job.browserSessionId && (
                        <a href={`https://www.browserbase.com/sessions/${job.browserSessionId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0f3d3a" }}>
                          Abrir sessão da loja
                        </a>
                      )}
                      {job.storeOrderNumber && <span style={{ fontSize: 12 }}>Pedido loja: <strong>{job.storeOrderNumber}</strong></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              {o.status === "paid" && (
                <>
                  {(o.purchaseJobs?.length ?? 0) === 0 && !operatorCourier && o.storeKey !== "concierge" && (
                    <button
                      style={primary}
                      disabled={busy === `${o.id}:prepare_purchase`}
                      onClick={() => act(o.id, "prepare_purchase")}
                      title="Abre uma sessão segura, confere os itens reais e monta o carrinho. No modo inicial, nunca finaliza a compra."
                    >
                      🤖 Montar carrinho automático
                    </button>
                  )}
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
                    {retailerDelivery ? "Confirmar compra no varejista" : "Marquei como comprado"}
                  </button>
                </>
              )}
              {retailerDelivery && (o.status === "retailer_preparing" || o.status === "operator_buying") && (
                <>
                  <input
                    placeholder="link https de rastreio (se houver)"
                    value={tracking[o.id] ?? ""}
                    onChange={(e) => setTracking((current) => ({ ...current, [o.id]: e.target.value }))}
                    style={{ ...input, minWidth: 240 }}
                  />
                  <button
                    style={primary}
                    disabled={busy === `${o.id}:retailer_out_for_delivery`}
                    onClick={() =>
                      act(o.id, "retailer_out_for_delivery", { trackingUrl: tracking[o.id] ?? "" })
                    }
                  >
                    🚚 Loja saiu para entrega
                  </button>
                </>
              )}
              {!retailerDelivery && (o.status === "operator_buying" || o.status === "ready_for_pickup") && (
                <button style={primary} disabled={busy === `${o.id}:dispatch`} onClick={() => act(o.id, "dispatch")}>
                  {operatorCourier ? "🛵 Despachar motoboy (sai da sua base)" : "🛵 Despachar courier autorizado"}
                </button>
              )}
              {(o.status === "retailer_out_for_delivery" || o.status === "dispatched") && (
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
              {o.status === "refund_pending" ? (
                <>
                  <input
                    placeholder="referência do estorno no provedor"
                    value={refundReferences[o.id] ?? ""}
                    onChange={(e) =>
                      setRefundReferences((current) => ({ ...current, [o.id]: e.target.value }))
                    }
                    style={{ ...input, minWidth: 240 }}
                  />
                  <button
                    style={primary}
                    disabled={busy === `${o.id}:confirm_refund` || !(refundReferences[o.id] ?? "").trim()}
                    onClick={() => {
                      if (
                        window.confirm(
                          "O provedor já confirmou o estorno? Esta ação avisará o cliente."
                        )
                      ) {
                        void act(o.id, "confirm_refund", {
                          refundReference: refundReferences[o.id] ?? ""
                        });
                      }
                    }}
                  >
                    ✅ Confirmar estorno concluído
                  </button>
                </>
              ) : (
                <button
                  style={ghost}
                  disabled={busy === `${o.id}:cancel`}
                  onClick={() => {
                    const prompt = paymentReceived
                      ? "Cancelar este pedido e registrar o estorno como PENDENTE? Isso ainda não executa o estorno no provedor."
                      : "Cancelar este pedido sem pagamento?";
                    if (window.confirm(prompt)) void act(o.id, "cancel");
                  }}
                >
                  {paymentReceived ? "Cancelar e solicitar estorno" : "Cancelar pedido"}
                </button>
              )}
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
                      <span style={l.reason === "too_far" ? reasonFar : reasonOut}>
                        {l.reason === "too_far" ? "longe" : "fora"}
                      </span>{" "}
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
const refundBanner: React.CSSProperties = {
  background: "#fff4e5",
  color: "#93370d",
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
const reasonOut: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#93370d", background: "#fef0c7", borderRadius: 4, padding: "1px 5px", textTransform: "uppercase" };
const reasonFar: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#5925dc", background: "#ebe9fe", borderRadius: 4, padding: "1px 5px", textTransform: "uppercase" };
const ghost: React.CSSProperties = { padding: "8px 12px", background: "transparent", color: "#b42318", border: "1px solid #fda29b", borderRadius: 8, fontSize: 13, cursor: "pointer" };
const quoteBox: React.CSSProperties = { marginTop: 10, padding: 10, border: "1px dashed #0f3d3a", borderRadius: 8, background: "#f2fbf9", display: "grid", gap: 8 };
