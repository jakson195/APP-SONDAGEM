import { prisma } from "@/lib/prisma";
import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

function rasterToDto(
  projectId: string,
  r: {
    id: number;
    rasterKind: string;
    epochDate: Date | null;
    minValue: number | null;
    maxValue: number | null;
    units: string;
  },
) {
  const pid = encodeURIComponent(projectId);
  const base = `/api/geo/v1/projects/${pid}/insar/rasters/${r.id}`;
  return {
    id: String(r.id),
    raster_kind: r.rasterKind,
    epoch_date: r.epochDate?.toISOString().slice(0, 10) ?? null,
    download_url: `${base}/download`,
    preview_url: null as string | null,
    metadata_url: base,
    min_value: r.minValue,
    max_value: r.maxValue,
    units: r.units,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  if (obraId === null) {
    return NextResponse.json({ error: "Projeto inválido" }, { status: 400 });
  }

  const url = new URL(req.url);
  const jobIdParam = url.searchParams.get("job_id");
  const kindParam = url.searchParams.get("kind");

  const items = await prisma.insarGeoRaster.findMany({
    where: {
      job: { obraId },
      ...(jobIdParam && Number.isFinite(Number(jobIdParam))
        ? { jobId: Number(jobIdParam) }
        : {}),
      ...(kindParam ? { rasterKind: kindParam } : {}),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      rasterKind: true,
      epochDate: true,
      minValue: true,
      maxValue: true,
      units: true,
    },
  });

  return NextResponse.json({
    items: items.map((r) => rasterToDto(projectId, r)),
  });
}
