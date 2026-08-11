"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none";

export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const payload = {
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
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nombre del cliente" htmlFor="clientName">
          <input id="clientName" name="clientName" type="text" required className={inputClasses} />
        </Field>
        <Field label="Email del cliente" htmlFor="clientEmail">
          <input id="clientEmail" name="clientEmail" type="email" required className={inputClasses} />
        </Field>
      </div>

      <Field label="Teléfono / WhatsApp (opcional)" htmlFor="clientPhone">
        <input id="clientPhone" name="clientPhone" type="text" className={inputClasses} />
      </Field>

      <Field label="Nombre del proyecto" htmlFor="projectName">
        <input id="projectName" name="projectName" type="text" required className={inputClasses} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Precio total" htmlFor="totalAmount">
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
        </Field>
        <Field label="Moneda" htmlFor="currency">
          <select id="currency" name="currency" defaultValue="COP" className={inputClasses}>
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </select>
        </Field>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Crear proyecto"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}
