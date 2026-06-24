"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, FastForward, RefreshCw } from "lucide-react";
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

  async function call(action: "approve" | "advance") {
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
    </div>
  );
}
