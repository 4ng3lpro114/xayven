"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { NAV_ITEMS } from "@/lib/constants";
import { stripLocale, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

interface HeaderProps {
  locale: Locale;
  labels: Record<(typeof NAV_ITEMS)[number]["key"], string>;
  ctaLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
  languageSwitcherLabel: string;
}

export function Header({
  locale,
  labels,
  ctaLabel,
  openMenuLabel,
  closeMenuLabel,
  languageSwitcherLabel,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const currentPath = stripLocale(pathname);

  // Close the mobile menu on navigation. Adjusted during render (per the
  // React docs pattern for "resetting state when a prop changes") rather
  // than in an effect, so it doesn't cause an extra cascading render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-colors duration-300",
          scrolled
            ? "border-b border-border bg-bg/85 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href={`/${locale}`} className="shrink-0" aria-label="XAYVEN — Home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const href = item.key === "home" ? `/${locale}` : `/${locale}${item.href}`;
              const active =
                item.key === "home" ? currentPath === "/" : currentPath.startsWith(item.href);
              return (
                <Link
                  key={item.key}
                  href={href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-fg",
                    active ? "text-fg" : "text-fg-muted"
                  )}
                >
                  {labels[item.key]}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LanguageSwitcher locale={locale} label={languageSwitcherLabel} />
            </div>
            <Button href={`/${locale}/contact`} size="md" className="hidden sm:inline-flex">
              {ctaLabel}
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex size-10 items-center justify-center rounded-md text-fg md:hidden"
              aria-label={openMenuLabel}
              aria-expanded={menuOpen}
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <MobileNavigation
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        locale={locale}
        labels={labels}
        ctaLabel={ctaLabel}
        closeMenuLabel={closeMenuLabel}
        languageSwitcherLabel={languageSwitcherLabel}
        currentPath={currentPath}
      />
    </>
  );
}
