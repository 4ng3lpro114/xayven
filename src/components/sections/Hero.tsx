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
            <HeroVisual />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-md sm:max-w-lg">
      <div
        className="absolute inset-0 rounded-xl border border-border-strong bg-bg-raised shadow-elevated"
        style={{ transform: "rotate(-2deg)" }}
      />
      <div
        className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border-accent bg-bg-elevated shadow-glow-md"
        style={{ transform: "rotate(1.5deg)" }}
      >
        {/* chrome */}
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-2 rounded-full bg-fg-subtle/40" />
          <span className="size-2 rounded-full bg-fg-subtle/40" />
          <span className="size-2 rounded-full bg-fg-subtle/40" />
        </div>

        {/* skeleton content */}
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="h-3 w-2/5 rounded-full bg-fg-subtle/25" />
          <div className="h-6 w-4/5 rounded-full bg-gradient-to-r from-accent-400 to-accent-600" />
          <div className="h-3 w-3/5 rounded-full bg-fg-subtle/20" />

          <div className="mt-2 grid flex-1 grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-bg-overlay/60" />
            <div className="rounded-lg border border-border-accent bg-gradient-to-br from-accent-600/40 to-transparent" />
            <div className="col-span-2 rounded-lg border border-border bg-bg-overlay/60" />
          </div>

          <div className="mt-auto flex items-center justify-between">
            <div className="h-8 w-24 rounded-pill bg-accent-500/90" />
            <div className="h-3 w-16 rounded-full bg-fg-subtle/20" />
          </div>
        </div>
      </div>

      <div
        className="absolute -bottom-6 -left-6 h-24 w-24 rounded-xl border border-border-accent bg-bg-elevated/90 shadow-glow-sm backdrop-blur-sm sm:h-28 sm:w-28"
        aria-hidden="true"
      />
    </div>
  );
}
