import { listCurrencyConfigs } from "@/lib/db/currencyConfigStore";
import { CurrencyConfigForm } from "@/components/admin/CurrencyConfigForm";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export const dynamic = "force-dynamic";

/**
 * International Pricing — Phase D Admin. /admin/currency-config —
 * rounding rule per currency (roundCommercial()'s only source, see
 * convertPrice.ts). Only COP/USD exist today (the closed set); a new
 * currency needs the enum widened first (currency/validation.ts) — this
 * page can't add a currency, only configure the ones the schema already
 * allows.
 *
 * Admin UI Polish — was a `<table>` for exactly 2 rows; now one card per
 * currency (see CurrencyConfigForm.tsx), matching the "cards when an
 * entity needs context" principle for a small, named set of records.
 */
export default async function CurrencyConfigPage() {
  const configs = await listCurrencyConfigs();

  return (
    <div>
      <AdminPageHeader
        eyebrow="International Pricing"
        title="Configuración de monedas"
        description="Regla de redondeo comercial usada por la conversión dinámica — nunca aplicada directamente por Web, Admin o XAYVEN AI."
      />

      <div className="mt-6 grid max-w-2xl gap-4">
        {configs.map((config) => (
          <CurrencyConfigForm key={config.currency} config={config} />
        ))}
      </div>
    </div>
  );
}
