import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { confirmManualPayment } from "@/lib/payments/service";

export const runtime = "nodejs";

const bodySchema = z.object({ outcome: z.enum(["APPROVED", "DECLINED"]) });

/**
 * Admin-only manual confirmation for WISE bank transfers (Fase 16) — the
 * only provider without a real integration, so a human has to look at the
 * bank account and say what happened. Routes through the same idempotent
 * core as every other provider (applyProviderStatus), so confirming twice
 * is a safe no-op.
 */
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

  const result = await confirmManualPayment(id, parsed.data.outcome);
  if (!result) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: result.payment.status });
}
