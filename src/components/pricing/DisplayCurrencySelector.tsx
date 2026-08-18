"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * International Pricing Phase D — Display Currency. Same cookie/session
 * pattern as LanguageSwitcher.tsx (src/components/layout/LanguageSwitcher.
 * tsx) — a client component that writes the cookie directly via
 * `document.cookie`, matching that component's own convention of not
 * importing a shared constant for the cookie name (LanguageSwitcher
 * hardcodes `NEXT_LOCALE` the same way). This literal MUST stay in sync
 * with `DISPLAY_CURRENCY_COOKIE` in src/lib/pricing/commercialContext.ts —
 * that file is `server-only` and can never be imported from a Client
 * Component, so the two can't share one constant.
 *
 * Unlike the locale switcher (which navigates to a different localized
 * URL), display currency never changes the URL — it only changes how an
 * already-resolved price is presented on the SAME page — so this uses
 * `router.refresh()` instead of a `<Link>`, re-running the Server
 * Component tree (and therefore `resolveDisplayCurrency()`) against the
 * new cookie value without a full navigation/scroll reset.
 *
 * `currencies` must only ever be the real, currently-configured set (see
 * `listCurrencyConfigs()`, currencyConfigStore.ts) — never a hardcoded
 * list of currencies XAYVEN might support "eventually". A market/currency
 * that has no `currency_config` row simply can't be selected here.
 *
 * This selector NEVER touches `xayven_market` — no code path here reads
 * or writes the commercial-market cookie. Changing display currency can
 * never change which market's price is official, structurally, not just
 * by convention.
 */
interface DisplayCurrencySelectorProps {
  currencies: readonly string[];
  current: string;
  label: string;
}

export function DisplayCurrencySelector({ currencies, current, label }: DisplayCurrencySelectorProps) {
  const router = useRouter();

  // Nothing to switch between — a single configured currency (or none)
  // means the selector would be pure noise, never rendered.
  if (currencies.length < 2) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs" role="group" aria-label={label}>
      <span className="text-fg-subtle">{label}</span>
      {currencies.map((currency) => (
        <button
          key={currency}
          type="button"
          aria-current={currency === current ? "true" : undefined}
          onClick={() => {
            document.cookie = `xayven_display_currency=${currency};path=/;max-age=31536000`;
            router.refresh();
          }}
          className={cn(
            "rounded-full border px-2.5 py-1 font-mono uppercase tracking-wide transition-colors",
            currency === current
              ? "border-accent-400 bg-accent-400/10 text-fg"
              : "border-border text-fg-subtle hover:text-fg-muted"
          )}
        >
          {currency}
        </button>
      ))}
    </div>
  );
}
