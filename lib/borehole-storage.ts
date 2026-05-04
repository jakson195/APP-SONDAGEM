import type { BoreholeInput, SptReading } from "@/lib/types";

const STORAGE_KEY = "vision-sondagem-boreholes";

export const BOREHOLES_CHANGED_EVENT = "vision-sondagem-boreholes-changed";

export function notifyBoreholesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BOREHOLES_CHANGED_EVENT));
}

function isSptReading(x: unknown): x is SptReading {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.depthM === "number" &&
    typeof o.n1 === "number" &&
    typeof o.n2 === "number" &&
    typeof o.n3 === "number" &&
    typeof o.soilDescription === "string"
  );
}

function normalizeBorehole(raw: unknown): BoreholeInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.projectId !== "string" ||
    typeof o.boreholeId !== "string" ||
    typeof o.depthM !== "number" ||
    typeof o.x !== "number" ||
    typeof o.y !== "number" ||
    !Array.isArray(o.sptReadings)
  ) {
    return null;
  }
  const readings = o.sptReadings.filter(isSptReading);
  if (readings.length !== o.sptReadings.length) return null;
  return {
    id: o.id,
    projectId: o.projectId,
    boreholeId: o.boreholeId,
    depthM: o.depthM,
    x: o.x,
    y: o.y,
    sptReadings: readings,
  };
}

export function loadBoreholes(): BoreholeInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: BoreholeInput[] = [];
    for (const item of parsed) {
      const b = normalizeBorehole(item);
      if (b) out.push(b);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveBoreholes(boreholes: BoreholeInput[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boreholes));
  } catch {
    // quota
  }
}

export function countBoreholesForProject(projectId: string): number {
  return loadBoreholes().filter((b) => b.projectId === projectId).length;
}

/** Removes all boreholes linked to a project (e.g. when the project is deleted). */
export function removeBoreholesForProject(projectId: string): void {
  const all = loadBoreholes();
  const next = all.filter((b) => b.projectId !== projectId);
  if (next.length === all.length) return;
  saveBoreholes(next);
  notifyBoreholesChanged();
}
