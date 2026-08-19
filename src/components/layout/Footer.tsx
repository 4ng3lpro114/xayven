import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { NAV_ITEMS } from "@/lib/constants";
import { CONTACT_EMAIL } from "@/lib/constants";
import { locales, localeNames, localizePath, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { CommercialMarketSelector } from "@/components/pricing/CommercialMarketSelector";
import type { MarketDetectionState } from "@/lib/pricing/commercialContext";

interface FooterProps {
  locale: Locale;
  dict: Dictionary;
  /** Commercial Market Selector (approved 2026-08-18) — resolved once in
   *  [locale]/layout.tsx (resolveCommercialMarket()/listPricingMarkets(),
   *  both untouched by this feature) and threaded down here so Footer
   *  stays a plain Server Component; CommercialMarketSelector itself
   *  decides (client-side, via usePathname()) whether to render at all
   *  on portal/auth routes. */
  markets: readonly { code: string; currency: string }[];
  currentMarketCode: string;
  /** XAYVEN CORE Phase 3.1 — replaces the old `isManual: boolean`, which
   *  collapsed "detected via real geolocation" and "geolocation failed,
   *  fell to OTHER" into the same `false`. See
   *  toMarketDetectionState() (commercialContext.ts). */
  detectionState: MarketDetectionState;
}

export function Footer({ locale, dict, markets, currentMarketCode, detectionState }: FooterProps) {
  const year = new Date().getFullYear();
  const currentPath = `/${locale}`;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-[88rem] px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-fg-muted">{dict.footer.tagline}</p>
          </div>

          <div>
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">
              {dict.footer.navHeading}
            </h2>
            <ul className="mt-4 space-y-3">
              {NAV_ITEMS.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.key === "home" ? `/${locale}` : `/${locale}${item.href}`}
                    className="text-sm text-fg-muted transition-colors hover:text-fg"
                  >
                    {dict.nav[item.key]}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`/${locale}/contact`}
                  className="text-sm text-fg-muted transition-colors hover:text-fg"
                >
                  {dict.nav.contact}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">
              {dict.footer.contactHeading}
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-sm text-fg-muted transition-colors hover:text-fg"
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">
              {dict.footer.languageHeading}
            </h2>
            <ul className="mt-4 space-y-3">
              {locales.map((l) => (
                <li key={l}>
                  <Link
                    href={localizePath(currentPath, l)}
                    className="text-sm text-fg-muted transition-colors hover:text-fg"
                    aria-current={l === locale ? "true" : undefined}
                  >
                    {localeNames[l]}
                  </Link>
                </li>
              ))}
            </ul>

            <h2 className="mt-8 font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">
              {dict.pricing.marketLabel}
            </h2>
            <div className="mt-4">
              <CommercialMarketSelector
                markets={markets}
                currentMarketCode={currentMarketCode}
                detectionState={detectionState}
                marketNames={dict.pricing.marketNames}
                marketDetails={dict.pricing.marketDetails}
                label={dict.pricing.marketLabel}
                explanation={dict.pricing.marketExplanation}
                automaticLabel={dict.pricing.marketAutomaticLabel}
                detectedLabel={dict.pricing.marketDetectedLabel}
                manualLabel={dict.pricing.marketManualLabel}
                fallbackLabel={dict.pricing.marketFallbackLabel}
                fallbackCountryLabel={dict.pricing.marketFallbackCountryLabel}
                activeLabel={dict.pricing.marketActiveLabel}
              />
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-8 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-2">
            <span>
              © {year} XAYVEN. {dict.footer.rights}
            </span>
            <Link href={`/${locale}/privacy`} className="underline transition-colors hover:text-fg-muted">
              {dict.privacy.eyebrow}
            </Link>
          </p>
          <p>{dict.footer.builtWith}</p>
        </div>
      </div>
    </footer>
  );
}
