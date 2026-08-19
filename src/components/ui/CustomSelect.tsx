"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom Dropdown (approved 2026-08-18) — visual replacement for native
 * `<select>`/`<option>` in public-facing forms (ContactForm, MaintenanceForm
 * today), styled to match XAYVEN's existing input language instead of the
 * browser's own select UI. Purely presentational: the value/name/required
 * contract a form's `handleSubmit()` already relies on via
 * `new FormData(event.currentTarget)` is preserved exactly — this renders
 * a real (visually hidden) `<input type="hidden" name={name} value={value}>`
 * that mirrors the visible selection, so no form/submit/validation logic
 * anywhere has to change to adopt this.
 *
 * `options` accepts EITHER a flat `string[]` where the value IS the label
 * — the original shape, every i18n options array already has it
 * (`dict.contact.form.projectTypeOptions`, `budgetOptions`,
 * `dict.maintenance.form.needOptions`, `priorityOptions`) — OR an array of
 * `{ value, label }` pairs, added in XAYVEN CORE Phase 3.5 so this same
 * component can be reused in Admin, where the submitted value (e.g.
 * "QUOTE_ONLY", "percentage") is a stable code distinct from its
 * human-readable label ("Solo cotización...", "Porcentaje") — Admin's
 * `Object.entries(LABELS)` maps normalize to exactly this shape. Both
 * forms are normalized internally to `{value,label}[]`; a caller passing
 * flat strings behaves byte-for-byte as before (value === label).
 *
 * ARIA: WAI-ARIA "select-only combobox" pattern — `role="combobox"` +
 * `aria-haspopup="listbox"` + `aria-expanded` + `aria-controls` on the
 * trigger button, `role="listbox"`/`role="option"`/`aria-selected` on the
 * panel, `aria-activedescendant` tracking the keyboard-highlighted option
 * while DOM focus stays on the trigger (never moves into the listbox) —
 * ArrowUp/ArrowDown/Enter/Space/Escape/Tab all handled on the trigger
 * itself, matching how a screen reader expects a native `<select>` to
 * behave.
 */
export type CustomSelectOption = string | { value: string; label: string };

export interface CustomSelectProps {
  id: string;
  name: string;
  options: readonly CustomSelectOption[];
  /** Shown when nothing is selected — reuses the exact "—" placeholder
   *  every native select in this codebase already used as its disabled
   *  first `<option>`, never a new hardcoded string. */
  placeholder: string;
  required?: boolean;
  defaultValue?: string;
  /** Phase 3.5 — mirrors a native `disabled` `<select>` (PackageForm's
   *  slug/category/billingInterval, only editable on create): the trigger
   *  becomes inert (native `disabled` on the `<button>`, so it never fires
   *  click/keydown — no extra guard logic needed) and the hidden input is
   *  also `disabled`, so it's excluded from `FormData` exactly like a
   *  disabled native `<select>` would be. Default false — every existing
   *  caller is unaffected. */
  disabled?: boolean;
  /** Phase 3.5 — optional, additive. Fires with the new value whenever a
   *  selection commits (click or keyboard), mirroring the `onChange`
   *  handler a few Admin forms already use to drive their own conditional
   *  UI (e.g. PromotionForm's discountType, PackageForm's category).
   *  Existing callers that omit it are unaffected — the value is always
   *  still written to the hidden input regardless. */
  onValueChange?: (value: string) => void;
  "aria-invalid"?: boolean;
  className?: string;
}

export function CustomSelect({
  id,
  name,
  options,
  placeholder,
  required,
  defaultValue = "",
  disabled = false,
  onValueChange,
  "aria-invalid": ariaInvalid,
  className,
}: CustomSelectProps) {
  const normalizedOptions = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();
  const reduceMotion = useReducedMotion();

  const selectedIndex = normalizedOptions.findIndex((o) => o.value === value);
  const selectedLabel = normalizedOptions.find((o) => o.value === value)?.label ?? value;

  // Cierra al hacer click fuera — mismo manejo que CommercialMarketSelector.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openAt(index: number) {
    setOpen(true);
    setActiveIndex(index);
  }

  function commitActive() {
    if (activeIndex >= 0 && activeIndex < normalizedOptions.length) {
      const next = normalizedOptions[activeIndex]!.value;
      setValue(next);
      onValueChange?.(next);
    }
    setOpen(false);
  }

  // Foco NUNCA sale del trigger — es el patrón "select-only combobox" de
  // WAI-ARIA: las flechas mueven `aria-activedescendant`, nunca el foco
  // real del DOM, exactamente como se navega un <select> nativo.
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openAt(selectedIndex >= 0 ? selectedIndex : 0);
        else setActiveIndex((i) => Math.min(i < 0 ? 0 : i + 1, normalizedOptions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openAt(selectedIndex >= 0 ? selectedIndex : normalizedOptions.length - 1);
        else setActiveIndex((i) => Math.max(i < 0 ? normalizedOptions.length - 1 : i - 1, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) openAt(selectedIndex >= 0 ? selectedIndex : 0);
        else commitActive();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        // Nunca preventDefault — el tabulado normal debe seguir su curso;
        // solo cerramos el panel para que no quede abierto sin foco.
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Backbone real de accesibilidad/envío del formulario — invisible,
       *  pero es lo que FormData(form) realmente lee. `disabled` la excluye
       *  de FormData exactamente igual que un <select disabled> nativo. */}
      <input type="hidden" name={name} value={value} required={required} disabled={disabled} />

      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={ariaInvalid}
        aria-activedescendant={open && activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-left text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          open ? "border-accent-400" : "focus:border-accent-400",
          value ? "text-fg" : "text-fg-subtle",
          className
        )}
      >
        <span className="truncate">{value ? selectedLabel : placeholder}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-fg-subtle transition-transform duration-150", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listboxId}
            role="listbox"
            aria-label={placeholder}
            initial={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 z-20 mt-1.5 max-h-64 overflow-auto rounded-md border border-border-strong bg-bg-elevated py-1.5 shadow-soft"
          >
            {normalizedOptions.map((option, index) => {
              const selected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${optionIdPrefix}-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    setValue(option.value);
                    onValueChange?.(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors",
                    index === activeIndex ? "bg-accent-400/10 text-fg" : "text-fg-muted hover:bg-accent-400/10 hover:text-fg"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {selected && <Check className="size-3.5 shrink-0 text-accent-400" aria-hidden="true" />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
