"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { AdminFormSection, AdminField, adminInputClasses } from "@/components/admin/ui/AdminFormSection";

const inputClasses = adminInputClasses;
const CURRENCY_OPTIONS = ["COP", "USD"];

export interface PreselectedClient {
  id: string;
  name: string;
  email: string;
  /** Only ever sourced from a linked conversation's `company` — `clients`
   *  itself has no such column (see Fase 5A audit). Null when unknown. */
  company: string | null;
}

/**
 * Fase 6: when `preselectedClient` is passed (the client already exists —
 * reached via /admin/projects/new?clientId=..., see the page component),
 * the client fields are replaced by a read-only summary and `clientId` is
 * sent instead of clientName/clientEmail/clientPhone. Without it, this is
 * the exact same form/flow as before — nothing about the original
 * behavior changed.
 *
 * XAYVEN CORE Phase 3.5 (Admin UI consistency) — currency now renders via
 * CustomSelect.tsx instead of a native `<select>` — same field name, same
 * submitted value, visual only.
 */
export function NewProjectForm({
  preselectedClient = null,
}: {
  preselectedClient?: PreselectedClient | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const payload = preselectedClient
      ? {
          clientId: preselectedClient.id,
          projectName: String(data.get("projectName") ?? ""),
          totalAmount: Number(data.get("totalAmount")),
          currency: String(data.get("currency") ?? "COP"),
        }
      : {
          clientName: String(data.get("clientName") ?? ""),
          clientEmail: String(data.get("clientEmail") ?? ""),
          clientPhone: String(data.get("clientPhone") ?? ""),
          projectName: String(data.get("projectName") ?? ""),
          totalAmount: Number(data.get("totalAmount")),
          currency: String(data.get("currency") ?? "COP"),
        };

    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; projectId?: string };

      if (res.ok && result.ok && result.projectId) {
        router.push(`/admin/projects/${result.projectId}`);
        router.refresh();
        return;
      }
      setError("No pudimos crear el proyecto. Revisa los datos e intenta de nuevo.");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <AdminFormSection title="Cliente">
        {preselectedClient ? (
          <div className="rounded-lg border border-border-accent bg-bg-raised p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
              Proyecto para
            </p>
            <p className="mt-1 text-sm font-medium text-fg">{preselectedClient.name}</p>
            {preselectedClient.company && (
              <p className="text-sm text-fg-muted">{preselectedClient.company}</p>
            )}
            <p className="text-sm text-fg-muted">{preselectedClient.email}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <AdminField label="Nombre del cliente" htmlFor="clientName">
                <input id="clientName" name="clientName" type="text" required className={inputClasses} />
              </AdminField>
              <AdminField label="Email del cliente" htmlFor="clientEmail">
                <input id="clientEmail" name="clientEmail" type="email" required className={inputClasses} />
              </AdminField>
            </div>
            <AdminField label="Teléfono / WhatsApp (opcional)" htmlFor="clientPhone">
              <input id="clientPhone" name="clientPhone" type="text" className={inputClasses} />
            </AdminField>
          </>
        )}
      </AdminFormSection>

      <AdminFormSection title="Proyecto">
        <AdminField label="Nombre del proyecto" htmlFor="projectName">
          <input id="projectName" name="projectName" type="text" required className={inputClasses} />
        </AdminField>

        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="Precio total" htmlFor="totalAmount">
            <input
              id="totalAmount"
              name="totalAmount"
              type="number"
              min={1}
              step={1}
              required
              placeholder="3000000"
              className={inputClasses}
            />
          </AdminField>
          <AdminField label="Moneda" htmlFor="currency">
            <CustomSelect id="currency" name="currency" options={CURRENCY_OPTIONS} defaultValue="COP" placeholder="—" />
          </AdminField>
        </div>
      </AdminFormSection>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Crear proyecto"}
      </Button>
    </form>
  );
}
