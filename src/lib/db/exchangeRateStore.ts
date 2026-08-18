import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalArray } from "@/lib/db/memoryStore";
import type { ExchangeRate } from "@/lib/pricing/currency/types";
import type { RecordExchangeRateInput } from "@/lib/pricing/currency/validation";

/**
 * International Pricing — Phase C. exchange_rates persistence — same
 * Supabase-or-memory shape as every other store, but APPEND-ONLY: there is
 * deliberately no update/delete function here. A new observation is
 * always a new row; nothing in this codebase ever rewrites a past rate.
 *
 * Starts genuinely empty (no seed) — Phase C does not connect any live
 * external exchange-rate provider (that requires its own explicit
 * approval, per the Phase A design doc). `recordExchangeRate()` is the
 * ingestion seam a future provider integration (or, for now, a manual
 * Admin entry) would call; nothing in this phase calls it automatically.
 */

const memoryStore = getGlobalArray<ExchangeRate>("pricing.exchangeRates");

function nowIso(): string {
  return new Date().toISOString();
}

interface ExchangeRateRow {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: string;
  fetched_at: string;
  created_at: string;
}

function rowToExchangeRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rate: row.rate,
    source: row.source,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
  };
}

/**
 * Inserts one new rate observation. `baseCurrency` is always "COP" in this
 * system — Pricing Core's basePrice is always COP (see
 * src/lib/pricing/types.ts) — never accepted as an input here, so nothing
 * upstream can accidentally record a rate against the wrong base.
 */
export async function recordExchangeRate(input: RecordExchangeRateInput): Promise<ExchangeRate> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const draft: ExchangeRate = {
    id: randomUUID(),
    baseCurrency: "COP",
    quoteCurrency: input.quoteCurrency,
    rate: input.rate,
    source: input.source,
    fetchedAt: now,
    createdAt: now,
  };

  if (!supabase) {
    memoryStore.push(draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("exchange_rates")
    .insert({
      id: draft.id,
      base_currency: draft.baseCurrency,
      quote_currency: draft.quoteCurrency,
      rate: draft.rate,
      source: draft.source,
      fetched_at: draft.fetchedAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[exchange_rates] recordExchangeRate failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToExchangeRate(data as ExchangeRateRow);
}

/**
 * Most recent COP → quoteCurrency observation, regardless of age — pure
 * data access, no staleness policy here (that's a business decision, made
 * by convertPrice.ts's convertFromBase(), not this store). Never throws;
 * null means "no rate has ever been recorded for this currency".
 */
export async function getLatestExchangeRate(quoteCurrency: string): Promise<ExchangeRate | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const candidates = memoryStore.filter((r) => r.baseCurrency === "COP" && r.quoteCurrency === quoteCurrency);
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, r) => (r.fetchedAt > latest.fetchedAt ? r : latest));
  }

  const { data } = await supabase
    .from("exchange_rates")
    .select("*")
    .eq("base_currency", "COP")
    .eq("quote_currency", quoteCurrency)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? rowToExchangeRate(data as ExchangeRateRow) : null;
}

/** Full history for one currency pair, newest first — used by tests and
 *  the future Admin "exchange rate history" view, never by the resolver
 *  itself (which only ever wants the latest, via getLatestExchangeRate()). */
export async function listExchangeRates(quoteCurrency: string): Promise<ExchangeRate[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return memoryStore
      .filter((r) => r.baseCurrency === "COP" && r.quoteCurrency === quoteCurrency)
      .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1));
  }

  const { data } = await supabase
    .from("exchange_rates")
    .select("*")
    .eq("base_currency", "COP")
    .eq("quote_currency", quoteCurrency)
    .order("fetched_at", { ascending: false });

  return (data ?? []).map((row) => rowToExchangeRate(row as ExchangeRateRow));
}
