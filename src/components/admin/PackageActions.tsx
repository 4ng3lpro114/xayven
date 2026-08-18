"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PackageStatusAction = "activate" | "deactivate";

export type PackageActionOutcome =
  | { status: "success" }
  | { status: "error"; code: "unauthorized" | "not_found" | "generic" };

/** Dependency-injectable request function, same shape as
 *  requestPromotionStatusChange() — testable without mocking global fetch. */
export async function requestPackageStatusChange(
  itemId: string,
  action: PackageStatusAction,
  fetchImpl: typeof fetch = fetch
): Promise<PackageActionOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/packages/${itemId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  } catch {
    return { status: "error", code: "generic" };
  }

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean };

  if (res.ok && body.ok) return { status: "success" };
  if (res.status === 401) return { status: "error", code: "unauthorized" };
  if (res.status === 404) return { status: "error", code: "not_found" };
  return { status: "error", code: "generic" };
}

const ERROR_MESSAGES: Record<Exclude<PackageActionOutcome, { status: "success" }>["code"], string> = {
  unauthorized: "Tu sesión expiró — vuelve a iniciar sesión.",
  not_found: "Este producto ya no existe.",
  generic: "No pudimos completar la acción. Intenta de nuevo.",
};

const ACTION_LABELS: Record<PackageStatusAction, string> = {
  activate: "Activar",
  deactivate: "Desactivar",
};

export function PackageActionButton({
  itemId,
  action,
  variant = "secondary",
}: {
  itemId: string;
  action: PackageStatusAction;
  variant?: "secondary" | "danger";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const outcome = await requestPackageStatusChange(itemId, action);
    setLoading(false);

    if (outcome.status === "success") {
      router.refresh();
      return;
    }
    setError(ERROR_MESSAGES[outcome.code]);
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
          variant === "danger"
            ? "border-error/40 text-error hover:bg-error/10"
            : "border-border-strong text-fg-muted hover:border-border-accent hover:text-fg"
        )}
      >
        {loading && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
        {ACTION_LABELS[action]}
      </button>
      {error && <p className="text-[0.7rem] text-error">{error}</p>}
    </div>
  );
}
