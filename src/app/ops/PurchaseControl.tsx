"use client";
import { useEffect, useState } from "react";
type Account = {
  storeKey: string;
  email?: string;
  loginReady: boolean;
  paymentReady: boolean;
  enabled: boolean;
  lastSeenAt?: string;
};
const stores: Record<string, string> = {
  drogariasp: "Drogaria São Paulo",
  paguemenos: "Pague Menos",
  cobasi: "Cobasi",
  oba: "Oba",
  swift: "Swift",
  divvino: "Divvino",
  kopenhagen: "Kopenhagen",
  rihappy: "Ri Happy",
  naturaldaterra: "Natural da Terra",
};
const button = {
  padding: "8px 12px",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
};
export function PurchaseAccounts() {
  const [open, setOpen] = useState(false),
    [policy, setPolicy] = useState<{ perOrderCents: number; dailyCents: number; usedCents: number; stores: string[]; paused: boolean } | null>(null),
    [accounts, setAccounts] = useState<Account[]>([]),
    [message, setMessage] = useState("");
  const [store, setStore] = useState("drogariasp"),
    [email, setEmail] = useState(""),
    [login, setLogin] = useState(false),
    [card, setCard] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    void fetch("/api/ops/purchase-accounts")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const body = await r.json();
        const loaded: Account[] = body.accounts;
        setPolicy(body.policy ?? null);
        setAccounts(loaded);
        const a = loaded.find((a) => a.storeKey === "drogariasp");
        setStore("drogariasp");
        setEmail(a?.email ?? "");
        setLogin(a?.loginReady ?? false);
        setCard(a?.paymentReady ?? false);
        setEnabled(a?.enabled ?? false);
      })
      .catch(() => setMessage("Não consegui carregar as contas."));
  }, [open]);
  function select(key: string) {
    setStore(key);
    const a = accounts.find((a) => a.storeKey === key);
    setEmail(a?.email ?? "");
    setLogin(a?.loginReady ?? false);
    setCard(a?.paymentReady ?? false);
    setEnabled(a?.enabled ?? false);
    setMessage("");
  }
  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/ops/purchase-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeKey: store,
          ...(email ? { email } : {}),
          loginReady: login,
          paymentReady: card,
          enabled,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setAccounts((old) => [
        ...old.filter((a) => a.storeKey !== store),
        b.account,
      ]);
      setMessage("Configuração salva.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        border: "1px solid #e4e7ec",
        padding: 14,
        borderRadius: 12,
        marginBottom: 18,
      }}
    >
      <button style={button} onClick={() => setOpen(!open)}>
        {open ? "Fechar configuração" : "Contas de compra da Lia"}
      </button>
      {open && (
        <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 600 }}>
          {policy && <p style={{ margin: 0 }}>
            Compra sem aprovação individual: até R$ {(policy.perOrderCents / 100).toFixed(2)} por pedido
            e R$ {(policy.dailyCents / 100).toFixed(2)} por dia, incluindo frete.
            Hoje: R$ {(policy.usedCents / 100).toFixed(2)} utilizados ou reservados (horário de São Paulo).
            {policy.paused ? " Compra automática pausada." : policy.stores.length
              ? ` Lojas liberadas após validação do checkout: ${policy.stores.map(s => stores[s] ?? s).join(", ")}. A conta também precisa estar conectada e ativa.`
              : " Nenhuma loja liberada ainda: falta validar checkout e comprovante."}
          </p>}
          <p style={{ margin: 0 }}>
            Entre na conta da loja e cadastre o cartão da empresa na janela do
            comprador. Depois confirme os dois itens abaixo. Senhas e cartão
            ficam na própria loja.
          </p>
          <label>
            Loja{" "}
            <select value={store} onChange={(e) => select(e.target.value)}>
              {Object.entries(stores).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            E-mail das compras{" "}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail da conta operacional"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={login}
              onChange={(e) => setLogin(e.target.checked)}
            />{" "}
            Conta conectada na janela do comprador
          </label>
          <label>
            <input
              type="checkbox"
              checked={card}
              onChange={(e) => setCard(e.target.checked)}
            />{" "}
            Cartão corporativo salvo e conferido nessa conta
          </label>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!login || !card || !email}
            />{" "}
            Ativar preparação de compras nesta loja
          </label>
          <button style={button} disabled={busy} onClick={save}>
            {busy ? "Salvando…" : "Salvar conta"}
          </button>
          {accounts.find((a) => a.storeKey === store)?.lastSeenAt && (
            <small>
              Último contato do comprador:{" "}
              {new Date(
                accounts.find((a) => a.storeKey === store)!.lastSeenAt!,
              ).toLocaleString("pt-BR")}
            </small>
          )}
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        </div>
      )}
    </section>
  );
}
export type PurchaseReviewJob = {
  id: string;
  status: string;
  checkoutHash?: string | null;
  checkoutExpiresAt?: string | null;
  lastErrorMessage?: string | null;
  checkoutEvidence?: {
    recipientName: string;
    accountEmail: string;
    destination: string;
    deliveryOption: string;
    deliveryPromise: string;
    paymentLabel: string;
    totalCents: number;
    freightCents: number;
    items: { sku: string; name: string; qty: number; lineTotalCents: number }[];
  } | null;
};
export function PurchaseReview({
  job,
  refresh,
}: {
  job: PurchaseReviewJob;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [note, setNote] = useState("");
  const e = job.checkoutEvidence;
  const labels: Record<string, string> = {
    queued: "Na fila de compra",
    claimed: "Preparando na loja",
    awaiting_approval: "Carrinho pronto para conferir",
    approved: "Autorizada — aguardando conferência na loja",
    submitting: "Finalizando na loja",
    outcome_unknown: "Confira o histórico da loja antes de tentar novamente",
    needs_review: "Compra precisa de revisão",
    completed: "Compra registrada",
  };
  const money = (v: number) =>
    (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  async function release() {
    setBusy(true);
    try {
      const r = await fetch(`/api/ops/purchase-jobs/${job.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reconcile_empty",
          confirmedNoOrder: true,
          confirmedEmptyCart: true,
          note,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível liberar");
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/ops/purchase-jobs/${job.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          checkoutHash: job.checkoutHash,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na aprovação");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      style={{
        background: "#eef6f3",
        padding: 12,
        borderRadius: 10,
        marginTop: 10,
      }}
    >
      <strong>{labels[job.status] ?? job.status}</strong>
      {e && job.status === "awaiting_approval" && (
        <>
          <ul>
            {e.items.map((i) => (
              <li key={i.sku}>
                {i.qty} × {i.name} — {money(i.lineTotalCents)}
              </li>
            ))}
          </ul>
          <p>
            {e.recipientName}
            <br />
            {e.destination}
            <br />
            {e.deliveryOption} · {e.deliveryPromise}
            <br />
            {e.accountEmail}
            <br />
            {e.paymentLabel} · frete {money(e.freightCents)}
          </p>
          <button
            style={button}
            disabled={busy || !job.checkoutHash}
            onClick={approve}
          >
            Autorizar compra de {money(e.totalCents)}
          </button>
          <small style={{ display: "block", marginTop: 6 }}>
            Esta é uma autorização adicional para este pedido, inclusive quando
            excede os limites automáticos. Você pode aprovar quando puder. Vamos conferir o carrinho novamente
            antes de comprar. Se algo mudar, pediremos nova conferência.
          </small>
        </>
      )}
      {["needs_review", "outcome_unknown"].includes(job.status) && (
        <div>
          <p>
            Se a compra existe, registre o número em “Confirmar compra”. Para
            tentar novamente, encerre o comprador, confira os pedidos e
            cobranças pendentes na loja e esvazie o carrinho.
          </p>
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            Conferi: não há compra nem cobrança pendente, e o carrinho está
            vazio
          </label>
          <label style={{ display: "block" }}>
            Registro da conferência{" "}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </label>
          <button
            style={button}
            disabled={busy || !reviewed || note.trim().length < 10}
            onClick={release}
          >
            Liberar conta após conferência
          </button>
        </div>
      )}
      {job.lastErrorMessage && <p>{job.lastErrorMessage}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
