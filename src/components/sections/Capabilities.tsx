import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";

export function Capabilities({ dict }: { dict: Dictionary }) {
  return (
    <Section divider spacing="tight">
      <Container>
        <SectionHeader
          eyebrow={dict.capabilities.eyebrow}
          heading={dict.capabilities.heading}
          description={dict.capabilities.description}
        />

        <Reveal delay={0.1}>
          <ul className="mt-10 flex flex-wrap gap-3">
            {dict.capabilities.items.map((item) => (
              <li
                key={item}
                className="rounded-pill border border-border bg-bg-raised px-4 py-2 text-sm text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
              >
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </Section>
  );
}
