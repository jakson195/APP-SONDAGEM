import type { GeoSurveyLocation } from "../dipolo2d/interpret-types";
import type { SolodataLinhaState } from "../dipolo2d/solodata-linha-types";
import type { TopographyPoint } from "../dipolo2d/topography-types";
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DReading,
} from "../dipolo2d/types";
import type { SerializedDipolo2DInvertResult } from "./invert-result-serialize";
import type { SurveyLineGeometry } from "../volume3d/volume3d-types";

export const GEOPHYS_PROJECT_STORAGE_KEY =
  "datageo-digital-geofisica-ert-project-v1";

export const GEOPHYS_PENDING_VOLUME_LOAD_KEY =
  "datageo-geophys-pending-volume-load-v1";

export const GEOPHYS_PENDING_QC_LOAD_KEY =
  "datageo-geophys-pending-qc-load-v1";

export type SavedInvertSummary = {
  rmsLog10: number;
  roughnessL2: number;
  iterations: number;
  methodId: Dipolo2DInvertMethodId;
  methodLabel: string;
  nx: number;
  nz: number;
};

/** Secção ERT guardada no projeto (GEO01, GEO02, …). */
export type SavedGeophysSection = {
  id: string;
  /** Código curto ex.: GEO01 */
  code: string;
  /** Nome descritivo */
  name: string;
  savedAt: string;
  readings: Dipolo2DReading[];
  topography?: TopographyPoint[];
  geometry: SurveyLineGeometry;
  invertParams?: Dipolo2DInvertParams;
  invertMethod?: Dipolo2DInvertMethodId;
  invertSummary?: SavedInvertSummary;
  /** Modelo invertido calculado no Dipolo-Dipolo (malha log₁₀ ρ). */
  invertResult?: SerializedDipolo2DInvertResult;
  linha?: SolodataLinhaState;
  defaultAM?: number;
  surveyLocation?: GeoSurveyLocation;
};

export type GeophysProjectStore = {
  projectName: string;
  sections: SavedGeophysSection[];
  updatedAt: string;
};

export function emptyGeophysProject(name = "Levantamento ERT"): GeophysProjectStore {
  return {
    projectName: name,
    sections: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadGeophysProject(): GeophysProjectStore {
  if (typeof window === "undefined") return emptyGeophysProject();
  try {
    const raw = localStorage.getItem(GEOPHYS_PROJECT_STORAGE_KEY);
    if (!raw) return emptyGeophysProject();
    const j = JSON.parse(raw) as GeophysProjectStore;
    if (!Array.isArray(j.sections)) return emptyGeophysProject();
    return {
      projectName: j.projectName || "Levantamento ERT",
      sections: j.sections,
      updatedAt: j.updatedAt || new Date().toISOString(),
    };
  } catch {
    return emptyGeophysProject();
  }
}

export function saveGeophysProject(store: GeophysProjectStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    GEOPHYS_PROJECT_STORAGE_KEY,
    JSON.stringify({
      ...store,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function suggestNextGeoCode(sections: SavedGeophysSection[]): string {
  let max = 0;
  for (const s of sections) {
    const m = /^GEO(\d+)$/i.exec(s.code.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `GEO${String(max + 1).padStart(2, "0")}`;
}

export function addGeophysSection(section: SavedGeophysSection): GeophysProjectStore {
  const store = loadGeophysProject();
  const withoutDup = store.sections.filter((s) => s.code !== section.code);
  const next = {
    ...store,
    sections: [...withoutDup, section],
  };
  saveGeophysProject(next);
  return next;
}

export function removeGeophysSection(id: string): GeophysProjectStore {
  const store = loadGeophysProject();
  const next = {
    ...store,
    sections: store.sections.filter((s) => s.id !== id),
  };
  saveGeophysProject(next);
  return next;
}

export function setPendingVolumeLoad(sectionIds: string[] | "all"): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    GEOPHYS_PENDING_VOLUME_LOAD_KEY,
    JSON.stringify(sectionIds),
  );
}

export function setPendingQcLoad(sectionIds: string[] | "all"): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    GEOPHYS_PENDING_QC_LOAD_KEY,
    JSON.stringify(sectionIds),
  );
}

export function consumePendingVolumeLoad(): string[] | "all" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GEOPHYS_PENDING_VOLUME_LOAD_KEY);
    sessionStorage.removeItem(GEOPHYS_PENDING_VOLUME_LOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[] | "all";
    return parsed;
  } catch {
    return null;
  }
}

export function consumePendingQcLoad(): string[] | "all" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GEOPHYS_PENDING_QC_LOAD_KEY);
    sessionStorage.removeItem(GEOPHYS_PENDING_QC_LOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[] | "all";
    return parsed;
  } catch {
    return null;
  }
}
