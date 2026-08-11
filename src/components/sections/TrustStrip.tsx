import { Ruler, Code2, Target, Globe2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";

const ICONS = [Ruler, Code2, Target, Globe2];

export function TrustStrip({ dict }: { dict: Dictionary }) {
  return (
    <section className="border-y border-border">
      <Container>
        <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
          {dict.trust.items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <li key={item.title} className="py-6 sm:px-6 sm:py-8">
                <Reveal delay={i * 0.05}>
                  <Icon className="size-5 text-accent-400" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-fg">{item.title}</p>
                  <p className="mt-1 text-sm text-fg-muted">{item.description}</p>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
