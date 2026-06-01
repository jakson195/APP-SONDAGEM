import { NextResponse } from "next/server";

import { listGeoPhotosSql, listStreetFramesSql } from "@/lib/geo-media-sql";
import { resolveGeoScopeFromRequest } from "@/lib/geo-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function buildFilename(obraId: number, obraName: string | null): string {
  const stem = (obraName ?? `obra-${obraId}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `geo-export-${stem || `obra-${obraId}`}.json`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const obraIdRaw = searchParams.get("obraId");

  const scopeResult = await resolveGeoScopeFromRequest(req, {
    obraId: obraIdRaw,
    requireWrite: false,
  });
  if (!scopeResult.ok) return scopeResult.response;

  const { scope } = scopeResult;
  if (scope.obraId == null) {
    return NextResponse.json(
      { error: "Selecione uma obra para exportar os arquivos GEO." },
      { status: 400 },
    );
  }

  const [photos, frames, obra] = await Promise.all([
    listGeoPhotosSql(prisma, { companyId: scope.companyId, obraId: scope.obraId }),
    listStreetFramesSql(prisma, { companyId: scope.companyId, obraId: scope.obraId }),
    prisma.obra.findUnique({
      where: { id: scope.obraId },
      select: { id: true, nome: true, companyId: true },
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    obra: {
      id: scope.obraId,
      nome: obra?.nome ?? null,
      companyId: scope.companyId,
    },
    totals: {
      photos: photos.length,
      frames: frames.length,
    },
    photos,
    frames,
  };

  const filename = buildFilename(scope.obraId, obra?.nome ?? null);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

