"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";

export function ConfirmWiseButtons({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"APPROVED" | "DECLINED" | null>(null);

  async function confirm(outcome: "APPROVED" | "DECLINED") {
    setLoading(outcome);
    try {
      await fetch(`/api/admin/payments/${paymentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => confirm("APPROVED")}
        disabled={loading !== null}
        className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
      >
        {loading === "APPROVED" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-3.5" aria-hidden="true" />
        )}
        Recibido
      </button>
      <button
        type="button"
        onClick={() => confirm("DECLINED")}
        disabled={loading !== null}
        className="inline-flex items-center gap-1 rounded-md border border-error/40 bg-error/10 px-2.5 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
      >
        {loading === "DECLINED" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <X className="size-3.5" aria-hidden="true" />
        )}
        Rechazar
      </button>
    </div>
  );
}
