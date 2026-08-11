import { cookies } from "next/headers";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { defaultLocale, hasLocale } from "@/lib/i18n/config";

// `not-found.tsx` inside a dynamic segment does not receive route params,
// so we infer the locale from the NEXT_LOCALE cookie set by the proxy /
// language switcher, falling back to the default locale.
export default async function LocaleNotFound() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = cookieLocale && hasLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro eyebrow={dict.notFound.eyebrow} heading={dict.notFound.heading} />
      <Section spacing="tight">
        <Container>
          <p className="max-w-md text-base text-fg-muted">{dict.notFound.description}</p>
          <div className="mt-8">
            <Button href={`/${locale}`} withArrow>
              {dict.notFound.cta}
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
