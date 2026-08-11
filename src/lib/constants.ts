export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://xayven.com";

export const SITE_NAME = "XAYVEN";

export const CONTACT_EMAIL = "hello@xayven.com";

/**
 * Optional — the floating WhatsApp button only renders once this is set.
 * Read server-side only (WhatsAppButton is a Server Component), so it does
 * NOT need a NEXT_PUBLIC_ prefix even though the number itself isn't a
 * secret. See .env.example / README "WhatsApp".
 */
export const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER?.trim() || null;

export const NAV_ITEMS = [
  { key: "home", href: "/" },
  { key: "work", href: "/work" },
  { key: "services", href: "/services" },
  { key: "process", href: "/process" },
  { key: "maintenance", href: "/maintenance" },
  { key: "about", href: "/about" },
] as const;
