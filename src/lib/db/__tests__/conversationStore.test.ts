import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  getOrCreateConversation,
  getConversationById,
  deleteConversation,
} from "@/lib/db/conversationStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// conversationStore.ts transparently uses its in-memory fallback — real
// (if ephemeral) read/write/delete round-trips, not mocks. Same pattern as
// src/lib/leads/__tests__/conversion.test.ts.

async function makeConversation() {
  const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
  return getOrCreateConversation(sessionId, "es");
}

describe("deleteConversation", () => {
  it("borra una conversación existente — deleted: true, y ya no es encontrable después", async () => {
    const conversation = await makeConversation();

    const result = await deleteConversation(conversation.id);

    expect(result.deleted).toBe(true);
    expect(await getConversationById(conversation.id)).toBeNull();
  });

  it("un id inexistente → deleted: false, sin lanzar", async () => {
    const result = await deleteConversation("00000000-0000-0000-0000-000000000000");

    expect(result.deleted).toBe(false);
  });

  it("borrar dos veces la misma conversación → la segunda vez deleted: false", async () => {
    const conversation = await makeConversation();

    const first = await deleteConversation(conversation.id);
    const second = await deleteConversation(conversation.id);

    expect(first.deleted).toBe(true);
    expect(second.deleted).toBe(false);
  });
});
