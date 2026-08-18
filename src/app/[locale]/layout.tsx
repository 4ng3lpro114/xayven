import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/ai/ChatWidget";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, locales, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { SITE_URL, WHATSAPP_NUMBER } from "@/lib/constants";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/supabaseServer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#07060a",
  colorScheme: "dark",
};

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);

  return {
    ...buildMetadata({
      locale,
      path: "/",
      title: dict.meta.defaultTitle,
      description: dict.meta.defaultDescription,
    }),
    metadataBase: new URL(SITE_URL),
    title: {
      default: dict.meta.defaultTitle,
      template: dict.meta.titleTemplate,
    },
    icons: {
      icon: "/icon",
      apple: "/apple-icon",
    },
    manifest: "/manifest.webmanifest",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  // Server-side only, re-validated against Supabase Auth on every request
  // (same getSessionUser() the /account page itself uses) — never trusts
  // a client-side-only flag, never localStorage. Determines only which
  // single label/link the header shows; no other behavior depends on it.
  const user = await getSessionUser();

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "XAYVEN",
    url: SITE_URL,
    description: dict.meta.defaultDescription,
    sameAs: [],
  };

  // SEO/AEO/GEO Phase 8 (§19 "evaluar WebSite/WebPage") — WebSite added
  // site-wide, once, alongside Organization. No `potentialAction`
  // SearchAction: this site has no internal search feature, so adding
  // one would be a fabricated capability, not real data. A generic
  // `WebPage` type per-page was deliberately NOT added — every page that
  // already has a more specific type (Service on service detail,
  // FAQPage where FAQ exists) would just be duplicating a less specific
  // type over a more specific one, which contradicts "no generar Schema
  // por cantidad" (§19).
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "XAYVEN",
    url: SITE_URL,
  };

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          {dict.skipToContent}
        </a>
        <PromotionBanner />
        <Header
          locale={locale}
          labels={{
            home: dict.nav.home,
            work: dict.nav.work,
            services: dict.nav.services,
            process: dict.nav.process,
            maintenance: dict.nav.maintenance,
            about: dict.nav.about,
          }}
          ctaLabel={dict.nav.ctaPrimary}
          isAuthenticated={Boolean(user)}
          loginCta={dict.nav.loginCta}
          accountCta={dict.nav.accountCta}
          openMenuLabel={dict.nav.openMenu}
          closeMenuLabel={dict.nav.closeMenu}
          languageSwitcherLabel={dict.nav.languageSwitcherLabel}
        />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer locale={locale} dict={dict} />
        <ChatWidget
          dict={dict.ai}
          locale={locale}
          privacyHref={`/${locale}/privacy`}
          whatsappNumber={WHATSAPP_NUMBER}
          whatsappLabel={dict.whatsapp.label}
          whatsappMessage={dict.whatsapp.defaultMessage}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </body>
    </html>
  );
}
