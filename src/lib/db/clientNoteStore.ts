import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalArray } from "@/lib/db/memoryStore";
import type { ClientNote } from "@/lib/db/types";

/**
 * XAYVEN CORE Phase 3.6 — client_notes. Same shape/discipline as
 * maintenanceStore.ts: Supabase when configured, a process-wide in-memory
 * array (getGlobalArray) as the local-dev fallback otherwise — never a
 * silent no-op. Create/list/delete only; no update function exists
 * because no edit capability is in scope (see 0028_client_notes.sql).
 */

const memoryStore = getGlobalArray<ClientNote>("clientNotes");

export async function createClientNote(input: {
  clientId: string;
  body: string;
}): Promise<ClientNote> {
  const record: ClientNote = {
    id: randomUUID(),
    clientId: input.clientId,
    body: input.body,
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    memoryStore.unshift(record);
    return record;
  }

  const { data, error } = await supabase
    .from("client_notes")
    .insert({ id: record.id, client_id: record.clientId, body: record.body })
    .select("*")
    .single();

  // Never fake success — same discipline as recordLeadStatusChange()
  // (conversationStore.ts): a note the admin believes was saved but
  // wasn't would be worse than a visible error.
  if (error || !data) {
    throw new Error(`[clientNotes] createClientNote failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToClientNote(data as ClientNoteRow);
}

/** Newest-first — matches how the "Notas" section and the activity feed
 *  both want to read them. Real server-side filter (`.eq("client_id", ...)`),
 *  not a bulk-fetch-and-filter-in-memory — unlike contact_requests/
 *  maintenance_requests, client_notes has no whole-table admin listing
 *  that would already need the bulk fetch, so there's no reason to pay
 *  for one here. */
export async function listClientNotes(clientId: string): Promise<ClientNote[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return memoryStore
      .filter((n) => n.clientId === clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { data } = await supabase
    .from("client_notes")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => rowToClientNote(row as ClientNoteRow));
}

/**
 * Deletes a note, scoped to BOTH `id` AND `clientId` in the same
 * operation — never a plain `delete by id` followed by a separate
 * ownership check. This is what makes it structurally impossible for
 * `DELETE /api/admin/clients/[id]/notes/[noteId]` to delete (or even
 * distinguish the existence of) a note belonging to a different client
 * than the one in the URL. `deleted: false` covers both "no such note"
 * and "that note belongs to another client" — deliberately not
 * distinguished, same privacy discipline the rest of this project applies
 * (e.g. getClientById returning null never reveals whether a client with
 * a *different* shape of ID would have matched).
 */
export async function deleteClientNote(
  id: string,
  clientId: string
): Promise<{ deleted: boolean }> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const index = memoryStore.findIndex((n) => n.id === id && n.clientId === clientId);
    if (index === -1) return { deleted: false };
    memoryStore.splice(index, 1);
    return { deleted: true };
  }

  const { data, error } = await supabase
    .from("client_notes")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id");

  if (error) {
    throw new Error(`[clientNotes] deleteClientNote failed: ${error.code} ${error.message}`);
  }

  return { deleted: (data?.length ?? 0) > 0 };
}

interface ClientNoteRow {
  id: string;
  created_at: string;
  client_id: string;
  body: string;
}

function rowToClientNote(row: ClientNoteRow): ClientNote {
  return {
    id: row.id,
    clientId: row.client_id,
    body: row.body,
    createdAt: row.created_at,
  };
}
