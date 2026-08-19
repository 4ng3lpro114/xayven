"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Globe2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Portal/Auth exclusion (approved 2026-08-18): a client already viewing a
 * fixed, already-invoiced amount (portal/payment pages) or managing their
 * account must never see a control that could be misread as "this changes
 * what I'm being charged" — Commercial Market only ever affects Pricing
 * Core's public/marketing prices, never a locked invoice. Checked here
 * (via usePathname(), same primitive Header.tsx already uses) rather than
 * conditionally rendering from the server layout, since layouts have no
 * built-in access to the current pathname — this keeps Footer.tsx a
 * plain Server Component and the routing knowledge in the one place that
 * actually needs it.
 */
const EXCLUDED_ROUTE_SEGMENTS = ["portal", "login", "register", "account"];

function isExcludedRoute(pathname: string): boolean {
  // pathname arrives as "/es/portal/abc" or "/en/login" — the segment
  // right after the locale prefix is what decides this.
  const segments = pathname.split("/").filter(Boolean);
  const afterLocale = segments[1];
  return afterLocale !== undefined && EXCLUDED_ROUTE_SEGMENTS.includes(afterLocale);
}

/**
 * Commercial Market Selector — manual FALLBACK/OVERRIDE for
 * `resolveCommercialMarket()`'s geo-detection tier, and (XAYVEN CORE
 * Phase 3.1) the one place a visitor can SEE and correct which of the
 * three states (manual / detected / fallback) they're currently in — see
 * `MarketDetectionState` (commercialContext.ts). Same cookie/session
 * pattern as before: a client component that writes the cookie directly
 * via `document.cookie`, hardcoding the literal cookie name rather than
 * importing it (`commercialContext.ts` is `server-only`).
 *
 * NEVER touches `xayven_display_currency` — this selector's only job is
 * to change WHICH commercial price is official (Commercial Market);
 * DisplayCurrencySelector's only job is how that price is presented.
 *
 * Phase 3.1 — what changed vs. the original (2026-08-18) version:
 *   - `isManual: boolean` → `detectionState: "manual" | "detected" |
 *     "fallback"`. The old boolean collapsed a REAL geo-detection hit and
 *     a FAILED detection (silently landing on 'OTHER') into the exact
 *     same "Automatic" label — which is precisely how a visitor in the US
 *     ended up reading "COP" as "it thinks I'm in Colombia" (Phase 3.0
 *     audit). Now all three states render distinctly, and 'fallback'
 *     NEVER borrows Colombia's name/flag — it's presented as its own
 *     honest "we don't know" state with an explicit call to action.
 *   - The closed trigger and each dropdown row now show the market's full
 *     currency name + symbol (via `marketDetails`), not just a bare
 *     currency code — same visual/interaction language as CustomSelect.tsx
 *     (motion-animated listbox, Check for the selected row, roving
 *     `aria-activedescendant` keyboard model) instead of the plain
 *     click-to-toggle list this component used before.
 *
 * Selecting "Automatic" simply expires the `xayven_market` cookie,
 * letting resolveCommercialMarket()'s existing priority chain
 * (cookie → geo detection → 'OTHER') run again from its detection tier —
 * this is the one, always-available way back out of a stale manual
 * choice, exactly what "no queremos que el usuario quede atrapado" means
 * in practice.
 */
interface CommercialMarketSelectorProps {
  /** Active markets only (listPricingMarkets({activeOnly:true})) — never
   *  a hardcoded list; a market that gets deactivated in Admin simply
   *  stops appearing here on the next render, same as everywhere else
   *  this store is consumed. */
  markets: readonly { code: string; currency: string }[];
  currentMarketCode: string;
  /** Whether the current market came from an explicit cookie, a real geo
   *  hit, or the 'OTHER' safety net — see `toMarketDetectionState()`
   *  (commercialContext.ts). Drives which of the three states below
   *  renders, both in the closed trigger and (implicitly, via the active
   *  row) in the open panel. */
  detectionState: "manual" | "detected" | "fallback";
  /** Localized market names keyed by code (dict.pricing.marketNames) —
   *  never `pricing_markets.name` directly, which is an unlocalized
   *  admin-facing string. A code with no entry falls back to the raw
   *  code, never hides the market or breaks the selector. */
  marketNames: Record<string, string>;
  /** Localized currency name + symbol per market (dict.pricing.marketDetails).
   *  `currencyName: null` for 'OTHER' is deliberate — its row never claims
   *  a specific currency identity the way Colombia/US/EU's rows do. */
  marketDetails: Record<string, { currencyName: string | null; symbol: string }>;
  label: string;
  explanation: string;
  automaticLabel: string;
  detectedLabel: string;
  manualLabel: string;
  fallbackLabel: string;
  /** Subtitle used only for 'OTHER's dropdown row (e.g. "Otros países"),
   *  deliberately distinct wording from `marketNames.OTHER` (e.g. "Otros
   *  mercados") per the approved design. */
  fallbackCountryLabel: string;
  activeLabel: string;
}

const MARKET_FLAGS: Record<string, string> = { CO: "🇨🇴", US: "🇺🇸", EU: "🇪🇺", OTHER: "🌎" };
const DEFAULT_FLAG = "🌐";

export function CommercialMarketSelector({
  markets,
  currentMarketCode,
  detectionState,
  marketNames,
  marketDetails,
  label,
  explanation,
  automaticLabel,
  detectedLabel,
  manualLabel,
  fallbackLabel,
  fallbackCountryLabel,
  activeLabel,
}: CommercialMarketSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const optionIdPrefix = useId();
  const reduceMotion = useReducedMotion();

  // Hook order stays stable (all hooks above run unconditionally) — this
  // is the only conditional return in the component, and it happens
  // after every hook has already been called.
  const excluded = isExcludedRoute(pathname ?? "");

  // "Automatic" is a real, selectable row (index 0) alongside the real
  // markets — this is what lets keyboard navigation reach it the same
  // way it reaches every other option, matching CustomSelect's model.
  const rowCount = markets.length + 1;
  const currentIndex = detectionState === "manual" ? markets.findIndex((m) => m.code === currentMarketCode) + 1 : 0;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (excluded) return null;

  function openAt(index: number) {
    setOpen(true);
    setActiveIndex(index);
  }

  function selectAutomatic() {
    document.cookie = "xayven_market=;path=/;max-age=0";
    setOpen(false);
    triggerRef.current?.focus();
    router.refresh();
  }

  function selectMarket(code: string) {
    document.cookie = `xayven_market=${code};path=/;max-age=31536000`;
    setOpen(false);
    triggerRef.current?.focus();
    router.refresh();
  }

  function commitActive() {
    if (activeIndex === 0) selectAutomatic();
    else if (activeIndex > 0 && activeIndex <= markets.length) selectMarket(markets[activeIndex - 1]!.code);
  }

  // Same "select-only combobox" roving-focus model as CustomSelect.tsx —
  // DOM focus never leaves the trigger; arrows move `aria-activedescendant`.
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openAt(currentIndex);
        else setActiveIndex((i) => Math.min(i < 0 ? 0 : i + 1, rowCount - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openAt(currentIndex);
        else setActiveIndex((i) => Math.max(i < 0 ? rowCount - 1 : i - 1, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) openAt(currentIndex);
        else commitActive();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      default:
        break;
    }
  }

  const currentDetails = marketDetails[currentMarketCode];
  const currentCurrency = markets.find((m) => m.code === currentMarketCode)?.currency;
  const isFallback = detectionState === "fallback";

  const closedFlag = MARKET_FLAGS[currentMarketCode] ?? DEFAULT_FLAG;
  const closedPrimary =
    !isFallback && currentDetails?.currencyName && currentCurrency
      ? `${currentCurrency} — ${currentDetails.currencyName}`
      : (marketNames[currentMarketCode] ?? currentMarketCode);
  const closedSubtitle = isFallback ? fallbackLabel : detectionState === "manual" ? manualLabel : detectedLabel;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-activedescendant={open && activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(currentIndex))}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex min-h-11 w-full max-w-xs items-center gap-2.5 rounded-md border bg-bg-elevated px-3 py-2 text-left transition-colors focus:outline-none",
          open ? "border-accent-400" : "border-border-strong hover:border-border-accent focus:border-accent-400"
        )}
      >
        <span className="text-lg leading-none" aria-hidden="true">
          {closedFlag}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{closedPrimary}</span>
          <span className="block truncate text-xs text-fg-subtle">{closedSubtitle}</span>
        </span>
        {!isFallback && (
          <span className="shrink-0 rounded-pill border border-accent-400/40 bg-accent-400/10 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-accent-300">
            {activeLabel}
          </span>
        )}
        <ChevronDown
          className={cn("size-4 shrink-0 text-fg-subtle transition-transform duration-150", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="listbox"
            aria-label={label}
            initial={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-full left-0 z-20 mb-2 w-[19rem] max-w-[calc(100vw-2.5rem)] rounded-md border border-border-strong bg-bg-elevated p-2 shadow-soft sm:left-auto sm:right-0"
          >
            <p className="px-2 pb-2 pt-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-subtle">
              {label}
            </p>

            <ul role="none" className="flex flex-col gap-0.5">
              <li role="none">
                <button
                  type="button"
                  id={`${optionIdPrefix}-0`}
                  role="option"
                  aria-selected={detectionState !== "manual"}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={selectAutomatic}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none",
                    activeIndex === 0 ? "bg-accent-400/10 text-fg" : "text-fg-muted hover:bg-bg-raised hover:text-fg"
                  )}
                >
                  <Globe2 className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{automaticLabel}</span>
                  {detectionState !== "manual" && <Check className="size-3.5 shrink-0 text-accent-400" aria-hidden="true" />}
                </button>
              </li>

              <li role="none" className="my-1 border-t border-border" />

              {markets.map((market, i) => {
                const index = i + 1;
                const active = detectionState === "manual" && market.code === currentMarketCode;
                const details = marketDetails[market.code];
                const isOther = market.code === "OTHER";
                const primary = details?.currencyName
                  ? `${market.currency} — ${details.currencyName}`
                  : (marketNames[market.code] ?? market.code);
                const subtitle = isOther
                  ? `${fallbackCountryLabel} (${market.code})`
                  : `${marketNames[market.code] ?? market.code} (${market.code})`;

                return (
                  <li key={market.code} role="none">
                    <button
                      type="button"
                      id={`${optionIdPrefix}-${index}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectMarket(market.code)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus:outline-none",
                        index === activeIndex ? "bg-accent-400/10 text-fg" : "text-fg-muted hover:bg-bg-raised hover:text-fg"
                      )}
                    >
                      <span className="text-lg leading-none" aria-hidden="true">
                        {MARKET_FLAGS[market.code] ?? DEFAULT_FLAG}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{primary}</span>
                        <span className="block truncate text-xs text-fg-subtle">{subtitle}</span>
                      </span>
                      {active ? (
                        <Check className="size-3.5 shrink-0 text-accent-400" aria-hidden="true" />
                      ) : (
                        details?.symbol && (
                          <span className="shrink-0 font-mono text-sm text-fg-subtle">{details.symbol}</span>
                        )
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-2 border-t border-border px-2 pt-2 text-xs text-fg-subtle">{explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
