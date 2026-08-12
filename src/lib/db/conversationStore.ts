import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, isDatabaseConfigured } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type {
  ChatMessage,
  Conversation,
  ConversationCounts,
  ExtractedFields,
  LeadStatus,
} from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";

/**
 * Conversation persistence, abstracted behind one small API so the rest of
 * the app never has to know whether Supabase is configured.
 *
 * Without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, this falls back to an
 * in-memory Map scoped to the current server process. That's enough to
 * demo and develop the whole AI flow end-to-end, but it is NOT persistent
 * across deploys/restarts and is NOT shared across multiple instances —
 * see README "Database" section before relying on it in production.
 */

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

const memoryStore = getGlobalMap<string, Conversation>("ai.conversations");

function nowIso() {
  return new Date().toISOString();
}

function createEmptyConversation(sessionId: string, locale: Locale): Conversation {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    sessionId,
    locale,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "active",
    messages: [],
    clientId: null,
    visitorName: null,
    visitorEmail: null,
    visitorPhone: null,
    company: null,
    website: null,
    projectType: null,
    need: null,
    goal: null,
    budget: null,
    urgency: null,
    leadScore: 0,
    leadStatus: "exploring",
    aiSummary: null,
    consentStatus: "pending",
  };
}

// ---------------------------------------------------------------------------
// Supabase row <-> domain mapping
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string;
  session_id: string;
  locale: string;
  created_at: string;
  updated_at: string;
  status: string;
  messages: ChatMessage[];
  client_id: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  company: string | null;
  website: string | null;
  project_type: string | null;
  need: string | null;
  goal: string | null;
  budget: string | null;
  urgency: string | null;
  lead_score: number;
  lead_status: string;
  ai_summary: string | null;
  consent_status: string;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    sessionId: row.session_id,
    locale: row.locale as Locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status as Conversation["status"],
    messages: row.messages ?? [],
    clientId: row.client_id,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    visitorPhone: row.visitor_phone,
    company: row.company,
    website: row.website,
    projectType: row.project_type,
    need: row.need,
    goal: row.goal,
    budget: row.budget,
    urgency: row.urgency,
    leadScore: row.lead_score,
    leadStatus: row.lead_status as LeadStatus,
    aiSummary: row.ai_summary,
    consentStatus: row.consent_status as Conversation["consentStatus"],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getOrCreateConversation(
  sessionId: string,
  locale: Locale
): Promise<Conversation> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = [...memoryStore.values()]
      .filter((c) => c.sessionId === sessionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (existing) return existing;
    const created = createEmptyConversation(sessionId, locale);
    memoryStore.set(created.id, created);
    return created;
  }

  const { data: existingRows } = await supabase
    .from("conversations")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingRows && existingRows.length > 0) {
    return rowToConversation(existingRows[0] as ConversationRow);
  }

  const draft = createEmptyConversation(sessionId, locale);
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      id: draft.id,
      session_id: draft.sessionId,
      locale: draft.locale,
      status: draft.status,
      messages: draft.messages,
      lead_score: draft.leadScore,
      lead_status: draft.leadStatus,
      consent_status: draft.consentStatus,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Fail open into the in-memory store rather than breaking the chat.
    memoryStore.set(draft.id, draft);
    return draft;
  }

  return rowToConversation(data as ConversationRow);
}

export async function saveConversation(conversation: Conversation): Promise<Conversation> {
  const supabase = getSupabaseAdmin();
  const updated: Conversation = { ...conversation, updatedAt: nowIso() };

  if (!supabase) {
    memoryStore.set(updated.id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({
      messages: updated.messages,
      status: updated.status,
      client_id: updated.clientId,
      visitor_name: updated.visitorName,
      visitor_email: updated.visitorEmail,
      visitor_phone: updated.visitorPhone,
      company: updated.company,
      website: updated.website,
      project_type: updated.projectType,
      need: updated.need,
      goal: updated.goal,
      budget: updated.budget,
      urgency: updated.urgency,
      lead_score: updated.leadScore,
      lead_status: updated.leadStatus,
      ai_summary: updated.aiSummary,
      consent_status: updated.consentStatus,
    })
    .eq("id", updated.id)
    .select("*")
    .single();

  if (error || !data) return updated;
  return rowToConversation(data as ConversationRow);
}

export function applyExtractedFields(
  conversation: Conversation,
  fields: ExtractedFields
): Conversation {
  const next = { ...conversation };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.trim().length > 0) {
      (next as Record<string, unknown>)[key] = value.trim();
    }
  }
  return next;
}

export async function listConversations(options?: {
  limit?: number;
  leadStatus?: LeadStatus;
}): Promise<Conversation[]> {
  const supabase = getSupabaseAdmin();
  const limit = options?.limit ?? 50;

  if (!supabase) {
    return [...memoryStore.values()]
      .filter((c) => !options?.leadStatus || c.leadStatus === options.leadStatus)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  let query = supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options?.leadStatus) {
    query = query.eq("lead_status", options.leadStatus);
  }

  const { data } = await query;
  return (data ?? []).map((row) => rowToConversation(row as ConversationRow));
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return memoryStore.get(id) ?? null;
  }

  const { data } = await supabase.from("conversations").select("*").eq("id", id).single();
  return data ? rowToConversation(data as ConversationRow) : null;
}

export async function countByLeadStatus(): Promise<ConversationCounts> {
  const all = await listConversations({ limit: 1000 });
  const counts: ConversationCounts = {
    total: all.length,
    exploring: 0,
    interested: 0,
    hot: 0,
    client: 0,
    support: 0,
  };
  for (const c of all) counts[c.leadStatus] += 1;
  return counts;
}

export function isConversationStorePersistent(): boolean {
  return isDatabaseConfigured();
}

/**
 * Real, permanent deletion — the first of its kind in this codebase (every
 * other store in the app only ever creates/updates, by design). Never
 * falls back to memory on a Supabase error the way the other functions in
 * this module do: silently "succeeding" a delete that didn't actually
 * happen against the real row would be actively dangerous, not a
 * resilience win. Callers (see the DELETE route) are responsible for the
 * "never delete a conversation linked to a client" business rule — this
 * function only knows how to delete-by-id, unconditionally.
 */
export async function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { deleted: memoryStore.delete(id) };
  }

  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    throw new Error(
      `[conversations] deleteConversation failed: ${error.code ?? "unknown"} ${error.message ?? ""}`
    );
  }

  return { deleted: (count ?? 0) > 0 };
}
