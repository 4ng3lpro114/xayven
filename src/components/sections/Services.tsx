import { Globe, ShoppingBag, Rocket, Fingerprint, Wrench } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { Button } from "@/components/ui/Button";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

const ICONS = [Globe, ShoppingBag, Rocket, Fingerprint, Wrench];

export function Services({ dict, locale }: { dict: Dictionary; locale: Locale }) {
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
          {dict.services.items.map((service, i) => (
            <ServiceCard
              key={service.title}
              icon={ICONS[i % ICONS.length]}
              title={service.title}
              summary={service.summary}
              who={service.who}
              problem={service.problem}
              outcome={service.outcome}
              fieldLabels={dict.services.fieldLabels}
              delay={0.05 * i}
            />
          ))}
        </div>
      </Container>
    </Section>
  );
}
