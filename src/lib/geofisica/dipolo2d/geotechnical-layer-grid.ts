/**
 * Malha geotécnica 2D por faixas de ρ (Argila / Rocha alterada / Rocha sã).
 * Substitui k-means arbitrário para secção interpretativa estilo RES2DINV.
 */

import {
  classifyRhoOhmM,
  type ResistivityNormProfile,
} from "./resistivity-norms-br";
import type { LayerUnit } from "./profile-layer-segmentation";
import {
  buildModelZCoverProfile,
  zCoverInterpolated,
} from "./model-section-render";
import type { Dipolo2DInvertResult } from "./types";
import type { Dipolo2DReading } from "./types";

function idx(i: number, j: number, nz: number) {
  return i * nz + j;
}

/** Filtro de maioria 3×3 na malha (reduz ruído mantendo contatos). */
function smoothLayerGridMajority(
  layerId: Int32Array,
  nx: number,
  nz: number,
  passes: number,
  nClasses: number,
): void {
  const buf = new Int32Array(layerId.length);

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const u = idx(i, j, nz);
        const counts = new Int32Array(nClasses);
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || ii >= nx || jj < 0 || jj >= nz) continue;
            const lid = layerId[idx(ii, jj, nz)]!;
            if (lid >= 0 && lid < nClasses) counts[lid]!++;
          }
        }
        let best = layerId[u]!;
        let bestN = 0;
        for (let k = 0; k < nClasses; k++) {
          if (counts[k]! > bestN) {
            bestN = counts[k]!;
            best = k;
          }
        }
        buf[u] = best;
      }
    }
    layerId.set(buf);
  }
}

/** Corpo vertical alto-ρ → diabásio (opcional). */
function applyIntrusionOverride(
  layerId: Int32Array,
  mLog: Float64Array,
  nx: number,
  nz: number,
): void {
  const rhos: number[] = [];
  for (let k = 0; k < mLog.length; k++) rhos.push(10 ** mLog[k]!);
  rhos.sort((a, b) => a - b);
  const p80 = rhos[Math.floor(rhos.length * 0.8)] ?? 800;
  const thresh = Math.max(1200, p80 * 1.15);

  for (let i = 0; i < nx; i++) {
    let run = 0;
    let jStart = 0;
    for (let j = 0; j <= nz; j++) {
      const high =
        j < nz && 10 ** mLog[idx(i, j, nz)]! >= thresh;
      if (high) {
        if (run === 0) jStart = j;
        run++;
      } else if (run >= Math.max(3, Math.floor(nz * 0.35))) {
        for (let jj = jStart; jj < j; jj++) {
          layerId[idx(i, jj, nz)] = 2;
        }
        run = 0;
      } else {
        run = 0;
      }
    }
  }
}

/**
 * Classifica cada célula da malha invertida nas 3 classes geotécnicas (ρ).
 */
export function buildGeotechnicalLayerGrid(
  result: Dipolo2DInvertResult,
  norm: ResistivityNormProfile,
  options?: { smoothPasses?: number; detectIntrusion?: boolean },
): {
  layerId: Int32Array;
  units: LayerUnit[];
  logLo: number;
  logHi: number;
} {
  const nx = result.nx;
  const nz = result.nz;
  const layerId = new Int32Array(nx * nz);
  const classIndex = new Map(
    norm.classes.map((c, i) => [c.id, i] as const),
  );

  const logSamples: number[] = [];
  const sumRho = new Float64Array(norm.classes.length);
  const counts = new Int32Array(norm.classes.length);

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const rho = 10 ** result.mLog10[idx(i, j, nz)]!;
      logSamples.push(Math.log10(Math.max(rho, 0.5)));
      const band = classifyRhoOhmM(rho, norm);
      const lid = classIndex.get(band.id) ?? 0;
      layerId[idx(i, j, nz)] = lid;
      sumRho[lid]! += rho;
      counts[lid]!++;
    }
  }

  const nClasses = Math.max(1, norm.classes.length);
  const smoothPasses = options?.smoothPasses ?? 2;
  if (smoothPasses > 0) {
    smoothLayerGridMajority(layerId, nx, nz, smoothPasses, nClasses);
  }

  if (
    options?.detectIntrusion !== false &&
    nClasses === 3 &&
    norm.classes.some((c) => c.id === "rocha_sa")
  ) {
    applyIntrusionOverride(layerId, result.mLog10, nx, nz);
  }

  logSamples.sort((a, b) => a - b);
  const logLo = logSamples[Math.floor(logSamples.length * 0.08)] ?? 1;
  const logHi = logSamples[Math.floor(logSamples.length * 0.92)] ?? 3;

  const units: LayerUnit[] = norm.classes.map((c, id) => ({
    id,
    label: `L${id + 1}`,
    material: c.label,
    cor: c.cor,
    meanRhoOhmM:
      counts[id]! > 0
        ? sumRho[id]! / counts[id]!
        : (c.rhoMinOhmM + c.rhoMaxOhmM) / 2,
    logRhoCentroid: Math.log10(
      Math.max(c.rhoMinOhmM, (c.rhoMinOhmM + c.rhoMaxOhmM) / 2),
    ),
    cellCount: counts[id]!,
  }));

  return { layerId, units, logLo, logHi };
}

/** Oculta células fora do trapézio de cobertura (para rótulos e relatório). */
export function maskLayerGridToCoverage(
  layerId: Int32Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  readings: Dipolo2DReading[],
  factorDepth: number,
): void {
  if (!readings.length) return;
  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z1 = zEdges[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = z1 / Math.max(1, nz);
  const profile = buildModelZCoverProfile(readings, x0, x1, nx, z1, factorDepth);

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const zMid = zEdges[j]! + dz * 0.5;
      const xM = x0 + (i + 0.5) * dx;
      const zCov = zCoverInterpolated(profile, xM, x0, dx, nx);
      if (zMid > zCov + dz * 0.25) {
        layerId[i * nz + j] = -1;
      }
    }
  }
}

export type GeotechLabelRegion = {
  material: string;
  cor: string;
  xCenterM: number;
  zCenterM: number;
  cellCount: number;
};

/** Regiões para rótulos na secção interpretativa (maior mancha por material). */
export function findLabelRegions(
  layerId: Int32Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  units: LayerUnit[],
): GeotechLabelRegion[] {
  const nz1 = nz;
  const dx = (xEdges[nx]! - xEdges[0]!) / Math.max(1, nx);
  const dz = zEdges[nz]! / Math.max(1, nz);
  const visited = new Uint8Array(nx * nz);
  const regions: GeotechLabelRegion[] = [];

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz1; j++) {
      const start = idx(i, j, nz);
      const lid = layerId[start]!;
      if (lid < 0 || lid >= units.length || visited[start]) continue;

      let n = 0;
      let sumX = 0;
      let sumZ = 0;
      const stack: [number, number][] = [[i, j]];
      visited[start] = 1;

      while (stack.length) {
        const [ci, cj] = stack.pop()!;
        const u = idx(ci, cj, nz);
        if (layerId[u] !== lid) continue;
        n++;
        sumX += xEdges[ci]! + dx * 0.5;
        sumZ += zEdges[cj]! + dz * 0.5;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || ni >= nx || nj < 0 || nj >= nz1) continue;
          const v = idx(ni, nj, nz);
          if (visited[v] || layerId[v] !== lid) continue;
          visited[v] = 1;
          stack.push([ni, nj]);
        }
      }

      if (n < Math.max(6, Math.floor((nx * nz) / 80))) continue;

      const unit = units[lid];
      if (!unit) continue;
      regions.push({
        material: unit.material,
        cor: unit.cor,
        xCenterM: sumX / n,
        zCenterM: sumZ / n,
        cellCount: n,
      });
    }
  }

  const byMaterial = new Map<string, GeotechLabelRegion>();
  for (const r of regions) {
    const prev = byMaterial.get(r.material);
    if (!prev || r.cellCount > prev.cellCount) {
      byMaterial.set(r.material, r);
    }
  }
  return [...byMaterial.values()];
}
