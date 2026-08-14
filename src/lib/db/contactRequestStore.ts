import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type { ContactRequest } from "@/lib/db/types";

/**
 * Persistence for the public "Crear mi proyecto" → /contact form
 * (POST /api/contact). Same Supabase-or-in-memory shape as every other
 * store in this codebase — but, unlike maintenanceStore.ts, this one
 * NEVER silently falls back to memory when Supabase is configured and a
 * write fails. That's the exact discipline already applied to
 * paymentsStore.ts's createClient/createProject/createPayment (the
 * "Risk #1" fix) and to promotionStore.ts: the only legitimate fallback
 * is `!supabase` (not configured at all), never a caught write error.
 * This matters here specifically because the route needs to know for
 * certain whether the request was actually saved before it can honestly
 * tell the visitor "recibido" — see route.ts.
 */

const memoryStore = getGlobalMap<string, ContactRequest>("contactRequests");

function nowIso(): string {
  return new Date().toISOString();
}

interface ContactRequestRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  project_type: string;
  budget: string;
  message: string;
  status: ContactRequest["status"];
  client_id: string | null;
  client_was_created: boolean | null;
}

function rowToContactRequest(row: ContactRequestRow): ContactRequest {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    company: row.company,
    projectType: row.project_type,
    budget: row.budget,
    message: row.message,
    status: row.status,
    clientId: row.client_id,
    clientWasCreated: row.client_was_created,
  };
}

export async function createContactRequest(
  input: Omit<ContactRequest, "id" | "createdAt" | "status" | "clientId" | "clientWasCreated">
): Promise<ContactRequest> {
  const supabase = getSupabaseAdmin();
  const draft: ContactRequest = {
    id: randomUUID(),
    createdAt: nowIso(),
    status: "new",
    clientId: null,
    clientWasCreated: null,
    ...input,
  };

  if (!supabase) {
    memoryStore.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("contact_requests")
    .insert({
      id: draft.id,
      name: draft.name,
      email: draft.email,
      company: draft.company,
      project_type: draft.projectType,
      budget: draft.budget,
      message: draft.message,
      status: draft.status,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Never fabricate a record the caller can't trust — the route needs
    // this to fail loudly so it can respond honestly instead of telling
    // the visitor their request was received when it wasn't.
    throw new Error(
      `[contact-requests] createContactRequest failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }

  return rowToContactRequest(data as ContactRequestRow);
}

export async function getContactRequestById(id: string): Promise<ContactRequest | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return memoryStore.get(id) ?? null;
  }

  const { data } = await supabase.from("contact_requests").select("*").eq("id", id).single();
  return data ? rowToContactRequest(data as ContactRequestRow) : null;
}

export async function listContactRequests(options?: {
  status?: ContactRequest["status"];
  limit?: number;
}): Promise<ContactRequest[]> {
  const supabase = getSupabaseAdmin();
  const limit = options?.limit ?? 1000;

  if (!supabase) {
    return [...memoryStore.values()]
      .filter((r) => !options?.status || r.status === options.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  let query = supabase
    .from("contact_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options?.status) query = query.eq("status", options.status);

  const { data } = await query;
  return (data ?? []).map((row) => rowToContactRequest(row as ContactRequestRow));
}

export class ContactRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Contact request not found: ${id}`);
    this.name = "ContactRequestNotFoundError";
  }
}

/**
 * The only sanctioned way to move a request manually between new ⇄
 * contacted — mirrors changeLeadStatus()/the promotion status functions:
 * a single write-point, never a generic field-by-field update. The
 * parameter type deliberately excludes "converted": that value is only
 * ever written by linkContactRequestToClient() below, together with a
 * real client_id, in the same statement — never by this function, and
 * never manually from the admin UI (ContactRequestActions.tsx's manual
 * toggle only ever offers "new"/"contacted"). This is what makes
 * "converted without a valid client" structurally unreachable through
 * this store, not just a convention callers are trusted to follow.
 */
export async function updateContactRequestStatus(
  id: string,
  status: Exclude<ContactRequest["status"], "converted">
): Promise<ContactRequest> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = memoryStore.get(id);
    if (!existing) throw new ContactRequestNotFoundError(id);
    const updated: ContactRequest = { ...existing, status };
    memoryStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("contact_requests")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new ContactRequestNotFoundError(id);
  }

  return rowToContactRequest(data as ContactRequestRow);
}

/**
 * The ONLY place `status: "converted"` is ever written — always together
 * with `client_id` (and, since 0009_contact_requests_client_was_created.sql,
 * `client_was_created`) in the same statement, so a request can never be
 * observed as "converted" with a null client_id, even transiently. Called
 * exclusively by convertContactRequestToClient() (see
 * src/lib/leads/contactRequestConversion.ts) after a real client already
 * exists — never before. Idempotent at the caller's level: the
 * conversion function short-circuits before ever calling this again for a
 * request that already has a clientId, so this always performs a real,
 * new transition when it's called at all.
 *
 * `clientWasCreated` is always the exact `created` value
 * createClientOrGetExisting() returned for THIS conversion — never
 * inferred, never derived from timestamps/IDs. Requests converted before
 * this column existed keep `client_was_created: null` forever (this
 * function is never called again for an already-converted request), which
 * the admin UI treats as its own honest "unknown" state.
 */
export async function linkContactRequestToClient(
  id: string,
  clientId: string,
  clientWasCreated: boolean
): Promise<ContactRequest> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = memoryStore.get(id);
    if (!existing) throw new ContactRequestNotFoundError(id);
    const updated: ContactRequest = { ...existing, clientId, status: "converted", clientWasCreated };
    memoryStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("contact_requests")
    .update({ client_id: clientId, status: "converted", client_was_created: clientWasCreated })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new ContactRequestNotFoundError(id);
  }

  return rowToContactRequest(data as ContactRequestRow);
}

/**
 * In-memory-fallback-only counterpart to `contact_requests.client_id`'s
 * real `ON DELETE SET NULL` — mirrors
 * conversationStore.ts's `nullifyClientIdInLeadStatusHistoryMemory()`
 * exactly. Production (real Supabase) gets this for free from the FK
 * itself; this exists purely so `deleteClient()`'s in-memory branch (dev
 * without Supabase) doesn't leave a dangling `clientId` that Supabase mode
 * would never produce — same parity concern the conversations version
 * already documents.
 *
 * Deliberately does NOT touch `status` — "converted" is kept forever as
 * the honest historical fact that this request did convert at some point,
 * never silently reverted to "new"/"contacted" just because the client
 * was later deleted. See [id]/page.tsx's "Convertida · Cliente no
 * encontrado" recovery UI, which is what actually surfaces this state to
 * an admin.
 */
export function nullifyClientIdInContactRequestsMemory(clientId: string): void {
  for (const [id, request] of memoryStore) {
    if (request.clientId === clientId) {
      memoryStore.set(id, { ...request, clientId: null });
    }
  }
}
