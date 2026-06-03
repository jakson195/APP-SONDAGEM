/**
 * Escala de visualização do modelo invertido (ρ em Ω·m) — independente do solver.
 */

export type ModelDisplayScale = "log" | "linear";

export type ModelContrastMode =
  | "auto"
  | "percentile"
  | "minmax"
  | "standard"
  | "equalize"
  | "stdstretch"
  | "manual"
  | "res2dinv";

export type ModelDisplayBounds = {
  logLo: number;
  logHi: number;
  rhoMinOhmM: number;
  rhoMaxOhmM: number;
  scaleLabel: string;
};

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function rhoPercentileBounds(
  rhoValues: number[],
  pLo = 5,
  pHi = 95,
): { rhoMin: number; rhoMax: number } {
  const positive = rhoValues.filter((v) => v > 0 && Number.isFinite(v));
  if (!positive.length) return { rhoMin: 10, rhoMax: 1000 };
  const sorted = [...positive].sort((a, b) => a - b);
  const iLo = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * (pLo / 100))),
  );
  const iHi = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * (pHi / 100))),
  );
  let rhoMin = sorted[iLo]!;
  let rhoMax = sorted[iHi]!;
  if (!(rhoMax > rhoMin)) {
    rhoMin = sorted[0]!;
    rhoMax = sorted[sorted.length - 1]!;
  }
  return { rhoMin, rhoMax };
}

export function resolveModelDisplayBounds(
  rhoCells: number[],
  contrast: ModelContrastMode,
  manualRhoMin?: number | null,
  manualRhoMax?: number | null,
): ModelDisplayBounds {
  const positive = rhoCells.filter((v) => v > 0 && Number.isFinite(v));
  if (!positive.length) {
    return {
      logLo: 1,
      logHi: 3,
      rhoMinOhmM: 10,
      rhoMaxOhmM: 1000,
      scaleLabel: "modelo (vazio)",
    };
  }

  if (contrast === "manual" && manualRhoMin != null && manualRhoMax != null) {
    const rhoMin = Math.max(1e-6, manualRhoMin);
    const rhoMax = Math.max(rhoMin * 1.01, manualRhoMax);
    let logLo = Math.log10(rhoMin);
    let logHi = Math.log10(rhoMax);
    if (!(logHi > logLo)) logHi = logLo + 0.15;
    return {
      logLo,
      logHi,
      rhoMinOhmM: rhoMin,
      rhoMaxOhmM: rhoMax,
      scaleLabel: "manual (ρ mín–máx)",
    };
  }

  const sorted = [...positive].sort((a, b) => a - b);

  let rhoMin: number;
  let rhoMax: number;
  let scaleLabel: string;

  switch (contrast) {
    case "minmax":
      rhoMin = sorted[0]!;
      rhoMax = sorted[sorted.length - 1]!;
      scaleLabel = "min–máx do modelo";
      break;
    case "standard":
      ({ rhoMin, rhoMax } = rhoPercentileBounds(positive, 8, 92));
      scaleLabel = "P8–P92 do modelo";
      break;
    case "equalize":
    case "stdstretch":
    case "auto":
      ({ rhoMin, rhoMax } = rhoPercentileBounds(positive, 2, 98));
      scaleLabel = "P2–P98 (legenda)";
      break;
    case "percentile":
    default:
      ({ rhoMin, rhoMax } = rhoPercentileBounds(positive, 5, 95));
      scaleLabel = "P5–P95 do modelo (RES2DINV)";
      break;
  }

  let logLo = Math.log10(Math.max(rhoMin, 1e-6));
  let logHi = Math.log10(Math.max(rhoMax, 1e-6));
  const span = logHi - logLo;
  const pad = Math.max(0.03, span * 0.04);
  logLo -= pad;
  logHi += pad;
  if (!(logHi > logLo)) logHi = logLo + 0.15;

  return {
    logLo,
    logHi,
    rhoMinOhmM: 10 ** logLo,
    rhoMaxOhmM: 10 ** logHi,
    scaleLabel,
  };
}

export type RhoSampleStats = {
  min: number;
  max: number;
  mean: number;
  std: number;
  logSpan: number;
  ratio: number;
};

export function rhoSampleStats(rhoValues: number[]): RhoSampleStats {
  const positive = rhoValues.filter((v) => v > 0 && Number.isFinite(v));
  if (!positive.length) {
    return { min: 1, max: 1, mean: 1, std: 0, logSpan: 0, ratio: 1 };
  }
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  const mean = positive.reduce((a, b) => a + b, 0) / positive.length;
  const variance =
    positive.reduce((a, r) => a + (r - mean) ** 2, 0) / positive.length;
  const std = Math.sqrt(variance);
  const logSpan = Math.log10(max) - Math.log10(min);
  return { min, max, mean, std, logSpan, ratio: max / Math.max(min, 1e-6) };
}

/** Faixa estreita em log₁₀ (ex.: 1900–3000 Ω·m ≈ 0,2 décadas) → paleta fica toda verde. */
export function needsAdaptiveContrast(stats: RhoSampleStats): boolean {
  return stats.logSpan < 0.45 || stats.ratio < 2.2 || stats.std / stats.mean < 0.04;
}

/** Mapeia ρ → t∈[0,1] por histogram equalization (usa toda a paleta). */
export function makeHistogramEqualizeMapper(
  rhoValues: number[],
): (rhoOhmM: number) => number {
  const sorted = rhoValues
    .filter((v) => v > 0 && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length < 2) {
    return () => 0.5;
  }
  return (rhoOhmM: number) => {
    const x = Math.max(rhoOhmM, 1e-12);
    if (x <= sorted[0]!) return 0;
    if (x >= sorted[sorted.length - 1]!) return 1;
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    return clamp01(lo / (sorted.length - 1));
  };
}

/** @deprecated use makeHistogramEqualizeMapper */
export function makeLogHistogramEqualizeMapper(
  rhoValues: number[],
): (rhoOhmM: number) => number {
  return makeHistogramEqualizeMapper(rhoValues);
}

/** Stretch ±n·σ em Ω·m (linear) — bom para faixas altas estreitas. */
export function makeStdStretchMapper(
  rhoValues: number[],
  nSigma = 2,
): (rhoOhmM: number) => number {
  const stats = rhoSampleStats(rhoValues);
  const spread = Math.max(stats.std, stats.mean * 0.02, 1);
  const lo = stats.mean - nSigma * spread;
  const hi = stats.mean + nSigma * spread;
  return (rhoOhmM: number) => clamp01((rhoOhmM - lo) / (hi - lo || 1));
}

export type AdaptiveContrastResult = {
  normalizeRho: (rhoOhmM: number) => number;
  scaleLabel: string;
  displayScale: ModelDisplayScale;
};

/** Escolhe equalização ou stretch σ quando o contraste em log é fraco. */
export function buildAdaptiveContrastMapper(
  rhoValues: number[],
): AdaptiveContrastResult {
  const stats = rhoSampleStats(rhoValues);
  if (needsAdaptiveContrast(stats)) {
    if (stats.std > 0 && stats.max > stats.min) {
      return {
        normalizeRho: makeStdStretchMapper(rhoValues, 2),
        scaleLabel: `auto ±2σ (${stats.min.toFixed(0)}–${stats.max.toFixed(0)} Ω·m)`,
        displayScale: "linear",
      };
    }
    return {
      normalizeRho: makeHistogramEqualizeMapper(rhoValues),
      scaleLabel: "auto equalização",
      displayScale: "log",
    };
  }
  const { rhoMin, rhoMax } = rhoPercentileBounds(rhoValues, 5, 95);
  const logLo = Math.log10(rhoMin);
  const logHi = Math.log10(rhoMax);
  return {
    normalizeRho: (rho) => {
      const logV = Math.log10(Math.max(rho, 1e-12));
      return clamp01((logV - logLo) / (logHi - logLo || 1));
    },
    scaleLabel: "auto P5–P95 log₁₀",
    displayScale: "log",
  };
}

export function rhoToNormalizedLinear(
  rhoOhmM: number,
  rhoMin: number,
  rhoMax: number,
): number {
  return clamp01((rhoOhmM - rhoMin) / (rhoMax - rhoMin || 1));
}

/** Substitui NaN/Inf por média das células finitas (evita canvas vazio). */
export function sanitizeModelLog10(
  mLog: Float64Array,
  fallbackLog10 = 2.3,
): { mLog10: Float64Array; invalidCount: number } {
  const out = new Float64Array(mLog.length);
  let sum = 0;
  let n = 0;
  for (let k = 0; k < mLog.length; k++) {
    const v = mLog[k]!;
    if (Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  const fill = n > 0 ? sum / n : fallbackLog10;
  let invalidCount = 0;
  for (let k = 0; k < mLog.length; k++) {
    const v = mLog[k]!;
    if (Number.isFinite(v)) out[k] = v;
    else {
      out[k] = fill;
      invalidCount++;
    }
  }
  return { mLog10: out, invalidCount };
}

export function validateModelForRender(
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
): string | null {
  if (nx < 1 || nz < 1) {
    return `Malha inválida (${nx}×${nz})`;
  }
  if (mLog.length !== nx * nz) {
    return `Tamanho do modelo (${mLog.length}) ≠ ${nx}×${nz} células`;
  }
  if (xEdges.length < nx + 1 || zEdges.length < nz + 1) {
    return "Arestas da malha incompletas";
  }
  let finite = 0;
  for (let k = 0; k < mLog.length; k++) {
    if (Number.isFinite(mLog[k]!)) finite++;
  }
  if (finite === 0) {
    return "Modelo sem valores finitos (NaN/Inf em todas as células)";
  }
  return null;
}

export function modelStatsFromLog10(mLog: ArrayLike<number>): {
  min: number;
  max: number;
  mean: number;
  std: number;
} {
  const rhos: number[] = [];
  for (let k = 0; k < mLog.length; k++) {
    const v = mLog[k];
    if (v != null && Number.isFinite(v)) rhos.push(10 ** v);
  }
  if (!rhos.length) return { min: 0, max: 0, mean: 0, std: 0 };
  const min = Math.min(...rhos);
  const max = Math.max(...rhos);
  const mean = rhos.reduce((a, b) => a + b, 0) / rhos.length;
  const variance =
    rhos.reduce((a, r) => a + (r - mean) ** 2, 0) / rhos.length;
  return { min, max, mean, std: Math.sqrt(variance) };
}

/** RMS relativo em %: sqrt(mean(((ρ_obs−ρ_syn)/ρ_obs)²))×100 */
export function computeRelativeRmsPercent(
  yObsLog10: ArrayLike<number>,
  ySynLog10: ArrayLike<number>,
): number {
  const n = Math.min(yObsLog10.length, ySynLog10.length);
  if (n < 1) return 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const obs = 10 ** yObsLog10[i]!;
    const syn = 10 ** ySynLog10[i]!;
    const rel = (obs - syn) / Math.max(obs, 1e-6);
    sumSq += rel * rel;
  }
  return Math.sqrt(sumSq / n) * 100;
}
