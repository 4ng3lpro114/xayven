import type { Metadata } from "next";
import { Hero } from "@/components/sections/Hero";
import { TrustStrip } from "@/components/sections/TrustStrip";
import { Services } from "@/components/sections/Services";
import { WhyXayven } from "@/components/sections/WhyXayven";
import { SelectedWork } from "@/components/sections/SelectedWork";
import { ProcessPreview } from "@/components/sections/ProcessPreview";
import { Capabilities } from "@/components/sections/Capabilities";
import { TrustBuilding } from "@/components/sections/TrustBuilding";
import { FAQSection } from "@/components/sections/FAQSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/",
    title: dict.meta.defaultTitle,
    description: dict.meta.defaultDescription,
  });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <Hero dict={dict} locale={locale} />
      <TrustStrip dict={dict} />
      <Services dict={dict} locale={locale} />
      <WhyXayven dict={dict} />
      <SelectedWork dict={dict} locale={locale} />
      <ProcessPreview dict={dict} locale={locale} />
      <Capabilities dict={dict} />
      <TrustBuilding dict={dict} />
      <FAQSection dict={dict} />
      <FinalCTA dict={dict} locale={locale} />
    </>
  );
}
