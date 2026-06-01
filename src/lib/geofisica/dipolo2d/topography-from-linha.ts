import { interpolateTopographyAt } from "./parse-topography";
import type { SolodataLinhaState } from "./solodata-linha-types";
import type { TopographyPoint } from "./topography-types";

/** Extrai topografia das colunas Dist + Cota da folha SOLODATA. */
export function topographyFromSolodataLinha(
  state: SolodataLinhaState,
): TopographyPoint[] {
  const byX = new Map<number, TopographyPoint>();
  for (const row of state.rows) {
    const st = row.dist;
    const el = row.cota;
    if (st == null || el == null || !Number.isFinite(st) || !Number.isFinite(el)) {
      continue;
    }
    byX.set(Math.round(st * 1000) / 1000, { stationM: st, elevationM: el });
  }
  return [...byX.values()].sort((a, b) => a.stationM - b.stationM);
}

/** Preenche coluna Cota nas linhas a partir do perfil topográfico. */
export function applyTopographyToLinha(
  state: SolodataLinhaState,
  topo: TopographyPoint[],
): SolodataLinhaState {
  if (topo.length < 2) return state;
  const sorted = [...topo].sort((a, b) => a.stationM - b.stationM);
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.dist == null) return row;
      return {
        ...row,
        cota: interpolateTopographyAt(sorted, row.dist),
      };
    }),
  };
}
