import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap, getGlobalSet } from "@/lib/db/memoryStore";
import { nullifyClientIdInLeadStatusHistoryMemory } from "@/lib/db/conversationStore";
import { nullifyClientIdInContactRequestsMemory } from "@/lib/db/contactRequestStore";
import type {
  Client,
  Payment,
  PaymentProviderName,
  PaymentStatus,
  PaymentType,
  Project,
  ProjectStatus,
  WebhookEventRecord,
} from "@/lib/payments/types";

/**
 * Payments persistence — same shape as conversationStore.ts: Supabase when
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set, an in-memory fallback
 * otherwise (fine for local sandbox testing, NOT for production — see
 * docs/payments.md).
 */

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

const clientsMemory = getGlobalMap<string, Client>("payments.clients");
const projectsMemory = getGlobalMap<string, Project>("payments.projects");
const paymentsMemory = getGlobalMap<string, Payment>("payments.payments");
const webhookEventsMemory = getGlobalSet<string>("payments.webhookEvents"); // dedup_key set

function nowIso() {
  return new Date().toISOString();
}

function generatePortalToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  is_commercial: boolean;
}

function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company ?? null,
    isCommercial: row.is_commercial,
  };
}

export async function createClient(input: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  /** Defaults to `true` — every pre-existing caller (Lead → Cliente,
   *  Solicitud → Cliente, direct client+project creation in
   *  /api/admin/projects) keeps creating real commercial clients with zero
   *  call-site changes. Only linkAccountToClient() (account registration)
   *  passes `false` explicitly — see 0012_clients_is_commercial.sql. */
  isCommercial?: boolean;
}): Promise<Client> {
  const supabase = getSupabaseAdmin();
  const timestamp = nowIso();
  const draft: Client = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    company: input.company ?? null,
    isCommercial: input.isCommercial ?? true,
  };

  if (!supabase) {
    clientsMemory.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      id: draft.id,
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      company: draft.company,
      is_commercial: draft.isCommercial,
    })
    .select("*")
    .single();

  // Supabase IS configured here — a write failure must never be papered
  // over with a fabricated in-memory client, or a later lookup (which only
  // ever queries Supabase once it's configured) would silently never find
  // it. Same discipline as deleteClient/deleteProject/
  // createClientOrGetExisting elsewhere in this file. The `!supabase`
  // branch above remains the only legitimate place this function falls
  // back to memory.
  if (error || !data) {
    throw new Error(
      `[clients] createClient failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }
  return rowToClient(data as ClientRow);
}

export async function getClientById(id: string): Promise<Client | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return clientsMemory.get(id) ?? null;

  const { data } = await supabase.from("clients").select("*").eq("id", id).single();
  return data ? rowToClient(data as ClientRow) : null;
}

export async function listClients(): Promise<Client[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...clientsMemory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
  return (data ?? []).map((row) => rowToClient(row as ClientRow));
}

/**
 * Thrown by deleteClient() specifically when Postgres rejects the DELETE
 * with a foreign-key violation (`error.code === "23503"`) — distinguished
 * from any other Supabase failure so the caller (DELETE
 * /api/admin/clients/[id]/route.ts) can map it to a controlled 409
 * instead of a generic 500, without ever forwarding the raw Postgres
 * message to the client. Fase 5C-fix (auditoría de eliminación de
 * proyectos): this is the safety net for the rare case where the
 * application-level classifyClientImportance() check said deletion was
 * safe but a project/payment was created for this client in the tiny
 * window between that check and this real DELETE (race condition) — the
 * `ON DELETE RESTRICT` FK is the last line of defense either way.
 */
export class ClientDeleteConflictError extends Error {
  readonly pgCode: string;

  constructor(pgCode: string, message: string) {
    super(message);
    this.name = "ClientDeleteConflictError";
    this.pgCode = pgCode;
  }
}

/**
 * Real, permanent deletion (Fase 5C, Etapa 10) — same discipline as
 * deleteConversation() in conversationStore.ts: never falls back to
 * memory on a Supabase error, since a fabricated success would be
 * dangerous here. The actual protection decision (is this client safe to
 * delete at all) is NOT this function's job — it lives in
 * classifyClientImportance() and is enforced by the caller (see
 * DELETE /api/admin/clients/[id]/route.ts) BEFORE this is ever invoked.
 * `projects.client_id`/`payments.client_id` are also `ON DELETE
 * RESTRICT` at the database level (see 0002_payments.sql) — a second,
 * independent safety net if the application-level check were ever wrong
 * (see ClientDeleteConflictError above).
 */
export async function deleteClient(id: string): Promise<{ deleted: boolean }> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const deleted = clientsMemory.delete(id);
    // Mirrors lead_status_history.client_id's real ON DELETE SET NULL
    // (Fase 9C) for the in-memory fallback only — production gets this
    // for free from the FK itself. contact_requests.client_id (Solicitud →
    // Cliente) needs the exact same treatment, for the exact same reason —
    // see nullifyClientIdInContactRequestsMemory()'s doc comment.
    if (deleted) {
      nullifyClientIdInLeadStatusHistoryMemory(id);
      nullifyClientIdInContactRequestsMemory(id);
    }
    return { deleted };
  }

  const { error, count } = await supabase.from("clients").delete({ count: "exact" }).eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new ClientDeleteConflictError(
        error.code,
        `[clients] deleteClient blocked by FK: ${error.message ?? ""}`
      );
    }
    throw new Error(
      `[clients] deleteClient failed: ${error.code ?? "unknown"} ${error.message ?? ""}`
    );
  }

  return { deleted: (count ?? 0) > 0 };
}

/**
 * XAYVEN CORE Phase 3.0 (Email Lookup Hardening) — escapes the three
 * characters Postgres's LIKE/ILIKE grammar treats specially so a value
 * passed to `.ilike()` is matched LITERALLY, never as a pattern:
 *   `%` — matches any sequence of characters
 *   `_` — matches any single character
 *   `\` — the escape character itself (must be escaped first, or the
 *         backslashes this function introduces for `%`/`_` would
 *         themselves get mangled by a later pass)
 *
 * Order matters and is deliberate: backslash MUST be escaped before `%`/`_`
 * — escaping it after would double the backslashes this function just
 * introduced for `%`/`_`, corrupting the pattern instead of fixing it.
 *
 * Confirmed necessary against real production data (Phase 3.0 audit): a
 * submitted email like `echeverriangel_8@gmail.com` — a DIFFERENT, non-
 * existent address — previously matched the real client
 * `echeverriangel98@gmail.com` under unescaped `.ilike()`, because `_` is
 * a single-character wildcard, not a literal underscore. Escaping is the
 * fix; the case-insensitivity `.ilike()` provides is still needed and
 * kept — see getClientByNormalizedEmail() below, which still relies on it
 * because no write path in this codebase currently guarantees
 * `clients.email` is stored already-lowercased (confirmed in the Phase
 * 3.0 audit: every write path is 🟡 at best).
 *
 * Pure function — no I/O, safe to unit-test in complete isolation from
 * Supabase (see paymentsStore.escapeIlike.test.ts).
 */
export function escapeIlikeSpecialChars(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Case/whitespace-insensitive client lookup by email — backs the lead →
 * client conversion flow's find-before-create step (see
 * src/lib/leads/conversion.ts). `normalizedEmail` must already be
 * `.trim().toLowerCase()`'d by the caller; this function does not
 * normalize it again, to keep the normalization rule defined in exactly
 * one place.
 */
export async function getClientByNormalizedEmail(normalizedEmail: string): Promise<Client | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      [...clientsMemory.values()].find((c) => c.email.trim().toLowerCase() === normalizedEmail) ?? null
    );
  }

  // `email` has no leading/trailing whitespace once written through this
  // module (see createClientOrGetExisting below), so an escaped ILIKE
  // match against the already-normalized input is a correct
  // case-insensitive EXACT equality check — never a pattern match. The
  // escaping (Phase 3.0) is what makes "never a pattern match" actually
  // true: `.ilike()` alone would treat a literal `%`/`_`/`\` in
  // `normalizedEmail` as a wildcard/escape character, not as the literal
  // character it is — see escapeIlikeSpecialChars() above for the
  // confirmed-in-production false-positive this fixes.
  const { data } = await supabase
    .from("clients")
    .select("*")
    .ilike("email", escapeIlikeSpecialChars(normalizedEmail))
    .maybeSingle();
  return data ? rowToClient(data as ClientRow) : null;
}

/**
 * Insert-or-recover, specifically for the lead → client conversion flow.
 * Deliberately does NOT share createClient()'s "any Supabase error falls
 * back to memory" behavior above: falling back silently here would hide a
 * real unique-constraint conflict (clients_email_normalized_unique_idx,
 * see supabase/migrations/0003_lead_to_client.sql) behind a fabricated
 * in-memory client, which defeats the entire point of detecting duplicates
 * safely. Instead:
 *   - a 23505 (unique_violation) is treated as "someone else already
 *     created this client" and recovered by re-reading it — the same
 *     recover-don't-duplicate pattern already used by
 *     recordWebhookEventIfNew for payment_webhook_events;
 *   - any OTHER error is a real failure and is thrown, never swallowed.
 */
export async function createClientOrGetExisting(input: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  /** Same meaning/default as createClient()'s — only used on the
   *  newly-created branch. When an existing client is found instead, its
   *  own `isCommercial` is returned untouched (never forced up or down
   *  here) — promoting a found account-only client to commercial is a
   *  deliberate decision made by the CALLER (see
   *  markClientAsCommercial(), used by conversion.ts/
   *  contactRequestConversion.ts right after this call), never implicit
   *  in this find-or-create primitive. */
  isCommercial?: boolean;
}): Promise<{ client: Client; created: boolean }> {
  const supabase = getSupabaseAdmin();
  const timestamp = nowIso();
  const normalizedEmail = input.email.trim().toLowerCase();
  const draft: Client = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    company: input.company ?? null,
    isCommercial: input.isCommercial ?? true,
  };

  if (!supabase) {
    // In-memory mode has no unique constraint to race against — a linear
    // scan is enough to stay consistent with the rest of this module's
    // memory-mode behavior.
    const existing = [...clientsMemory.values()].find(
      (c) => c.email.trim().toLowerCase() === normalizedEmail
    );
    if (existing) return { client: existing, created: false };
    clientsMemory.set(draft.id, draft);
    return { client: draft, created: true };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      id: draft.id,
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      company: draft.company,
      is_commercial: draft.isCommercial,
    })
    .select("*")
    .single();

  if (!error && data) {
    return { client: rowToClient(data as ClientRow), created: true };
  }

  if (error?.code === "23505") {
    const existing = await getClientByNormalizedEmail(normalizedEmail);
    if (existing) return { client: existing, created: false };
  }

  // A real, unhidden failure — never fabricate a client here.
  throw new Error(
    `[leads] createClientOrGetExisting failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
  );
}

/**
 * Single-purpose promotion writer — sets `is_commercial = true`, nothing
 * else. Idempotent: calling it on an already-commercial client is a
 * harmless UPDATE (same value written again), matching setProfileClientId's
 * "converges on repeat calls" discipline (profilesStore.ts).
 *
 * The only legitimate callers are real commercial-conversion moments:
 * convertConversationToClient() (Lead → Cliente), promoting a
 * previously-account-only client it found by email;
 * convertContactRequestToClient() (Solicitud → Cliente), same reason;
 * POST /api/admin/clients/[id]/promote (the "Agregar cliente" button, for
 * an account-only client with no lead/solicitud path at all); and
 * POST /api/admin/projects, because creating a real project for an
 * account-only client is itself a commercial event — see that route's
 * comment. Deliberately never called from linkAccountToClient() —
 * registering a XAYVEN account must never, by itself, promote anyone.
 *
 * Never falls back to memory on a real Supabase error — same discipline
 * as deleteClient()/createClientOrGetExisting() above: a fabricated
 * success here would let a client look promoted in the UI when it wasn't
 * actually written.
 */
export async function markClientAsCommercial(id: string): Promise<Client> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = clientsMemory.get(id);
    if (!existing) {
      throw new Error(`[clients] markClientAsCommercial failed: client ${id} not found`);
    }
    const updated: Client = { ...existing, isCommercial: true, updatedAt: nowIso() };
    clientsMemory.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("clients")
    .update({ is_commercial: true })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[clients] markClientAsCommercial failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }
  return rowToClient(data as ClientRow);
}

/**
 * Exact mirror of markClientAsCommercial() above — sets `is_commercial =
 * false`, nothing else. Idempotent, same "no memory fallback on a real
 * Supabase error" discipline.
 *
 * The only legitimate caller is DELETE /api/admin/clients/[id]/route.ts,
 * and only for a client that has a real XAYVEN account linked
 * (profiles.client_id points at it): "Eliminar cliente" for that person
 * can never be a physical DELETE, because that would sever the account's
 * only link to any client row and make it structurally impossible to ever
 * show "Cuenta XAYVEN: Activa / Cliente: Sin cliente" for them again
 * without creating a second row (which this project never does). This is
 * the exact reverse of what "Agregar cliente" does — it un-does the
 * promotion, on the SAME row, keeping the account link, conversations,
 * and contact_requests intact (a physical DELETE would instead null out
 * conversations.client_id/lead_status_history.client_id/
 * contact_requests.client_id via their ON DELETE SET NULL FKs — this
 * UPDATE touches none of that). A client with NO linked account keeps
 * being physically deleted exactly as before — see the route for that
 * branch.
 */
export async function markClientAsNonCommercial(id: string): Promise<Client> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = clientsMemory.get(id);
    if (!existing) {
      throw new Error(`[clients] markClientAsNonCommercial failed: client ${id} not found`);
    }
    const updated: Client = { ...existing, isCommercial: false, updatedAt: nowIso() };
    clientsMemory.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("clients")
    .update({ is_commercial: false })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[clients] markClientAsNonCommercial failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }
  return rowToClient(data as ClientRow);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  name: string;
  status: string;
  currency: string;
  total_amount: number;
  paid_amount: number;
  portal_token: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientId: row.client_id,
    name: row.name,
    status: row.status as ProjectStatus,
    currency: row.currency,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    portalToken: row.portal_token,
  };
}

export async function createProject(input: {
  clientId: string;
  name: string;
  totalAmount: number;
  currency?: string;
}): Promise<Project> {
  const supabase = getSupabaseAdmin();
  const timestamp = nowIso();
  const draft: Project = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    clientId: input.clientId,
    name: input.name,
    status: "awaiting_payment",
    currency: input.currency ?? "COP",
    totalAmount: input.totalAmount,
    paidAmount: 0,
    portalToken: generatePortalToken(),
  };

  if (!supabase) {
    projectsMemory.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      id: draft.id,
      client_id: draft.clientId,
      name: draft.name,
      status: draft.status,
      currency: draft.currency,
      total_amount: draft.totalAmount,
      paid_amount: draft.paidAmount,
      portal_token: draft.portalToken,
    })
    .select("*")
    .single();

  // Supabase IS configured here — see the matching comment in createClient()
  // above for why a write failure must throw, never fabricate an in-memory
  // project. The `!supabase` branch above remains the only legitimate
  // fallback.
  if (error || !data) {
    throw new Error(
      `[projects] createProject failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }
  return rowToProject(data as ProjectRow);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return projectsMemory.get(id) ?? null;

  const { data } = await supabase.from("projects").select("*").eq("id", id).single();
  return data ? rowToProject(data as ProjectRow) : null;
}

export async function getProjectByPortalToken(token: string): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...projectsMemory.values()].find((p) => p.portalToken === token) ?? null;
  }

  const { data } = await supabase.from("projects").select("*").eq("portal_token", token).single();
  return data ? rowToProject(data as ProjectRow) : null;
}

export async function listProjects(filters?: { clientId?: string }): Promise<Project[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...projectsMemory.values()]
      .filter((p) => !filters?.clientId || p.clientId === filters.clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
  if (filters?.clientId) query = query.eq("client_id", filters.clientId);

  const { data } = await query;
  return (data ?? []).map((row) => rowToProject(row as ProjectRow));
}

/**
 * Sets the project's paid_amount to an explicit value (the caller — see
 * src/lib/payments/service.ts — computes it from current state plus exactly
 * one approved payment, guarded by the webhook idempotency ledger so this
 * is never invoked twice for the same transition).
 */
export async function setProjectPaidAmount(
  projectId: string,
  paidAmount: number,
  status?: ProjectStatus
): Promise<Project | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const project = projectsMemory.get(projectId);
    if (!project) return null;
    const updated: Project = {
      ...project,
      paidAmount,
      status: status ?? project.status,
      updatedAt: nowIso(),
    };
    projectsMemory.set(projectId, updated);
    return updated;
  }

  const patch: Record<string, unknown> = { paid_amount: paidAmount };
  if (status) patch.status = status;

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select("*")
    .single();

  if (error || !data) return null;
  return rowToProject(data as ProjectRow);
}

/**
 * Thrown by deleteProject() specifically when Postgres rejects the DELETE
 * with a foreign-key violation (`error.code === "23503"`) — distinguished
 * from any other Supabase failure so the caller (DELETE
 * /api/admin/projects/[id]/route.ts) can map it to a controlled 409
 * instead of a generic 500, without ever forwarding the raw Postgres
 * message to the client. Fase 8B (implementación de eliminación segura de
 * proyectos): same pattern as ClientDeleteConflictError — this is the
 * safety net for the rare case where getProjectProtectionReason() said
 * deletion was safe but a payment was created for this project in the
 * tiny window between that check and this real DELETE (race condition) —
 * the `ON DELETE RESTRICT` FK is the last line of defense either way.
 */
export class ProjectDeleteConflictError extends Error {
  readonly pgCode: string;

  constructor(pgCode: string, message: string) {
    super(message);
    this.name = "ProjectDeleteConflictError";
    this.pgCode = pgCode;
  }
}

/**
 * Real, permanent deletion (Fase 8B) — same discipline as deleteClient()/
 * deleteConversation(): never falls back to memory on a Supabase error,
 * since a fabricated success would be dangerous here. The actual
 * protection decision (is this project safe to delete at all) is NOT this
 * function's job — it lives in getProjectProtectionReason() and is
 * enforced by the caller (see DELETE /api/admin/projects/[id]/route.ts)
 * BEFORE this is ever invoked. `payments.project_id` is also `ON DELETE
 * RESTRICT` at the database level (see 0002_payments.sql) — a second,
 * independent safety net if the application-level check were ever wrong
 * (see ProjectDeleteConflictError above).
 */
export async function deleteProject(id: string): Promise<{ deleted: boolean }> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { deleted: projectsMemory.delete(id) };
  }

  const { error, count } = await supabase.from("projects").delete({ count: "exact" }).eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new ProjectDeleteConflictError(
        error.code,
        `[projects] deleteProject blocked by FK: ${error.message ?? ""}`
      );
    }
    throw new Error(
      `[projects] deleteProject failed: ${error.code ?? "unknown"} ${error.message ?? ""}`
    );
  }

  return { deleted: (count ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

interface PaymentRow {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  client_id: string;
  provider: string;
  provider_transaction_id: string | null;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  payment_type: string;
  metadata: Record<string, unknown>;
}

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectId: row.project_id,
    clientId: row.client_id,
    provider: row.provider as PaymentProviderName,
    providerTransactionId: row.provider_transaction_id,
    reference: row.reference,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentStatus,
    paymentType: row.payment_type as PaymentType,
    metadata: row.metadata ?? {},
  };
}

export async function createPayment(input: {
  projectId: string;
  clientId: string;
  provider: PaymentProviderName;
  reference: string;
  amount: number;
  currency: string;
  paymentType: PaymentType;
  metadata?: Record<string, unknown>;
}): Promise<Payment> {
  const supabase = getSupabaseAdmin();
  const timestamp = nowIso();
  const draft: Payment = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: input.projectId,
    clientId: input.clientId,
    provider: input.provider,
    providerTransactionId: null,
    reference: input.reference,
    amount: input.amount,
    currency: input.currency,
    status: "PENDING",
    paymentType: input.paymentType,
    metadata: input.metadata ?? {},
  };

  if (!supabase) {
    paymentsMemory.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("payments")
    .insert({
      id: draft.id,
      project_id: draft.projectId,
      client_id: draft.clientId,
      provider: draft.provider,
      reference: draft.reference,
      amount: draft.amount,
      currency: draft.currency,
      status: draft.status,
      payment_type: draft.paymentType,
      metadata: draft.metadata,
    })
    .select("*")
    .single();

  // Supabase IS configured here — see the matching comment in createClient()
  // above. This one matters most: a fabricated in-memory Payment would be
  // invisible to getPaymentByReference/getPaymentByProviderTransactionId
  // (both Supabase-only once configured), so a real provider confirmation
  // for it could never be matched back — throwing here is what prevents
  // that. The `!supabase` branch above remains the only legitimate fallback.
  if (error || !data) {
    throw new Error(
      `[payments] createPayment failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }
  return rowToPayment(data as PaymentRow);
}

export async function getPaymentById(id: string): Promise<Payment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return paymentsMemory.get(id) ?? null;

  const { data } = await supabase.from("payments").select("*").eq("id", id).single();
  return data ? rowToPayment(data as PaymentRow) : null;
}

export async function getPaymentByReference(reference: string): Promise<Payment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...paymentsMemory.values()].find((p) => p.reference === reference) ?? null;
  }

  const { data } = await supabase.from("payments").select("*").eq("reference", reference).single();
  return data ? rowToPayment(data as PaymentRow) : null;
}

export async function getPaymentByProviderTransactionId(
  provider: PaymentProviderName,
  providerTransactionId: string
): Promise<Payment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      [...paymentsMemory.values()].find(
        (p) => p.provider === provider && p.providerTransactionId === providerTransactionId
      ) ?? null
    );
  }

  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("provider", provider)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle();
  return data ? rowToPayment(data as PaymentRow) : null;
}

/** Most recent still-PENDING payment for this project+type+provider, if
 *  any — lets the portal reuse an in-flight checkout instead of creating a
 *  fresh reference every time the client reloads the pay page. */
export async function getPendingPayment(
  projectId: string,
  paymentType: PaymentType,
  provider: PaymentProviderName
): Promise<Payment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      [...paymentsMemory.values()]
        .filter(
          (p) =>
            p.projectId === projectId &&
            p.paymentType === paymentType &&
            p.provider === provider &&
            p.status === "PENDING"
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }

  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("project_id", projectId)
    .eq("payment_type", paymentType)
    .eq("provider", provider)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToPayment(data as PaymentRow) : null;
}

export async function updatePayment(
  id: string,
  patch: Partial<Pick<Payment, "status" | "providerTransactionId" | "metadata">>
): Promise<Payment | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = paymentsMemory.get(id);
    if (!existing) return null;
    const updated: Payment = { ...existing, ...patch, updatedAt: nowIso() };
    paymentsMemory.set(id, updated);
    return updated;
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.status) dbPatch.status = patch.status;
  if (patch.providerTransactionId !== undefined) {
    dbPatch.provider_transaction_id = patch.providerTransactionId;
  }
  if (patch.metadata) dbPatch.metadata = patch.metadata;

  const { data, error } = await supabase
    .from("payments")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return null;
  return rowToPayment(data as PaymentRow);
}

export async function listPayments(filters?: {
  status?: PaymentStatus;
  projectId?: string;
  clientId?: string;
  limit?: number;
}): Promise<Payment[]> {
  const supabase = getSupabaseAdmin();
  const limit = filters?.limit ?? 100;

  if (!supabase) {
    return [...paymentsMemory.values()]
      .filter((p) => !filters?.status || p.status === filters.status)
      .filter((p) => !filters?.projectId || p.projectId === filters.projectId)
      .filter((p) => !filters?.clientId || p.clientId === filters.clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  let query = supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);
  if (filters?.clientId) query = query.eq("client_id", filters.clientId);

  const { data } = await query;
  return (data ?? []).map((row) => rowToPayment(row as PaymentRow));
}

// ---------------------------------------------------------------------------
// Webhook idempotency ledger
// ---------------------------------------------------------------------------

/**
 * Attempts to record a webhook delivery. Returns `isNew: false` if this
 * exact (provider, transaction, status) transition was already recorded —
 * the caller must treat that as a no-op, not reprocess it. See
 * src/lib/payments/service.ts.
 */
export async function recordWebhookEventIfNew(input: {
  provider: PaymentProviderName;
  providerTransactionId: string;
  status: string;
  payload: Record<string, unknown>;
}): Promise<{ isNew: boolean; record: WebhookEventRecord }> {
  const dedupKey = `${input.provider}:${input.providerTransactionId}:${input.status}`;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const isNew = !webhookEventsMemory.has(dedupKey);
    if (isNew) webhookEventsMemory.add(dedupKey);
    return {
      isNew,
      record: {
        id: dedupKey,
        receivedAt: nowIso(),
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        status: input.status,
        dedupKey,
      },
    };
  }

  const { data, error } = await supabase
    .from("payment_webhook_events")
    .insert({
      provider: input.provider,
      provider_transaction_id: input.providerTransactionId,
      status: input.status,
      dedup_key: dedupKey,
      payload: input.payload,
    })
    .select("*")
    .single();

  if (error) {
    // Postgres unique_violation — this exact transition was already recorded.
    if (error.code === "23505") {
      return {
        isNew: false,
        record: {
          id: dedupKey,
          receivedAt: nowIso(),
          provider: input.provider,
          providerTransactionId: input.providerTransactionId,
          status: input.status,
          dedupKey,
        },
      };
    }
    // Any other infra error: fail open (don't block legitimate processing
    // just because the audit ledger write failed) but the caller should log.
    return {
      isNew: true,
      record: {
        id: dedupKey,
        receivedAt: nowIso(),
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        status: input.status,
        dedupKey,
      },
    };
  }

  return {
    isNew: true,
    record: {
      id: data.id as string,
      receivedAt: data.received_at as string,
      provider: input.provider,
      providerTransactionId: input.providerTransactionId,
      status: input.status,
      dedupKey,
    },
  };
}
