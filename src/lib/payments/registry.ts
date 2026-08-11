import "server-only";
import type { PaymentProvider } from "@/lib/payments/provider";
import type { PaymentProviderName } from "@/lib/payments/types";
import { wompiProvider } from "@/lib/payments/providers/wompi";
import { paypalProvider } from "@/lib/payments/providers/paypal";
import { wiseProvider } from "@/lib/payments/providers/wise";

/**
 * Single place that knows every provider — the rest of the app (service.ts,
 * routes, portal pages) should only ever call `getProvider(name)`, never
 * import a provider class directly. This is what makes adding Stripe or
 * another provider later a matter of registering it here, not touching
 * every call site.
 */
const providers: Record<PaymentProviderName, PaymentProvider> = {
  WOMPI: wompiProvider,
  PAYPAL: paypalProvider,
  WISE: wiseProvider,
};

export function getProvider(name: PaymentProviderName): PaymentProvider {
  return providers[name];
}

export function listConfiguredProviders(): PaymentProviderName[] {
  return (Object.keys(providers) as PaymentProviderName[]).filter((name) =>
    providers[name].isConfigured()
  );
}
