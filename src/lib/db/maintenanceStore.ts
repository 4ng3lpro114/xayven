import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalArray } from "@/lib/db/memoryStore";
import type { MaintenanceRequest } from "@/lib/db/types";

const memoryStore = getGlobalArray<MaintenanceRequest>("maintenanceRequests");

export async function createMaintenanceRequest(
  input: Omit<MaintenanceRequest, "id" | "createdAt" | "status">
): Promise<MaintenanceRequest> {
  const record: MaintenanceRequest = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new",
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
  };
}

/**
 * Fase 10 (Analytics V2) — read-only. First time `maintenance_requests` is
 * ever listed anywhere in the codebase; before this, the table only ever
 * received inserts from the public /maintenance form, with zero admin
 * visibility (confirmed in the Fase 10 Etapa 1 audit). Deliberately never
 * relates this to `clients`/`projects` — that link does not exist in the
 * schema (no client_id/project_id column here, see 0001_init.sql) and is
 * not invented here.
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
