import type { ReactNode } from "react";

/**
 * Admin UI Polish — groups related form fields under a heading, replacing
 * the flat "label / input / label / input" run every admin form used to
 * be. Every form (MarketForm, PackageForm, ServiceForm) already built its
 * OWN local `Field` helper with slightly different markup — this file is
 * now the one shared version, and AdminFormSection is the new grouping
 * layer around it. Purely structural: field names, validation, submit
 * logic in each form are untouched.
 */
export function AdminFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated/40 p-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{title}</h3>
      {description && <p className="mt-1 text-xs text-fg-subtle">{description}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

/** Shared field wrapper — same shape every form's local `Field` helper
 *  already rendered (label + control), now written once. */
export function AdminField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Shared checkbox row — same "checkbox + inline label" shape repeated in
 *  every form (isActive, conversionAllowed, ...). */
export function AdminCheckboxField({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-fg">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 rounded border-border-strong" />
      {children}
    </label>
  );
}

export const adminInputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none disabled:opacity-50";
