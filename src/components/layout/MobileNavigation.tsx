"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { NAV_ITEMS } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

interface MobileNavigationProps {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  labels: Record<(typeof NAV_ITEMS)[number]["key"], string>;
  ctaLabel: string;
  closeMenuLabel: string;
  languageSwitcherLabel: string;
  currentPath: string;
}

export function MobileNavigation({
  open,
  onClose,
  locale,
  labels,
  ctaLabel,
  closeMenuLabel,
  languageSwitcherLabel,
  currentPath,
}: MobileNavigationProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col bg-bg md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-16 items-center justify-between px-5">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-fg-muted">
              XAYVEN
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-10 items-center justify-center rounded-md text-fg"
              aria-label={closeMenuLabel}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col justify-center gap-1 px-6" aria-label="Mobile">
            {NAV_ITEMS.map((item, i) => {
              const href = item.key === "home" ? `/${locale}` : `/${locale}${item.href}`;
              const active =
                item.key === "home" ? currentPath === "/" : currentPath.startsWith(item.href);
              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    href={href}
                    className={cn(
                      "block py-3 text-3xl font-medium tracking-tight",
                      active ? "text-fg" : "text-fg-muted"
                    )}
                  >
                    {labels[item.key]}
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-6">
            <LanguageSwitcher locale={locale} label={languageSwitcherLabel} />
            <Button href={`/${locale}/contact`} withArrow>
              {ctaLabel}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
