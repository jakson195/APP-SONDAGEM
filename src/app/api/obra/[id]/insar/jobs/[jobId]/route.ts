import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; jobId: string }> };

function parseIdPair(idStr: string, jobIdStr: string) {
  const obraId = Number(idStr);
  const jobId = Number(jobIdStr);
  return {
    ok: Number.isFinite(obraId) && Number.isFinite(jobId),
    obraId,
    jobId,
  };
}

function serializeRaster(r: {
  id: number;
  jobId: number;
  rasterKind: string;
  epochDate: Date | null;
  relativePath: string;
  fileSizeBytes: bigint | null;
  crsEpsg: number | null;
  width: number | null;
  height: number | null;
  minValue: number | null;
  maxValue: number | null;
  meanValue: number | null;
  nodataValue: number | null;
  units: string;
  footprintGeoJson: unknown;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    ...r,
    epochDate: r.epochDate?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    fileSizeBytes: r.fileSizeBytes?.toString() ?? null,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr, jobId: jobIdStr } = await ctx.params;
  const { ok, obraId, jobId } = parseIdPair(idStr, jobIdStr);
  if (!ok) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const job = await prisma.insarPipelineJob.findFirst({
    where: { id: jobId, obraId },
    include: { rasters: { orderBy: { id: "asc" } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      obraId: job.obraId,
      name: job.name,
      status: job.status,
      dateFrom: job.dateFrom.toISOString(),
      dateTo: job.dateTo.toISOString(),
      referenceDate: job.referenceDate?.toISOString() ?? null,
      orbitDirection: job.orbitDirection,
      aoiWkt: job.aoiWkt,
      masterCopernicusId: job.masterCopernicusId,
      slaveCopernicusId: job.slaveCopernicusId,
      sceneCount: job.sceneCount,
      errorMessage: job.errorMessage,
      properties: job.properties,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      rasters: job.rasters.map(serializeRaster),
    },
  });
}
