import { Sparkles, FolderCheck, Waypoints, UserRound } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";

const ICONS = [Sparkles, FolderCheck, Waypoints, UserRound];

export function TrustBuilding({ dict }: { dict: Dictionary }) {
  return (
    <Section divider>
      <Container size="narrow">
        <SectionHeader
          eyebrow={dict.trustBuilding.eyebrow}
          heading={dict.trustBuilding.heading}
          description={dict.trustBuilding.description}
        />

        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {dict.trustBuilding.items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <li key={item.title} className="flex gap-3.5">
                <Reveal delay={0.05 * i} className="flex items-start gap-3.5">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-400">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="pt-1.5">
                    <p className="text-sm font-semibold text-fg">{item.title}</p>
                    <p className="mt-1 text-sm text-fg-muted">{item.description}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
