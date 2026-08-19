"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Users,
  Briefcase,
  CreditCard,
  Inbox,
  Wrench,
  Tag,
  Layers,
  Package,
  Globe,
  Coins,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof MessageSquare;
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Admin UI Polish (Fase 13) — grouped sidebar navigation, replacing the
 * single-row top nav that had 10 flat links (`hidden sm:flex` with no
 * mobile fallback at all — real gap this also closes). Routes are exactly
 * the same hrefs the old nav used — nothing here changes what a link
 * points to, only how the list is organized and rendered. Grouping
 * mirrors the actual domain structure already established across this
 * codebase: Comercial (leads/clients/projects/payments/promotions/
 * mantenimiento — added in XAYVEN CORE Phase 2),
 * Catálogo (services/packages — both live in pricing_catalog),
 * International Pricing (markets/currency — Phase D's own domain),
 * Insights (Analytics).
 */
export function buildGroups(newContactRequestsCount: number): NavGroup[] {
  return [
    {
      label: "General",
      items: [{ href: "/admin", label: "Conversaciones", icon: MessageSquare }],
    },
    {
      label: "Comercial",
      items: [
        { href: "/admin/clients", label: "Clientes", icon: Users },
        { href: "/admin/projects", label: "Proyectos", icon: Briefcase },
        { href: "/admin/payments", label: "Pagos", icon: CreditCard },
        { href: "/admin/contact-requests", label: "Solicitudes", icon: Inbox, badge: newContactRequestsCount },
        { href: "/admin/maintenance", label: "Mantenimiento", icon: Wrench },
        { href: "/admin/promotions", label: "Promociones", icon: Tag },
      ],
    },
    {
      label: "Catálogo",
      items: [
        { href: "/admin/services", label: "Servicios", icon: Layers },
        { href: "/admin/packages", label: "Paquetes", icon: Package },
      ],
    },
    {
      label: "International Pricing",
      items: [
        { href: "/admin/markets", label: "Mercados", icon: Globe },
        { href: "/admin/currency-config", label: "Monedas", icon: Coins },
      ],
    },
    {
      label: "Insights",
      items: [{ href: "/admin/statistics", label: "Estadísticas", icon: BarChart3 }],
    },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The actual link list — shared by the desktop sidebar and the mobile
 *  overlay (AdminMobileNav.tsx) so there is exactly one place that knows
 *  what a nav link looks like. */
export function AdminNavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-fg-subtle">{group.label}</p>
          <div className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border border-border-accent bg-accent-500/10 text-fg"
                      : "border border-transparent text-fg-muted hover:bg-bg-elevated hover:text-fg"
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && item.badge > 0 && (
                    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-pill bg-accent-500 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Desktop sidebar — fixed column, always visible at `lg:` and up. */
export function AdminSidebar({ newContactRequestsCount }: { newContactRequestsCount: number }) {
  return <AdminNavLinks groups={buildGroups(newContactRequestsCount)} />;
}
