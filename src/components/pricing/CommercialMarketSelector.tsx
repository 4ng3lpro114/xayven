"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Globe2 } from "lucide-react";
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
 * Commercial Market Selector (approved 2026-08-18) — manual FALLBACK/
 * OVERRIDE for `resolveCommercialMarket()`'s geo-detection tier, needed
 * because XAYVEN's current hosting (Hostinger/hCDN) doesn't provide a
 * reliable geo-IP header for Node.js apps (see the Hostinger Geo-IP
 * Investigation) — without this, an international visitor silently falls
 * to the 'OTHER'/COP market with no way to correct it.
 *
 * Same cookie/session pattern as DisplayCurrencySelector.tsx and
 * LanguageSwitcher.tsx — a client component that writes the cookie
 * directly via `document.cookie`, hardcoding the literal cookie name
 * rather than importing it: `commercialContext.ts` (MARKET_COOKIE) is
 * `server-only` and can never be imported from a Client Component. This
 * literal MUST stay in sync with `MARKET_COOKIE` there.
 *
 * NEVER touches `xayven_display_currency` — this selector's only job is
 * to change WHICH commercial price is official (Commercial Market);
 * DisplayCurrencySelector's only job is how that price is presented
 * (Display Currency). Changing one must never write the other's cookie —
 * structurally, this file contains zero references to the display
 * currency cookie at all.
 *
 * `resolveCommercialMarket()`/`resolveDisplayCurrency()` themselves are
 * NEVER touched by this feature — this component is purely a new WRITER
 * of the cookie those functions already knew how to read (explicit
 * cookie → geo → 'OTHER', unchanged). Selecting "Automatic" simply
 * expires the cookie, letting that existing priority chain run again
 * from its geo tier.
 *
 * `isManual=false` (no explicit cookie today) always renders the closed
 * pill as "Automatic", regardless of which market `resolveCommercialMarket()`
 * actually resolved (even a real geo hit) — showing e.g. "Europe" here
 * would imply a confidence in geo-detection XAYVEN's current hosting
 * cannot back up (see the Hostinger Geo-IP Investigation: the header this
 * app reads for geo is not verified on Hostinger/hCDN). The open panel's
 * market list is informational/selectable, never a claim about which one
 * is "yours" unless you picked it.
 */
interface CommercialMarketSelectorProps {
  /** Active markets only (listPricingMarkets({activeOnly:true})) — never
   *  a hardcoded list; a market that gets deactivated in Admin simply
   *  stops appearing here on the next render, same as everywhere else
   *  this store is consumed. */
  markets: readonly { code: string; currency: string }[];
  /** The market `resolveCommercialMarket()` is ACTUALLY using right now
   *  — only meaningful for highlighting when `isManual` is true. */
  currentMarketCode: string;
  /** true only when the current market came from an explicit
   *  `xayven_market` cookie (source === "explicit_cookie") — false for
   *  both "geo_suggestion" and "default", i.e. every non-manual case is
   *  presented identically as "Automatic". */
  isManual: boolean;
  /** Localized market names keyed by code (dict.pricing.marketNames) —
   *  never `pricing_markets.name` directly, which is an unlocalized
   *  admin-facing string. A code with no entry falls back to the raw
   *  code, never hides the market or breaks the selector. */
  marketNames: Record<string, string>;
  label: string;
  explanation: string;
  automaticLabel: string;
}

const MARKET_FLAGS: Record<string, string> = { CO: "🇨🇴", US: "🇺🇸", EU: "🇪🇺", OTHER: "🌎" };
const DEFAULT_FLAG = "🌐";

export function CommercialMarketSelector({
  markets,
  currentMarketCode,
  isManual,
  marketNames,
  label,
  explanation,
  automaticLabel,
}: CommercialMarketSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Hook order stays stable (all hooks above run unconditionally) — this
  // is the only conditional return in the component, and it happens
  // after every hook has already been called.
  const excluded = isExcludedRoute(pathname ?? "");

  // Cierra al hacer click fuera o al presionar Escape — mismo manejo de
  // foco que cualquier disclosure accesible: Escape devuelve el foco al
  // botón que abrió el panel.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>("[data-market-trigger]")?.focus();
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

  const closedFlag = isManual ? (MARKET_FLAGS[currentMarketCode] ?? DEFAULT_FLAG) : MARKET_FLAGS.OTHER;
  const closedName = isManual ? (marketNames[currentMarketCode] ?? currentMarketCode) : automaticLabel;
  const closedCurrency = isManual ? markets.find((m) => m.code === currentMarketCode)?.currency : undefined;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-market-trigger
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg-muted transition-colors hover:border-border-accent hover:text-fg focus:border-accent-400 focus:outline-none"
      >
        <span aria-hidden="true">{closedFlag}</span>
        <span>
          {closedName}
          {closedCurrency ? ` · ${closedCurrency}` : ""}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-md border border-border-strong bg-bg-elevated p-3 shadow-soft sm:left-auto sm:right-0"
        >
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">{label}</p>

          <div className="mt-3 flex flex-col gap-1">
            <button
              type="button"
              aria-current={!isManual ? "true" : undefined}
              onClick={() => {
                document.cookie = "xayven_market=;path=/;max-age=0";
                setOpen(false);
                router.refresh();
              }}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                !isManual ? "bg-accent-400/10 text-fg" : "text-fg-muted hover:bg-bg-raised hover:text-fg"
              )}
            >
              <Globe2 className="size-4 shrink-0" aria-hidden="true" />
              {automaticLabel}
            </button>

            {markets.map((market) => {
              const active = isManual && market.code === currentMarketCode;
              return (
                <button
                  key={market.code}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    document.cookie = `xayven_market=${market.code};path=/;max-age=31536000`;
                    setOpen(false);
                    router.refresh();
                  }}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                    active ? "bg-accent-400/10 text-fg" : "text-fg-muted hover:bg-bg-raised hover:text-fg"
                  )}
                >
                  <span aria-hidden="true">{MARKET_FLAGS[market.code] ?? DEFAULT_FLAG}</span>
                  {marketNames[market.code] ?? market.code} · {market.currency}
                </button>
              );
            })}
          </div>

          <p className="mt-3 border-t border-border pt-3 text-xs text-fg-subtle">{explanation}</p>
        </div>
      )}
    </div>
  );
}
