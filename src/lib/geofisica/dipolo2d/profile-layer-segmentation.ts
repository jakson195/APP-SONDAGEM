import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";
import type { GeologicMaterialRho } from "./interpret-types";

export type VisibleCell = {
  i: number;
  j: number;
  xM: number;
  zM: number;
  rhoOhmM: number;
  logRho: number;
};

export type LayerUnit = {
  id: number;
  label: string;
  material: string;
  cor: string;
  meanRhoOhmM: number;
  logRhoCentroid: number;
  cellCount: number;
};

export type GeologicContactLine = {
  /** Polilinha em metros (estação, profundidade). */
  points: { xM: number; zM: number }[];
  layerAboveId: number;
  layerBelowId: number;
  layerAbove: string;
  layerBelow: string;
};

function maxPseudoDepthAtX(
  readings: Dipolo2DReading[],
  xCenter: number,
  halfWidth: number,
  factorDepth: number,
): number {
  let zMax = 0;
  for (const r of readings) {
    if (Math.abs(r.stationM - xCenter) > halfWidth) continue;
    zMax = Math.max(zMax, factorDepth * r.n * r.aM);
  }
  return zMax;
}

/** Células visíveis da secção invertida (trapézio de cobertura). */
export function extractVisibleCells(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
): VisibleCell[] {
  const nx = result.nx;
  const nz = result.nz;
  const dx = (result.xEdgesM[nx]! - result.xEdgesM[0]!) / Math.max(1, nx);
  const dz = result.zEdgesM[nz]! / Math.max(1, nz);
  const out: VisibleCell[] = [];

  for (let i = 0; i < nx; i++) {
    const xCenter = result.xEdgesM[i]! + dx * 0.5;
    const zCover = readings.length
      ? maxPseudoDepthAtX(readings, xCenter, dx * 0.75, params.factorDepth)
      : result.zEdgesM[nz]!;
    for (let j = 0; j < nz; j++) {
      const zMid = result.zEdgesM[j]! + dz * 0.5;
      if (zMid > zCover + dz * 0.5) continue;
      const rho = 10 ** result.mLog10[i * nz + j]!;
      out.push({
        i,
        j,
        xM: xCenter,
        zM: zMid,
        rhoOhmM: rho,
        logRho: Math.log10(Math.max(rho, 0.5)),
      });
    }
  }
  return out;
}

function kMeansLogRho(
  cells: VisibleCell[],
  k: number,
  maxIter = 40,
): Int32Array {
  const n = cells.length;
  const assign = new Int32Array(n);
  if (n === 0) return assign;
  const kk = Math.max(2, Math.min(k, Math.min(6, Math.floor(n / 4))));

  const sorted = [...cells].sort((a, b) => a.logRho - b.logRho);
  const centroids: number[] = [];
  for (let c = 0; c < kk; c++) {
    const idx = Math.min(
      n - 1,
      Math.floor(((c + 0.5) / kk) * n),
    );
    centroids.push(sorted[idx]!.logRho);
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false;
    const sums = new Float64Array(kk);
    const counts = new Int32Array(kk);

    for (let p = 0; p < n; p++) {
      const lr = cells[p]!.logRho;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const d = Math.abs(lr - centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[p] !== best) moved = true;
      assign[p] = best;
      sums[best]! += lr;
      counts[best]!++;
    }

    for (let c = 0; c < kk; c++) {
      if (counts[c]! > 0) centroids[c] = sums[c]! / counts[c]!;
    }
    if (!moved) break;
  }

  return assign;
}

function pickLayerCount(cells: VisibleCell[]): number {
  if (cells.length < 12) return 2;
  const logs = cells.map((c) => c.logRho).sort((a, b) => a - b);
  let gaps = 0;
  const gapThresh = 0.18;
  for (let i = 1; i < logs.length; i++) {
    if (logs[i]! - logs[i - 1]! > gapThresh) gaps++;
  }
  return Math.max(2, Math.min(5, gaps + 1));
}

function scoreMaterial(
  rhoOhmM: number,
  mat: GeologicMaterialRho,
): number {
  const logR = Math.log10(Math.max(rhoOhmM, 0.5));
  const logLo = Math.log10(Math.max(mat.rhoMinOhmM, 0.5));
  const logHi = Math.log10(Math.max(mat.rhoMaxOhmM, mat.rhoMinOhmM * 1.05));
  const mid = (logLo + logHi) / 2;
  const half = Math.max(0.08, (logHi - logLo) / 2);
  const fit = Math.max(0, 1 - Math.abs(logR - mid) / half);
  // Ajuste de ρ domina; prior regional só desempata.
  return fit * fit * (0.35 + 0.65 * mat.prior);
}

function classifyRho(
  rhoOhmM: number,
  materials: GeologicMaterialRho[],
): { nome: string; cor: string } {
  let best = materials[0]!;
  let bestScore = -1;
  for (const m of materials) {
    const s = scoreMaterial(rhoOhmM, m);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return { nome: best.nome, cor: best.cor };
}

/** Mapa i,j → id de camada (ou -1 fora da máscara). */
export function buildLayerGrid(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  materials: GeologicMaterialRho[],
): {
  layerId: Int32Array;
  units: LayerUnit[];
  cells: VisibleCell[];
  logLo: number;
  logHi: number;
} {
  const nx = result.nx;
  const nz = result.nz;
  const cells = extractVisibleCells(result, params, readings);
  const layerId = new Int32Array(nx * nz).fill(-1);

  if (!cells.length) {
    return { layerId, units: [], cells, logLo: 1, logHi: 3 };
  }

  const logs = cells.map((c) => c.logRho).sort((a, b) => a - b);
  const p08 = logs[Math.floor(logs.length * 0.08)] ?? logs[0]!;
  const p92 = logs[Math.floor(logs.length * 0.92)] ?? logs[logs.length - 1]!;

  const k = pickLayerCount(cells);
  const assign = kMeansLogRho(cells, k);

  const clusterStats = new Map<
    number,
    { sumRho: number; sumLog: number; n: number }
  >();
  for (let p = 0; p < cells.length; p++) {
    const c = cells[p]!;
    const cid = assign[p]!;
    const st = clusterStats.get(cid) ?? { sumRho: 0, sumLog: 0, n: 0 };
    st.sumRho += c.rhoOhmM;
    st.sumLog += c.logRho;
    st.n++;
    clusterStats.set(cid, st);
    layerId[c.i * nz + c.j] = cid;
  }

  const units: LayerUnit[] = [...clusterStats.entries()]
    .map(([id, st]) => {
      const meanRho = st.sumRho / st.n;
      const { nome, cor } = classifyRho(meanRho, materials);
      return {
        id,
        label: `Camada ${id + 1}`,
        material: nome,
        cor,
        meanRhoOhmM: meanRho,
        logRhoCentroid: st.sumLog / st.n,
        cellCount: st.n,
      };
    })
    .sort((a, b) => a.logRhoCentroid - b.logRhoCentroid);

  const idRemap = new Map(units.map((u, idx) => [u.id, idx]));
  for (let p = 0; p < cells.length; p++) {
    const c = cells[p]!;
    const old = assign[p]!;
    const neu = idRemap.get(old) ?? old;
    layerId[c.i * nz + c.j] = neu;
    assign[p] = neu;
  }
  for (let i = 0; i < units.length; i++) {
    units[i]!.id = i;
    units[i]!.label = `Camada ${i + 1}`;
  }

  return { layerId, units, cells, logLo: p08, logHi: p92 };
}

function unitById(units: LayerUnit[], id: number): LayerUnit {
  return units[id] ?? {
    id,
    label: "?",
    material: "Indefinido",
    cor: "#94a3b8",
    meanRhoOhmM: 100,
    logRhoCentroid: 2,
    cellCount: 0,
  };
}

/**
 * Linhas de contato nas fronteiras entre células com camadas diferentes.
 */
export function extractContactLines(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  layerId: Int32Array,
  units: LayerUnit[],
): GeologicContactLine[] {
  const nx = result.nx;
  const nz = result.nz;
  const dx = (result.xEdgesM[nx]! - result.xEdgesM[0]!) / Math.max(1, nx);
  const segments: {
    x1: number;
    z1: number;
    x2: number;
    z2: number;
    above: number;
    below: number;
  }[] = [];

  const visible = (i: number, j: number) => layerId[i * nz + j]! >= 0;

  for (let i = 0; i < nx; i++) {
    const xCenter = result.xEdgesM[i]! + dx * 0.5;
    const zCover = readings.length
      ? maxPseudoDepthAtX(
          readings,
          xCenter,
          dx * 0.75,
          params.factorDepth,
        )
      : result.zEdgesM[nz]!;
    const xL = result.xEdgesM[i]!;
    const xR = result.xEdgesM[i + 1]!;

    for (let j = 0; j < nz - 1; j++) {
      const zMid = result.zEdgesM[j]! + (result.zEdgesM[j + 1]! - result.zEdgesM[j]!) * 0.5;
      if (zMid > zCover) continue;
      if (!visible(i, j) || !visible(i, j + 1)) continue;
      const above = layerId[i * nz + j]!;
      const below = layerId[i * nz + (j + 1)]!;
      if (above === below) continue;
      const zB = result.zEdgesM[j + 1]!;
      segments.push({
        x1: xL,
        z1: zB,
        x2: xR,
        z2: zB,
        above,
        below,
      });
    }
  }

  for (let j = 0; j < nz; j++) {
    const zT = result.zEdgesM[j]!;
    const zB = result.zEdgesM[j + 1] ?? zT + 1;
    const zMid = (zT + zB) / 2;
    for (let i = 0; i < nx - 1; i++) {
      const xC = result.xEdgesM[i]! + dx * 0.5;
      const zCover = readings.length
        ? maxPseudoDepthAtX(readings, xC, dx * 0.75, params.factorDepth)
        : result.zEdgesM[nz]!;
      if (zMid > zCover) continue;
      if (!visible(i, j) || !visible(i + 1, j)) continue;
      const left = layerId[i * nz + j]!;
      const right = layerId[(i + 1) * nz + j]!;
      if (left === right) continue;
      const xE = result.xEdgesM[i + 1]!;
      segments.push({
        x1: xE,
        z1: zT,
        x2: xE,
        z2: zB,
        above: left,
        below: right,
      });
    }
  }

  const merged = new Map<string, GeologicContactLine>();

  for (const s of segments) {
    const key = `${s.above}-${s.below}`;
    const ua = unitById(units, s.above);
    const ub = unitById(units, s.below);
    const line = merged.get(key) ?? {
      points: [],
      layerAboveId: s.above,
      layerBelowId: s.below,
      layerAbove: ua.material,
      layerBelow: ub.material,
    };
    line.points.push(
      { xM: s.x1, zM: s.z1 },
      { xM: s.x2, zM: s.z2 },
    );
    merged.set(key, line);
  }

  return [...merged.values()];
}

/** Camadas na coluna central (perfil representativo). */
export function columnLayersFromGrid(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  layerId: Int32Array,
  units: LayerUnit[],
  colIndex: number,
): { topo: number; base: number; cor: string; material: string; layerId: number }[] {
  const nx = result.nx;
  const nz = result.nz;
  const i = Math.min(nx - 1, Math.max(0, colIndex));
  const dx = (result.xEdgesM[nx]! - result.xEdgesM[0]!) / Math.max(1, nx);
  const dz = result.zEdgesM[nz]! / Math.max(1, nz);
  const xCenter = result.xEdgesM[i]! + dx * 0.5;
  const zCover = readings.length
    ? maxPseudoDepthAtX(readings, xCenter, dx * 0.75, params.factorDepth)
    : result.zEdgesM[nz]!;

  const raw: { topo: number; base: number; lid: number }[] = [];
  for (let j = 0; j < nz; j++) {
    const lid = layerId[i * nz + j]!;
    if (lid < 0) continue;
    const zTop = result.zEdgesM[j]!;
    const zBase = result.zEdgesM[j + 1] ?? zTop + dz;
    if (zTop > zCover) continue;
    raw.push({ topo: zTop, base: Math.min(zBase, zCover), lid });
  }

  const merged: { topo: number; base: number; lid: number }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && last.lid === r.lid && Math.abs(last.base - r.topo) < 0.3) {
      last.base = r.base;
    } else {
      merged.push({ ...r });
    }
  }

  return merged.map((m) => {
    const u = unitById(units, m.lid);
    return {
      topo: m.topo,
      base: m.base,
      cor: u.cor,
      material: u.material,
      layerId: m.lid,
    };
  });
}
