import { geoJsonPolygonToWkt } from "@/lib/geojson-polygon-wkt";
import { getObraPolygonGeoJson } from "@/lib/obra-area-postgis";
import { prisma } from "@/lib/prisma";

/** Bbox WGS84 em torno do centro da obra (graus). */
export function bboxWktFromLatLng(
  latitude: number,
  longitude: number,
  delta = 0.04,
): string {
  const minLat = latitude - delta;
  const maxLat = latitude + delta;
  const minLng = longitude - delta;
  const maxLng = longitude + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

export function insarSyntheticFallbackEnabled(): boolean {
  if (process.env.INSAR_ALLOW_SYNTHETIC_FALLBACK === "1") return true;
  return (
    process.env.NODE_ENV === "development" &&
    process.env.INSAR_DISABLE_DEV_SYNTHETIC !== "1"
  );
}

/** AOI para pipeline / fallback sintético. */
export async function resolveAoiWktForInsarJob(job: {
  id: number;
  obraId: number;
  aoiWkt: string | null;
  dateFrom: Date;
  dateTo: Date;
}): Promise<{ wkt: string; source: string }> {
  if (job.aoiWkt?.trim()) {
    return { wkt: job.aoiWkt.trim(), source: "job.aoiWkt" };
  }

  const poly = await getObraPolygonGeoJson(prisma, job.obraId);
  const fromGeo = geoJsonPolygonToWkt(poly);
  if (fromGeo) {
    return { wkt: fromGeo, source: "obra.area_of_interest" };
  }

  const obra = await prisma.obra.findUnique({
    where: { id: job.obraId },
    select: { latitude: true, longitude: true },
  });
  if (
    obra?.latitude != null &&
    obra?.longitude != null &&
    Number.isFinite(obra.latitude) &&
    Number.isFinite(obra.longitude)
  ) {
    return {
      wkt: bboxWktFromLatLng(obra.latitude, obra.longitude),
      source: "obra.lat_lng_bbox",
    };
  }

  throw new Error(
    "Área de interesse em falta: desenhe o polígono na obra ou defina latitude/longitude.",
  );
}

export function syntheticSceneDates(job: {
  dateFrom: Date;
  dateTo: Date;
}): { masterDate: string; slaveDate: string } {
  const mid = new Date(
    (job.dateFrom.getTime() + job.dateTo.getTime()) / 2,
  );
  const slave = job.dateTo.toISOString().slice(0, 10);
  const master = mid.toISOString().slice(0, 10);
  return { masterDate: master, slaveDate: slave };
}
