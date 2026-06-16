import type { Dipolo2DReading } from "./types";
import { applyTopographyToLinha } from "./topography-from-linha";
import type { TopographyPoint } from "./topography-types";
import { computeSolodataLinhaRow, withSolodataLinhaCalculations } from "./solodata-linha-compute";
import type { SolodataLinhaRow, SolodataLinhaState } from "./solodata-linha-types";

/** Leituras para inversão 2D a partir das colunas Dist, Esp, N, R ap (entrada vermelha). */
export function solodataLinhaToReadings(
  state: SolodataLinhaState,
  defaultAM: number,
): Dipolo2DReading[] {
  const aDef = defaultAM > 0 && Number.isFinite(defaultAM) ? defaultAM : 15;
  const out: Dipolo2DReading[] = [];
  for (let rowIndex = 0; rowIndex < state.rows.length; rowIndex++) {
    const row = computeSolodataLinhaRow(state.rows[rowIndex]!, aDef);
    const rho = row.rap ?? row.rapCalc;
    const n = row.nSep;
    const st = row.dist;
    const aCell = row.esp;
    if (rho == null || !(rho > 0) || n == null || !(n >= 1)) continue;
    const stUse =
      st != null && Number.isFinite(st)
        ? st
        : row.m2 != null && Number.isFinite(row.m2)
          ? row.m2
          : null;
    if (stUse == null || !Number.isFinite(stUse)) continue;
    const aUse =
      aCell != null && aCell > 0 && Number.isFinite(aCell) ? aCell : aDef;
    out.push({
      stationM: stUse,
      n: Math.max(1, Math.round(n)),
      rhoApparentOhmM: rho,
      aM: aUse,
      spMv: row.spMv,
      vMv: row.vMv,
      iMa: row.iMa,
      sourceRowIndex: rowIndex,
      excluded: row.excluded === true,
    });
  }
  return out;
}

/** Aplica o mesmo ESP (m) a todas as linhas e recalcula K, Rap e posições. */
export function applyGlobalEspToLinha(
  state: SolodataLinhaState,
  espM: number,
): SolodataLinhaState {
  const esp = espM > 0 && Number.isFinite(espM) ? espM : 15;
  const rows = state.rows.map((row) => ({
    ...row,
    espM: esp,
    esp: esp,
  }));
  return withSolodataLinhaCalculations({ ...state, rows }, esp);
}

export function activeReadingsForInversion(
  readings: Dipolo2DReading[],
): Dipolo2DReading[] {
  return readings.filter((r) => !r.excluded);
}

export function excludedReadingIndices(readings: Dipolo2DReading[]): Set<number> {
  const s = new Set<number>();
  readings.forEach((r, i) => {
    if (r.excluded) s.add(i);
  });
  return s;
}

export function toggleReadingExcluded(
  state: SolodataLinhaState,
  reading: Dipolo2DReading,
  excluded: boolean,
): SolodataLinhaState {
  const idx = reading.sourceRowIndex;
  if (idx == null || idx < 0 || idx >= state.rows.length) return state;
  const rows = state.rows.map((row, i) =>
    i === idx ? { ...row, excluded } : row,
  );
  return { ...state, rows };
}

function emptyRowFromReading(
  L: Dipolo2DReading,
  medida: number,
): SolodataLinhaRow {
  return {
    medida,
    piquete: 1,
    espM: L.aM,
    a: null,
    b: null,
    m: null,
    nEl: null,
    nivel: L.n,
    spMv: null,
    vMv: null,
    iMa: null,
    g: null,
    k: null,
    rapCalc: null,
    a2: null,
    b2: null,
    m2: null,
    n2: null,
    dist: L.stationM,
    esp: L.aM,
    nSep: L.n,
    rap: L.rhoApparentOhmM,
    cota: null,
  };
}

export function readingsToSolodataLinha(
  readings: Dipolo2DReading[],
  base: SolodataLinhaState,
  topography?: TopographyPoint[],
): SolodataLinhaState {
  const rows = base.rows.map((r) => ({ ...r }));
  let i = 0;
  for (const L of readings) {
    while (i < rows.length && rows[i]!.rap != null && rows[i]!.rap! > 0) {
      i++;
    }
    if (i >= rows.length) {
      rows.push(emptyRowFromReading(L, rows.length + 1));
    } else {
      rows[i] = {
        ...rows[i]!,
        dist: L.stationM,
        esp: L.aM,
        nSep: L.n,
        rap: L.rhoApparentOhmM,
        nivel: L.n,
      };
      i++;
    }
  }
  let state: SolodataLinhaState = { ...base, rows };
  if (topography && topography.length >= 2) {
    state = applyTopographyToLinha(state, topography);
  }
  return state;
}
