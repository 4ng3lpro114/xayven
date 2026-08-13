import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/admin";
import { LogoutButton } from "@/components/admin/LogoutButton";

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
