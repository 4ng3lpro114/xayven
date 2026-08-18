import { Globe, ShoppingBag, Search, Zap, Fingerprint, type LucideIcon } from "lucide-react";

/**
 * Icon per service, keyed by slug — deliberately code-driven, not stored
 * in servicesStore.ts/the DB (a presentation concern, not commercial
 * data, same reasoning already applied to Project.accent in
 * lib/data/projects.ts). Shared by every consumer that renders a service
 * icon (index, homepage teaser, future detail page) so there is exactly
 * one mapping, never a per-component positional ICONS[i % ICONS.length]
 * array again (that pattern silently breaks if services get reordered —
 * this one doesn't).
 */
const SERVICE_ICONS: Record<string, LucideIcon> = {
  "web-development": Globe,
  ecommerce: ShoppingBag,
  seo: Search,
  automation: Zap,
  "custom-solutions": Fingerprint,
};

const DEFAULT_ICON = Globe;

export function getServiceIcon(slug: string): LucideIcon {
  return SERVICE_ICONS[slug] ?? DEFAULT_ICON;
}
