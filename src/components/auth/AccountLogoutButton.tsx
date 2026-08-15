"use client";

import { useRouter } from "next/navigation";

/** Client account logout — mirrors admin's LogoutButton.tsx exactly, but
 *  hits /api/auth/logout (Supabase Auth session), never /api/admin/logout. */
export function AccountLogoutButton({ label, loginHref }: { label: string; loginHref: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(loginHref);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
    >
      {label}
    </button>
  );
}
