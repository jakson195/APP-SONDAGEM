"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, FolderKanban, LogOut } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

type Props = {
  company: {
    name: string;
    slug: string;
    logo: string | null;
    primaryColor: string | null;
  };
  user: {
    name: string | null;
    email: string;
  };
  children: React.ReactNode;
};

const defaultAccent = "#0F766E";

async function logout() {
  try {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } finally {
    window.location.href = "/login";
  }
}

export function ClientPortalShell({ company, user, children }: Props) {
  const pathname = usePathname() ?? "";
  const accent = company.primaryColor ?? defaultAccent;
  const nav = [
    { href: `/cliente/${company.slug}`, label: "Dashboard", icon: BarChart3 },
    { href: `/cliente/${company.slug}/obras`, label: "Obras", icon: FolderKanban },
    { href: `/cliente/${company.slug}/relatorios`, label: "Relatórios", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div
        className="border-b border-white/10"
        style={{
          background: `linear-gradient(135deg, ${accent}22 0%, rgba(15,23,42,0.98) 55%, rgba(2,6,23,1) 100%)`,
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              {company.logo ? (
                <img
                  src={company.logo}
                  alt={company.name}
                  className="h-14 w-14 rounded-2xl border border-white/10 bg-white/95 object-contain p-2"
                />
              ) : (
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-xl font-semibold"
                  style={{ boxShadow: `inset 0 0 0 1px ${accent}55` }}
                >
                  {company.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/60">
                  Portal do cliente
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {company.name}
                </h1>
                <p className="mt-1 text-sm text-white/70">
                  Área privada para acompanhamento de projetos e relatórios.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-right">
                <p className="text-xs text-white/55">Sessão</p>
                <p className="text-sm font-medium">{user.name ?? user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {nav.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                    active
                      ? "border-white/10 bg-white text-slate-950"
                      : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
