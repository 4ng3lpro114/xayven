import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { ProcessStep } from "@/components/process/ProcessStep";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

export function ProcessPreview({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  return (
    <Section divider>
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <SectionHeader
              eyebrow={dict.process.eyebrow}
              heading={dict.process.heading}
              description={dict.process.description}
            />
            <div className="mt-8">
              <Button href={`/${locale}/process`} variant="secondary" withArrow>
                {dict.nav.process}
              </Button>
            </div>
          </div>

          <div>
            {dict.process.steps.map((step, i) => (
              <ProcessStep
                key={step.number}
                number={step.number}
                title={step.title}
                description={step.description}
                delay={0.04 * i}
                isLast={i === dict.process.steps.length - 1}
              />
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
