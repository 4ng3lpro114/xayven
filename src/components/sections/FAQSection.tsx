import { Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/dictionary";

/**
 * Native <details>/<summary> accordion — fully keyboard and screen-reader
 * accessible with zero client-side JavaScript.
 */
export function FAQSection({ dict }: { dict: Dictionary }) {
  return (
    <Section divider id="faq">
      <Container size="narrow">
        <SectionHeader
          eyebrow={dict.faq.eyebrow}
          heading={dict.faq.heading}
          description={dict.faq.description}
        />

        <div className="mt-10 divide-y divide-border border-y border-border">
          {dict.faq.items.map((item, i) => (
            <Reveal key={item.question} delay={0.03 * i}>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-fg marker:content-none">
                  <span className="text-base font-medium">{item.question}</span>
                  <Plus
                    className="size-4 shrink-0 text-fg-subtle transition-transform duration-300 group-open:rotate-45 group-open:text-accent-400"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 max-w-xl text-sm text-fg-muted">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
