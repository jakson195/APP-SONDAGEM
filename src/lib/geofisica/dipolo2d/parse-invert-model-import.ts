/**
 * Importação de modelos invertidos já calculados (export DataGeo / relatório .txt).
 */

import { finalizeResult } from "./invert-core-2d";
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DReading,
} from "./types";
import { computeModelZMaxM } from "./model-depth";
import { res2dinvDataPreset } from "./smooth-invert-2d";

function parseNum(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

export function looksLikePrecalculatedInvertFile(text: string): boolean {
  const t = text.replace(/^\uFEFF/, "");
  return (
    /DATAGEO_DIPOLO2D_INVERSION/i.test(t) ||
    /^\s*\[MODELO_CELULAS\]/m.test(t) ||
    /^MODEL\s+I\s+J\s+LOG10_RHO/im.test(t)
  );
}

type ParsedModelGrid = {
  nx: number;
  nz: number;
  mLog10: number[];
  xEdgesM?: Float64Array;
  zEdgesM?: Float64Array;
  rmsLog10?: number;
  iterations?: number;
  methodId?: Dipolo2DInvertMethodId;
  methodLabel?: string;
  yObsLog10?: number[];
  ySynLog10?: number[];
};

function meshFromReadings(
  readings: Dipolo2DReading[],
  nx: number,
  nz: number,
  params: Dipolo2DInvertParams,
): { x0: number; x1: number; zMax: number } {
  const valid = readings.filter(
    (L) => L.rhoApparentOhmM > 0 && L.aM > 0 && L.n >= 1,
  );
  const xs = valid.map((L) => L.stationM);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 100;
  const margin = Math.max(1e-6, (xMax - xMin) * 0.05 + 0.5);
  const zMax = computeModelZMaxM(valid, params);
  return { x0: xMin - margin, x1: xMax + margin, zMax };
}

function buildResultFromGrid(
  grid: ParsedModelGrid,
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
): Dipolo2DInvertResult | null {
  const { nx, nz } = grid;
  if (nx < 1 || nz < 1 || grid.mLog10.length !== nx * nz) return null;

  const { x0, x1, zMax } =
    grid.xEdgesM && grid.zEdgesM
      ? {
          x0: grid.xEdgesM[0]!,
          x1: grid.xEdgesM[nx]!,
          zMax: grid.zEdgesM[nz]!,
        }
      : meshFromReadings(readings, nx, nz, params);

  const valid = readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0);
  const yObs = (
    grid.yObsLog10 ?? valid.map((r) => Math.log10(r.rhoApparentOhmM))
  ).map((v) => v ?? 0);
  const ySyn = (grid.ySynLog10 ?? yObs).map((v) => v ?? 0);

  const result = finalizeResult(
    grid.mLog10,
    yObs,
    ySyn.length === yObs.length ? ySyn : yObs.map(() => 0),
    x0,
    x1,
    zMax,
    nx,
    nz,
    grid.iterations ?? 0,
    [],
    grid.methodId ?? "smoothness",
    grid.methodLabel ?? "Importado (modelo calculado)",
  );

  if (grid.rmsLog10 != null && Number.isFinite(grid.rmsLog10)) {
    result.rmsLog10 = grid.rmsLog10;
  }

  if (grid.xEdgesM && grid.xEdgesM.length === nx + 1) {
    result.xEdgesM = grid.xEdgesM;
  }
  if (grid.zEdgesM && grid.zEdgesM.length === nz + 1) {
    result.zEdgesM = grid.zEdgesM;
  }

  return result;
}

function parseDatageoDatFormat(text: string): ParsedModelGrid | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.some((l) => /DATAGEO_DIPOLO2D_INVERSION/i.test(l))) return null;

  let nx = 0;
  let nz = 0;
  let rms: number | undefined;
  let iterations = 0;
  const yObs: number[] = [];
  const ySyn: number[] = [];
  const model: { i: number; j: number; logR: number }[] = [];

  let section: "none" | "data" | "model" = "none";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const kv = line.match(/^(\w+)\s+(.+)$/i);
    if (kv) {
      const key = kv[1]!.toUpperCase();
      const val = parseNum(kv[2]!);
      if (key === "NX" && val != null) nx = Math.round(val);
      if (key === "NZ" && val != null) nz = Math.round(val);
      if (key === "RMS" && val != null) rms = val;
      if (key === "NITER" && val != null) iterations = Math.round(val);
    }

    if (/^DATA\s+STATION/i.test(line)) {
      section = "data";
      continue;
    }
    if (/^MODEL\s+I\s+J/i.test(line)) {
      section = "model";
      continue;
    }

    const parts = line.split(/\s+/).map(parseNum);
    if (section === "data" && parts.length >= 6) {
      const obs = parts[3];
      const syn = parts[4];
      if (obs != null && obs > 0) yObs.push(Math.log10(obs));
      if (syn != null && syn > 0) ySyn.push(Math.log10(syn));
      continue;
    }

    if (section === "model" && parts.length >= 3) {
      const i = parts[0];
      const j = parts[1];
      const logR = parts[2];
      if (i != null && j != null && logR != null && Number.isFinite(logR)) {
        model.push({ i: Math.round(i), j: Math.round(j), logR });
      }
    }
  }

  if (nx < 1 || nz < 1 || model.length === 0) return null;

  const mLog10 = new Array(nx * nz).fill(NaN);
  for (const cell of model) {
    const ii = cell.i - 1;
    const jj = cell.j - 1;
    if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
    mLog10[ii * nz + jj] = cell.logR;
  }
  if (mLog10.some((v) => !Number.isFinite(v))) return null;

  return {
    nx,
    nz,
    mLog10,
    rmsLog10: rms,
    iterations,
    yObsLog10: yObs.length > 0 ? yObs : undefined,
    ySynLog10: ySyn.length > 0 ? ySyn : undefined,
    methodLabel: "Importado DataGeo (.dat)",
  };
}

function parseModeloCelulasSection(text: string): ParsedModelGrid | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*\[MODELO_CELULAS\]/i.test(l.trim()));
  if (start < 0) return null;

  const cells: { i: number; j: number; x: number; z: number; logR: number }[] =
    [];

  for (let k = start + 1; k < lines.length; k++) {
    const line = lines[k]!.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) break;
    if (/^i\t/i.test(line)) continue;

    const parts = line.split(/\s+/).map(parseNum);
    if (parts.length < 5) continue;
    const i = parts[0];
    const j = parts[1];
    const x = parts[2];
    const z = parts[3];
    const logR = parts[4];
    if (
      i == null ||
      j == null ||
      x == null ||
      z == null ||
      logR == null ||
      !Number.isFinite(logR)
    ) {
      continue;
    }
    cells.push({
      i: Math.round(i),
      j: Math.round(j),
      x,
      z,
      logR,
    });
  }

  if (cells.length === 0) return null;

  const nx = Math.max(...cells.map((c) => c.i));
  const nz = Math.max(...cells.map((c) => c.j));
  const mLog10 = new Array(nx * nz).fill(NaN);

  let xMin = Infinity;
  let xMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;

  for (const c of cells) {
    const ii = c.i - 1;
    const jj = c.j - 1;
    if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
    mLog10[ii * nz + jj] = c.logR;
    xMin = Math.min(xMin, c.x);
    xMax = Math.max(xMax, c.x);
    zMin = Math.min(zMin, c.z);
    zMax = Math.max(zMax, c.z);
  }

  if (mLog10.some((v) => !Number.isFinite(v))) return null;

  const dx = (xMax - xMin) / Math.max(1, nx);
  const dz = (zMax - zMin) / Math.max(1, nz);
  const xEdges = new Float64Array(nx + 1);
  const zEdges = new Float64Array(nz + 1);
  for (let i = 0; i <= nx; i++) xEdges[i] = xMin - dx / 2 + i * dx;
  for (let j = 0; j <= nz; j++) zEdges[j] = zMin - dz / 2 + j * dz;

  return {
    nx,
    nz,
    mLog10,
    xEdgesM: xEdges,
    zEdgesM: zEdges,
    methodLabel: "Importado (relatório .txt)",
  };
}

/** Constrói Dipolo2DInvertResult a partir de ficheiro com modelo já calculado. */
export function parsePrecalculatedInvertResult(
  text: string,
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams = res2dinvDataPreset,
): Dipolo2DInvertResult | null {
  const grid =
    parseDatageoDatFormat(text) ?? parseModeloCelulasSection(text);
  if (!grid) return null;
  return buildResultFromGrid(grid, readings, params);
}
