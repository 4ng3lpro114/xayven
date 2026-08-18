"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { AdminNavLinks, buildGroups } from "@/components/admin/ui/AdminSidebar";

/**
 * Admin UI Polish (Fase 15) — the sidebar (AdminSidebar) is `hidden` below
 * `lg:`. Before this pass, the entire nav was `hidden sm:flex` with no
 * mobile alternative at all — a real gap, not a style nit. This is a
 * simple full-screen overlay (no new animation dependency), reusing the
 * exact same AdminNavLinks/buildGroups the desktop sidebar uses so the
 * two can never drift into two different navigation structures.
 */
export function AdminMobileNav({ newContactRequestsCount }: { newContactRequestsCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        className="inline-flex items-center justify-center rounded-md border border-border-strong p-2 text-fg-muted hover:text-fg lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-bg lg:hidden">
          <div className="flex h-16 items-center justify-between border-b border-border px-5">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="inline-flex items-center justify-center rounded-md border border-border-strong p-2 text-fg-muted hover:text-fg"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="h-[calc(100vh-4rem)] overflow-y-auto px-5 py-6">
            <AdminNavLinks groups={buildGroups(newContactRequestsCount)} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
