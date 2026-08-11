import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getProjectById } from "@/lib/db/paymentsStore";
import { createMaintenanceCharge, PaymentAuthorizationError } from "@/lib/payments/service";
import { isPayPalCurrencySupported } from "@/lib/payments/providers/paypal";

export const runtime = "nodejs";

const bodySchema = z.object({
  projectId: z.string().uuid(),
  amount: z.number().int().positive().max(1_000_000_000),
  provider: z.enum(["WOMPI", "PAYPAL", "WISE"]),
});

/** Admin-only. The amount and provider are set here by an authenticated
 *  admin — never by the client (see Fase 17). */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-maintenance:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
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

  const project = await getProjectById(parsed.data.projectId);
  if (!project) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (parsed.data.provider === "PAYPAL" && !isPayPalCurrencySupported(project.currency)) {
    return NextResponse.json({ ok: false, error: "paypal_currency_not_supported" }, { status: 400 });
  }

  try {
    const payment = await createMaintenanceCharge({
      project,
      clientId: project.clientId,
      amount: parsed.data.amount,
      provider: parsed.data.provider,
    });
    return NextResponse.json({ ok: true, paymentId: payment.id });
  } catch (error) {
    if (error instanceof PaymentAuthorizationError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 400 });
    }
    throw error;
  }
}
