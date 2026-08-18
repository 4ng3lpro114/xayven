import { listCurrencyConfigs } from "@/lib/db/currencyConfigStore";
import { CurrencyConfigForm } from "@/components/admin/CurrencyConfigForm";

export const dynamic = "force-dynamic";

/**
 * International Pricing — Phase D Admin. /admin/currency-config —
 * rounding rule per currency (roundCommercial()'s only source, see
 * convertPrice.ts). Only COP/USD exist today (the closed set); a new
 * currency needs the enum widened first (currency/validation.ts) — this
 * page can't add a currency, only configure the ones the schema already
 * allows.
 */
export default async function CurrencyConfigPage() {
  const configs = await listCurrencyConfigs();

  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Configuración de monedas</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Regla de redondeo comercial usada por la conversión dinámica (Phase C) — nunca por Web/
        Admin/AI directamente.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full max-w-xl border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">Moneda</th>
              <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">
                Unidad de redondeo
              </th>
              <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">Decimales</th>
              <th className="border-b border-border py-2 text-left font-medium text-fg-subtle" />
            </tr>
          </thead>
          <tbody>
            {configs.map((config) => (
              <CurrencyConfigForm key={config.currency} config={config} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
