"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ children }: { children: ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
    >
      {children}
    </button>
  );
}
