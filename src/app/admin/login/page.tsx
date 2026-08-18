"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (res.ok && data.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }

      if (data.error === "not_configured") {
        setError("El panel de administración todavía no está configurado (ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET).");
      } else if (res.status === 429) {
        setError("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
      } else {
        setError("Contraseña incorrecta.");
      }
    } catch {
      setError("No pudimos conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div className="field-glow" />
      <div className="grid-overlay" />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border-strong bg-bg-raised p-8 shadow-elevated">
        <div className="flex items-center gap-2.5">
          <Logo />
        </div>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">XAYVEN Admin</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-fg">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <input
                id="password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border-strong bg-bg-elevated py-3 pl-10 pr-4 text-sm text-fg focus:border-accent-400 focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
