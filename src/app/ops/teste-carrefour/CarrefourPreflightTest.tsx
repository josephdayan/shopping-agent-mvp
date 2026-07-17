"use client";

import { useCallback, useEffect, useState } from "react";

type Result = {
  ok?: boolean;
  status?: string;
  runId?: string;
  actualTotal?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: string;
};

const terminal = new Set(["cart_ready", "needs_human", "failed", "canceled"]);

export default function CarrefourPreflightTest() {
  const [result, setResult] = useState<Result>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/ops/internal-preflight", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as Result;
    setResult(response.ok ? data : { error: data.error ?? `HTTP ${response.status}` });
    return data;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!result.status || terminal.has(result.status) || result.status === "not_started") return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh, result.status]);

  async function run() {
    setBusy(true);
    try {
      const response = await fetch("/api/ops/internal-preflight", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as Result;
      setResult(response.ok ? { ...data, status: "preflight_queued" } : { error: data.error ?? `HTTP ${response.status}` });
    } finally {
      setBusy(false);
    }
  }

  async function openLoginSession() {
    setSessionBusy(true);
    try {
      const response = await fetch("/api/ops/carrefour-session", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { debuggerUrl?: string; error?: string };
      if (!response.ok || !data.debuggerUrl) {
        setResult({ error: data.error ?? `HTTP ${response.status}` });
        return;
      }
      setSessionUrl(data.debuggerUrl);
    } finally {
      setSessionBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <button type="button" onClick={() => void run()} disabled={busy} style={{ padding: "10px 14px", width: "fit-content" }}>
        {busy ? "Iniciando…" : "Executar preflight cart_only"}
      </button>
      <button type="button" onClick={() => void openLoginSession()} disabled={sessionBusy} style={{ padding: "10px 14px", width: "fit-content" }}>
        {sessionBusy ? "Abrindo sessão…" : "Abrir sessão Carrefour para login"}
      </button>
      {sessionUrl && <a href={sessionUrl} target="_blank" rel="noreferrer">Entrar na sessão viva do Carrefour →</a>}
      <div style={{ padding: 14, border: "1px solid #d0d5dd", borderRadius: 10, background: "#fff" }}>
        <div><strong>Status:</strong> {result.status ?? "—"}</div>
        {result.actualTotal != null && <div><strong>Total:</strong> R$ {result.actualTotal.toFixed(2).replace(".", ",")}</div>}
        {result.errorCode && <div><strong>Código:</strong> {result.errorCode}</div>}
        {(result.errorMessage || result.error) && <div><strong>Detalhe:</strong> {result.errorMessage ?? result.error}</div>}
        {result.runId && <div><strong>Run:</strong> {result.runId}</div>}
      </div>
      <p style={{ color: "#667085", margin: 0 }}>Sem WhatsApp, cobrança ou compra. A produção continua em cart_only.</p>
    </div>
  );
}
