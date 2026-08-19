import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getClientById } from "@/lib/db/paymentsStore";
import { createClientNote } from "@/lib/db/clientNoteStore";

export const runtime = "nodejs";

/**
 * XAYVEN CORE Phase 3.6 — create a client note. Same "guard, rate-limit,
 * validate, act" shape as POST /api/admin/contact-requests/[id]/status —
 * no new pattern introduced. Only POST is exported (list happens
 * server-side, directly from the client detail page's Server Component
 * via listClientNotes(), same as every other relation on that page —
 * there's no GET here because nothing needs to fetch this over HTTP).
 */
const bodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-clients-notes:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;

  const client = await getClientById(id);
  if (!client) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

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

  try {
    const note = await createClientNote({ clientId: id, body: parsed.data.body });
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    console.error("[admin/clients/notes] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 500 });
  }
}
