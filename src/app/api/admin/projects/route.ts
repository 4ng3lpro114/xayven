import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createClient, createProject, getClientById } from "@/lib/db/paymentsStore";

export const runtime = "nodejs";

/**
 * Two shapes, controlled by whether `clientId` is present (Fase 6):
 *   - `clientId` set → create a project for that EXISTING client. No
 *     client fields needed/used.
 *   - `clientId` absent → the original V1 behavior: create a brand-new
 *     client + project together (still the only flow /admin/projects/new
 *     uses when reached without a preselected client — see
 *     src/components/admin/NewProjectForm.tsx).
 * The `.refine` below is the explicit guard for that split — never rely
 * on the FK to reject an inconsistent combination.
 */
const bodySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    clientName: z.string().trim().min(2).max(120).optional(),
    clientEmail: z.string().trim().email().max(200).optional(),
    clientPhone: z.string().trim().max(40).optional().or(z.literal("")),
    projectName: z.string().trim().min(2).max(160),
    totalAmount: z.number().int().positive().max(1_000_000_000),
    currency: z.enum(["COP", "USD"]).default("COP"),
  })
  .refine((data) => Boolean(data.clientId) || Boolean(data.clientName && data.clientEmail), {
    message: "Either clientId, or clientName + clientEmail, is required",
  });

/** Admin-only. Creates a project — for an existing client (`clientId`) or,
 *  same as always, a brand-new client + project together in one step. */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-projects:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
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
    let clientId: string;

    if (parsed.data.clientId) {
      // Explicit existence check — never trust the FK alone to reject a
      // bad id; a stale/tampered/guessed clientId must fail with a clean
      // 404, not a raw constraint-violation error.
      const existingClient = await getClientById(parsed.data.clientId);
      if (!existingClient) {
        return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
      }
      clientId = existingClient.id;
    } else {
      // zod's .refine already guarantees these are present here.
      const client = await createClient({
        name: parsed.data.clientName!,
        email: parsed.data.clientEmail!,
        phone: parsed.data.clientPhone || null,
      });
      clientId = client.id;
    }

    const project = await createProject({
      clientId,
      name: parsed.data.projectName,
      totalAmount: parsed.data.totalAmount,
      currency: parsed.data.currency,
    });

    return NextResponse.json({ ok: true, projectId: project.id });
  } catch (error) {
    console.error("[admin/projects] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "creation_failed" }, { status: 500 });
  }
}
