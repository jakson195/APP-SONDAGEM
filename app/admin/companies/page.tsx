import Link from "next/link";
import { Building2, Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { verifyAuthToken } from "@/lib/server-auth";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { redirect } from "next/navigation";
import type { SubscriptionStatus } from "@prisma/client";

const STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "TRIAL",
  "SUSPENDED",
  "CANCELLED",
];

const statusLabel: Record<SubscriptionStatus, string> = {
  ACTIVE: "Ativo",
  TRIAL: "Trial",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
};

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const jar = await cookies();
  const raw = jar.get(AUTH_TOKEN_COOKIE)?.value;
  const payload = raw ? verifyAuthToken(raw) : null;
  if (!payload) redirect("/login?next=/admin/companies");

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { systemRole: true },
  });
  if (!user || !isPlatformSuperAdmin(user.systemRole)) redirect("/dashboard");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const statusFilter =
    sp.status && STATUSES.includes(sp.status as SubscriptionStatus)
      ? (sp.status as SubscriptionStatus)
      : undefined;

  const parts: object[] = [];
  if (statusFilter) parts.push({ status: statusFilter });
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { cnpj: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  const where = parts.length ? { AND: parts } : {};

  const companies = await prisma.company.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { obras: true, memberships: true } },
    },
  });

  const base = "/admin/companies";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Building2 className="h-7 w-7 text-teal-600" />
            Empresas
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Gestão multiempresa — utilizadores, obras e contratos.
          </p>
        </div>
        <Link
          href="/admin/companies/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:bg-teal-500"
        >
          <Plus className="h-4 w-4" />
          Nova empresa
        </Link>
      </div>

      <form
        method="get"
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="q" className="text-xs font-medium text-slate-500">
            Busca
          </label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={sp.q ?? ""}
              placeholder="Nome, CNPJ, email, telefone…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-teal-500/20 focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
        <div className="sm:w-44">
          <label htmlFor="status" className="text-xs font-medium text-slate-500">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Filtrar
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="hidden px-4 py-3 md:table-cell">CNPJ</th>
              <th className="hidden px-4 py-3 lg:table-cell">Dono</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Obras</th>
              <th className="px-4 py-3 text-right">Membros</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {companies.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  Nenhuma empresa encontrada. Ajuste os filtros ou crie uma nova.
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/20"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/companies/${c.id}`}
                      className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      {c.name}
                    </Link>
                    {c.email && (
                      <p className="text-xs text-slate-500">{c.email}</p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 dark:text-slate-300 md:table-cell">
                    {c.cnpj ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="text-slate-700 dark:text-slate-300">
                      {c.user.name ?? c.user.email}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {statusLabel[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {c._count.obras}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {c._count.memberships}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        {companies.length} registo(s)
        {(q || statusFilter) && (
          <>
            {" "}
            ·{" "}
            <Link href={base} className="text-teal-600 hover:underline">
              limpar filtros
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
