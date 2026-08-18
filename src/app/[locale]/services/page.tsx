import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ServiceIndexCard } from "@/components/services/ServiceIndexCard";
import { OpenChatButton } from "@/components/ai/OpenChatButton";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/constants";
import { listServices } from "@/lib/db/servicesStore";
import { listCurrencyConfigs } from "@/lib/db/currencyConfigStore";
import { resolveServiceOfficialPriceSummary } from "@/lib/services/officialPricing";
import { formatServicePriceLabel, applyDisplayCurrency } from "@/lib/services/pricingSummary";
import { resolveCommercialMarket, resolveDisplayCurrency } from "@/lib/pricing/commercialContext";
import { getServiceIcon } from "@/lib/services/icons";
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb";
import { DisplayCurrencySelector } from "@/components/pricing/DisplayCurrencySelector";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/services",
    title: dict.pages.services.title,
    description: dict.pages.services.description,
  });
}

/**
 * Services Phase 2 — the true commercial catalog entry point.
 *
 * Source of truth from this page on: servicesStore.ts (content) +
 * pricingCatalogStore.ts (prices). The old dict.services.items/
 * fieldLabels legacy array was removed entirely in Phase 10 (QA) once
 * Phase 6 migrated XAYVEN AI's knowledge off it too, leaving it with zero
 * consumers. Only `dict.services.{eyebrow,heading,description,
 * viewService,priceFrom,priceQuote,aiHelp}` — generic UI copy, not
 * per-service editorial content — are still used from the dictionary.
 *
 * SEO/AEO/GEO Phase 8: breadcrumb (UI + BreadcrumbList schema) added.
 *
 * International Pricing Phase D: price labels now resolve via
 * resolveServiceOfficialPriceSummary() — market-aware, backed by
 * resolveOfficialPrice(). The commercial market is resolved ONCE per
 * request (resolveCommercialMarket()), then reused for every card —
 * never re-resolved per service. This opts the route into dynamic
 * rendering (cookies()/headers() are request-time APIs), a deliberate
 * trade-off documented in the Phase D checkpoint.
 *
 * International Pricing Phase D — Display Currency: `displayCurrency` is
 * resolved ONCE (resolveDisplayCurrency(market)), same "resolve once,
 * reuse per card" discipline as `market` itself, and applied via
 * `applyDisplayCurrency()` — a second, independent step AFTER the
 * official (market-determined) summary, never an input to it. The
 * selector only ever lists currencies with a real `currency_config` row
 * (listCurrencyConfigs()) — never a hardcoded/future currency.
 */
export default async function ServicesPage({
  params,
}: PageProps<"/[locale]/services">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  const [services, { market }, currencyConfigs] = await Promise.all([
    listServices({ publishedOnly: true }),
    resolveCommercialMarket(),
    listCurrencyConfigs(),
  ]);
  const { currency: displayCurrency } = await resolveDisplayCurrency(market);
  const configuredCurrencies = currencyConfigs.map((c) => c.currency);

  const breadcrumbItems = [
    { label: dict.nav.home, href: `/${locale}` },
    { label: dict.services.eyebrow },
  ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: dict.nav.home, url: `${SITE_URL}/${locale}` },
    { name: dict.services.eyebrow, url: `${SITE_URL}/${locale}/services` },
  ]);

  return (
    <>
      <PageIntro
        eyebrow={dict.services.eyebrow}
        heading={dict.services.heading}
        description={dict.services.description}
        breadcrumb={<Breadcrumb items={breadcrumbItems} />}
      />

      <Section spacing="tight">
        <Container>
          <DisplayCurrencySelector
            currencies={configuredCurrencies}
            current={displayCurrency}
            label={dict.pricing.displayCurrencyLabel}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

      <Section divider spacing="tight">
        <Container size="narrow">
          <SectionHeader
            eyebrow={dict.services.eyebrow}
            heading={dict.services.aiHelp.heading}
            description={dict.services.aiHelp.description}
            action={<OpenChatButton>{dict.services.aiHelp.cta}</OpenChatButton>}
          />
        </Container>
      </Section>

      <FinalCTA dict={dict} locale={locale} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
    </>
  );
}
