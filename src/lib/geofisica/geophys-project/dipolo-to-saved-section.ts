import type { GeoSurveyLocation } from "../dipolo2d/interpret-types";
import type { SolodataLinhaState } from "../dipolo2d/solodata-linha-types";
import type { TopographyPoint } from "../dipolo2d/topography-types";
import {
  activeReadingsForInversion,
  solodataLinhaToReadings,
} from "../dipolo2d/solodata-linha-readings";
import { GARUVA_DEFAULT_LOCATION } from "../dipolo2d/regional-geology";
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
} from "../dipolo2d/types";
import { registerLineFromReadings } from "../volume3d/line-auto-register";
import { newLineId } from "../volume3d/survey-line-factory";
import type { GeophysSurveyLine } from "../volume3d/volume3d-types";
import type { SavedGeophysSection } from "./geophys-project-storage";
import { suggestNextGeoCode } from "./geophys-project-storage";
import {
  deserializeInvertResult,
  serializeInvertResult,
} from "./invert-result-serialize";

export type DipoloSaveSectionInput = {
  linha: SolodataLinhaState;
  defaultAM: number;
  params: Dipolo2DInvertParams;
  invertMethod: Dipolo2DInvertMethodId;
  invertResult: Dipolo2DInvertResult;
  surveyLocation: GeoSurveyLocation | null;
  topography: TopographyPoint[];
  code?: string;
  name?: string;
  lineIndex?: number;
  existingSections?: SavedGeophysSection[];
};

function invertSummaryFromResult(
  invertResult: Dipolo2DInvertResult,
): SavedGeophysSection["invertSummary"] {
  return {
    rmsLog10: invertResult.rmsLog10,
    roughnessL2: invertResult.roughnessL2,
    iterations: invertResult.iterations,
    methodId: invertResult.methodId,
    methodLabel: invertResult.methodLabel,
    nx: invertResult.nx,
    nz: invertResult.nz,
  };
}

export function buildSavedSectionFromDipolo(
  input: DipoloSaveSectionInput,
): SavedGeophysSection {
  const {
    linha,
    defaultAM,
    params,
    invertMethod,
    invertResult,
    surveyLocation,
    topography,
    lineIndex = 0,
    existingSections = [],
  } = input;

  const readings = activeReadingsForInversion(
    solodataLinhaToReadings(linha, defaultAM),
  );

  const base = surveyLocation ?? GARUVA_DEFAULT_LOCATION;
  const reg = registerLineFromReadings(
    readings,
    topography.length >= 2 ? topography : undefined,
    lineIndex,
    50,
    base,
  );

  const code =
    input.code?.trim().toUpperCase() || suggestNextGeoCode(existingSections);

  const name =
    input.name?.trim() ||
    linha.meta.titulo?.trim() ||
    linha.meta.linha?.trim() ||
    `Secção ${code}`;

  return {
    id: crypto.randomUUID(),
    code,
    name,
    savedAt: new Date().toISOString(),
    readings,
    topography: topography.length >= 2 ? topography : undefined,
    geometry: reg.geometry,
    invertParams: { ...params },
    invertMethod,
    invertSummary: invertSummaryFromResult(invertResult),
    invertResult: serializeInvertResult(invertResult),
    linha,
    defaultAM,
    surveyLocation: surveyLocation ?? undefined,
  };
}

export function buildSavedSectionFromSurveyLine(
  line: GeophysSurveyLine,
  existingSections: SavedGeophysSection[],
  opts?: { code?: string; name?: string; lineIndex?: number },
): SavedGeophysSection | null {
  if (!line.invertResult || line.readings.length === 0) return null;

  const active = activeReadingsForInversion(line.readings);
  const code =
    opts?.code?.trim().toUpperCase() || suggestNextGeoCode(existingSections);
  const name = opts?.name?.trim() || line.name.trim() || `Secção ${code}`;

  return {
    id: crypto.randomUUID(),
    code,
    name,
    savedAt: new Date().toISOString(),
    readings: active,
    topography: line.topography,
    geometry: line.geometry,
    invertParams: line.invertParams ? { ...line.invertParams } : undefined,
    invertMethod: line.invertResult.methodId,
    invertSummary: invertSummaryFromResult(line.invertResult),
    invertResult: serializeInvertResult(line.invertResult),
  };
}

export function savedSectionToSurveyLine(
  section: SavedGeophysSection,
): GeophysSurveyLine {
  const invertResult = section.invertResult
    ? deserializeInvertResult(section.invertResult)
    : undefined;

  return {
    id: newLineId(),
    name: section.code,
    readings: section.readings.map((r) => ({ ...r })),
    topography: section.topography?.map((t) => ({ ...t })),
    geometry: {
      ...section.geometry,
      start: { ...section.geometry.start },
      end: { ...section.geometry.end },
      projectOrigin: section.geometry.projectOrigin
        ? { ...section.geometry.projectOrigin }
        : undefined,
    },
    invertParams: section.invertParams ? { ...section.invertParams } : undefined,
    invertResult,
  };
}

export function savedSectionsToSurveyLines(
  sections: SavedGeophysSection[],
): GeophysSurveyLine[] {
  return sections.map(savedSectionToSurveyLine);
}
