import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  /** Omitted (or the last item) renders as the current page — plain
   *  text, `aria-current="page"`, never a link to itself. */
  href?: string;
}

/**
 * SEO/AEO/GEO Phase 8 — first consumer: Services (index + detail) and
 * Maintenance. Semantic `<nav>`/`<ol>`, `aria-label` and
 * `aria-current="page"` — same accessibility discipline already applied
 * everywhere else in this project (skip-link, FAQ `<details>`, real
 * `<table>` for the maintenance comparison). No JS, works with zero
 * client-side code. Pair with buildBreadcrumbJsonLd() (lib/seo/breadcrumb.ts)
 * using the exact same items so the visible trail and the schema can
 * never disagree.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-subtle">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />}
              {isLast || !item.href ? (
                <span aria-current="page" className="text-fg-muted">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="transition-colors hover:text-fg">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
