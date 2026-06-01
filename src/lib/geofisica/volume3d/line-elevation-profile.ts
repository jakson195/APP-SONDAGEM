import type { TopographyPoint } from "../dipolo2d/topography-types";
import type { GeophysSurveyLine, SurveyLineGeometry } from "./volume3d-types";
import { computeSurveyAnchor } from "./geometry-coords";
import { refreshLineAzimuth } from "./line-auto-register";
import { lineToLocalSegment } from "./line-geometry-3d";
import { localMToLatLng } from "@/lib/hydraulic-interpolation";
import type { DemElevationPoint } from "../geodata/fetch-elevation-dem";

export type ProfileSampleWgs84 = {
  lat: number;
  lng: number;
  stationM: number;
};

/** Comprimento planimétrico A→B (m). */
export function profileLengthM(
  geometry: SurveyLineGeometry,
  anchorLat: number,
  anchorLng: number,
): number {
  return lineToLocalSegment("", "", geometry, anchorLat, anchorLng).lengthM;
}

/** Estações ao longo do perfil — leituras ou amostragem regular. */
export function stationsForTopography(
  line: GeophysSurveyLine,
  anchorLat: number,
  anchorLng: number,
): number[] {
  const active = line.readings.filter((r) => !r.excluded);
  if (active.length >= 2) {
    const uniq = [...new Set(active.map((r) => r.stationM))].sort(
      (a, b) => a - b,
    );
    if (uniq.length >= 2) return uniq;
  }

  const len = profileLengthM(line.geometry, anchorLat, anchorLng);
  const spacing = line.geometry.spacingM ?? 15;
  const step = Math.max(10, Math.min(spacing, 25));
  const n = Math.max(8, Math.min(50, Math.ceil(len / step)));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    out.push((len * i) / n);
  }
  return out;
}

/** Pontos WGS84 ao longo do perfil para cada estação (m desde A). */
export function samplePointsAlongProfile(
  geometry: SurveyLineGeometry,
  anchorLat: number,
  anchorLng: number,
  stationsM: number[],
): ProfileSampleWgs84[] {
  const seg = lineToLocalSegment("", "", geometry, anchorLat, anchorLng);
  const lengthM = seg.lengthM;

  return stationsM.map((stationM) => {
    const t = Math.max(0, Math.min(1, stationM / lengthM));
    const localX = seg.start.x + t * (seg.end.x - seg.start.x);
    const localY = seg.start.y + t * (seg.end.y - seg.start.y);
    const ll = localMToLatLng(anchorLat, anchorLng, {
      x: localX,
      y: localY,
    });
    return { lat: ll.lat, lng: ll.lng, stationM };
  });
}

export function demPointsToTopography(
  demPoints: DemElevationPoint[],
): TopographyPoint[] {
  return demPoints
    .filter(
      (p) =>
        p.elevationM != null &&
        Number.isFinite(p.elevationM) &&
        p.stationM != null &&
        Number.isFinite(p.stationM),
    )
    .map((p) => ({
      stationM: p.stationM!,
      elevationM: p.elevationM!,
    }))
    .sort((a, b) => a.stationM - b.stationM);
}

/** Aplica topografia DEM à linha e actualiza cotas A/B na geometria. */
export function applyTopographyToLineGeometry(
  line: GeophysSurveyLine,
  topography: TopographyPoint[],
): GeophysSurveyLine {
  if (topography.length < 2) return line;

  const sorted = [...topography].sort((a, b) => a.stationM - b.stationM);
  const startZ = sorted[0]!.elevationM;
  const endZ = sorted[sorted.length - 1]!.elevationM;

  const geometry = refreshLineAzimuth({
    ...line.geometry,
    start: { ...line.geometry.start, z: startZ },
    end: { ...line.geometry.end, z: endZ },
  });

  return {
    ...line,
    topography: sorted,
    geometry,
  };
}

export function mergeDemWithStations(
  samples: ProfileSampleWgs84[],
  demPoints: DemElevationPoint[],
): DemElevationPoint[] {
  return samples.map((s, i) => ({
    lat: s.lat,
    lng: s.lng,
    stationM: s.stationM,
    elevationM: demPoints[i]?.elevationM ?? null,
  }));
}

/** Obtém topografia DEM ao longo do perfil (API Next.js). */
export async function fetchDemTopographyForLine(
  line: GeophysSurveyLine,
): Promise<GeophysSurveyLine | null> {
  const anchor = computeSurveyAnchor([line]);
  const stations = stationsForTopography(line, anchor.lat, anchor.lng);
  const samples = samplePointsAlongProfile(
    line.geometry,
    anchor.lat,
    anchor.lng,
    stations,
  );

  const res = await fetch("/api/geofisica/elevation/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locations: samples }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    points?: DemElevationPoint[];
    error?: string;
  };
  if (!res.ok || !data.ok || !data.points) {
    throw new Error(data.error ?? "Falha ao obter cotas DEM do mapa.");
  }

  const merged = mergeDemWithStations(samples, data.points);
  const topography = demPointsToTopography(merged);
  if (topography.length < 2) return null;

  return applyTopographyToLineGeometry(line, topography);
}
