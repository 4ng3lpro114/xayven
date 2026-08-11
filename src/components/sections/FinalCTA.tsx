import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

export function FinalCTA({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  return (
    <Section spacing="tight">
      <Container>
        <div className="relative overflow-hidden rounded-xl border border-border-accent bg-bg-raised px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="field-glow" />
          <div className="relative z-10 mx-auto max-w-2xl">
            <Reveal>
              <h2 className="text-display-2 font-semibold tracking-tight text-fg">
                {dict.finalCta.heading}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base text-fg-muted">
                {dict.finalCta.description}
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Button href={`/${locale}/contact`} size="lg" withArrow>
                  {dict.finalCta.ctaPrimary}
                </Button>
                <Button href={`/${locale}/work`} size="lg" variant="secondary">
                  {dict.finalCta.ctaSecondary}
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
