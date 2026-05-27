import { notFound } from "next/navigation";
import { requireClientPortalPageAccess } from "@/lib/client-portal-auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string; reportId: string }>;
};

export default async function ClientPortalReportDetailPage({
  params,
}: PageProps) {
  const { slug, reportId } = await params;
  const access = await requireClientPortalPageAccess(
    slug,
    `/cliente/${slug}/relatorios/${reportId}`,
  );
  if (!access.company.shareReportsEnabled) notFound();

  const share = await prisma.clientReportShare.findFirst({
    where: {
      empresaId: access.company.id,
      slug: reportId,
      published: true,
    },
    include: {
      furo: {
        include: {
          obra: true,
          spt: { orderBy: { prof: "asc" } },
        },
      },
    },
  });
  if (!share) notFound();

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.28em] text-white/45">
          Relatório compartilhado
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          {share.title}
        </h2>
        <p className="mt-3 text-sm text-white/65">
          {share.furo.obra.nome} · Furo {share.furo.codigo} · {share.furo.tipo.toUpperCase()}
        </p>
        {share.description && (
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">
            {share.description}
          </p>
        )}
      </header>

      <section className="grid gap-4 lg:grid-cols-4">
        {[
          ["Cliente", share.furo.obra.cliente],
          ["Local", share.furo.obra.local],
          ["Furo", share.furo.codigo],
          ["Amostras SPT", String(share.furo.spt.length)],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">
              {label}
            </p>
            <p className="mt-3 text-base font-medium text-white/85">{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Registro técnico</h3>
        <p className="mt-1 text-sm text-white/60">
          Visualização autenticada do conteúdo compartilhado para este cliente.
        </p>

        {share.furo.spt.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/55">
            Não há linhas SPT registradas para este furo.
          </p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-white/65">
                <tr>
                  <th className="px-4 py-3">Prof. (m)</th>
                  <th className="px-4 py-3">G1</th>
                  <th className="px-4 py-3">G2</th>
                  <th className="px-4 py-3">G3</th>
                  <th className="px-4 py-3">Solo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {share.furo.spt.map((row) => (
                  <tr key={row.id} className="bg-black/10">
                    <td className="px-4 py-3">{row.prof.toFixed(2)}</td>
                    <td className="px-4 py-3">{row.g1}</td>
                    <td className="px-4 py-3">{row.g2}</td>
                    <td className="px-4 py-3">{row.g3}</td>
                    <td className="px-4 py-3">{row.solo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
