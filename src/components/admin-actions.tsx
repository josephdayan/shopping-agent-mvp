"use client";

import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, FastForward, PackageCheck, RefreshCw, RotateCcw, Truck } from "lucide-react";
import { useState } from "react";

export default function AdminActions({
  orderId,
  canApprove,
  canAdvance
}: {
  orderId?: string;
  canApprove?: boolean;
  canAdvance?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function call(action: "approve" | "advance" | "purchased" | "delivered" | "substitution" | "cancel-refund") {
    if (!orderId) {
      router.refresh();
      return;
    }
    setLoading(action);
    await fetch(`/api/admin/orders/${orderId}/${action}`, { method: "POST" });
    setLoading(null);
    router.refresh();
  }

  if (!orderId) {
    return (
      <button
        onClick={() => router.refresh()}
        className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-medium hover:border-leaf"
      >
        <RefreshCw size={16} />
        Atualizar
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        disabled={!canApprove || loading !== null}
        onClick={() => call("approve")}
        className="inline-flex items-center gap-2 rounded-md bg-coral px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        <CheckCircle2 size={14} />
        Aprovar
      </button>
      <button
        disabled={!canAdvance || loading !== null}
        onClick={() => call("advance")}
        className="inline-flex items-center gap-2 rounded-md border border-ink/15 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
      >
        <FastForward size={14} />
        Avancar
      </button>
      <button
        disabled={loading !== null}
        onClick={() => call("purchased")}
        className="inline-flex items-center gap-2 rounded-md border border-ink/15 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
      >
        <PackageCheck size={14} />
        Comprado
      </button>
      <button
        disabled={loading !== null}
        onClick={() => call("delivered")}
        className="inline-flex items-center gap-2 rounded-md border border-ink/15 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Truck size={14} />
        Entregue
      </button>
      <button
        disabled={loading !== null}
        onClick={() => call("substitution")}
        className="inline-flex items-center gap-2 rounded-md border border-gold/40 px-3 py-2 text-xs font-semibold text-gold disabled:cursor-not-allowed disabled:opacity-45"
      >
        <RotateCcw size={14} />
        Substituir
      </button>
      <button
        disabled={loading !== null}
        onClick={() => call("cancel-refund")}
        className="inline-flex items-center gap-2 rounded-md border border-coral/40 px-3 py-2 text-xs font-semibold text-coral disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Ban size={14} />
        Cancelar
      </button>
    </div>
  );
}
