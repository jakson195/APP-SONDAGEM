import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import { deleteGeophysSectionById } from "@/lib/geofisica/geophys-section-db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sectionId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { sectionId } = await params;
  const sp = new URL(req.url).searchParams;
  const obraId = Number(sp.get("obraId") ?? sp.get("obra_id"));

  if (!Number.isFinite(obraId) || obraId < 1) {
    return NextResponse.json({ error: "obraId é obrigatório." }, { status: 400 });
  }

  return withGeophysicsApi(
    req,
    async (ctx) => {
      const obra = await prisma.obra.findUnique({
        where: { id: obraId },
        select: { companyId: true },
      });
      if (!obra || obra.companyId !== ctx.scope.companyId) {
        return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
      }

      const ok = await deleteGeophysSectionById(obraId, sectionId);
      if (!ok) {
        return NextResponse.json({ error: "Secção não encontrada." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    },
    { obraId, requireWrite: true },
  );
}
