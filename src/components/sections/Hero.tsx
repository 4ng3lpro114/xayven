import { Compass, PenTool, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

interface HeroProps {
  dict: Dictionary;
  locale: Locale;
}

export function Hero({ dict, locale }: HeroProps) {
  return (
    <section className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
      <div className="field-glow" />
      <div className="grid-overlay" />
      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-8">
          <div>
            <Reveal>
              <Badge variant="eyebrow">{dict.hero.eyebrow}</Badge>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 text-display-1 font-semibold text-fg">
                {dict.hero.headline}{" "}
                <span className="text-gradient">{dict.hero.headlineAccent}</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-lg text-lg text-fg-muted">{dict.hero.subheadline}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button href={`/${locale}/contact`} size="lg" withArrow>
                  {dict.hero.ctaPrimary}
                </Button>
                <Button href={`/${locale}/work`} size="lg" variant="secondary">
                  {dict.hero.ctaSecondary}
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-8 font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">
                {dict.hero.visualCaption}
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.1} offset={24}>
            <HeroVisual pillars={dict.hero.pillars} />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/**
 * "System of pillars" — Strategy → Design → Development as one connected
 * system, not three independent cards. Deliberately graphic-first: one
 * icon + one short word per pillar, joined by a thin gradient line — no
 * numbers, no chart shapes, no fabricated metrics (this app never invents
 * stats, see ai/knowledge.ts HARD RULES; the same principle applies here).
 */
function HeroVisual({
  pillars,
}: {
  pillars: Dictionary["hero"]["pillars"];
}) {
  const steps = [
    { label: pillars.strategy, Icon: Compass },
    { label: pillars.design, Icon: PenTool },
    { label: pillars.development, Icon: Code2 },
  ];

  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-md sm:max-w-lg">
      <div
        className="absolute inset-0 rounded-xl border border-border-strong bg-bg-raised shadow-elevated"
        style={{ transform: "rotate(-2deg)" }}
      />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border-accent bg-bg-elevated shadow-glow-md"
        style={{ transform: "rotate(1.5deg)" }}
      >
        <div className="flex flex-col items-center">
          {steps.map((step, i) => (
            <div key={step.label} className="flex flex-col items-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-border-accent bg-bg-overlay shadow-glow-sm sm:size-16">
                <step.Icon
                  className="size-6 text-accent-300 sm:size-7"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </div>
              <span className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-fg-muted">
                {step.label}
              </span>

              {i < steps.length - 1 && (
                <div
                  className="my-4 h-10 w-px bg-gradient-to-b from-accent-500/70 to-accent-500/10 sm:h-12"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className="absolute -bottom-6 -left-6 h-24 w-24 rounded-xl border border-border-accent bg-bg-elevated/90 shadow-glow-sm backdrop-blur-sm sm:h-28 sm:w-28"
        aria-hidden="true"
      />
    </div>
  );
}
