import { prisma } from "@/lib/prisma";
import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; rasterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { projectId, rasterId: rasterIdStr } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  const rid = Number(rasterIdStr);
  if (obraId === null || !Number.isFinite(rid)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const raster = await prisma.insarGeoRaster.findFirst({
    where: { id: rid, job: { obraId } },
  });

  if (!raster) {
    return NextResponse.json({ error: "Raster não encontrado" }, { status: 404 });
  }

  const pid = encodeURIComponent(projectId);
  const base = `/api/geo/v1/projects/${pid}/insar/rasters/${raster.id}`;

  return NextResponse.json({
    id: String(raster.id),
    raster_kind: raster.rasterKind,
    epoch_date: raster.epochDate?.toISOString().slice(0, 10) ?? null,
    download_url: `${base}/download`,
    preview_url: null,
    metadata_url: base,
    min_value: raster.minValue,
    max_value: raster.maxValue,
    units: raster.units,
    footprint: raster.footprintGeoJson ?? null,
    crs_epsg: raster.crsEpsg ?? undefined,
    nodata_value: raster.nodataValue ?? null,
  });
}
