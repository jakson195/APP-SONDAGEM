import { localMToLatLng } from "@/lib/hydraulic-interpolation";
import { GARUVA_DEFAULT_LOCATION } from "../dipolo2d/regional-geology";
import type { SectionPoint3D, SurveyLineGeometry } from "./volume3d-types";

/** Geometria padrão: linhas paralelas espaçadas em Y local (m). */
export function defaultSurveyLineGeometry(
  lineIndex: number,
  lengthM = 200,
  parallelSpacingM = 50,
): SurveyLineGeometry {
  const base = GARUVA_DEFAULT_LOCATION;
  const offsetY = lineIndex * parallelSpacingM;
  const start = localMToLatLng(base.lat, base.lng, { x: 0, y: offsetY });
  const end = localMToLatLng(base.lat, base.lng, { x: lengthM, y: offsetY });
  return {
    coordMode: "wgs84",
    start: { x: start.lat, y: start.lng, z: 0 },
    end: { x: end.lat, y: end.lng, z: 0 },
    spacingM: 15,
  };
}

export function defaultProjectOrigin(): SectionPoint3D {
  const base = GARUVA_DEFAULT_LOCATION;
  return { x: base.lat, y: base.lng, z: 0 };
}

export function newLineId(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
