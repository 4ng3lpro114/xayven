import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createClient, createProject } from "@/lib/db/paymentsStore";

export const runtime = "nodejs";

const bodySchema = z.object({
  clientName: z.string().trim().min(2).max(120),
  clientEmail: z.string().trim().email().max(200),
  clientPhone: z.string().trim().max(40).optional().or(z.literal("")),
  projectName: z.string().trim().min(2).max(160),
  totalAmount: z.number().int().positive().max(1_000_000_000),
  currency: z.enum(["COP", "USD"]).default("COP"),
});

/** Admin-only. Creates a client + project in one step (V1 doesn't have a
 *  separate "pick an existing client" flow — see docs/payments.md). */
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

  const client = await createClient({
    name: parsed.data.clientName,
    email: parsed.data.clientEmail,
    phone: parsed.data.clientPhone || null,
  });

  const project = await createProject({
    clientId: client.id,
    name: parsed.data.projectName,
    totalAmount: parsed.data.totalAmount,
    currency: parsed.data.currency,
  });

  return NextResponse.json({ ok: true, projectId: project.id });
}
