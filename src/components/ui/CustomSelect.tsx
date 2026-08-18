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
 * `options` is a flat `string[]` where the value IS the label — same shape
 * every i18n options array already has (`dict.contact.form.
 * projectTypeOptions`, `budgetOptions`, `dict.maintenance.form.
 * needOptions`, `priorityOptions`) — never a separate {value,label} shape,
 * so no caller has to restructure its dictionary data to use this.
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
export interface CustomSelectProps {
  id: string;
  name: string;
  options: readonly string[];
  /** Shown when nothing is selected — reuses the exact "—" placeholder
   *  every native select in this codebase already used as its disabled
   *  first `<option>`, never a new hardcoded string. */
  placeholder: string;
  required?: boolean;
  defaultValue?: string;
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
  "aria-invalid": ariaInvalid,
  className,
}: CustomSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();
  const reduceMotion = useReducedMotion();

  const selectedIndex = options.indexOf(value);

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
    if (activeIndex >= 0 && activeIndex < options.length) {
      setValue(options[activeIndex]);
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
        else setActiveIndex((i) => Math.min(i < 0 ? 0 : i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openAt(selectedIndex >= 0 ? selectedIndex : options.length - 1);
        else setActiveIndex((i) => Math.max(i < 0 ? options.length - 1 : i - 1, 0));
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
       *  pero es lo que FormData(form) realmente lee. */}
      <input type="hidden" name={name} value={value} required={required} />

      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={ariaInvalid}
        aria-activedescendant={open && activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-left text-sm transition-colors focus:outline-none",
          open ? "border-accent-400" : "focus:border-accent-400",
          value ? "text-fg" : "text-fg-subtle",
          className
        )}
      >
        <span className="truncate">{value || placeholder}</span>
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
            {options.map((option, index) => {
              const selected = option === value;
              return (
                <li
                  key={option}
                  id={`${optionIdPrefix}-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    setValue(option);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors",
                    index === activeIndex ? "bg-accent-400/10 text-fg" : "text-fg-muted hover:bg-accent-400/10 hover:text-fg"
                  )}
                >
                  <span className="truncate">{option}</span>
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
