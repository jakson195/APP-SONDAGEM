import { requireClientPortalPageAccess } from "@/lib/client-portal-auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ClientPortalWorksPage({ params }: PageProps) {
  const { slug } = await params;
  const access = await requireClientPortalPageAccess(slug);

  const obras = await prisma.obra.findMany({
    where: { companyId: access.company.id },
    orderBy: [{ status: "asc" }, { id: "desc" }],
    include: {
      _count: { select: { furos: true } },
      projectModules: { select: { module: true, active: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.28em] text-white/45">
          Obras
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Projetos do cliente
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-white/65">
          Lista privada das obras associadas ao cliente, com resumo técnico e
          quantidade de furos/pontos cadastrados.
        </p>
      </header>

      {obras.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-white/5 px-6 py-14 text-center text-sm text-white/55">
          Nenhuma obra disponível para este cliente.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {obras.map((obra) => (
            <article
              key={obra.id}
              className="rounded-[26px] border border-white/10 bg-slate-900/70 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{obra.nome}</h3>
                  <p className="mt-1 text-sm text-white/60">
                    {obra.cliente} · {obra.local}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white/70">
                  {obra.status}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Furos / pontos
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {obra._count.furos}
                  </p>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Módulos ativos
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    {obra.projectModules.filter((mod) => mod.active).length || "Padrão"}
                  </p>
                </div>
              </div>

              {obra.description && (
                <p className="mt-4 text-sm leading-6 text-white/65">
                  {obra.description}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
