"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProductActions({ productId, available }: { productId: string; available: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markUnavailable() {
    setLoading(true);
    await fetch(`/api/admin/products/${productId}/unavailable`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      disabled={!available || loading}
      onClick={markUnavailable}
      className="mt-2 rounded-md border border-lia-line px-2 py-1 text-xs text-lia-body hover:border-lia-aqua hover:text-lia-night disabled:opacity-45"
    >
      {available ? "Marcar indisponivel" : "Indisponivel"}
    </button>
  );
}
