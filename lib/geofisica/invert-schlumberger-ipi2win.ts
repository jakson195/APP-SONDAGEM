/**
 * Inversão 1D SEV Schlumberger — forward físico (Koefoed + filtro digital) em
 * `./sev-forward-physical.ts` e ajuste Gauss–Newton com regularização.
 */

import type { ModeloSchlumbergerCamadas } from "./types";
import { forwardSchlumbergerPhysical } from "./sev-forward-physical";

export type { ModeloSchlumbergerCamadas } from "./types";
export { forwardSchlumbergerPhysical } from "./sev-forward-physical";
/** Alias histórico: mesmo que `forwardSchlumbergerPhysical`. */
export const forwardSchlumbergerIpi2Win = forwardSchlumbergerPhysical;

function logspace(a: number, b: number, n: number): number[] {
  if (n < 2) return [a];
  const res: number[] = [];
  const la = Math.log10(a);
  const lb = Math.log10(b);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    res.push(10 ** (la + t * (lb - la)));
  }
  return res;
}

function buildInitialModel(
  ab2: number[],
  data: number[],
  n: number,
): { rhos: number[]; hs: number[] } {
  const rmin = Math.min(...data);
  const rmax = Math.max(...data);
  const rhos = logspace(rmin, rmax, n);

  const maxDepth = Math.max(...ab2) / 3;
  const depths = logspace(1, Math.max(maxDepth, 2), n);

  const hs: number[] = [];
  for (let i = 0; i < depths.length - 1; i++) {
    hs.push(depths[i + 1]! - depths[i]!);
  }

  return { rhos, hs };
}

function jacobian(ab2: number[], model: ModeloSchlumbergerCamadas): number[][] {
  const base = forwardSchlumbergerPhysical(ab2, model);
  const m = [...model.rhoOhmM, ...model.hM];

  const J: number[][] = [];
  for (let i = 0; i < base.length; i++) {
    J[i] = [];
  }

  for (let k = 0; k < m.length; k++) {
    const pert = [...m];
    const delta = m[k]! * 0.01 + 1e-6;

    pert[k]! += delta;

    const test: ModeloSchlumbergerCamadas = {
      rhoOhmM: pert.slice(0, model.rhoOhmM.length),
      hM: pert.slice(model.rhoOhmM.length),
    };

    const f = forwardSchlumbergerPhysical(ab2, test);

    for (let i = 0; i < f.length; i++) {
      J[i]![k] = (f[i]! - base[i]!) / delta;
    }
  }

  return J;
}

function transpose(A: number[][]): number[][] {
  if (A.length === 0) return [];
  return A[0]!.map((_, i) => A.map((r) => r[i]!));
}

function matmul(A: number[][], B: number[][]): number[][] {
  const res = Array(A.length)
    .fill(0)
    .map(() => Array(B[0]!.length).fill(0));

  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B[0]!.length; j++) {
      for (let k = 0; k < B.length; k++) {
        res[i]![j] += A[i]![k]! * B[k]![j]!;
      }
    }
  }
  return res;
}

function matvec(A: number[][], x: number[]): number[] {
  return A.map((r) => r.reduce((s, v, i) => s + v * x[i]!, 0));
}

function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]!]);

  for (let i = 0; i < n; i++) {
    let max = i;

    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k]![i]!) > Math.abs(M[max]![i]!)) max = k;
    }

    [M[i], M[max]] = [M[max]!, M[i]!];

    const div = M[i]![i]! || 1e-10;

    for (let j = i; j <= n; j++) {
      M[i]![j]! /= div;
    }

    for (let k = 0; k < n; k++) {
      if (k === i) continue;

      const factor = M[k]![i]!;

      for (let j = i; j <= n; j++) {
        M[k]![j]! -= factor * M[i]![j]!;
      }
    }
  }

  return M.map((r) => r[n]!);
}

function buildL(n: number): number[][] {
  const size = 2 * n - 1;
  const L: number[][] = [];

  for (let i = 1; i < size - 1; i++) {
    const row = Array(size).fill(0);
    row[i - 1] = 1;
    row[i] = -2;
    row[i + 1] = 1;
    L.push(row);
  }

  return L;
}

function rmsRelativePct(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const den = a[i]! || 1e-12;
    s += ((a[i]! - b[i]!) / den) ** 2;
  }
  return Math.sqrt(s / a.length) * 100;
}

/**
 * Garante espessuras e resistividades coerentes com o arranjo (profundidade ~ ordem de AB/2).
 * Chamado no fim da inversão e pode reaplicar-se no cliente se existir estado antigo.
 */
export function clampSchlumbergerModelToSurvey(
  model: ModeloSchlumbergerCamadas,
  abHalfMax: number,
  rhoMeasMin: number,
  rhoMeasMax: number,
): ModeloSchlumbergerCamadas {
  const ab = Math.max(1e-6, abHalfMax);
  const hMax = Math.min(320, Math.max(5, ab * 2.8));
  const minHz = Math.max(0.2, ab / 600);
  const sumCap = Math.min(1200, Math.max(50, ab * 8));

  const rLo = Math.max(0.01, rhoMeasMin * 0.02);
  const rHi = Math.min(5e5, Math.max(rhoMeasMax * 30, rhoMeasMax * 1.5));

  let rhoOhmM = model.rhoOhmM.map((r) => {
    if (!Number.isFinite(r) || r <= 0) return Math.sqrt(rLo * rHi);
    return Math.min(Math.max(r, rLo), rHi);
  });

  if (rhoOhmM.length < 2) {
    const r1 = Math.min(Math.max(rhoMeasMin, rLo), rHi);
    const r2 = Math.min(Math.max(rhoMeasMax, rLo), rHi);
    rhoOhmM = r1 >= r2 ? [r1, r2 * 1.05] : [r1, r2];
  }

  const n = rhoOhmM.length;
  const needH = n - 1;
  const defaultThickness = Math.max(
    minHz,
    Math.min(hMax / needH, ab / Math.max(3, needH)),
  );

  let hs: number[] = [];
  for (let i = 0; i < needH; i++) {
    const h = model.hM[i];
    if (h !== undefined && Number.isFinite(h) && h > 0) {
      hs.push(h);
    } else {
      hs.push(defaultThickness);
    }
  }

  hs = hs.map((h) => Math.min(Math.max(h, minHz), hMax));
  let sumH = hs.reduce((s, h) => s + h, 0);
  if (sumH > sumCap && sumH > 0) {
    const s = sumCap / sumH;
    hs = hs.map((h) => h * s);
  }

  return { rhoOhmM, hM: hs };
}

/**
 * @param ab2 Meio-espalhamentos AB/2 (m), ordenados.
 * @param data Resistividades aparentes medidas (Ω·m), mesmo comprimento que ab2.
 * @param nLayers Número de camadas (≥ 2); a última é o semi-espaço.
 */
export function invertSchlumbergerIpi2Win(
  ab2: number[],
  data: number[],
  nLayers: number,
): { model: ModeloSchlumbergerCamadas; syntheticRho: number[]; rmsRelativoPct: number } | null {
  if (nLayers < 2 || ab2.length !== data.length || ab2.length < 3) return null;
  if (!ab2.every((x) => x > 0 && Number.isFinite(x))) return null;
  if (!data.every((x) => x > 0 && Number.isFinite(x))) return null;

  const abMax = Math.max(...ab2);
  const rhoDataMin = Math.min(...data);
  const rhoDataMax = Math.max(...data);
  /** Limite por camada finita (m): ~ profundidade de investigação em SEV. */
  const hMaxLayer = Math.min(320, Math.max(6, abMax * 2.8));
  /** Soma das espessuras finitas (m). */
  const hSumMax = Math.min(1200, Math.max(50, abMax * 8));
  const rhoLo = Math.max(1e-3, rhoDataMin * 0.03);
  const rhoHi = Math.max(rhoDataMax * 40, rhoDataMax + 50);

  let inner: { rhos: number[]; hs: number[] } = buildInitialModel(ab2, data, nLayers);
  /** Regularização mais forte no início evita passos enormes em h. */
  let lambdaReg = 40;

  const L = buildL(nLayers);

  const minH = Math.max(0.35, abMax / 200);

  const clampStep = (v: number, dv: number, maxRel: number): number => {
    if (!Number.isFinite(v) || !Number.isFinite(dv)) return v;
    const cap = Math.max(Math.abs(v) * maxRel, 1e-9);
    const d = Math.max(-cap * 2.5, Math.min(cap * 2.5, dv));
    return v + d;
  };

  for (let iter = 0; iter < 40; iter++) {
    const calc = forwardSchlumbergerPhysical(ab2, {
      rhoOhmM: inner.rhos,
      hM: inner.hs,
    });
    const r = data.map((d, i) => d - calc[i]!);

    const J = jacobian(ab2, { rhoOhmM: inner.rhos, hM: inner.hs });
    const JT = transpose(J);

    const JTJ = matmul(JT, J);
    const LTL = matmul(transpose(L), L);

    const A = JTJ.map((row, i) =>
      row.map((v, j) => v + lambdaReg * LTL[i]![j]!),
    );

    const g = matvec(JT, r);

    const dm = solve(A, g);

    if (dm.some((x) => !Number.isFinite(x))) {
      break;
    }

    const mvec = [...inner.rhos, ...inner.hs];
    const absStepH = Math.min(hMaxLayer * 0.35, abMax * 0.22);
    const next = mvec.map((v, i) => {
      const dv = dm[i]!;
      if (i < nLayers) {
        const nv = clampStep(v, dv, 0.35);
        return Math.min(Math.max(nv, rhoLo), rhoHi);
      }
      const dClamped = Math.max(-absStepH, Math.min(absStepH, dv));
      const nv = v + dClamped;
      return Math.min(Math.max(nv, minH), hMaxLayer);
    });

    inner = {
      rhos: next.slice(0, nLayers),
      hs: next.slice(nLayers),
    };

    let sumH = inner.hs.reduce((s, h) => s + h, 0);
    if (sumH > hSumMax && sumH > 0) {
      const s = hSumMax / sumH;
      inner = { rhos: inner.rhos, hs: inner.hs.map((h) => h * s) };
    }

    const err = rmsRelativePct(data, calc);

    if (err < 3) break;

    lambdaReg = Math.max(4, lambdaReg * 0.92);
  }

  const model = clampSchlumbergerModelToSurvey(
    { rhoOhmM: inner.rhos, hM: inner.hs },
    abMax,
    rhoDataMin,
    rhoDataMax,
  );
  const syntheticRho = forwardSchlumbergerPhysical(ab2, model);
  const rmsRelativoPct = rmsRelativePct(data, syntheticRho);

  return { model, syntheticRho, rmsRelativoPct };
}
