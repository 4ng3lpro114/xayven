import "server-only";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type { CurrencyConfig } from "@/lib/pricing/currency/types";
import type { CurrencyConfigInput } from "@/lib/pricing/currency/validation";

/**
 * International Pricing — Phase C. currency_config persistence — same
 * Supabase-or-memory shape as pricingCatalogStore.ts. Pre-seeded (like
 * pricing_catalog, unlike transactional stores) with the rounding rule for
 * the 2 currencies already active in the system (COP, USD) — this is
 * infrastructure/reference data, not a commercial pricing decision, so
 * Phase A Rule 11 (no international commercial prices seeded yet) does
 * not apply to it.
 */

const memoryStore = getGlobalMap<string, CurrencyConfig>("pricing.currencyConfig"); // keyed by currency

function nowIso(): string {
  return new Date().toISOString();
}

const SEED_CURRENCY_CONFIG: readonly Omit<CurrencyConfig, "createdAt" | "updatedAt">[] = [
  { currency: "COP", roundingUnit: 1000, decimalPlaces: 0 },
  { currency: "USD", roundingUnit: 1, decimalPlaces: 2 },
];

function ensureMemorySeeded(): void {
  if (memoryStore.size > 0) return;
  const timestamp = nowIso();
  for (const config of SEED_CURRENCY_CONFIG) {
    memoryStore.set(config.currency, { ...config, createdAt: timestamp, updatedAt: timestamp });
  }
}

interface CurrencyConfigRow {
  currency: string;
  rounding_unit: number;
  decimal_places: number;
  created_at: string;
  updated_at: string;
}

function rowToCurrencyConfig(row: CurrencyConfigRow): CurrencyConfig {
  return {
    currency: row.currency,
    roundingUnit: row.rounding_unit,
    decimalPlaces: row.decimal_places,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCurrencyConfigs(): Promise<CurrencyConfig[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...memoryStore.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  }

  const { data } = await supabase.from("currency_config").select("*").order("currency", { ascending: true });
  return (data ?? []).map((row) => rowToCurrencyConfig(row as CurrencyConfigRow));
}

/** Never throws for an unconfigured currency — returns null. The
 *  conversion tier (convertPrice.ts) treats "no config" as "cannot round
 *  safely" and refuses to produce a converted price rather than guessing
 *  a rounding unit. */
export async function getCurrencyConfig(currency: string): Promise<CurrencyConfig | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return memoryStore.get(currency) ?? null;
  }

  const { data } = await supabase.from("currency_config").select("*").eq("currency", currency).maybeSingle();
  return data ? rowToCurrencyConfig(data as CurrencyConfigRow) : null;
}

/**
 * Upsert — currency_config is keyed by `currency` itself (no synthetic
 * id), and, unlike pricing_markets/pricing_market_prices, there's no
 * "identity vs. editable field" distinction to protect (every field here
 * is just a rounding rule an Admin may correct at any time) — so a single
 * create-or-replace function is simpler and just as safe as separate
 * create/update functions would be.
 */
export async function setCurrencyConfig(input: CurrencyConfigInput): Promise<CurrencyConfig> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();

  if (!supabase) {
    ensureMemorySeeded();
    const existing = memoryStore.get(input.currency);
    const config: CurrencyConfig = {
      currency: input.currency,
      roundingUnit: input.roundingUnit,
      decimalPlaces: input.decimalPlaces,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    memoryStore.set(input.currency, config);
    return config;
  }

  const { data, error } = await supabase
    .from("currency_config")
    .upsert(
      { currency: input.currency, rounding_unit: input.roundingUnit, decimal_places: input.decimalPlaces, updated_at: now },
      { onConflict: "currency" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[currency_config] setCurrencyConfig failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToCurrencyConfig(data as CurrencyConfigRow);
}
