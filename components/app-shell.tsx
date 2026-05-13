"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { useObraModulos } from "@/components/obra-context";
import type { ModuloProjetoChave } from "@/lib/modulos-projeto";

const coreNav = [
  { href: "/dashboard", label: "📊 Painel" },
  { href: "/obras", label: "📁 Obras · mapas" },
  { href: "/obra", label: "🏗️ Nova obra" },
  { href: "/gestao-empresa", label: "🏢 Gestão · empresas" },
  { href: "/admin/companies", label: "🏛️ Empresas · admin" },
] as const;

const moduleNavDefs: {
  module: ModuloProjetoChave;
  href: string;
  label: string;
}[] = [
  { module: "geo", href: "/geo", label: "🧭 GEO" },
  { module: "resistividade", href: "/geofisica", label: "⚡ Geofísica" },
  { module: "spt", href: "/spt", label: "📊 Sondagem SPT" },
  { module: "rotativa", href: "/rotativa", label: "🌀 Sondagem Rotativa" },
  { module: "trado", href: "/trado", label: "🪵 Sondagem Trado" },
  { module: "piezo", href: "/pocos", label: "💧 Poços Monitoramento" },
  { module: "relatorios", href: "/relatorio", label: "📄 Relatórios" },
];

function hrefWithObra(base: string, obraId: number | null) {
  if (obraId == null) return base;
  return `${base}?obraId=${obraId}`;
}

function navLinkClass(active: boolean) {
  return `block rounded-lg p-2 text-sm font-medium transition-colors ${
    active ? "bg-gray-700 text-white" : "text-gray-200 hover:bg-gray-700 hover:text-white"
  }`;
}

async function sair() {
  try {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* limpar cookie mesmo assim */
  }
  window.location.href = "/login";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    selectedObraId,
    obraNome,
    modules,
    modulesLoading,
    setObraContext,
  } = useObraModulos();

  const moduleNav = useMemo(() => {
    if (
      selectedObraId == null ||
      modulesLoading ||
      modules == null
    ) {
      return moduleNavDefs;
    }
    return moduleNavDefs.filter((item) => modules[item.module]);
  }, [selectedObraId, modules, modulesLoading]);

  const navEntries = useMemo(() => {
    const mod = moduleNav.map((item) => ({
      href: hrefWithObra(item.href, selectedObraId),
      label: item.label,
    }));
    const insertAt = 1;
    const out = [...coreNav.slice(0, insertAt), ...mod, ...coreNav.slice(insertAt)];
    return out;
  }, [moduleNav, selectedObraId]);

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-[var(--surface)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-gray-900 p-5 text-white print:hidden md:flex md:flex-col">
        <h1 className="mb-6 text-xl font-bold tracking-tight">SOILSUL</h1>
        <nav className="flex flex-1 flex-col space-y-2 overflow-y-auto">
          {navEntries.map(({ href, label }) => {
            const pathOnly = href.split("?")[0] ?? href;
            const active =
              pathname === pathOnly ||
              (pathOnly !== "/obra" &&
                pathname.startsWith(`${pathOnly}/`));
            return (
              <Link key={`${pathOnly}-${label}`} href={href} className={navLinkClass(active)}>
                {label}
              </Link>
            );
          })}
        </nav>
        {selectedObraId != null && (
          <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2 text-xs text-gray-300">
            <p className="truncate font-medium text-white" title={obraNome ?? ""}>
              {obraNome ?? `Obra #${selectedObraId}`}
            </p>
            <p className="mt-0.5 text-[10px] text-gray-400">
              Menu filtrado por esta obra
            </p>
            <button
              type="button"
              onClick={() => setObraContext(null)}
              className="mt-2 w-full rounded-md border border-gray-600 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-700"
            >
              Limpar obra do menu
            </button>
          </div>
        )}
        <div className="mt-auto border-t border-gray-700 pt-4">
          <button
            type="button"
            onClick={() => void sair()}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            Sair
          </button>
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
        <nav className="flex flex-1 flex-col space-y-2 overflow-y-auto">
          {navEntries.map(({ href, label }) => {
            const pathOnly = href.split("?")[0] ?? href;
            const active =
              pathname === pathOnly ||
              (pathOnly !== "/obra" &&
                pathname.startsWith(`${pathOnly}/`));
            return (
              <Link
                key={`${pathOnly}-${label}`}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={navLinkClass(active)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {selectedObraId != null && (
          <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2 text-xs text-gray-300">
            <p className="truncate font-medium text-white" title={obraNome ?? ""}>
              {obraNome ?? `Obra #${selectedObraId}`}
            </p>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setObraContext(null);
              }}
              className="mt-2 w-full rounded-md border border-gray-600 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-700"
            >
              Limpar obra do menu
            </button>
          </div>
        )}
        <div className="border-t border-gray-700 pt-4">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              void sair();
            }}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            Sair
          </button>
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
