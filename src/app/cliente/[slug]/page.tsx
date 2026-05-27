import Link from "next/link";
import { FileText, FolderKanban, Landmark, Users } from "lucide-react";
import { requireClientPortalPageAccess } from "@/lib/client-portal-auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ClientPortalDashboardPage({ params }: PageProps) {
  const { slug } = await params;
  const access = await requireClientPortalPageAccess(slug);

  const [obraCount, furoCount, memberCount, reportCount, recentWorks] =
    await Promise.all([
      prisma.obra.count({ where: { companyId: access.company.id } }),
      prisma.furo.count({ where: { obra: { companyId: access.company.id } } }),
      prisma.orgMembership.count({ where: { empresaId: access.company.id } }),
      prisma.clientReportShare.count({
        where: { empresaId: access.company.id, published: true },
      }),
      prisma.obra.findMany({
        where: { companyId: access.company.id },
        take: 6,
        orderBy: { id: "desc" },
        select: {
          id: true,
          nome: true,
          cliente: true,
          local: true,
          status: true,
        },
      }),
    ]);

  const cards = [
    { label: "Obras", value: obraCount, icon: FolderKanban },
    { label: "Furos e pontos", value: furoCount, icon: Landmark },
    { label: "Relatórios publicados", value: reportCount, icon: FileText },
    { label: "Utilizadores vinculados", value: memberCount, icon: Users },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/50">
              Dashboard do cliente
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Visão executiva dos seus projetos
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Este painel reúne as obras associadas ao seu cliente, os relatórios
              publicados para consulta e o volume atual de dados de campo.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/cliente/${slug}/obras`}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              Ver obras
            </Link>
            <Link
              href={`/cliente/${slug}/relatorios`}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Ver relatórios
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold tabular-nums">
                    {card.value}
                  </p>
                </div>
                <span className="rounded-2xl bg-white/5 p-3 text-white/80">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Obras recentes</h3>
            <p className="mt-1 text-sm text-white/60">
              Projetos mais recentes vinculados a este cliente.
            </p>
          </div>
          <Link
            href={`/cliente/${slug}/obras`}
            className="text-sm font-medium text-teal-300 hover:text-teal-200"
          >
            Abrir lista completa
          </Link>
        </div>

        {recentWorks.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/55">
            Ainda não existem obras associadas a este cliente.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {recentWorks.map((obra) => (
              <article
                key={obra.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="text-sm font-semibold">{obra.nome}</p>
                <p className="mt-1 text-sm text-white/60">
                  {obra.cliente} · {obra.local}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/45">
                  Estado: {obra.status}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
