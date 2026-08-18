import { Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";

interface FAQSectionProps {
  eyebrow: string;
  heading: string;
  description: string;
  items: { question: string; answer: string }[];
  /** Defaults to "faq" (the homepage's own anchor). Services Phase 3:
   *  the detail page passes a per-service id so an internal link like
   *  /services/seo#faq never collides with the homepage's section. */
  id?: string;
}

/**
 * Native <details>/<summary> accordion — fully keyboard and screen-reader
 * accessible with zero client-side JavaScript. Data-only props (not the
 * whole Dictionary) since Services Phase 3: this is now shared between
 * the homepage's dict.faq and a service detail page's own
 * content.faq — one accordion implementation, never a second copy of
 * this markup.
 */
export function FAQSection({ eyebrow, heading, description, items, id = "faq" }: FAQSectionProps) {
  return (
    <Section divider id={id}>
      <Container size="narrow">
        <SectionHeader eyebrow={eyebrow} heading={heading} description={description} />

        <div className="mt-10 divide-y divide-border border-y border-border">
          {items.map((item, i) => (
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
