"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import { locales, localeLabels, localizePath, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  locale: Locale;
  label: string;
}

export function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Globe className="mr-1 size-4 text-fg-subtle" aria-hidden="true" />
      {locales.map((l, i) => (
        <span key={l} className="flex items-center">
          <Link
            href={localizePath(pathname, l)}
            onClick={() => {
              document.cookie = `NEXT_LOCALE=${l};path=/;max-age=31536000`;
            }}
            aria-current={l === locale ? "true" : undefined}
            className={cn(
              "px-1.5 text-sm font-medium transition-colors",
              l === locale ? "text-fg" : "text-fg-subtle hover:text-fg-muted"
            )}
          >
            {localeLabels[l]}
          </Link>
          {i < locales.length - 1 && <span className="text-fg-subtle">/</span>}
        </span>
      ))}
    </div>
  );
}
