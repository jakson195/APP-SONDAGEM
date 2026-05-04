"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

const nav = [
  { href: "/geo", label: "🧭 GEO" },
  { href: "/geofisica", label: "⚡ Geofísica" },
  { href: "/obras", label: "📁 Obras · mapas" },
  { href: "/obra", label: "🏗️ Nova obra" },
  { href: "/spt", label: "📊 Sondagem SPT" },
  { href: "/rotativa", label: "🌀 Sondagem Rotativa" },
  { href: "/trado", label: "🪵 Sondagem Trado" },
  { href: "/pocos", label: "💧 Poços Monitoramento" },
] as const;

function navLinkClass(active: boolean) {
  return `block rounded-lg p-2 text-sm font-medium transition-colors ${
    active ? "bg-gray-700 text-white" : "text-gray-200 hover:bg-gray-700 hover:text-white"
  }`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-[var(--surface)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-gray-900 p-5 text-white print:hidden md:flex md:flex-col">
        <h1 className="mb-6 text-xl font-bold tracking-tight">SOILSUL</h1>
        <nav className="flex flex-1 flex-col space-y-2">
          {nav.map(({ href, label }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={navLinkClass(active)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-gray-700 pt-4">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            Sair
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity print:hidden md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100%-3rem,18rem)] flex-col bg-gray-900 p-5 text-white shadow-xl transition-transform duration-200 ease-out print:hidden md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold">SOILSUL</h1>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-gray-300 hover:bg-gray-700"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col space-y-2">
          {nav.map(({ href, label }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={navLinkClass(active)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-700 pt-4">
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            Sair
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur-md print:hidden md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[var(--text)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-[var(--text)]">SOILSUL</span>
        </header>
        <main className="flex-1 bg-gray-100 px-4 py-6 dark:bg-[var(--surface)] print:bg-white print:px-2 print:py-2 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
