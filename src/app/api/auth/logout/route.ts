import { NextResponse } from "next/server";
import { createSupabaseServerClient, isClientAuthConfigured } from "@/lib/auth/supabaseServer";

export const runtime = "nodejs";

/** Client account logout (Fase 2). Destroys the Supabase Auth session —
 *  completely separate from /api/admin/logout, which clears a different
 *  cookie entirely and is untouched by this route. */
export async function POST() {
  if (!isClientAuthConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
