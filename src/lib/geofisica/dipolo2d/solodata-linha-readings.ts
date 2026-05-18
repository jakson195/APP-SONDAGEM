import type { Dipolo2DReading } from "./types";
import type { SolodataLinhaRow, SolodataLinhaState } from "./solodata-linha-types";

/** Leituras para inversão 2D a partir das colunas Dist, Esp, N, R ap (entrada vermelha). */
export function solodataLinhaToReadings(
  state: SolodataLinhaState,
  defaultAM: number,
): Dipolo2DReading[] {
  const aDef = defaultAM > 0 && Number.isFinite(defaultAM) ? defaultAM : 15;
  const out: Dipolo2DReading[] = [];
  for (const row of state.rows) {
    const rho = row.rap;
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
    });
  }
  return out;
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
  };
}

export function readingsToSolodataLinha(
  readings: Dipolo2DReading[],
  base: SolodataLinhaState,
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
  return { ...base, rows };
}
