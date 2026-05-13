import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/server-auth";

export default async function AdmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const raw = jar.get(AUTH_TOKEN_COOKIE)?.value;
  const payload = raw ? verifyAuthToken(raw) : null;
  if (!payload) redirect("/login?next=/adm");

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { systemRole: true, email: true },
  });
  if (!user || !isPlatformSuperAdmin(user.systemRole)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
              ADM mestre
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/admin/companies"
              className="font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Empresas
            </Link>
            <Link
              href="/adm"
              className="font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Resumo
            </Link>
            <Link href="/dashboard" className="text-slate-600 hover:underline dark:text-slate-400">
              App
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
