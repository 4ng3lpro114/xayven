import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type {
  CreatePromotionInput,
  Promotion,
  PromotionAudience,
  PromotionDiscountType,
  PromotionStatus,
  UpdatePromotionInput,
} from "@/lib/promotions/types";

/**
 * Fase 11B — promotions persistence. Same shape as conversationStore.ts/
 * paymentsStore.ts: Supabase when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * are set, an in-memory fallback otherwise.
 *
 * Fase 11B hard rule, explicit in the brief: never fall back to memory on
 * a REAL Supabase error — that would let an admin believe a promotion was
 * saved when it wasn't. Same discipline already applied to
 * deleteClient()/deleteProject()/recordLeadStatusChange() in this
 * codebase: the only legitimate fallback is `!supabase` (not configured
 * at all), never a caught write failure.
 */

const memoryStore = getGlobalMap<string, Promotion>("promotions");

function nowIso(): string {
  return new Date().toISOString();
}

interface PromotionRow {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  text: string;
  discount_type: string;
  discount_value: number;
  currency: string | null;
  start_at: string;
  end_at: string;
  audience: string;
  status: string;
  cta_label: string;
  cta_message: string | null;
  metadata: Record<string, unknown>;
  audience_rules: Record<string, unknown> | null;
}

function rowToPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    text: row.text,
    discountType: row.discount_type as PromotionDiscountType,
    discountValue: row.discount_value,
    currency: row.currency,
    startAt: row.start_at,
    endAt: row.end_at,
    audience: row.audience as PromotionAudience,
    status: row.status as PromotionStatus,
    ctaLabel: row.cta_label,
    ctaMessage: row.cta_message,
    metadata: row.metadata ?? {},
    audienceRules: row.audience_rules,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPromotion(input: CreatePromotionInput): Promise<Promotion> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const draft: Promotion = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    name: input.name,
    text: input.text,
    discountType: input.discountType,
    discountValue: input.discountValue,
    currency: input.currency,
    startAt: input.startAt,
    endAt: input.endAt,
    audience: input.audience,
    status: input.status ?? "draft",
    ctaLabel: input.ctaLabel,
    ctaMessage: input.ctaMessage ?? null,
    metadata: {},
    audienceRules: null,
  };

  if (!supabase) {
    memoryStore.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("promotions")
    .insert({
      id: draft.id,
      name: draft.name,
      text: draft.text,
      discount_type: draft.discountType,
      discount_value: draft.discountValue,
      currency: draft.currency,
      start_at: draft.startAt,
      end_at: draft.endAt,
      audience: draft.audience,
      status: draft.status,
      cta_label: draft.ctaLabel,
      cta_message: draft.ctaMessage,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[promotions] createPromotion failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }

  return rowToPromotion(data as PromotionRow);
}

export async function getPromotionById(id: string): Promise<Promotion | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return memoryStore.get(id) ?? null;
  }

  const { data } = await supabase.from("promotions").select("*").eq("id", id).single();
  return data ? rowToPromotion(data as PromotionRow) : null;
}

export async function listPromotions(options?: {
  status?: PromotionStatus;
  limit?: number;
}): Promise<Promotion[]> {
  const supabase = getSupabaseAdmin();
  const limit = options?.limit ?? 1000;

  if (!supabase) {
    return [...memoryStore.values()]
      .filter((p) => !options?.status || p.status === options.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  let query = supabase.from("promotions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (options?.status) query = query.eq("status", options.status);

  const { data } = await query;
  return (data ?? []).map((row) => rowToPromotion(row as PromotionRow));
}

export class PromotionNotFoundError extends Error {
  constructor(id: string) {
    super(`Promotion not found: ${id}`);
    this.name = "PromotionNotFoundError";
  }
}

/**
 * Fase 11B: once `archived`, a promotion becomes read-only — its terms are
 * a historical record from that point on (see the Fase 11B report for why:
 * the audit didn't resolve this exact question, and no attribution FK
 * exists yet in this phase to make the risk concrete, but an admin
 * referencing "what was August's discount" later shouldn't find it
 * silently changed). No other field-level restriction is enforced beyond
 * this — deliberately not inventing finer-grained rules the audit never
 * specified.
 */
export class PromotionArchivedError extends Error {
  constructor(id: string) {
    super(`Promotion ${id} is archived and can no longer be edited.`);
    this.name = "PromotionArchivedError";
  }
}

/** `status` is never part of a generic edit — see UpdatePromotionInput's
 *  doc comment. Only pausePromotion()/resumePromotion()/archivePromotion()/
 *  schedulePromotion() below ever change it. */
export async function updatePromotion(id: string, patch: UpdatePromotionInput): Promise<Promotion> {
  const current = await getPromotionById(id);
  if (!current) throw new PromotionNotFoundError(id);
  if (current.status === "archived") throw new PromotionArchivedError(id);

  const supabase = getSupabaseAdmin();

  // Explicit field-by-field whitelist in BOTH branches — never a raw
  // `{ ...current, ...patch }` spread, which would let an unexpected key
  // (e.g. `status`, bypassing the type system via `as any`) slip through
  // silently in the in-memory branch even though UpdatePromotionInput
  // doesn't declare it. Same discipline the Supabase branch already had
  // to follow (it can only ever `update()` columns it names explicitly).
  const updated: Promotion = {
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    text: patch.text !== undefined ? patch.text : current.text,
    discountType: patch.discountType !== undefined ? patch.discountType : current.discountType,
    discountValue: patch.discountValue !== undefined ? patch.discountValue : current.discountValue,
    currency: patch.currency !== undefined ? patch.currency : current.currency,
    startAt: patch.startAt !== undefined ? patch.startAt : current.startAt,
    endAt: patch.endAt !== undefined ? patch.endAt : current.endAt,
    audience: patch.audience !== undefined ? patch.audience : current.audience,
    ctaLabel: patch.ctaLabel !== undefined ? patch.ctaLabel : current.ctaLabel,
    ctaMessage: patch.ctaMessage !== undefined ? patch.ctaMessage : current.ctaMessage,
    updatedAt: nowIso(),
  };

  if (!supabase) {
    memoryStore.set(id, updated);
    return updated;
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.text !== undefined) dbPatch.text = patch.text;
  if (patch.discountType !== undefined) dbPatch.discount_type = patch.discountType;
  if (patch.discountValue !== undefined) dbPatch.discount_value = patch.discountValue;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;
  if (patch.startAt !== undefined) dbPatch.start_at = patch.startAt;
  if (patch.endAt !== undefined) dbPatch.end_at = patch.endAt;
  if (patch.audience !== undefined) dbPatch.audience = patch.audience;
  if (patch.ctaLabel !== undefined) dbPatch.cta_label = patch.ctaLabel;
  if (patch.ctaMessage !== undefined) dbPatch.cta_message = patch.ctaMessage;

  const { data, error } = await supabase
    .from("promotions")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[promotions] updatePromotion failed: ${error?.code ?? "not_found"} ${error?.message ?? ""}`
    );
  }

  return rowToPromotion(data as PromotionRow);
}

// ---------------------------------------------------------------------------
// Estado — únicamente vía estas 4 funciones, nunca updatePromotion()
// ---------------------------------------------------------------------------

export class PromotionTransitionError extends Error {
  constructor(
    public code: "illegal_transition",
    message: string
  ) {
    super(message);
    this.name = "PromotionTransitionError";
  }
}

async function writeStatus(id: string, status: PromotionStatus): Promise<Promotion> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = memoryStore.get(id);
    if (!existing) throw new PromotionNotFoundError(id);
    const updated: Promotion = { ...existing, status, updatedAt: nowIso() };
    memoryStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("promotions")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[promotions] writeStatus failed: ${error?.code ?? "not_found"} ${error?.message ?? ""}`
    );
  }

  return rowToPromotion(data as PromotionRow);
}

/**
 * Fase 11B: not explicitly named in the brief's store list (only pause/
 * resume were) — added because without it, a `draft` promotion (the
 * default a fresh creation gets, see createPromotion) would have no way
 * to ever go live. Flagged explicitly in the Fase 11B report as a gap the
 * audit didn't resolve, filled pragmatically rather than left broken.
 */
export async function schedulePromotion(id: string): Promise<Promotion> {
  const current = await getPromotionById(id);
  if (!current) throw new PromotionNotFoundError(id);
  if (current.status !== "draft") {
    throw new PromotionTransitionError(
      "illegal_transition",
      `Cannot schedule from status '${current.status}' — only 'draft' can be scheduled.`
    );
  }
  return writeStatus(id, "scheduled");
}

export async function pausePromotion(id: string): Promise<Promotion> {
  const current = await getPromotionById(id);
  if (!current) throw new PromotionNotFoundError(id);
  if (current.status !== "scheduled") {
    throw new PromotionTransitionError(
      "illegal_transition",
      `Cannot pause from status '${current.status}' — only 'scheduled' can be paused.`
    );
  }
  return writeStatus(id, "paused");
}

export async function resumePromotion(id: string): Promise<Promotion> {
  const current = await getPromotionById(id);
  if (!current) throw new PromotionNotFoundError(id);
  if (current.status !== "paused") {
    throw new PromotionTransitionError(
      "illegal_transition",
      `Cannot resume from status '${current.status}' — only 'paused' can be resumed.`
    );
  }
  return writeStatus(id, "scheduled");
}

/**
 * Never a physical DELETE — archiving is the terminal state, promotions
 * are never removed from the table (Fase 11A audit: historical record for
 * Analytics/atribución must survive forever). Idempotency guard: archiving
 * an already-archived promotion is rejected rather than silently
 * no-op'd, so a caller always knows whether this call actually did
 * anything (same "changed: true/false" spirit as changeLeadStatus(), just
 * surfaced as a thrown error here since the archive action has no other
 * side effect to report).
 */
export async function archivePromotion(id: string): Promise<Promotion> {
  const current = await getPromotionById(id);
  if (!current) throw new PromotionNotFoundError(id);
  if (current.status === "archived") {
    throw new PromotionTransitionError("illegal_transition", "Already archived.");
  }
  return writeStatus(id, "archived");
}
