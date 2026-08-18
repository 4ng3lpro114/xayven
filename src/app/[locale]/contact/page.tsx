import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, Clock } from "lucide-react";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { ContactForm } from "@/components/contact/ContactForm";
import { CONTACT_EMAIL } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/contact",
    title: dict.pages.contact.title,
    description: dict.pages.contact.description,
  });
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: PageProps<"/[locale]/contact">["params"];
  searchParams: Promise<{ plan?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const dict = await getDictionary(hasLocale(rawLocale) ? rawLocale : "es");

  // Flujo A — arrived from a package CTA with `?plan=<slug>`. Resolved
  // server-side against the real, active catalog (never trusted as-is);
  // an absent, unknown, or deactivated slug is not an error — it's
  // treated exactly like Flujo C (no plan selected), same as
  // /api/contact/route.ts's own resolution.
  const { plan: planSlug } = await searchParams;
  const selectedPlan = planSlug ? await getPricingCatalogItemBySlug(planSlug) : null;
  const resolvedPlan = selectedPlan && selectedPlan.isActive ? selectedPlan : null;

  return (
    <>
      <PageIntro
        eyebrow={dict.contact.eyebrow}
        heading={dict.contact.heading}
        description={dict.contact.description}
      />
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">
                  {dict.contact.directHeading}
                </h2>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="mt-4 flex items-center gap-2.5 text-base text-fg transition-colors hover:text-accent-300"
                >
                  <Mail className="size-4 text-accent-400" aria-hidden="true" />
                  {CONTACT_EMAIL}
                </a>
                <p className="mt-3 flex items-center gap-2.5 text-sm text-fg-muted">
                  <Clock className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  {dict.contact.directNote}
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <ContactForm
                form={dict.contact.form}
                selectedPlan={resolvedPlan ? { slug: resolvedPlan.slug, name: resolvedPlan.name } : null}
              />
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  );
}
