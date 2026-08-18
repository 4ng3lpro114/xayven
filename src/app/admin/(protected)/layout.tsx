import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/admin";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { AdminSidebar } from "@/components/admin/ui/AdminSidebar";
import { AdminMobileNav } from "@/components/admin/ui/AdminMobileNav";

/**
 * Admin UI Polish (Fase 13/15) — sidebar + mobile overlay replacing the
 * single-row top nav (10 flat links, `hidden sm:flex` with zero mobile
 * fallback). Auth check and the `newContactRequestsCount` fetch are
 * untouched — same cookie, same verifySessionToken(), same bulk-fetch
 * count. Every route this admin has ever linked to is still linked from
 * exactly the same href, only the visual organization changed.
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!verifySessionToken(token)) {
    redirect("/admin/login");
  }

  // Same "bulk fetch + in-memory reduce" the rest of this admin already
  // uses for aggregate counts (e.g. countByLeadStatus) — there's no
  // persistent "read/unread" concept anywhere in this codebase, so this
  // is a recount on every render, not a stored flag.
  const newContactRequestsCount = (await listContactRequests({ status: "new", limit: 1000 })).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <AdminMobileNav newContactRequestsCount={newContactRequestsCount} />
            <Link href="/admin" className="flex items-center gap-2">
              <Logo />
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">Admin</span>
            </Link>
          </div>
          <LogoutButton>
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </LogoutButton>
        </div>
      </header>

      <div className="mx-auto flex max-w-[100rem] items-start gap-8 px-5 py-8">
        <aside className="sticky top-24 hidden w-56 shrink-0 lg:block">
          <AdminSidebar newContactRequestsCount={newContactRequestsCount} />
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
