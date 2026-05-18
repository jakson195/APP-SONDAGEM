import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Building2, LayoutDashboard, ChevronRight } from "lucide-react";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/server-auth";

const nav = [
  { href: "/admin/companies", label: "Empresas", icon: Building2 },
  { href: "/adm", label: "Resumo da plataforma", icon: LayoutDashboard },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const raw = jar.get(AUTH_TOKEN_COOKIE)?.value;
  const payload = raw ? verifyAuthToken(raw) : null;
  if (!payload) redirect("/login?next=/admin/companies");

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { systemRole: true, email: true, name: true },
  });
  if (!user || !isPlatformSuperAdmin(user.systemRole)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/40 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:flex md:flex-col">
          <div className="border-b border-slate-200 px-5 py-6 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
              SOILSUL
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight">Administração</p>
            <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400" title={user.email}>
              {user.name ?? user.email}
            </p>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-3">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-teal-950/50 dark:hover:text-teal-300"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100" />
                {label}
                <ChevronRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-50" />
              </Link>
            ))}
          </nav>
          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
            >
              ← Voltar à aplicação
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 md:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">SOILSUL Admin</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {nav.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium dark:bg-slate-800"
                >
                  {label}
                </Link>
              ))}
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
