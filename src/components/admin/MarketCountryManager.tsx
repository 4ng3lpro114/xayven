"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * International Pricing — Phase D Admin. Add/remove country → market
 * routes (market_countries) for one market. Deliberately simple — a text
 * input + a list of removable pills, no separate "edit" (a route only
 * ever exists pointing at one market or doesn't; see
 * /api/admin/markets/[id]/countries/route.ts's doc comment).
 */
export function MarketCountryManager({ marketId, countryCodes }: { marketId: string; countryCodes: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const countryCode = String(data.get("countryCode") ?? "").trim();
    if (!countryCode) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/countries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", countryCode }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && result.ok) {
        e.currentTarget.reset();
        router.refresh();
      } else {
        setError("Código de país inválido (usa ISO 3166-1 alpha-2, p.ej. US, CO, DE).");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(countryCode: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/countries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", countryCode }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && result.ok) {
        router.refresh();
      } else {
        setError("No pudimos quitar ese país. Intenta de nuevo.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {countryCodes.length === 0 && (
          <p className="text-sm text-fg-subtle">
            Ningún país enrutado todavía — cualquier visitante cae al mercado &apos;OTHER&apos; por defecto.
          </p>
        )}
        {countryCodes.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1.5 rounded-pill border border-border-strong px-3 py-1 text-xs font-medium text-fg"
          >
            {code}
            <button
              type="button"
              onClick={() => handleRemove(code)}
              disabled={loading}
              aria-label={`Quitar ${code}`}
              className="text-fg-subtle hover:text-error disabled:opacity-50"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={handleAdd} className="mt-4 flex items-end gap-3">
        <div>
          <label htmlFor="countryCode" className="mb-1 block text-xs font-medium text-fg-muted">
            Agregar país (ISO 3166-1 alpha-2)
          </label>
          <input
            id="countryCode"
            name="countryCode"
            type="text"
            maxLength={2}
            placeholder="US"
            required
            className="w-24 rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm uppercase text-fg focus:border-accent-400 focus:outline-none"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Agregar"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
