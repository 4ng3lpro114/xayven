"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionary";

type Status = "idle" | "submitting" | "success" | "error";

interface FieldErrors {
  name?: string;
  email?: string;
  projectType?: string;
  budget?: string;
  message?: string;
}

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent-400 focus:outline-none";

export function ContactForm({ form }: { form: Dictionary["contact"]["form"] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const formId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      company: String(data.get("company") ?? "").trim(),
      projectType: String(data.get("projectType") ?? "").trim(),
      budget: String(data.get("budget") ?? "").trim(),
      message: String(data.get("message") ?? "").trim(),
      website: String(data.get("website") ?? ""), // honeypot
    };

    const nextErrors: FieldErrors = {};
    if (payload.name.length < 2) nextErrors.name = form.requiredError;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) nextErrors.email = form.emailError;
    if (!payload.projectType) nextErrors.projectType = form.requiredError;
    if (!payload.budget) nextErrors.budget = form.requiredError;
    if (payload.message.length < 20) nextErrors.message = form.minLengthError;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-border-accent bg-bg-raised p-8 text-center">
        <CheckCircle2 className="mx-auto size-8 text-accent-400" aria-hidden="true" />
        <h3 className="mt-4 text-lg font-semibold text-fg">{form.successTitle}</h3>
        <p className="mt-2 text-sm text-fg-muted">{form.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Honeypot — hidden from real users, catches simple bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`${formId}-website`}>Website</label>
        <input
          id={`${formId}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={form.name} htmlFor={`${formId}-name`} error={errors.name}>
          <input
            id={`${formId}-name`}
            name="name"
            type="text"
            required
            placeholder={form.namePlaceholder}
            className={inputClasses}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>

        <Field label={form.email} htmlFor={`${formId}-email`} error={errors.email}>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            required
            placeholder={form.emailPlaceholder}
            className={inputClasses}
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
      </div>

      <Field label={form.company} htmlFor={`${formId}-company`}>
        <input
          id={`${formId}-company`}
          name="company"
          type="text"
          placeholder={form.companyPlaceholder}
          className={inputClasses}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={form.projectType} htmlFor={`${formId}-projectType`} error={errors.projectType}>
          <select
            id={`${formId}-projectType`}
            name="projectType"
            required
            defaultValue=""
            className={cn(inputClasses, "appearance-none")}
            aria-invalid={Boolean(errors.projectType)}
          >
            <option value="" disabled>
              —
            </option>
            {form.projectTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label={form.budget} htmlFor={`${formId}-budget`} error={errors.budget}>
          <select
            id={`${formId}-budget`}
            name="budget"
            required
            defaultValue=""
            className={cn(inputClasses, "appearance-none")}
            aria-invalid={Boolean(errors.budget)}
          >
            <option value="" disabled>
              —
            </option>
            {form.budgetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={form.message} htmlFor={`${formId}-message`} error={errors.message}>
        <textarea
          id={`${formId}-message`}
          name="message"
          required
          rows={5}
          placeholder={form.messagePlaceholder}
          className={cn(inputClasses, "resize-none")}
          aria-invalid={Boolean(errors.message)}
        />
      </Field>

      {status === "error" && (
        <div className="flex items-start gap-2.5 rounded-md border border-error/40 bg-error/10 px-4 py-3 text-sm text-fg">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          <div>
            <p className="font-medium">{form.errorTitle}</p>
            <p className="mt-0.5 text-fg-muted">{form.errorBody}</p>
          </div>
        </div>
      )}

      <Button type="submit" size="lg" disabled={status === "submitting"} className="w-full sm:w-auto">
        {status === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {form.submitting}
          </>
        ) : status === "error" ? (
          form.retry
        ) : (
          form.submit
        )}
      </Button>
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
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}
