import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type { PricingCatalogItem, PricingCategory } from "@/lib/pricing/types";
import type { PricingCatalogItemInput, UpdatePricingCatalogItemInput } from "@/lib/pricing/validation";

/**
 * Pricing Core persistence — same shape as promotionStore.ts: Supabase
 * when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set, an in-memory
 * fallback otherwise.
 *
 * Unlike every other store's memory fallback in this codebase (which
 * starts genuinely empty — clients, projects, promotions all begin with
 * nothing until something is created through the app), this one is
 * pre-seeded with the exact same 8 canonical items the real migration
 * inserts (see 0014_pricing_catalog.sql). Deliberate: this table is
 * reference/config data, not transactional data a user creates — running
 * locally without Supabase configured should still show the real
 * commercial catalog, not an empty one. Kept in sync with the migration
 * manually; if the two ever drift, this comment is the pointer to fix it.
 *
 * Admin Phase 5: write functions added (create/update/setActive),
 * following createPromotion()/updatePromotion()'s exact discipline
 * (explicit field whitelist, never a raw spread, never falls back to
 * memory on a real Supabase error). `slug`/`category`/`billingInterval`
 * are never editable via updatePricingCatalogItem() — see
 * UpdatePricingCatalogItemInput's doc comment in pricing/validation.ts.
 */

const memoryStore = getGlobalMap<string, PricingCatalogItem>("pricing.catalog");

function nowIso(): string {
  return new Date().toISOString();
}

/** Never share one object/array reference across seed entries — each
 *  call returns a fresh `{es:[],en:[]}` so no two catalog items (or two
 *  memory-store rows spread from them) can ever alias the same arrays. */
function emptyFeatures(): { es: string[]; en: string[] } {
  return { es: [], en: [] };
}

/** Mirrors the migration's seed exactly — same slugs, names, categories,
 *  billing intervals, price types, amounts and currency. See
 *  0014_pricing_catalog.sql. `features` mirrors 0020_pricing_catalog_
 *  features.sql's backfill — real text for the 3 maintenance plans
 *  (moved here from dict.maintenance.plans, not reinvented; see
 *  Pre-Production Correction R1), empty for the 5 web packages. */
const SEED_PRICING_CATALOG: readonly Omit<PricingCatalogItem, "id" | "createdAt" | "updatedAt">[] = [
  { slug: "start", name: "START", category: "package", billingInterval: "ONE_TIME", priceType: "FIXED", basePrice: 799_000, currency: "COP", isActive: true, features: emptyFeatures() },
  { slug: "professional", name: "PROFESSIONAL", category: "package", billingInterval: "ONE_TIME", priceType: "FIXED", basePrice: 1_499_000, currency: "COP", isActive: true, features: emptyFeatures() },
  { slug: "business", name: "BUSINESS", category: "package", billingInterval: "ONE_TIME", priceType: "FIXED", basePrice: 2_499_000, currency: "COP", isActive: true, features: emptyFeatures() },
  { slug: "ecommerce", name: "E-COMMERCE", category: "package", billingInterval: "ONE_TIME", priceType: "FROM", basePrice: 3_499_000, currency: "COP", isActive: true, features: emptyFeatures() },
  { slug: "custom", name: "CUSTOM", category: "package", billingInterval: "ONE_TIME", priceType: "FROM", basePrice: 6_000_000, currency: "COP", isActive: true, features: emptyFeatures() },
  {
    slug: "essential",
    name: "Essential",
    category: "maintenance",
    billingInterval: "MONTHLY",
    priceType: "FIXED",
    basePrice: 149_000,
    currency: "COP",
    isActive: true,
    features: {
      es: ["Actualizaciones técnicas y de seguridad", "Monitoreo de disponibilidad", "Copias de seguridad periódicas", "Soporte por correo"],
      en: ["Technical and security updates", "Uptime monitoring", "Regular backups", "Email support"],
    },
  },
  {
    slug: "growth",
    name: "Growth",
    category: "maintenance",
    billingInterval: "MONTHLY",
    priceType: "FIXED",
    basePrice: 299_000,
    currency: "COP",
    isActive: true,
    features: {
      es: ["Todo lo de Essential", "Cambios de contenido periódicos", "Optimización de velocidad", "Revisión SEO básica recurrente"],
      en: ["Everything in Essential", "Regular content updates", "Speed optimization", "Recurring basic SEO review"],
    },
  },
  {
    slug: "care-plus",
    name: "Care+",
    category: "maintenance",
    billingInterval: "MONTHLY",
    priceType: "FIXED",
    basePrice: 499_000,
    currency: "COP",
    isActive: true,
    features: {
      es: ["Todo lo de Growth", "Prioridad de respuesta", "Nuevas secciones o funcionalidades pequeñas", "Acompañamiento estratégico periódico"],
      en: ["Everything in Growth", "Priority response", "New sections or small features", "Recurring strategic check-ins"],
    },
  },
];

/** Lazily seeds the in-memory store exactly once per process — mirrors
 *  the migration's `ON CONFLICT (slug) DO NOTHING` idempotency, just for
 *  the memory-fallback branch. Deterministic synthetic ids
 *  (`seed-<slug>`) since nothing depends on them matching real Postgres
 *  uuids — only `slug` is ever used as the stable reference. */
function ensureMemorySeeded(): void {
  if (memoryStore.size > 0) return;
  const timestamp = nowIso();
  for (const item of SEED_PRICING_CATALOG) {
    const id = `seed-${item.slug}`;
    memoryStore.set(id, { ...item, id, createdAt: timestamp, updatedAt: timestamp });
  }
}

interface PricingCatalogRow {
  id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  name: string;
  category: string;
  billing_interval: string;
  price_type: string;
  base_price: number;
  currency: string;
  is_active: boolean;
  features_es: string[] | null;
  features_en: string[] | null;
}

function rowToPricingCatalogItem(row: PricingCatalogRow): PricingCatalogItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: row.slug,
    name: row.name,
    category: row.category as PricingCategory,
    billingInterval: row.billing_interval as PricingCatalogItem["billingInterval"],
    priceType: row.price_type as PricingCatalogItem["priceType"],
    basePrice: row.base_price,
    currency: row.currency,
    isActive: row.is_active,
    // Defensive fallback to [] — only relevant against a real Supabase
    // row from before 0020 was applied; the memory branch never omits
    // these fields.
    features: { es: row.features_es ?? [], en: row.features_en ?? [] },
  };
}

export async function listPricingCatalogItems(options?: {
  category?: PricingCategory;
  activeOnly?: boolean;
}): Promise<PricingCatalogItem[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...memoryStore.values()]
      .filter((item) => !options?.category || item.category === options.category)
      .filter((item) => !options?.activeOnly || item.isActive)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  let query = supabase.from("pricing_catalog").select("*").order("slug", { ascending: true });
  if (options?.category) query = query.eq("category", options.category);
  if (options?.activeOnly) query = query.eq("is_active", true);

  const { data } = await query;
  return (data ?? []).map((row) => rowToPricingCatalogItem(row as PricingCatalogRow));
}

export async function getPricingCatalogItemBySlug(slug: string): Promise<PricingCatalogItem | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...memoryStore.values()].find((item) => item.slug === slug) ?? null;
  }

  const { data } = await supabase.from("pricing_catalog").select("*").eq("slug", slug).maybeSingle();
  return data ? rowToPricingCatalogItem(data as PricingCatalogRow) : null;
}

export async function getPricingCatalogItemById(id: string): Promise<PricingCatalogItem | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return memoryStore.get(id) ?? null;
  }

  const { data } = await supabase.from("pricing_catalog").select("*").eq("id", id).maybeSingle();
  return data ? rowToPricingCatalogItem(data as PricingCatalogRow) : null;
}

// ---------------------------------------------------------------------------
// Writes — Admin Phase 5. Never falls back to memory on a real Supabase
// error; explicit field whitelist always, never a raw spread. Same
// discipline as promotionStore.ts / servicesStore.ts.
// ---------------------------------------------------------------------------

export class PricingCatalogItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Pricing catalog item not found: ${id}`);
    this.name = "PricingCatalogItemNotFoundError";
  }
}

export class PricingCatalogSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A pricing catalog item with slug "${slug}" already exists.`);
    this.name = "PricingCatalogSlugConflictError";
  }
}

export async function createPricingCatalogItem(input: PricingCatalogItemInput): Promise<PricingCatalogItem> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const draft: PricingCatalogItem = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    slug: input.slug,
    name: input.name,
    category: input.category,
    billingInterval: input.billingInterval,
    priceType: input.priceType,
    basePrice: input.basePrice,
    currency: input.currency,
    isActive: input.isActive,
    features: input.features,
  };

  if (!supabase) {
    ensureMemorySeeded();
    if ([...memoryStore.values()].some((item) => item.slug === draft.slug)) {
      throw new PricingCatalogSlugConflictError(draft.slug);
    }
    memoryStore.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("pricing_catalog")
    .insert({
      id: draft.id,
      slug: draft.slug,
      name: draft.name,
      category: draft.category,
      billing_interval: draft.billingInterval,
      price_type: draft.priceType,
      base_price: draft.basePrice,
      currency: draft.currency,
      is_active: draft.isActive,
      features_es: draft.features.es,
      features_en: draft.features.en,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new PricingCatalogSlugConflictError(draft.slug);
    throw new Error(`[pricing_catalog] createPricingCatalogItem failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToPricingCatalogItem(data as PricingCatalogRow);
}

/** Explicit field-by-field whitelist in BOTH branches — never a raw
 *  `{...current, ...patch}` spread. `slug`/`category`/`billingInterval`
 *  are never touched here — see UpdatePricingCatalogItemInput. */
export async function updatePricingCatalogItem(
  id: string,
  patch: UpdatePricingCatalogItemInput
): Promise<PricingCatalogItem> {
  const current = await getPricingCatalogItemById(id);
  if (!current) throw new PricingCatalogItemNotFoundError(id);

  const updated: PricingCatalogItem = {
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    priceType: patch.priceType !== undefined ? patch.priceType : current.priceType,
    basePrice: patch.basePrice !== undefined ? patch.basePrice : current.basePrice,
    currency: patch.currency !== undefined ? patch.currency : current.currency,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    features: patch.features !== undefined ? patch.features : current.features,
    updatedAt: nowIso(),
  };

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    memoryStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("pricing_catalog")
    .update({
      name: updated.name,
      price_type: updated.priceType,
      base_price: updated.basePrice,
      currency: updated.currency,
      is_active: updated.isActive,
      features_es: updated.features.es,
      features_en: updated.features.en,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[pricing_catalog] updatePricingCatalogItem failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToPricingCatalogItem(data as PricingCatalogRow);
}

export async function setPricingCatalogItemActive(id: string, isActive: boolean): Promise<PricingCatalogItem> {
  return updatePricingCatalogItem(id, { isActive });
}
