/**
 * Inversão 2D suavizada estilo “RES2DINV-like” para perfil dipolo-dipolo:
 * modelo linear em log₁₀(ρ) de células, linhas de sensibilidade gaussianas
 * em (x, z pseudo), regularização Laplaciana discreta e pesos Huber nos resíduos.
 *
 * Isto é um modelo interpretativo rápido (não substitui RES2DINV completo).
 */

import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";

const NM = (nx: number, nz: number) => nx * nz;

function idx2(i: number, j: number, nz: number) {
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
  // evitar matriz nula se nx=nz=1
  if (nm === 1) {
    H[0]![0]! += 1e-12;
  }
}

function matVec(G: number[][], x: number[]): number[] {
  const y: number[] = [];
  for (let i = 0; i < G.length; i++) {
    let s = 0;
    const row = G[i]!;
    for (let j = 0; j < row.length; j++) s += row[j]! * x[j]!;
    y.push(s);
  }
  return y;
}

function GtWG(G: number[][], w: number[]): number[][] {
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

function GtWy(G: number[][], w: number[], y: number[]): number[] {
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

function symAdd(A: number[][], B: number[][], scale: number) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      A[i]![j]! += scale * B[i]![j]!;
    }
  }
}

function choleskySolve(A: number[][], b: number[]): number[] | null {
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

function roughnessL2FromModel(m: number[], nx: number, nz: number): number {
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

function huberWeights(res: number[], c: number): number[] {
  return res.map((r) => {
    const a = Math.abs(r);
    if (a <= c || c <= 0) return 1;
    return c / a;
  });
}

export function invertDipolo2DSmoothRes2dinvLike(
  readings: Dipolo2DReading[],
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult | null {
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

  const ridge = 1e-6;
  let m = new Array(nm).fill(0);
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

  let iter = 0;
  let wHub = new Array(nd).fill(1);

  for (iter = 0; iter < p.maxIter; iter++) {
    const A = GtWG(G, wHub);
    for (let i = 0; i < nm; i++) A[i]![i]! += ridge;
    symAdd(A, Hreg, p.lambda);
    const b = GtWy(G, wHub, yObs);
    const sol = choleskySolve(A, b);
    if (!sol) break;
    m = sol;
    const pred = matVec(G, m);
    const res = yObs.map((yo, d) => yo - pred[d]!);
    wHub = huberWeights(res, p.huberC);
  }

  const ySyn = matVec(G, m);
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
    iterations: iter + 1,
    nx,
    nz,
  };
}
