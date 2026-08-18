import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Reveal } from "@/components/motion/Reveal";
import { FAQSection } from "@/components/sections/FAQSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { ServiceIndexCard } from "@/components/services/ServiceIndexCard";
import { ServiceAiCtaButton } from "@/components/services/ServiceAiCtaButton";
import { TrackView } from "@/components/analytics/TrackView";
import { TrackedCtaLink } from "@/components/analytics/TrackedCtaLink";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, locales, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { listServices, getServiceBySlug } from "@/lib/db/servicesStore";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { listCurrencyConfigs } from "@/lib/db/currencyConfigStore";
import { resolveServiceOfficialPriceSummary, resolveOfficialPricesBySlug } from "@/lib/services/officialPricing";
import { formatServicePriceLabel, applyDisplayCurrency } from "@/lib/services/pricingSummary";
import { withDisplayPrice } from "@/lib/pricing/displayPrice";
import { resolveCommercialMarket, resolveDisplayCurrency } from "@/lib/pricing/commercialContext";
import { getServiceIcon } from "@/lib/services/icons";
import { formatMoney } from "@/lib/payments/format";
import { DisplayCurrencySelector } from "@/components/pricing/DisplayCurrencySelector";
import type { PricingCatalogItem } from "@/lib/pricing/types";

export async function generateStaticParams() {
  const services = await listServices({ publishedOnly: true });
  return locales.flatMap((locale) => services.map((s) => ({ locale, slug: s.slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services/[slug]">): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);

  const service = await getServiceBySlug(slug);
  if (!service || !service.isPublished) {
    return buildMetadata({
      locale,
      path: "/services",
      title: dict.pages.services.title,
      description: dict.pages.services.description,
    });
  }

  const content = service.content[locale];
  return buildMetadata({
    locale,
    path: `/services/${service.slug}`,
    title: content.heading,
    description: content.tagline,
  });
}

/**
 * Services Phase 3 — the real service detail page. Content and pricing
 * come exclusively from servicesStore.ts / pricingCatalogStore.ts (never
 * hardcoded here). Structure follows the master prompt's editorial
 * sections (Hero → Definition → Problem → Solution → Includes →
 * ForWhom → UseCases → Pricing → Process → FAQ → Related), same
 * generateStaticParams/generateMetadata/notFound pattern as
 * work/[slug]/page.tsx.
 *
 * SEO/AEO/GEO Phase 8: breadcrumb (UI + BreadcrumbList schema, replacing
 * the old plain "back to services" link) and explicit internal links to
 * Maintenance/Diagnosis (master prompt §39) added.
 *
 * International Pricing Phase D: every visitor-facing price on this page
 * (hero label, per-package pricing cards, related-service cards) resolves
 * via the market-aware officialPricing.ts functions, backed by
 * resolveOfficialPrice(). `catalogItems` is still fetched and still feeds
 * the schema.org Offer JSON-LD block below — that structured-data price
 * deliberately stays the Pricing Core base (COP) price: search crawlers
 * have no commercial market/country context to resolve against, so
 * showing a market-specific number there would misrepresent the page's
 * canonical price to the one audience that can't see the actual UI. This
 * is a deliberate scope decision, not an oversight — see the Phase D
 * checkpoint.
 *
 * International Pricing Phase D — Display Currency: `displayCurrency` is
 * resolved ONCE (resolveDisplayCurrency(market)), same "resolve once,
 * reuse everywhere" discipline as `market` itself, and applied via
 * `applyDisplayCurrency()`/`withDisplayPrice()` — a second, independent
 * step AFTER each official (market-determined) price/summary, never an
 * input to how any of them is picked. The JSON-LD Offer block above stays
 * on the Pricing Core base (COP) price on purpose — display currency is a
 * visitor-facing presentation concern, not a fact a search crawler should
 * ever see substituted.
 */
export default async function ServiceDetailPage({
  params,
}: PageProps<"/[locale]/services/[slug]">) {
  const { locale: rawLocale, slug } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const service = await getServiceBySlug(slug);
  if (!service || !service.isPublished) notFound();

  const dict = await getDictionary(locale);
  const content = service.content[locale];
  const sd = dict.serviceDetail;

  const [allServices, catalogItems, { market }, currencyConfigs] = await Promise.all([
    listServices({ publishedOnly: true }),
    listPricingCatalogItems({ activeOnly: true }),
    resolveCommercialMarket(),
    listCurrencyConfigs(),
  ]);
  const { currency: displayCurrency } = await resolveDisplayCurrency(market);
  const configuredCurrencies = currencyConfigs.map((c) => c.currency);

  const relatedPackages = service.relatedPackageSlugs
    .map((pkgSlug) => catalogItems.find((item) => item.slug === pkgSlug))
    .filter((item): item is PricingCatalogItem => Boolean(item));

  const [heroOfficialSummary, relatedOfficialPricesRaw] = await Promise.all([
    resolveServiceOfficialPriceSummary(service.relatedPackageSlugs, market.code),
    resolveOfficialPricesBySlug(
      relatedPackages.map((p) => p.slug),
      market.code
    ),
  ]);
  const heroPriceSummary = await applyDisplayCurrency(heroOfficialSummary, displayCurrency);
  const heroPriceLabel = formatServicePriceLabel(heroPriceSummary, dict.services);

  const relatedOfficialPrices = new Map(
    await Promise.all(
      [...relatedOfficialPricesRaw.entries()].map(
        async ([pkgSlug, official]) => [pkgSlug, await withDisplayPrice(official, displayCurrency)] as const
      )
    )
  );

  const relatedServices = allServices.filter((s) => s.slug !== service.slug).slice(0, 3);

  const canonicalUrl = `${SITE_URL}/${locale}/services/${service.slug}`;

  const breadcrumbItems = [
    { label: dict.nav.home, href: `/${locale}` },
    { label: dict.services.eyebrow, href: `/${locale}/services` },
    { label: content.heading },
  ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: dict.nav.home, url: `${SITE_URL}/${locale}` },
    { name: dict.services.eyebrow, url: `${SITE_URL}/${locale}/services` },
    { name: content.heading, url: canonicalUrl },
  ]);

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: content.heading,
    description: content.definition,
    url: canonicalUrl,
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    ...(relatedPackages.length > 0
      ? {
          offers: relatedPackages.map((pkg) => ({
            "@type": "Offer",
            name: pkg.name,
            price: pkg.basePrice,
            priceCurrency: pkg.currency,
            url: canonicalUrl,
          })),
        }
      : {}),
  };

  const faqJsonLd =
    content.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: content.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <>
      <TrackView eventType="service_page_view" serviceSlug={service.slug} />

      {/* A. Hero */}
      <Section spacing="tight" className="pt-14 sm:pt-20">
        <Container size="narrow">
          <Reveal>
            <Breadcrumb items={breadcrumbItems} />

            <div className="mt-6">
              <Badge variant="eyebrow">{dict.services.eyebrow}</Badge>
            </div>
            <h1 className="mt-4 text-display-2 font-semibold tracking-tight text-fg">{content.heading}</h1>
            <p className="mt-5 max-w-xl text-lg text-fg-muted">{content.tagline}</p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <TrackedCtaLink
                href={`/${locale}/contact`}
                eventType="service_project_cta"
                serviceSlug={service.slug}
                size="lg"
                withArrow
              >
                {dict.nav.ctaPrimary}
              </TrackedCtaLink>
              <ServiceAiCtaButton
                slug={service.slug}
                message={
                  locale === "es"
                    ? `Quiero saber más sobre ${content.heading}.`
                    : `I'd like to know more about ${content.heading}.`
                }
                label={dict.services.aiHelp.cta}
              />
            </div>

            <p className="mt-6 font-mono text-xs uppercase tracking-[0.1em] text-fg-subtle">{heroPriceLabel}</p>
          </Reveal>
        </Container>
      </Section>

      {/* B. Definición */}
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-fg-subtle">{sd.definitionHeading}</h2>
            <p className="mt-3 max-w-2xl text-lg text-fg">{content.definition}</p>
          </Reveal>
        </Container>
      </Section>

      {/* C. El problema */}
      <Section divider spacing="tight">
        <Container size="narrow">
          <SectionHeader eyebrow={dict.services.eyebrow} heading={sd.problemHeading} description="" />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {content.problem.map((item, i) => (
              <Reveal key={item} delay={0.03 * i}>
                <li className="rounded-lg border border-border bg-bg-raised p-5 text-sm text-fg-muted">{item}</li>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* D. La solución XAYVEN */}
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-fg-subtle">{sd.solutionHeading}</h2>
            <p className="mt-3 max-w-2xl text-base text-fg-muted">{content.solution}</p>
          </Reveal>
        </Container>
      </Section>

      {/* E. Qué incluye */}
      <Section divider spacing="tight">
        <Container size="narrow">
          <SectionHeader eyebrow={dict.services.eyebrow} heading={sd.includesHeading} description="" />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {content.includes.map((item, i) => (
              <Reveal key={item} delay={0.03 * i}>
                <li className="flex items-start gap-2.5 text-sm text-fg-muted">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden="true" />
                  {item}
                </li>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* F. Para quién es */}
      <Section spacing="tight">
        <Container size="narrow">
          <SectionHeader eyebrow={dict.services.eyebrow} heading={sd.forWhomHeading} description="" />
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-fg">{sd.idealIfLabel}</h3>
              <ul className="mt-3 space-y-2">
                {content.forWhom.idealIf.map((item) => (
                  <li key={item} className="text-sm text-fg-muted">
                    — {item}
                  </li>
                ))}
              </ul>
            </div>
            {content.forWhom.notIdealIf.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-fg-subtle">{sd.notIdealIfLabel}</h3>
                <ul className="mt-3 space-y-2">
                  {content.forWhom.notIdealIf.map((item) => (
                    <li key={item} className="text-sm text-fg-subtle">
                      — {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Container>
      </Section>

      {/* G. Casos de uso */}
      {content.useCases.length > 0 && (
        <Section divider spacing="tight">
          <Container size="narrow">
            <SectionHeader
              eyebrow={dict.services.eyebrow}
              heading={sd.useCasesHeading}
              description=""
              action={
                <Button href={`/${locale}/work`} variant="secondary" withArrow>
                  {sd.workLinkLabel}
                </Button>
              }
            />
            <ul className="mt-8 space-y-4">
              {content.useCases.map((item, i) => (
                <Reveal key={item} delay={0.03 * i}>
                  <li className="max-w-2xl text-sm text-fg-muted">{item}</li>
                </Reveal>
              ))}
            </ul>
          </Container>
        </Section>
      )}

      {/* I. Precios */}
      <Section spacing="tight">
        <Container size="narrow">
          <SectionHeader eyebrow={dict.services.eyebrow} heading={sd.pricingHeading} description="" />
          <div className="mt-4">
            <DisplayCurrencySelector
              currencies={configuredCurrencies}
              current={displayCurrency}
              label={dict.pricing.displayCurrencyLabel}
            />
          </div>
          {relatedPackages.length > 0 ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPackages.map((pkg, i) => {
                const official = relatedOfficialPrices.get(pkg.slug);
                const priceText =
                  official && official.amount !== null
                    ? `${official.priceType === "FROM" ? `${dict.services.priceFrom} ` : ""}${formatMoney(official.amount, official.currency)}`
                    : dict.services.priceQuote;
                return (
                <Reveal key={pkg.slug} delay={0.05 * i}>
                  <div className="flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6">
                    <TrackView eventType="pricing_package_view" packageSlug={pkg.slug} />
                    <h3 className="text-base font-semibold text-fg">{pkg.name}</h3>
                    <p className="mt-2 text-lg font-semibold text-accent-300">{priceText}</p>
                    <TrackedCtaLink
                      href={`/${locale}/contact?plan=${pkg.slug}`}
                      eventType="pricing_package_cta"
                      packageSlug={pkg.slug}
                      variant="secondary"
                      className="mt-5"
                      withArrow
                    >
                      {sd.choosePackageLabel}
                    </TrackedCtaLink>
                  </div>
                </Reveal>
                );
              })}
            </div>
          ) : (
            <Reveal className="mt-8">
              <p className="max-w-xl text-sm text-fg-muted">{sd.priceQuoteExplanation}</p>
              <div className="mt-5">
                <Button href={`/${locale}/contact`} variant="secondary" withArrow>
                  {dict.nav.ctaPrimary}
                </Button>
              </div>
            </Reveal>
          )}
        </Container>
      </Section>

      {/* H. Proceso */}
      <Section divider spacing="tight">
        <Container size="narrow">
          <SectionHeader
            eyebrow={dict.services.eyebrow}
            heading={sd.processHeading}
            description={sd.processDescription}
            action={
              <Button href={`/${locale}/process`} variant="secondary" withArrow>
                {sd.processLinkLabel}
              </Button>
            }
          />
        </Container>
      </Section>

      {/* J. FAQ */}
      {content.faq.length > 0 && (
        <FAQSection
          id={`faq-${service.slug}`}
          eyebrow={dict.services.eyebrow}
          heading={sd.faqHeading}
          description={sd.faqDescription}
          items={content.faq}
        />
      )}

      {/* K. Servicios relacionados */}
      {relatedServices.length > 0 && (
        <Section divider spacing="tight">
          <Container>
            <SectionHeader eyebrow={dict.services.eyebrow} heading={sd.relatedHeading} description="" />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {await Promise.all(
                relatedServices.map(async (related, i) => {
                  const relatedContent = related.content[locale];
                  const relatedOfficialSummary = await resolveServiceOfficialPriceSummary(related.relatedPackageSlugs, market.code);
                  const relatedPriceSummary = await applyDisplayCurrency(relatedOfficialSummary, displayCurrency);
                  const relatedPriceLabel = formatServicePriceLabel(relatedPriceSummary, dict.services);
                  return (
                    <ServiceIndexCard
                      key={related.slug}
                      href={`/${locale}/services/${related.slug}`}
                      icon={getServiceIcon(related.slug)}
                      heading={relatedContent.heading}
                      tagline={relatedContent.tagline}
                      priceLabel={relatedPriceLabel}
                      viewLabel={dict.services.viewService}
                      delay={0.05 * i}
                    />
                  );
                })
              )}
            </div>
          </Container>
        </Section>
      )}

      {/* Explora más — internal linking explícito hacia Maintenance y
          Diagnosis (master prompt §39), ninguno de los dos enlazado
          desde aquí hasta esta fase. */}
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-fg-subtle">{sd.exploreMoreHeading}</h2>
            <div className="mt-4 flex flex-wrap gap-4">
              <Button href={`/${locale}/maintenance`} variant="secondary" withArrow>
                {sd.maintenanceLinkLabel}
              </Button>
              <Button href={`/${locale}/diagnosis`} variant="secondary" withArrow>
                {sd.diagnosisLinkLabel}
              </Button>
            </div>
          </Reveal>
        </Container>
      </Section>

      <FinalCTA dict={dict} locale={locale} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
    </>
  );
}
