"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import LiaBrand from "@/components/lia-brand";

export default function AdminLogin() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password })
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      router.refresh();
      return;
    }
    const body = await res?.json().catch(() => null);
    setError(body?.error ?? "Não deu pra entrar agora. Tenta de novo.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-lia-lavender/55 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-md border border-lia-line bg-white px-6 py-7 shadow-brand">
        <div className="flex items-center justify-between">
          <LiaBrand size="sm" />
          <Lock size={18} className="text-lia-night/60" />
        </div>
        <h1 className="text-lg font-semibold text-lia-night">Painel admin</h1>
        <label className="block space-y-1 text-sm text-lia-night/80">
          <span>Usuário</span>
          <input
            value={user}
            onChange={(event) => setUser(event.target.value)}
            autoComplete="username"
            className="w-full rounded-md border border-lia-line px-3 py-2 text-lia-night outline-none focus:border-lia-aqua"
          />
        </label>
        <label className="block space-y-1 text-sm text-lia-night/80">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="w-full rounded-md border border-lia-line px-3 py-2 text-lia-night outline-none focus:border-lia-aqua"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !user || !password}
          className="w-full rounded-md bg-lia-night px-4 py-2 font-semibold text-white transition disabled:opacity-50"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
