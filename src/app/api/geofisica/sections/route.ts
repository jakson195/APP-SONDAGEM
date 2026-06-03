import { NextResponse } from "next/server";
import {
  withGeophysicsApi,
  parseScopeIdsFromBody,
  parseScopeIdsFromSearchParams,
} from "@/lib/geofisica/geophys-api-guard";
import {
  listGeophysSectionsForObra,
  syncGeophysProjectToDb,
  upsertGeophysSection,
} from "@/lib/geofisica/geophys-section-db";
import type { SavedGeophysSection } from "@/lib/geofisica/geophys-project/geophys-project-storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { obraId } = parseScopeIdsFromSearchParams(req.url);
  if (!obraId || !Number.isFinite(Number(obraId))) {
    return NextResponse.json({ error: "obraId é obrigatório." }, { status: 400 });
  }

  return withGeophysicsApi(
    req,
    async (ctx) => {
      const obra = await prisma.obra.findUnique({
        where: { id: Number(obraId) },
        select: { id: true, companyId: true, nome: true },
      });
      if (!obra || obra.companyId !== ctx.scope.companyId) {
        return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
      }

      const sections = await listGeophysSectionsForObra(obra.id);
      return NextResponse.json({
        projectName: `Levantamento ERT — ${obra.nome}`,
        sections,
        updatedAt: new Date().toISOString(),
        source: "database",
      });
    },
    { obraId: Number(obraId) },
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { obraId, companyId } = parseScopeIdsFromBody(body);
  const obraNum = Number(obraId);
  if (!Number.isFinite(obraNum) || obraNum < 1) {
    return NextResponse.json({ error: "obraId é obrigatório." }, { status: 400 });
  }

  return withGeophysicsApi(
    req,
    async (ctx) => {
      const obra = await prisma.obra.findUnique({
        where: { id: obraNum },
        select: { id: true, companyId: true },
      });
      if (!obra || obra.companyId !== ctx.scope.companyId) {
        return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
      }

      if (Array.isArray(body.sections)) {
        const sections = body.sections as SavedGeophysSection[];
        const saved = await syncGeophysProjectToDb(obra.id, sections, ctx.user.id);
        return NextResponse.json({
          ok: true,
          sections: saved,
          count: saved.length,
        });
      }

      const section = body.section as SavedGeophysSection | undefined;
      if (!section?.code || !section?.name) {
        return NextResponse.json(
          { error: "Envie `section` ou `sections[]`." },
          { status: 400 },
        );
      }

      const saved = await upsertGeophysSection(obra.id, section, ctx.user.id);
      return NextResponse.json({ ok: true, section: saved });
    },
    { obraId: obraNum, companyId, requireWrite: true },
  );
}
