import { Compass, PenTool, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
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
 * system, not three independent cards. Graphic-first, no invented data:
 * the dot texture and radial glow are pure decoration (the exact same
 * technique/opacity as the page-level `.grid-overlay`/`.field-glow` in
 * globals.css, just scoped locally here — no new tokens, no chart shapes,
 * no numbers). See ai/knowledge.ts HARD RULES for why this app never
 * fabricates stats — the same principle governs this visual.
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
  // The middle pillar ("Design") doubles as the system's core — the
  // pulsing ring around it is the one place movement happens, everything
  // else stays still.
  const coreIndex = 1;

  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-md sm:max-w-lg">
      <div
        className="absolute inset-0 rounded-xl border border-border-strong bg-bg-raised shadow-elevated"
        style={{ transform: "rotate(-2deg)" }}
      />
      <div
        className="absolute inset-0 overflow-hidden rounded-xl border border-border-accent bg-bg-elevated shadow-glow-md"
        style={{ transform: "rotate(1.5deg)" }}
      >
        {/* Ultra-faint dot texture — same rgba source (--color-border-strong)
            and comparable resulting opacity as .grid-overlay in
            globals.css, just a tighter local grid. Decoration only. */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(var(--color-border-strong) 1px, transparent 1.5px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />

        {/* Soft core glow, centered behind the node system — same token
            .field-glow already uses site-wide (--color-accent-glow-soft). */}
        <div
          className="absolute left-1/2 top-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full sm:size-52"
          style={{
            background: "radial-gradient(closest-side, var(--color-accent-glow-soft), transparent 72%)",
          }}
          aria-hidden="true"
        />

        {/* Corner highlights — barely-there framing marks, pure detail. */}
        <span className="absolute left-5 top-5 h-6 w-px bg-border-accent sm:h-7" aria-hidden="true" />
        <span className="absolute left-5 top-5 h-px w-6 bg-border-accent sm:w-7" aria-hidden="true" />
        <span className="absolute bottom-5 right-5 h-6 w-px bg-border-accent sm:h-7" aria-hidden="true" />
        <span className="absolute bottom-5 right-5 h-px w-6 bg-border-accent sm:w-7" aria-hidden="true" />

        {/* The node system itself, painted above the decoration. */}
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          {steps.map((step, i) => (
            <div key={step.label} className="flex flex-col items-center">
              <div className="relative flex size-12 items-center justify-center rounded-full border border-border-accent bg-bg-overlay shadow-glow-sm sm:size-14">
                {i === coreIndex && (
                  <span
                    className="absolute -inset-2 animate-pulse rounded-full border border-accent-400/50"
                    aria-hidden="true"
                  />
                )}
                <step.Icon
                  className="size-5 text-accent-300 sm:size-6"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </div>
              <span className="mt-2.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted sm:text-xs">
                {step.label}
              </span>

              {i < steps.length - 1 && (
                <div
                  className="relative my-3 flex h-8 w-px items-center justify-center bg-gradient-to-b from-accent-500/60 via-accent-400/20 to-accent-500/60 sm:h-10"
                  aria-hidden="true"
                >
                  <span className="size-1 rounded-full bg-accent-300 shadow-glow-sm" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Secondary module — the XAYVEN mark itself (Logo, markOnly), styled
          as if it were still being assembled: an incomplete corner bracket
          (only two of four corners, unlike the fully-framed main panel)
          and a slow breathing ring, reusing the exact same animate-pulse
          treatment as the "Design" pillar's core above — no new animation
          technique introduced. */}
      <div
        className="absolute -bottom-6 -left-6 flex h-24 w-24 items-center justify-center rounded-xl border border-border-accent bg-bg-elevated/90 shadow-glow-sm backdrop-blur-sm sm:h-28 sm:w-28"
        aria-hidden="true"
      >
        <span className="absolute -inset-1 animate-pulse rounded-lg border border-accent-400/40" />
        <span className="absolute left-3 top-3 h-3 w-px bg-border-accent sm:h-3.5" />
        <span className="absolute left-3 top-3 h-px w-3 bg-border-accent sm:w-3.5" />
        <span className="absolute bottom-3 right-3 size-1 rounded-full bg-accent-300 shadow-glow-sm" />
        <Logo markOnly size={36} className="relative opacity-90" />
      </div>
    </div>
  );
}
