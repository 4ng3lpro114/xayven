import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { MaintenancePlanCard } from "@/components/maintenance/MaintenancePlanCard";
import { MaintenanceForm } from "@/components/maintenance/MaintenanceForm";
import { FAQSection } from "@/components/sections/FAQSection";
import { OpenChatButton } from "@/components/ai/OpenChatButton";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { listCurrencyConfigs } from "@/lib/db/currencyConfigStore";
import { resolveMaintenancePlanOfficialPrice } from "@/lib/pricing/maintenancePlanOfficialPrice";
import { resolveCommercialMarket, resolveDisplayCurrency } from "@/lib/pricing/commercialContext";
import { DisplayCurrencySelector } from "@/components/pricing/DisplayCurrencySelector";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/maintenance">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/maintenance",
    title: dict.pages.maintenance.title,
    description: dict.pages.maintenance.description,
  });
}

/**
 * Maintenance Phase 4 — connected to Pricing Core. Essential/Growth/Care+
 * names, prices and active state come from pricingCatalogStore.ts
 * (category="maintenance"), matched by `slug`; editorial content
 * (tagline/who) stays in the dictionary — this is 3 fixed plans, not a
 * whole new content domain like Services got. A plan whose slug doesn't
 * resolve to an active catalog item falls back to
 * dict.maintenance.priceUnavailable ("Consultar"/"Get a quote") instead
 * of ever showing a fabricated number.
 *
 * International Pricing Phase D: the PRICE for each plan now resolves via
 * resolveMaintenancePlanOfficialPrice() — market-aware, backed by
 * resolveOfficialPrice() (the single deterministic resolver; see
 * XAYVEN_INTERNATIONAL_PRICING_AI_ARCHITECTURE.md). The commercial market
 * itself is resolved ONCE per request via resolveCommercialMarket()
 * (cookie → geo suggestion → 'OTHER' fallback) — never re-resolved per
 * plan. Calling resolveCommercialMarket() reads cookies()/headers(),
 * which opts this route into dynamic rendering (no longer statically
 * generated) — a deliberate, documented trade-off, not an oversight.
 *
 * Pre-Production Correction R1: `features` (qué incluye cada plan) ya NO
 * vive en el diccionario — viene de Pricing Core (pricing_catalog.
 * features_es/features_en), la misma fuente que el precio. Antes había
 * dos fuentes para una misma entidad comercial; ahora hay una sola.
 *
 * Maintenance stays a separate route/concept from Services (never
 * merged) — same existing MaintenanceForm/`/api/maintenance` flow is
 * reused unchanged, no new form.
 *
 * SEO/AEO/GEO Phase 8: breadcrumb (UI + BreadcrumbList), Service+Offer
 * JSON-LD for the 3 real plans, and FAQPage JSON-LD (content already
 * existed since Phase 4, schema never had before) added.
 *
 * International Pricing Phase D — Display Currency: `displayCurrency` is
 * resolved ONCE (resolveDisplayCurrency(market)) right after `market`,
 * same discipline as `market` itself, and passed into
 * resolveMaintenancePlanOfficialPrice() — a second, independent
 * conversion step applied AFTER the official (market-determined) price,
 * never an input to which market/price gets picked. The selector only
 * lists currencies with a real currency_config row.
 */
export default async function MaintenancePage({
  params,
}: PageProps<"/[locale]/maintenance">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  const [catalogItems, { market }, currencyConfigs] = await Promise.all([
    listPricingCatalogItems({ category: "maintenance", activeOnly: true }),
    resolveCommercialMarket(),
    listCurrencyConfigs(),
  ]);
  const { currency: displayCurrency } = await resolveDisplayCurrency(market);
  const configuredCurrencies = currencyConfigs.map((c) => c.currency);

  const plans = await Promise.all(
    dict.maintenance.plans.map(async (plan) => {
      const resolved = await resolveMaintenancePlanOfficialPrice(
        plan.slug,
        market.code,
        locale,
        {
          perMonthSuffix: dict.maintenance.perMonthSuffix,
          priceUnavailable: dict.maintenance.priceUnavailable,
        },
        displayCurrency
      );
      return {
        ...plan,
        displayName: resolved.displayName ?? plan.name,
        priceLabel: resolved.priceLabel,
        features: resolved.features,
      };
    })
  );

  const breadcrumbItems = [
    { label: dict.nav.home, href: `/${locale}` },
    { label: dict.maintenance.eyebrow },
  ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: dict.nav.home, url: `${SITE_URL}/${locale}` },
    { name: dict.maintenance.eyebrow, url: `${SITE_URL}/${locale}/maintenance` },
  ]);

  // Service+Offer JSON-LD for Essential/Growth/Care+ — only real, active
  // Pricing Core items ever reach here (catalogItems is already
  // activeOnly:true), same discipline as the service detail page's own
  // Offer[] block. Omitted entirely if the catalog resolves to nothing
  // (never a fabricated offer).
  const maintenanceJsonLd =
    catalogItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "Service",
          name: dict.maintenance.heading,
          description: dict.maintenance.description,
          provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
          offers: catalogItems.map((item) => ({
            "@type": "Offer",
            name: item.name,
            price: item.basePrice,
            priceCurrency: item.currency,
            url: `${SITE_URL}/${locale}/maintenance`,
          })),
        }
      : null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dict.maintenance.faq.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <PageIntro
        eyebrow={dict.maintenance.eyebrow}
        heading={dict.maintenance.heading}
        description={dict.maintenance.description}
        breadcrumb={<Breadcrumb items={breadcrumbItems} />}
      />

      {/* Qué es / Por qué existe / Qué problemas resuelve */}
      <Section spacing="tight">
        <Container size="narrow">
          <div className="grid gap-10 sm:grid-cols-2">
            <Reveal>
              <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-fg-subtle">
                {dict.maintenance.about.whatHeading}
              </h2>
              <p className="mt-3 text-base text-fg-muted">{dict.maintenance.about.whatBody}</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-fg-subtle">
                {dict.maintenance.about.whyHeading}
              </h2>
              <p className="mt-3 text-base text-fg-muted">{dict.maintenance.about.whyBody}</p>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="mt-10">
            <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-fg-subtle">
              {dict.maintenance.about.problemsHeading}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {dict.maintenance.about.problems.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-border bg-bg-raised p-4 text-sm leading-relaxed text-fg-muted shadow-soft"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      {/* Planes */}
      <Section divider>
        <Container>
          <DisplayCurrencySelector
            currencies={configuredCurrencies}
            current={displayCurrency}
            label={dict.pricing.displayCurrencyLabel}
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, i) => (
              <MaintenancePlanCard
                key={plan.slug}
                slug={plan.slug}
                name={plan.displayName}
                tagline={plan.tagline}
                who={plan.who}
                features={plan.features}
                priceLabel={plan.priceLabel}
                ctaLabel={dict.maintenance.ctaLabel}
                featured={i === 1}
                featuredLabel={dict.maintenance.featuredLabel}
                delay={0.05 * i}
              />
            ))}
          </div>
        </Container>
      </Section>

      {/* Comparación de planes — tabla real, sin inventar paridad de
          features entre planes (cada plan lista lo suyo tal cual). */}
      <Section spacing="tight">
        <Container>
          <SectionHeader
            eyebrow={dict.maintenance.eyebrow}
            heading={dict.maintenance.comparisonHeading}
            description={dict.maintenance.comparisonNote}
          />
          <Reveal
            delay={0.1}
            className="mt-8 overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-bg-raised shadow-soft"
          >
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-bg-elevated">
                  <th scope="col" className="w-40 border-b border-border pl-5" />
                  {plans.map((plan) => (
                    <th
                      key={plan.slug}
                      scope="col"
                      className="border-b border-border px-4 py-4 text-left font-semibold text-fg"
                    >
                      {plan.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th
                    scope="row"
                    className="border-b border-border py-3 pl-5 pr-4 text-left font-medium text-fg-subtle"
                  >
                    {dict.maintenance.comparisonPriceRow}
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.slug} className="border-b border-border px-4 py-3 text-fg">
                      {plan.priceLabel}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th
                    scope="row"
                    className="border-b border-border py-3 pl-5 pr-4 text-left align-top font-medium text-fg-subtle"
                  >
                    {dict.maintenance.comparisonWhoRow}
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.slug} className="border-b border-border px-4 py-3 align-top text-fg-muted">
                      {plan.who}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="py-3 pl-5 pr-4 text-left align-top font-medium text-fg-subtle">
                    {dict.maintenance.comparisonIncludesRow}
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.slug} className="px-4 py-3 align-top">
                      <ul className="space-y-1.5 text-fg-muted">
                        {plan.features.map((feature) => (
                          <li key={feature}>— {feature}</li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Reveal>
        </Container>
      </Section>

      {/* AI CTA */}
      <Section divider spacing="tight">
        <Container size="narrow">
          <SectionHeader
            eyebrow={dict.maintenance.eyebrow}
            heading={dict.maintenance.aiHelp.heading}
            description={dict.maintenance.aiHelp.description}
            action={
              <OpenChatButton trackEventType="maintenance_cta">{dict.maintenance.aiHelp.cta}</OpenChatButton>
            }
          />
        </Container>
      </Section>

      {/* FAQ */}
      <FAQSection
        id="maintenance-faq"
        eyebrow={dict.maintenance.faq.eyebrow}
        heading={dict.maintenance.faq.heading}
        description={dict.maintenance.faq.description}
        items={dict.maintenance.faq.items}
      />

      {/* Formulario — flujo existente, sin cambios */}
      <Section id="maintenance-request" divider>
        <Container size="narrow">
          <SectionHeader
            eyebrow={dict.maintenance.eyebrow}
            heading={dict.maintenance.form.heading}
            description={dict.maintenance.form.description}
          />
          <Reveal delay={0.1} className="mt-10">
            <MaintenanceForm form={dict.maintenance.form} />
          </Reveal>
        </Container>
      </Section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {maintenanceJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(maintenanceJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </>
  );
}
