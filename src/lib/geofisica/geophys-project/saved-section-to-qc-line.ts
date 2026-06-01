import { activeReadingsForInversion } from "../dipolo2d/solodata-linha-readings";
import type { Dipolo2DReading } from "../dipolo2d/types";
import type { QcSurveyLine } from "../qc/qc-survey-types";
import { geometryStartEndWgs84 } from "../volume3d/geometry-coords";
import type { SurveyLineGeometry } from "../volume3d/volume3d-types";
import type { SavedGeophysSection } from "./geophys-project-storage";

export function readingsToQcSurveyLine(
  readings: Dipolo2DReading[],
  name: string,
  geometry: SurveyLineGeometry,
  opts?: { lineLengthM?: number; azimuthDeg?: number },
): QcSurveyLine {
  const active = activeReadingsForInversion(readings);
  const stations = active.map((r) => r.stationM);
  const span =
    stations.length > 0
      ? Math.max(...stations) - Math.min(...stations)
      : (opts?.lineLengthM ?? 200);

  const { start } = geometryStartEndWgs84(geometry);

  return {
    id: crypto.randomUUID(),
    name,
    readings: active,
    anchorLat: start.lat,
    anchorLng: start.lng,
    azimuthDeg: opts?.azimuthDeg ?? geometry.azimuthDeg ?? 90,
    profileLengthM: Math.max(span, 50),
  };
}

export function savedSectionToQcLine(section: SavedGeophysSection): QcSurveyLine {
  return readingsToQcSurveyLine(
    section.readings,
    section.code,
    section.geometry,
    {
      azimuthDeg: section.geometry.azimuthDeg,
    },
  );
}

export function savedSectionsToQcLines(
  sections: SavedGeophysSection[],
): QcSurveyLine[] {
  return sections.map(savedSectionToQcLine);
}
