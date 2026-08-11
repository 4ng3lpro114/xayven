import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { MaintenancePlanCard } from "@/components/maintenance/MaintenancePlanCard";
import { MaintenanceForm } from "@/components/maintenance/MaintenanceForm";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

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

export default async function MaintenancePage({
  params,
}: PageProps<"/[locale]/maintenance">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro
        eyebrow={dict.maintenance.eyebrow}
        heading={dict.maintenance.heading}
        description={dict.maintenance.description}
      />

      <Section>
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dict.maintenance.plans.map((plan, i) => (
              <MaintenancePlanCard
                key={plan.name}
                name={plan.name}
                tagline={plan.tagline}
                who={plan.who}
                features={plan.features}
                priceLabel={plan.priceLabel}
                ctaLabel={dict.maintenance.ctaLabel}
                featured={i === 1}
                delay={0.05 * i}
              />
            ))}
          </div>
        </Container>
      </Section>

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
    </>
  );
}
