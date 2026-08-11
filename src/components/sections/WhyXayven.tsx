import { PenTool, Zap, Compass, Languages, Users2, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";

const ICONS = [PenTool, Zap, Compass, Languages, Users2, MessageCircle];

export function WhyXayven({ dict }: { dict: Dictionary }) {
  return (
    <Section divider>
      <Container>
        <SectionHeader
          eyebrow={dict.why.eyebrow}
          heading={dict.why.heading}
          description={dict.why.description}
        />

        <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {dict.why.items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <li key={item.title}>
                <Reveal delay={0.04 * i}>
                  <Icon className="size-5 text-accent-400" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold text-fg">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{item.description}</p>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
