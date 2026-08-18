import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ServiceIndexCard } from "@/components/services/ServiceIndexCard";
import { Button } from "@/components/ui/Button";
import { listServices } from "@/lib/db/servicesStore";
import { resolveServiceOfficialPriceSummary } from "@/lib/services/officialPricing";
import { formatServicePriceLabel, applyDisplayCurrency } from "@/lib/services/pricingSummary";
import { resolveCommercialMarket, resolveDisplayCurrency } from "@/lib/pricing/commercialContext";
import { getServiceIcon } from "@/lib/services/icons";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

/**
 * Homepage teaser — Services Phase 2: reuses the exact same source
 * (servicesStore.ts) and the exact same card (ServiceIndexCard) as
 * /services itself, instead of a second, drifting copy of the same 5
 * services. Only `dict.services.{eyebrow,heading,description,ctaLabel,
 * viewService,priceFrom,priceQuote}` — generic UI copy — still come from
 * the dictionary.
 *
 * Closure Audit follow-up (Home ↔ /services pricing unification) — this
 * used to call resolveServicePriceSummary() (pricingSummary.ts's OLD
 * sync function, base COP price straight off pricing_catalog, never
 * market-aware) — a visitor in a market other than the default could see
 * a different number here than on /services for the exact same package.
 * Now resolves the commercial market and display currency exactly once
 * per request (resolveCommercialMarket()/resolveDisplayCurrency()) — the
 * same calls /services/page.tsx makes — and reuses the SAME market-aware
 * resolver (resolveServiceOfficialPriceSummary(), which itself calls
 * resolveOfficialPrice() — never a second pricing computation) plus the
 * same applyDisplayCurrency() step. No selector rendered here (this is a
 * teaser section, not the commercial catalog page) — displayCurrency
 * still comes from whatever cookie the visitor already set on /services
 * or a service detail page; a visitor who never set one simply sees the
 * resolved market's own currency, same default /services would show.
 */
export async function Services({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [services, { market }] = await Promise.all([
    listServices({ publishedOnly: true }),
    resolveCommercialMarket(),
  ]);
  const { currency: displayCurrency } = await resolveDisplayCurrency(market);

  return (
    <Section divider>
      <Container>
        <SectionHeader
          eyebrow={dict.services.eyebrow}
          heading={dict.services.heading}
          description={dict.services.description}
          action={
            <Button href={`/${locale}/services`} variant="secondary" withArrow>
              {dict.services.ctaLabel}
            </Button>
          }
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {await Promise.all(
            services.map(async (service, i) => {
              const content = service.content[locale];
              const officialSummary = await resolveServiceOfficialPriceSummary(service.relatedPackageSlugs, market.code);
              const priceSummary = await applyDisplayCurrency(officialSummary, displayCurrency);
              const priceLabel = formatServicePriceLabel(priceSummary, dict.services);
              return (
                <ServiceIndexCard
                  key={service.slug}
                  href={`/${locale}/services/${service.slug}`}
                  icon={getServiceIcon(service.slug)}
                  heading={content.heading}
                  tagline={content.tagline}
                  priceLabel={priceLabel}
                  viewLabel={dict.services.viewService}
                  delay={0.05 * i}
                />
              );
            })
          )}
        </div>
      </Container>
    </Section>
  );
}
