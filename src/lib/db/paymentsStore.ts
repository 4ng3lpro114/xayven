import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap, getGlobalSet } from "@/lib/db/memoryStore";
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
}

function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
  };
}

export async function createClient(input: {
  name: string;
  email: string;
  phone?: string | null;
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
  };

  if (!supabase) {
    clientsMemory.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ id: draft.id, name: draft.name, email: draft.email, phone: draft.phone })
    .select("*")
    .single();

  if (error || !data) {
    clientsMemory.set(draft.id, draft);
    return draft;
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

  if (error || !data) {
    projectsMemory.set(draft.id, draft);
    return draft;
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

export async function listProjects(): Promise<Project[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...projectsMemory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
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

  if (error || !data) {
    paymentsMemory.set(draft.id, draft);
    return draft;
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
  limit?: number;
}): Promise<Payment[]> {
  const supabase = getSupabaseAdmin();
  const limit = filters?.limit ?? 100;

  if (!supabase) {
    return [...paymentsMemory.values()]
      .filter((p) => !filters?.status || p.status === filters.status)
      .filter((p) => !filters?.projectId || p.projectId === filters.projectId)
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
