/**
 * Cadastro automático de linhas a partir de metadados de importação.
 */

import type { Dipolo2DReading } from "../dipolo2d/types";
import type { TopographyPoint } from "../dipolo2d/topography-types";
import type { Res2dinvDatParseResult } from "../dipolo2d/parse-res2dinv-dat";
import { localMToLatLng } from "@/lib/hydraulic-interpolation";
import { GARUVA_DEFAULT_LOCATION } from "../dipolo2d/regional-geology";
import { azimuthDegFromEndpoints } from "./line-geometry-3d";
import { geometryStartEndWgs84 } from "./geometry-coords";
import type { SurveyLineGeometry } from "./volume3d-types";
import type { XyzParseResult } from "./parse-xyz";

export type LineRegistration = {
  geometry: SurveyLineGeometry;
  spacingM: number;
  lineLengthM: number;
  elevationMinM?: number;
  elevationMaxM?: number;
  azimuthDeg: number;
};

function wgs84Geometry(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  startZ = 0,
  endZ = 0,
  extra?: Partial<SurveyLineGeometry>,
): SurveyLineGeometry {
  const startWgs = { lat: startLat, lng: startLng };
  const endWgs = { lat: endLat, lng: endLng };
  return {
    coordMode: "wgs84",
    start: { x: startLat, y: startLng, z: startZ },
    end: { x: endLat, y: endLng, z: endZ },
    azimuthDeg: azimuthDegFromEndpoints(startWgs, endWgs),
    ...extra,
  };
}

/** Registo automático a partir de RES2DINV + índice de linha paralela. */
export function registerLineFromRes2dinv(
  parsed: Res2dinvDatParseResult,
  lineIndex: number,
  parallelSpacingM = 50,
  baseLatLng = GARUVA_DEFAULT_LOCATION,
): LineRegistration {
  const readings = parsed.readings;
  const stations = readings.map((r) => r.stationM);
  const lineLengthM =
    stations.length > 0
      ? Math.max(...stations) - Math.min(...stations)
      : 200;

  const offsetY = lineIndex * parallelSpacingM;
  const start = localMToLatLng(baseLatLng.lat, baseLatLng.lng, {
    x: 0,
    y: offsetY,
  });
  const end = localMToLatLng(baseLatLng.lat, baseLatLng.lng, {
    x: lineLengthM,
    y: offsetY,
  });

  const geometry = wgs84Geometry(
    start.lat,
    start.lng,
    end.lat,
    end.lng,
    0,
    0,
    { spacingM: parsed.unitSpacingM },
  );

  return {
    geometry,
    spacingM: parsed.unitSpacingM,
    lineLengthM,
    azimuthDeg: geometry.azimuthDeg ?? 90,
  };
}

export function registerLineFromXyz(
  parsed: XyzParseResult,
  lineIndex: number,
  parallelSpacingM = 50,
): LineRegistration | null {
  if (parsed.isGeographic && parsed.points.length >= 2) {
    const sorted = [...parsed.points].sort(
      (a, b) => (a.stationM ?? 0) - (b.stationM ?? 0),
    );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const zs = parsed.points.map((p) => p.z);
    const geometry = wgs84Geometry(
      first.y,
      first.x,
      last.y,
      last.x,
      first.z,
      last.z,
    );
    return {
      geometry,
      spacingM: inferSpacingFromReadings(sorted),
      lineLengthM: (last.stationM ?? 0) - (first.stationM ?? 0),
      elevationMinM: Math.min(...zs),
      elevationMaxM: Math.max(...zs),
      azimuthDeg: geometry.azimuthDeg ?? 0,
    };
  }

  return registerLineFromRes2dinv(
    {
      title: parsed.title ?? "XYZ",
      unitSpacingM: 15,
      arrayType: 0,
      subArrayType: 0,
      readings: [],
      warnings: [],
      topographyFromReadings: [],
    },
    lineIndex,
    parallelSpacingM,
  );
}

export function registerLineFromReadings(
  readings: Dipolo2DReading[],
  topography: TopographyPoint[] | undefined,
  lineIndex: number,
  parallelSpacingM = 50,
  baseLatLng = GARUVA_DEFAULT_LOCATION,
): LineRegistration {
  const stations = readings.map((r) => r.stationM);
  const lineLengthM =
    stations.length > 0
      ? Math.max(...stations) - Math.min(...stations)
      : 200;
  const spacing =
    readings.find((r) => r.aM > 0)?.aM ??
    (stations.length > 1
      ? lineLengthM / (stations.length - 1)
      : 15);

  const offsetY = lineIndex * parallelSpacingM;
  const start = localMToLatLng(baseLatLng.lat, baseLatLng.lng, { x: 0, y: offsetY });
  const end = localMToLatLng(baseLatLng.lat, baseLatLng.lng, {
    x: lineLengthM,
    y: offsetY,
  });

  let startZ = 0;
  let endZ = 0;
  let elevationMinM: number | undefined;
  let elevationMaxM: number | undefined;
  if (topography && topography.length > 0) {
    const elevs = topography.map((t) => t.elevationM);
    elevationMinM = Math.min(...elevs);
    elevationMaxM = Math.max(...elevs);
    const sorted = [...topography].sort((a, b) => a.stationM - b.stationM);
    startZ = sorted[0]!.elevationM;
    endZ = sorted[sorted.length - 1]!.elevationM;
  }

  const geometry = wgs84Geometry(
    start.lat,
    start.lng,
    end.lat,
    end.lng,
    startZ,
    endZ,
    { spacingM: spacing },
  );

  return {
    geometry,
    spacingM: spacing,
    lineLengthM,
    elevationMinM,
    elevationMaxM,
    azimuthDeg: geometry.azimuthDeg ?? 90,
  };
}

function inferSpacingFromReadings(points: { stationM?: number }[]): number {
  if (points.length < 2) return 15;
  let span = 0;
  for (let i = 1; i < points.length; i++) {
    span +=
      Math.abs((points[i]!.stationM ?? 0) - (points[i - 1]!.stationM ?? 0));
  }
  return span / (points.length - 1);
}

export function refreshLineAzimuth(geometry: SurveyLineGeometry): SurveyLineGeometry {
  const { start, end } = geometryStartEndWgs84(geometry);
  return {
    ...geometry,
    azimuthDeg: azimuthDegFromEndpoints(
      { lat: start.lat, lng: start.lng },
      { lat: end.lat, lng: end.lng },
    ),
  };
}
