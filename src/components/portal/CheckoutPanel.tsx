import { Button } from "@/components/ui/Button";
import { WompiWidget } from "@/components/portal/WompiWidget";
import type { CheckoutResult } from "@/lib/payments/provider";

interface CheckoutPanelProps {
  checkout: CheckoutResult;
  continueLabel: string;
  manualInstructionsTitle: string;
  manualPendingNote: string;
}

/** Renders whichever checkout mode a provider returned — shared between
 *  the DEPOSIT/BALANCE/FULL_PAYMENT pay page and the maintenance pay page
 *  so the three provider UIs are only implemented once. */
export function CheckoutPanel({
  checkout,
  continueLabel,
  manualInstructionsTitle,
  manualPendingNote,
}: CheckoutPanelProps) {
  if (checkout.mode === "widget") {
    // See WompiWidget.tsx for why this uses Wompi's programmatic
    // WidgetCheckout API (our own button + explicit .open() call) instead
    // of the declarative data-render="button" auto-mount script.
    return <WompiWidget scriptSrc={checkout.scriptSrc} config={checkout.config} label={continueLabel} />;
  }

  if (checkout.mode === "redirect") {
    return (
      <div className="mt-6">
        <Button href={checkout.url} size="lg" withArrow>
          {continueLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-fg">{manualInstructionsTitle}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{checkout.instructions}</p>
      <p className="mt-4 text-xs text-fg-subtle">{manualPendingNote}</p>
    </div>
  );
}
