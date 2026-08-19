import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalArray } from "@/lib/db/memoryStore";
import type { MaintenanceRequest } from "@/lib/db/types";

const memoryStore = getGlobalArray<MaintenanceRequest>("maintenanceRequests");

export async function createMaintenanceRequest(
  input: Omit<MaintenanceRequest, "id" | "createdAt" | "status" | "clientId"> & {
    /** XAYVEN CORE Phase 2 — resolved server-side by the caller (POST
     *  /api/maintenance) via a best-effort normalized-email lookup against
     *  `clients` — NEVER auto-created here or by the caller. Optional,
     *  defaults to `null`: a maintenance request always survives on its
     *  own regardless of whether a match was found. Same discipline as
     *  createContactRequest()'s marketCode/displayCurrency/... params. */
    clientId?: string | null;
  }
): Promise<MaintenanceRequest> {
  const record: MaintenanceRequest = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new",
    clientId: null,
    ...input,
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    memoryStore.unshift(record);
    return record;
  }

  const { error } = await supabase.from("maintenance_requests").insert({
    id: record.id,
    name: record.name,
    email: record.email,
    company: record.company,
    website: record.website,
    need: record.need,
    priority: record.priority,
    message: record.message,
    status: record.status,
    client_id: record.clientId,
  });

  if (error) {
    // Fail open — the visitor still gets a success state, we just keep a
    // local copy so it isn't silently lost.
    memoryStore.unshift(record);
  }

  return record;
}

interface MaintenanceRequestRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  website: string;
  need: string;
  priority: string;
  message: string;
  status: MaintenanceRequest["status"];
  client_id: string | null;
}

function rowToMaintenanceRequest(row: MaintenanceRequestRow): MaintenanceRequest {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    company: row.company,
    website: row.website,
    need: row.need,
    priority: row.priority,
    message: row.message,
    status: row.status,
    clientId: row.client_id,
  };
}

/**
 * XAYVEN CORE Phase 2 — single-record lookup, needed for
 * /admin/maintenance/[id] (this table had zero admin surface before this
 * phase — see the Phase 2 architecture audit). Same shape as
 * getContactRequestById(): Supabase when configured, in-memory fallback
 * otherwise, `null` (never throws) when nothing matches.
 */
export async function getMaintenanceRequestById(id: string): Promise<MaintenanceRequest | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return memoryStore.find((r) => r.id === id) ?? null;
  }

  const { data } = await supabase.from("maintenance_requests").select("*").eq("id", id).single();
  return data ? rowToMaintenanceRequest(data as MaintenanceRequestRow) : null;
}

/**
 * Fase 10 (Analytics V2) — read-only. First time `maintenance_requests` was
 * ever listed anywhere in the codebase; before that, the table only ever
 * received inserts from the public /maintenance form, with zero admin
 * visibility. XAYVEN CORE Phase 2 added a real (nullable) `client_id` and
 * /admin/maintenance on top of this — `project_id` still does not exist on
 * this table and is not invented here; the Phase 2 audit found no evidence
 * a maintenance request needs a direct project relation beyond the client
 * it's already linked to.
 */
export async function listMaintenanceRequests(options?: {
  limit?: number;
}): Promise<MaintenanceRequest[]> {
  const supabase = getSupabaseAdmin();
  const limit = options?.limit ?? 1000;

  if (!supabase) {
    return [...memoryStore].slice(0, limit);
  }

  const { data } = await supabase
    .from("maintenance_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => rowToMaintenanceRequest(row as MaintenanceRequestRow));
}
