import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/admin";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { listContactRequests } from "@/lib/db/contactRequestStore";

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
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="flex items-center gap-2">
              <Logo />
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">
                Admin
              </span>
            </Link>
            <nav className="hidden items-center gap-5 text-sm text-fg-muted sm:flex">
              <Link href="/admin" className="transition-colors hover:text-fg">
                Conversaciones
              </Link>
              <Link href="/admin/clients" className="transition-colors hover:text-fg">
                Clientes
              </Link>
              <Link href="/admin/projects" className="transition-colors hover:text-fg">
                Proyectos
              </Link>
              <Link href="/admin/payments" className="transition-colors hover:text-fg">
                Pagos
              </Link>
              <Link href="/admin/statistics" className="transition-colors hover:text-fg">
                Estadísticas
              </Link>
              <Link href="/admin/promotions" className="transition-colors hover:text-fg">
                Promociones
              </Link>
              <Link
                href="/admin/contact-requests"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-fg"
              >
                Solicitudes
                {newContactRequestsCount > 0 && (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-pill bg-accent-500 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
                    {newContactRequestsCount}
                  </span>
                )}
              </Link>
            </nav>
          </div>
          <LogoutButton>
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </LogoutButton>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
    </div>
  );
}
