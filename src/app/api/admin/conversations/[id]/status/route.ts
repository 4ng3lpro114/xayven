import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getConversationById, saveConversation } from "@/lib/db/conversationStore";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: z.enum(["exploring", "interested", "hot", "client", "support"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const conversation = await getConversationById(id);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  conversation.leadStatus = parsed.data.status;
  const saved = await saveConversation(conversation);

  return NextResponse.json({ ok: true, leadStatus: saved.leadStatus });
}
