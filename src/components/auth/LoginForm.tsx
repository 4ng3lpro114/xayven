"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Dictionary } from "@/lib/i18n/dictionary";

type Status = "idle" | "submitting" | "error";

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent-400 focus:outline-none";

export interface LoginApiResponse {
  ok?: boolean;
  error?: string;
}

export type LoginOutcome =
  | { status: "success" }
  | { status: "error"; code: "invalid_credentials" | "rate_limited" | "generic" };

/** Pure and independently testable — same shape as deriveRegisterOutcome(). */
export function deriveLoginOutcome(res: { status: number }, body: LoginApiResponse): LoginOutcome {
  if (res.status === 200 && body.ok === true) return { status: "success" };
  if (res.status === 401) return { status: "error", code: "invalid_credentials" };
  if (res.status === 429) return { status: "error", code: "rate_limited" };
  return { status: "error", code: "generic" };
}

export async function requestLogin(
  payload: { email: string; password: string },
  fetchImpl: typeof fetch = fetch
): Promise<LoginOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "error", code: "generic" };
  }
  const body = (await res.json().catch(() => ({}))) as LoginApiResponse;
  return deriveLoginOutcome(res, body);
}

export function LoginForm({
  form,
  registerHref,
  accountHref,
}: {
  form: Dictionary["auth"]["login"];
  registerHref: string;
  accountHref: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = new FormData(event.currentTarget);
    const payload = {
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };

    setStatus("submitting");
    const outcome = await requestLogin(payload);

    if (outcome.status === "success") {
      router.push(accountHref);
      router.refresh();
      return;
    }

    const messages: Record<typeof outcome.code, string> = {
      invalid_credentials: form.errorInvalidCredentials,
      rate_limited: form.errorRateLimited,
      generic: form.errorGeneric,
    };
    setError(messages[outcome.code]);
    setStatus("error");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field label={form.emailLabel} htmlFor={`${formId}-email`}>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={form.emailPlaceholder}
          className={inputClasses}
        />
      </Field>

      <Field label={form.passwordLabel} htmlFor={`${formId}-password`}>
        <input
          id={`${formId}-password`}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder={form.passwordPlaceholder}
          className={inputClasses}
        />
      </Field>

      {status === "error" && error && (
        <div className="flex items-start gap-2.5 rounded-md border border-error/40 bg-error/10 px-4 py-3 text-sm text-fg">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <Button type="submit" size="lg" disabled={status === "submitting"} className="w-full sm:w-auto">
        {status === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {form.submitting}
          </>
        ) : (
          form.submit
        )}
      </Button>

      <p className="text-sm text-fg-subtle">
        {form.noAccount}{" "}
        <a href={registerHref} className="text-accent-300 transition-colors hover:text-accent-100">
          {form.registerLink}
        </a>
      </p>
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
  children: ReactNode;
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
