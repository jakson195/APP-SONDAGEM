/**
 * Núcleo numérico da inversão 2D dipolo-dipolo (modelo linear em log₁₀ ρ).
 */

import type {
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DIterationRecord,
  Dipolo2DReading,
} from "./types";

export const NM = (nx: number, nz: number) => nx * nz;

export function idx2(i: number, j: number, nz: number) {
  return i * nz + j;
}

/** Matriz G (nd × nm), linhas normalizadas a soma 1. */
export function buildSensitivityMatrix(
  readings: Dipolo2DReading[],
  xMin: number,
  xMax: number,
  zMax: number,
  nx: number,
  nz: number,
  factorDepth: number,
  sigmaXM: number,
  sigmaZM: number,
): { G: number[][]; xCenters: Float64Array; zCenters: Float64Array } {
  const nm = NM(nx, nz);
  const dx = (xMax - xMin) / Math.max(1, nx);
  const dz = zMax / Math.max(1, nz);
  const xCenters = new Float64Array(nx);
  const zCenters = new Float64Array(nz);
  for (let i = 0; i < nx; i++) xCenters[i] = xMin + (i + 0.5) * dx;
  for (let j = 0; j < nz; j++) zCenters[j] = (j + 0.5) * dz;

  const nd = readings.length;
  const G: number[][] = [];
  const sx2 = 2 * sigmaXM * sigmaXM;
  const sz2 = 2 * sigmaZM * sigmaZM;

  for (let d = 0; d < nd; d++) {
    const row = new Array(nm).fill(0);
    const L = readings[d]!;
    const xd = L.stationM;
    const zd = factorDepth * L.n * L.aM;
    let s = 0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const wx = Math.exp(-((xd - xCenters[i]!) ** 2) / sx2);
        const wz = Math.exp(-((zd - zCenters[j]!) ** 2) / sz2);
        const w = wx * wz;
        row[idx2(i, j, nz)] = w;
        s += w;
      }
    }
    if (s > 0) {
      for (let k = 0; k < nm; k++) row[k]! /= s;
    } else {
      row[idx2(Math.min(nx - 1, Math.floor(nx / 2)), Math.min(nz - 1, Math.floor(nz / 2)), nz)] =
        1;
    }
    G.push(row);
  }
  return { G, xCenters, zCenters };
}

/** H = DxᵀDx + DzᵀDz (nm × nm), diferenças primeiras (suavidade). */
export function accumulateRoughnessH(nx: number, nz: number, H: number[][]) {
  const nm = NM(nx, nz);
  const add = (r: number, c: number, v: number) => {
    H[r]![c]! += v;
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const u = idx2(i, j, nz);
      if (i + 1 < nx) {
        const v = idx2(i + 1, j, nz);
        add(u, u, 1);
        add(v, v, 1);
        add(u, v, -1);
        add(v, u, -1);
      }
      if (j + 1 < nz) {
        const v = idx2(i, j + 1, nz);
        add(u, u, 1);
        add(v, v, 1);
        add(u, v, -1);
        add(v, u, -1);
      }
    }
  }
  if (nm === 1) {
    H[0]![0]! += 1e-12;
  }
}

export function matVec(G: number[][], x: number[]): number[] {
  const y: number[] = [];
  for (let i = 0; i < G.length; i++) {
    let s = 0;
    const row = G[i]!;
    for (let j = 0; j < row.length; j++) s += row[j]! * x[j]!;
    y.push(s);
  }
  return y;
}

export function GtWG(G: number[][], w: number[]): number[][] {
  const nd = G.length;
  const nm = G[0]!.length;
  const A: number[][] = Array.from({ length: nm }, () => new Array(nm).fill(0));
  for (let d = 0; d < nd; d++) {
    const wd = w[d]!;
    if (!(wd > 0)) continue;
    const row = G[d]!;
    for (let j = 0; j < nm; j++) {
      const gj = row[j]! * wd;
      for (let k = 0; k < nm; k++) {
        A[j]![k]! += gj * row[k]!;
      }
    }
  }
  return A;
}

export function GtWy(G: number[][], w: number[], y: number[]): number[] {
  const nd = G.length;
  const nm = G[0]!.length;
  const b = new Array(nm).fill(0);
  for (let d = 0; d < nd; d++) {
    const wd = w[d]! * y[d]!;
    const row = G[d]!;
    for (let j = 0; j < nm; j++) {
      b[j]! += row[j]! * wd;
    }
  }
  return b;
}

export function symAdd(A: number[][], B: number[][], scale: number) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      A[i]![j]! += scale * B[i]![j]!;
    }
  }
}

export function choleskySolve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (s <= 1e-18) return null;
        L[i]![j]! = Math.sqrt(s);
      } else {
        L[i]![j]! = s / L[j]![j]!;
      }
    }
  }
  const ySol = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i]![k]! * ySol[k]!;
    ySol[i]! = s / L[i]![i]!;
  }
  const xSol = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = ySol[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k]![i]! * xSol[k]!;
    xSol[i]! = s / L[i]![i]!;
  }
  return xSol;
}

export function roughnessL2FromModel(m: number[], nx: number, nz: number): number {
  let s = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const u = m[idx2(i, j, nz)]!;
      if (i + 1 < nx) {
        const v = m[idx2(i + 1, j, nz)]!;
        s += (u - v) ** 2;
      }
      if (j + 1 < nz) {
        const v = m[idx2(i, j + 1, nz)]!;
        s += (u - v) ** 2;
      }
    }
  }
  return Math.sqrt(s);
}

export function huberWeights(res: number[], c: number): number[] {
  return res.map((r) => {
    const a = Math.abs(r);
    if (a <= c || c <= 0) return 1;
    return c / a;
  });
}

/** Pesos IRLS para norma L1 nos resíduos (aproximação iterativa). */
export function l1IrlsWeights(res: number[], eps = 1e-4): number[] {
  return res.map((r) => 1 / Math.max(eps, Math.abs(r)));
}

export function clampHybridAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1;
  return Math.max(0, Math.min(1, alpha));
}

/** Mistura pesos IRLS Huber (L2) e L1: α=1 → Huber, α=0 → L1. */
export function hybridIrlsWeights(
  res: number[],
  huberC: number,
  hybridAlpha: number,
): number[] {
  const alpha = clampHybridAlpha(hybridAlpha);
  const wHub = huberWeights(res, huberC);
  const wL1 = l1IrlsWeights(res, Math.max(1e-4, huberC * 0.25));
  return wHub.map((wh, d) => alpha * wh + (1 - alpha) * wL1[d]!);
}

export function blendModels(base: number[], next: number[], alpha: number): number[] {
  const out = new Array(base.length);
  for (let i = 0; i < base.length; i++) {
    out[i] = base[i]! * (1 - alpha) + next[i]! * alpha;
  }
  return out;
}

function huberLoss(r: number, huberC: number): number {
  const a = Math.abs(r);
  const c = huberC > 0 ? huberC : Number.POSITIVE_INFINITY;
  return a <= c ? 0.5 * r * r : c * (a - 0.5 * c);
}

export function objective(
  G: number[][],
  yObs: number[],
  m: number[],
  wData: number[],
  huberC: number,
  lambda: number,
  nx: number,
  nz: number,
  hybridAlpha = 1,
): { phi: number; pred: number[]; res: number[] } {
  const pred = matVec(G, m);
  const res = yObs.map((yo, d) => yo - pred[d]!);
  const alpha = clampHybridAlpha(hybridAlpha);
  let dataTerm = 0;
  for (let d = 0; d < res.length; d++) {
    const r = res[d]!;
    const wd = wData[d] ?? 1;
    const l2 = huberLoss(r, huberC);
    const l1 = Math.abs(r);
    dataTerm += wd * (alpha * l2 + (1 - alpha) * l1);
  }
  const rough = roughnessL2FromModel(m, nx, nz);
  const phi = dataTerm + lambda * rough * rough;
  return { phi, pred, res };
}

export function rmsLog10FromRes(res: number[], nd: number): number {
  let sse = 0;
  for (let d = 0; d < nd; d++) sse += res[d]! * res[d]!;
  return Math.sqrt(sse / Math.max(1, nd));
}

export function pushIterationRecord(
  history: Dipolo2DIterationRecord[],
  iter: number,
  res: number[],
  nd: number,
  lambda: number,
  phi: number,
  rough: number,
  prevPhi: number | null,
) {
  const rms = rmsLog10FromRes(res, nd);
  const relativeGain =
    prevPhi != null && prevPhi > 0 ? (prevPhi - phi) / prevPhi : null;
  history.push({
    iter,
    rmsLog10: rms,
    lambda,
    phi,
    roughnessL2: rough,
    relativeGain,
  });
}

export function finalizeResult(
  m: number[],
  yObs: number[],
  ySyn: number[],
  x0: number,
  x1: number,
  zMax: number,
  nx: number,
  nz: number,
  iterCount: number,
  history: Dipolo2DIterationRecord[],
  methodId: Dipolo2DInvertResult["methodId"],
  methodLabel: string,
): Dipolo2DInvertResult {
  const nd = yObs.length;
  let sse = 0;
  for (let d = 0; d < nd; d++) {
    const e = yObs[d]! - ySyn[d]!;
    sse += e * e;
  }
  const rmsLog10 = Math.sqrt(sse / Math.max(1, nd));
  const rough = roughnessL2FromModel(m, nx, nz);

  const xEdges = new Float64Array(nx + 1);
  const zEdges = new Float64Array(nz + 1);
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = zMax / Math.max(1, nz);
  for (let i = 0; i <= nx; i++) xEdges[i] = x0 + i * dx;
  for (let j = 0; j <= nz; j++) zEdges[j] = j * dz;

  return {
    mLog10: Float64Array.from(m),
    xEdgesM: xEdges,
    zEdgesM: zEdges,
    yObsLog10: Float64Array.from(yObs),
    ySynLog10: Float64Array.from(ySyn),
    rmsLog10,
    roughnessL2: rough,
    iterations: iterCount,
    iterationHistory: history,
    nx,
    nz,
    methodId,
    methodLabel,
  };
}

export type InvertProblem = {
  valid: Dipolo2DReading[];
  G: number[][];
  yObs: number[];
  Hreg: number[][];
  wData: number[];
  x0: number;
  x1: number;
  zMax: number;
  nx: number;
  nz: number;
  nd: number;
  nm: number;
  ridge: number;
};

export function prepareInvertProblem(
  readings: Dipolo2DReading[],
  p: Dipolo2DInvertParams,
): InvertProblem | null {
  const valid = readings.filter(
    (L) =>
      Number.isFinite(L.stationM) &&
      L.n >= 1 &&
      L.rhoApparentOhmM > 0 &&
      L.aM > 0,
  );
  if (valid.length < 4) return null;

  const xs = valid.map((L) => L.stationM);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const margin = Math.max(1e-6, (xMax - xMin) * 0.05 + 0.5);
  const x0 = xMin - margin;
  const x1 = xMax + margin;
  const aMed =
    valid.reduce((acc, L) => acc + L.aM, 0) / Math.max(1, valid.length);
  const nMax = Math.max(...valid.map((L) => L.n));
  const zMax = Math.max(aMed * nMax * p.factorDepth * 1.25, aMed * 2);

  const { nx, nz } = p;
  const { G } = buildSensitivityMatrix(
    valid,
    x0,
    x1,
    zMax,
    nx,
    nz,
    p.factorDepth,
    p.sigmaXM,
    p.sigmaZM,
  );

  const nd = valid.length;
  const nm = NM(nx, nz);
  const yObs = valid.map((L) => Math.log10(Math.max(1e-12, L.rhoApparentOhmM)));
  const Hreg: number[][] = Array.from({ length: nm }, () => new Array(nm).fill(0));
  accumulateRoughnessH(nx, nz, Hreg);
  const wData = valid.map((L) => 1 / Math.sqrt(Math.max(1, L.n)));

  return {
    valid,
    G,
    yObs,
    Hreg,
    wData,
    x0,
    x1,
    zMax,
    nx,
    nz,
    nd,
    nm,
    ridge: 1e-6,
  };
}

export function initialModelFromBackproject(
  G: number[][],
  yObs: number[],
  nd: number,
  nm: number,
): number[] {
  const m = new Array(nm).fill(0);
  for (let k = 0; k < nm; k++) {
    let s = 0;
    let w = 0;
    for (let d = 0; d < nd; d++) {
      const g = G[d]![k]!;
      if (g > 0) {
        s += g * yObs[d]!;
        w += g;
      }
    }
    m[k] = w > 0 ? s / w : yObs.reduce((a, b) => a + b, 0) / nd;
  }
  return m;
}

export function solveRegularized(
  G: number[][],
  yObs: number[],
  w: number[],
  Hreg: number[][],
  lambda: number,
  nm: number,
  ridge: number,
): number[] | null {
  const A = GtWG(G, w);
  for (let i = 0; i < nm; i++) A[i]![i]! += ridge;
  symAdd(A, Hreg, lambda);
  const b = GtWy(G, w, yObs);
  return choleskySolve(A, b);
}

export function acceptLineSearch(
  G: number[][],
  yObs: number[],
  m: number[],
  candidate: number[],
  wData: number[],
  huberC: number,
  lambda: number,
  nx: number,
  nz: number,
  best: { phi: number; pred: number[]; res: number[] },
  hybridAlpha = 1,
): { m: number[]; best: { phi: number; pred: number[]; res: number[] }; accepted: boolean } {
  const alphas = [1, 0.75, 0.5, 0.3, 0.15];
  for (const alpha of alphas) {
    const trialM = blendModels(m, candidate, alpha);
    const trial = objective(
      G,
      yObs,
      trialM,
      wData,
      huberC,
      lambda,
      nx,
      nz,
      hybridAlpha,
    );
    if (trial.phi < best.phi) {
      return { m: trialM, best: trial, accepted: true };
    }
  }
  return { m, best, accepted: false };
}
