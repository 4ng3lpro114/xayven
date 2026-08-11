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
