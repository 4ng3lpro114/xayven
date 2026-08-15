"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionary";

type Status = "idle" | "submitting" | "success" | "error";

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent-400 focus:outline-none";

export interface RegisterApiResponse {
  ok?: boolean;
  sessionActive?: boolean;
  error?: string;
}

export type RegisterOutcome =
  | { status: "success"; sessionActive: boolean }
  | { status: "error"; code: "email_in_use" | "passwords_dont_match" | "rate_limited" | "generic" };

/** Pure and independently testable — same shape as
 *  deriveContactSubmitStatus() in ContactForm.tsx. */
export function deriveRegisterOutcome(res: { status: number }, body: RegisterApiResponse): RegisterOutcome {
  if (res.status === 200 && body.ok === true) {
    return { status: "success", sessionActive: Boolean(body.sessionActive) };
  }
  if (body.error === "email_in_use") return { status: "error", code: "email_in_use" };
  if (body.error === "passwords_dont_match") return { status: "error", code: "passwords_dont_match" };
  if (res.status === 429) return { status: "error", code: "rate_limited" };
  return { status: "error", code: "generic" };
}

export async function requestRegister(
  payload: { email: string; password: string; confirmPassword: string },
  fetchImpl: typeof fetch = fetch
): Promise<RegisterOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "error", code: "generic" };
  }
  const body = (await res.json().catch(() => ({}))) as RegisterApiResponse;
  return deriveRegisterOutcome(res, body);
}

export function RegisterForm({
  form,
  loginHref,
  accountHref,
}: {
  form: Dictionary["auth"]["register"];
  loginHref: string;
  accountHref: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [sessionActive, setSessionActive] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const formId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setServerError(null);

    const data = new FormData(event.currentTarget);
    const payload = {
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    };

    const nextErrors: FieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) nextErrors.email = form.errorGeneric;
    if (payload.password.length < 8) nextErrors.password = form.errorWeakPassword;
    if (payload.password !== payload.confirmPassword) {
      nextErrors.confirmPassword = form.errorPasswordsDontMatch;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setStatus("submitting");
    const outcome = await requestRegister(payload);

    if (outcome.status === "success") {
      setSessionActive(outcome.sessionActive);
      setStatus("success");
      if (outcome.sessionActive) {
        router.refresh();
      }
      return;
    }

    const messages: Record<typeof outcome.code, string> = {
      email_in_use: form.errorEmailInUse,
      passwords_dont_match: form.errorPasswordsDontMatch,
      rate_limited: form.errorRateLimited,
      generic: form.errorGeneric,
    };
    setServerError(messages[outcome.code]);
    setStatus("error");
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-border-accent bg-bg-raised p-8 text-center">
        <CheckCircle2 className="mx-auto size-8 text-accent-400" aria-hidden="true" />
        <h3 className="mt-4 text-lg font-semibold text-fg">{form.successTitle}</h3>
        <p className="mt-2 text-sm text-fg-muted">
          {sessionActive ? form.successBodyActive : form.successBodyConfirmEmail}
        </p>
        {sessionActive && (
          <Button href={accountHref} className="mt-5" withArrow>
            {form.goToAccountCta}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field label={form.emailLabel} htmlFor={`${formId}-email`} error={errors.email}>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={form.emailPlaceholder}
          className={inputClasses}
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <Field label={form.passwordLabel} htmlFor={`${formId}-password`} error={errors.password}>
        <input
          id={`${formId}-password`}
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder={form.passwordPlaceholder}
          className={inputClasses}
          aria-invalid={Boolean(errors.password)}
        />
      </Field>

      <Field
        label={form.confirmPasswordLabel}
        htmlFor={`${formId}-confirmPassword`}
        error={errors.confirmPassword}
      >
        <input
          id={`${formId}-confirmPassword`}
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder={form.confirmPasswordPlaceholder}
          className={inputClasses}
          aria-invalid={Boolean(errors.confirmPassword)}
        />
      </Field>

      {serverError && (
        <div className="flex items-start gap-2.5 rounded-md border border-error/40 bg-error/10 px-4 py-3 text-sm text-fg">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          <p>{serverError}</p>
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
        {form.haveAccount}{" "}
        <a href={loginHref} className="text-accent-300 transition-colors hover:text-accent-100">
          {form.loginLink}
        </a>
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={cn("mb-2 block text-sm font-medium text-fg")}>
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}
