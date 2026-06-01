"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { useObraModulos } from "@/components/obra-context";
import { AppSidebarNav } from "@/components/sidebar/app-sidebar-nav";
import { useModuleNav } from "@/hooks/use-module-nav";

const coreNav = [
  { href: "/dashboard", label: "📊 Painel" },
  { href: "/hidrologia/chuvas-sc", label: "🌧️ Chuvas SC (HidroChu)" },
  { href: "/hidrologia/chuvas-br", label: "🇧🇷 HidroBrasil (ANA + IA)" },
  { href: "/obras", label: "📁 Obras · mapas" },
  { href: "/obra", label: "🏗️ Nova obra" },
  { href: "/gestao-empresa", label: "🏢 Gestão · empresas" },
  { href: "/admin/companies", label: "🏛️ Empresas · admin" },
] as const;

function hrefWithObra(base: string, obraId: number | null) {
  if (obraId == null) return base;
  return `${base}?obraId=${obraId}`;
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

function ObraContextCard({
  selectedObraId,
  obraNome,
  onClear,
}: {
  selectedObraId: number;
  obraNome: string | null;
  onClear: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2 text-xs text-gray-300">
      <p className="truncate font-medium text-white" title={obraNome ?? ""}>
        {obraNome ?? `Obra #${selectedObraId}`}
      </p>
      <p className="mt-0.5 text-[10px] text-gray-400">Menu filtrado por esta obra</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 w-full rounded-md border border-gray-600 py-1 text-[11px] font-medium text-gray-200 transition-colors hover:bg-gray-700"
      >
        Limpar obra do menu
      </button>
    </div>
  );
}

function LogoutButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        void sair();
      }}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gray-300 transition-colors duration-200 hover:bg-gray-700 hover:text-white"
    >
      <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
      Sair
    </button>
  );
}

function GlobalQuickActions({
  selectedObraId,
  setObraContext,
  pathname,
  search,
}: {
  selectedObraId: number | null;
  setObraContext: (id: number | null) => void;
  pathname: string;
  search: string;
}) {
  const [obras, setObras] = useState<Array<{ id: number; nome: string }>>([]);
  const [loadingObras, setLoadingObras] = useState(false);
  const obraHref = hrefWithObra("/obra", selectedObraId);
  const empresaHref = hrefWithObra("/gestao-empresa", selectedObraId);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingObras(true);
    void (async () => {
      try {
        const response = await fetch(apiUrl("/api/obra"), { credentials: "include" });
        const data = (await response.json().catch(() => [])) as
          | Array<{ id: number; nome: string }>
          | { error?: string };
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data)) {
          setObras([]);
          return;
        }
        setObras(data.map((item) => ({ id: item.id, nome: item.nome })));
      } catch {
        if (!cancelled) setObras([]);
      } finally {
        if (!cancelled) setLoadingObras(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = useCallback(async (includeObra: boolean) => {
    const url = new URL(window.location.origin + pathname);
    const params = new URLSearchParams(search);
    if (includeObra && selectedObraId != null) {
      params.set("obraId", String(selectedObraId));
    }
    url.search = params.toString();
    await navigator.clipboard.writeText(url.toString());
    setCopyMsg(includeObra ? "Weblink da aba + obra copiado." : "Weblink da aba copiado.");
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, [pathname, search, selectedObraId]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <label className="flex min-w-[18rem] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
        <span className="text-xs font-medium text-[var(--muted)]">Obra (projeto)</span>
        <select
          value={selectedObraId ?? ""}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!event.target.value || !Number.isFinite(next)) {
              setObraContext(null);
              return;
            }
            setObraContext(next);
          }}
          disabled={loadingObras}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)]"
        >
          <option value="">— Escolher obra —</option>
          {obras.map((obra) => (
            <option key={obra.id} value={obra.id}>
              {obra.nome}
            </option>
          ))}
        </select>
      </label>
      <Link
        href={empresaHref}
        className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-teal-500/50 hover:bg-teal-500/10"
      >
        Cadastrar empresa
      </Link>
      <Link
        href={obraHref}
        className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-500"
      >
        Criar obra
      </Link>
      <button
        type="button"
        onClick={() => void copyLink(false)}
        className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-blue-500/50 hover:bg-blue-500/10"
      >
        Copiar weblink da aba
      </button>
      <button
        type="button"
        onClick={() => void copyLink(true)}
        disabled={selectedObraId == null}
        className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-indigo-500/50 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Copiar weblink aba + projeto
      </button>
      {copyMsg && <span className="text-xs text-[var(--muted)]">{copyMsg}</span>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    selectedObraId,
    obraNome,
    modules,
    modulesLoading,
    setObraContext,
  } = useObraModulos();

  const moduleNav = useModuleNav({
    obraId: selectedObraId,
    obraModules: modules,
    modulesLoading,
  });

  const flatNavItems = useMemo(() => {
    const mod = moduleNav.map((item) => ({
      href: hrefWithObra(item.href, selectedObraId),
      label: item.label,
    }));
    const insertAt = 1;
    return [
      ...coreNav.slice(0, insertAt).map((x) => ({
        href: hrefWithObra(x.href, selectedObraId),
        label: x.label,
      })),
      ...mod,
      ...coreNav.slice(insertAt).map((x) => ({
        href: hrefWithObra(x.href, selectedObraId),
        label: x.label,
      })),
    ];
  }, [moduleNav, selectedObraId]);

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-[var(--surface)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-gray-900 p-5 text-white print:hidden md:flex md:flex-col">
        <h1 className="mb-6 text-xl font-bold tracking-tight">DataGeo Digital</h1>
        <AppSidebarNav pathname={pathname} flatItems={flatNavItems} />
        {selectedObraId != null && (
          <ObraContextCard
            selectedObraId={selectedObraId}
            obraNome={obraNome}
            onClear={() => setObraContext(null)}
          />
        )}
        <div className="mt-auto border-t border-gray-700 pt-4">
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 print:hidden md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100%-3rem,18rem)] flex-col bg-gray-900 p-5 text-white shadow-xl transition-transform duration-300 ease-out print:hidden md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold">DataGeo Digital</h1>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-gray-700"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <AppSidebarNav
          pathname={pathname}
          flatItems={flatNavItems}
          onNavigate={() => setMobileOpen(false)}
        />
        {selectedObraId != null && (
          <ObraContextCard
            selectedObraId={selectedObraId}
            obraNome={obraNome}
            onClear={() => {
              setMobileOpen(false);
              setObraContext(null);
            }}
          />
        )}
        <div className="border-t border-gray-700 pt-4">
          <LogoutButton onClick={() => setMobileOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur-md print:hidden md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[var(--text)] transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-[var(--text)]">DataGeo Digital</span>
        </header>
        <main className="flex-1 bg-gray-100 px-4 py-6 dark:bg-[var(--surface)] print:bg-white print:px-2 print:py-2 sm:px-6 lg:px-8">
          <GlobalQuickActions
            selectedObraId={selectedObraId}
            setObraContext={setObraContext}
            pathname={pathname}
            search={searchParams.toString()}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
