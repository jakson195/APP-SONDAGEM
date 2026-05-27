import Link from "next/link";
import { requireClientPortalPageAccess } from "@/lib/client-portal-auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ClientPortalReportsPage({ params }: PageProps) {
  const { slug } = await params;
  const access = await requireClientPortalPageAccess(slug);

  if (!access.company.shareReportsEnabled) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/10 bg-white/5 px-6 py-14 text-center text-sm text-white/55">
        O compartilhamento de relatórios está temporariamente desativado para este
        cliente.
      </div>
    );
  }

  const shares = await prisma.clientReportShare.findMany({
    where: { empresaId: access.company.id, published: true },
    orderBy: { createdAt: "desc" },
    include: {
      furo: {
        select: {
          id: true,
          codigo: true,
          tipo: true,
          obra: {
            select: { id: true, nome: true, local: true },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.28em] text-white/45">
          Relatórios
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Relatórios compartilhados
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-white/65">
          Acesse os relatórios técnicos publicados para o seu cliente. Cada link
          exige autenticação da equipa vinculada a este portal.
        </p>
      </header>

      {shares.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-white/5 px-6 py-14 text-center text-sm text-white/55">
          Ainda não existem relatórios compartilhados para este cliente.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {shares.map((share) => (
            <article
              key={share.id}
              className="rounded-[26px] border border-white/10 bg-slate-900/70 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{share.title}</h3>
                  <p className="mt-1 text-sm text-white/60">
                    {share.furo.obra.nome} · Furo {share.furo.codigo}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
                  Publicado
                </span>
              </div>

              {share.description && (
                <p className="mt-4 text-sm leading-6 text-white/65">
                  {share.description}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
                <span>
                  {share.furo.tipo.toUpperCase()} · {share.furo.obra.local}
                </span>
                <span>
                  Publicado em{" "}
                  {new Date(share.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>

              <div className="mt-5">
                <Link
                  href={`/cliente/${slug}/relatorios/${share.slug}`}
                  className="inline-flex rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  Abrir relatório
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
