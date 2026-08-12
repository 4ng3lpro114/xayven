import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppButtonProps {
  phoneNumber: string | null;
  message: string;
  label: string;
  /** Hidden (not just visually, unmounted) while the chat panel is open, so
   *  the two floating actions never compete for the same corner. */
  visible?: boolean;
  className?: string;
}

/**
 * Floating WhatsApp entry point. Renders nothing if WHATSAPP_NUMBER isn't
 * configured — no broken link, no placeholder button. Uses WhatsApp's own
 * green deliberately: it's a small, universally-recognized affordance, not
 * a second brand color competing with XAYVEN's violet.
 */
export function WhatsAppButton({
  phoneNumber,
  message,
  label,
  visible = true,
  className,
}: WhatsAppButtonProps) {
  if (!phoneNumber || !visible) return null;

  const href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        "fixed right-5 z-40 flex size-13 items-center justify-center rounded-full shadow-elevated transition-transform duration-200 hover:scale-105 sm:right-6",
        className
      )}
      style={{
        background: "var(--color-accent-500)",
        bottom: "calc(6.25rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <MessageCircle className="size-6 text-white" fill="white" strokeWidth={0} aria-hidden="true" />
    </a>
  );
}
