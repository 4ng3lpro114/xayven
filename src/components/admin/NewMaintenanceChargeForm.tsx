"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none";

export function NewMaintenanceChargeForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const payload = {
      projectId,
      amount: Number(data.get("amount")),
      provider: String(data.get("provider") ?? "WOMPI"),
    };

    try {
      const res = await fetch("/api/admin/payments/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.refresh();
        (e.target as HTMLFormElement).reset();
        return;
      }
      setError("No pudimos crear el cobro. Revisa el monto e intenta de nuevo.");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="amount" className="mb-1.5 block text-xs text-fg-subtle">
          Monto
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          min={1}
          step={1}
          required
          placeholder="300000"
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="provider" className="mb-1.5 block text-xs text-fg-subtle">
          Método
        </label>
        <select id="provider" name="provider" defaultValue="WOMPI" className={inputClasses}>
          <option value="WOMPI">Wompi</option>
          <option value="PAYPAL">PayPal</option>
          <option value="WISE">Wise (manual)</option>
        </select>
      </div>
      <Button type="submit" disabled={loading} size="md">
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Crear cobro"}
      </Button>
      {error && <p className="w-full text-sm text-error">{error}</p>}
    </form>
  );
}
