/**
 * Renderização do modelo invertido estilo RES2DINV:
 * suavização leve em log₁₀(ρ), amostragem bilinear e quantização em níveis discretos.
 */

import { paletteColor, rhoToNormalized } from "./colormap";
import type { ResistivityColorScale } from "./colormap";
import type { Dipolo2DReading } from "./types";

// Ganho visual da cobertura para "abrir" mais o trapézio.
const COVERAGE_DEPTH_GAIN = 1.22;

function maxPseudoDepthAtX(
  readings: Dipolo2DReading[],
  xCenter: number,
  halfWidth: number,
  factorDepth: number,
  zLimit: number,
): number {
  let zMax = 0;
  for (const r of readings) {
    if (Math.abs(r.stationM - xCenter) > halfWidth) continue;
    zMax = Math.max(zMax, factorDepth * r.n * r.aM * COVERAGE_DEPTH_GAIN);
  }
  return Math.min(zLimit, zMax);
}

/**
 * Profundidade de cobertura por coluna, com janela ampla e interpolação nos vazios
 * (evita faixas brancas verticais entre estações dipolo-dipolo).
 */
export function buildModelZCoverProfile(
  readings: Dipolo2DReading[],
  x0: number,
  x1: number,
  nx: number,
  zMax: number,
  factorDepth: number,
): Float64Array {
  const dx = (x1 - x0) / Math.max(1, nx);
  const stations = [...readings.map((r) => r.stationM)].sort((a, b) => a - b);
  let meanSpacing = dx * 2;
  if (stations.length > 1) {
    let span = 0;
    for (let k = 1; k < stations.length; k++) span += stations[k]! - stations[k - 1]!;
    meanSpacing = span / (stations.length - 1);
  }
  const halfWidth = Math.max(dx * 2.5, meanSpacing * 1.1);

  const raw = new Float64Array(nx);
  for (let i = 0; i < nx; i++) {
    const xc = x0 + (i + 0.5) * dx;
    raw[i] = maxPseudoDepthAtX(readings, xc, halfWidth, factorDepth, zMax);
  }

  for (let i = 0; i < nx; i++) {
    if (raw[i]! > 0) continue;
    let lo = -1;
    let hi = -1;
    for (let k = i - 1; k >= 0; k--) {
      if (raw[k]! > 0) {
        lo = k;
        break;
      }
    }
    for (let k = i + 1; k < nx; k++) {
      if (raw[k]! > 0) {
        hi = k;
        break;
      }
    }
    if (lo >= 0 && hi >= 0) {
      raw[i] = raw[lo]! + ((raw[hi]! - raw[lo]!) * (i - lo)) / (hi - lo);
    } else if (lo >= 0) {
      raw[i] = raw[lo]!;
    } else if (hi >= 0) {
      raw[i] = raw[hi]!;
    } else {
      raw[i] = zMax;
    }
  }

  const smooth = Float64Array.from(raw);
  for (let i = 1; i < nx - 1; i++) {
    smooth[i] = (raw[i - 1]! + raw[i]! * 2 + raw[i + 1]!) / 4;
  }
  return smooth;
}

export function zCoverInterpolated(
  profile: Float64Array,
  xM: number,
  x0: number,
  dx: number,
  nx: number,
): number {
  const fi = (xM - x0) / dx - 0.5;
  const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
  const i1 = Math.min(nx - 1, i0 + 1);
  const t = Math.max(0, Math.min(1, fi - i0));
  return profile[i0]! * (1 - t) + profile[i1]! * t;
}

function idx(i: number, j: number, nz: number) {
  return i * nz + j;
}

/** Suavização Laplaciana leve só para exibição (não altera dados exportados). */
export function smoothLogModelForDisplay(
  mLog: Float64Array,
  nx: number,
  nz: number,
  passes = 2,
  alpha = 0.24,
): Float64Array {
  let cur = Float64Array.from(mLog);
  let next = new Float64Array(cur.length);
  const a = Math.max(0, Math.min(0.45, alpha));

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const u = idx(i, j, nz);
        let sum = 0;
        let n = 0;
        if (i > 0) {
          sum += cur[idx(i - 1, j, nz)]!;
          n++;
        }
        if (i + 1 < nx) {
          sum += cur[idx(i + 1, j, nz)]!;
          n++;
        }
        if (j > 0) {
          sum += cur[idx(i, j - 1, nz)]!;
          n++;
        }
        if (j + 1 < nz) {
          sum += cur[idx(i, j + 1, nz)]!;
          n++;
        }
        const avg = n > 0 ? sum / n : cur[u]!;
        next[u] = cur[u]! * (1 - a) + avg * a;
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }
  return cur;
}

/** log₁₀(ρ) em coordenadas contínuas de célula (0 = centro da célula 0). */
export function bilinearLogRho(
  mLog: Float64Array,
  nx: number,
  nz: number,
  fi: number,
  fj: number,
): number {
  const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(nz - 1, Math.floor(fj)));
  const i1 = Math.min(nx - 1, i0 + 1);
  const j1 = Math.min(nz - 1, j0 + 1);
  const tx = fi - i0;
  const ty = fj - j0;

  const v00 = mLog[idx(i0, j0, nz)]!;
  const v10 = mLog[idx(i1, j0, nz)]!;
  const v01 = mLog[idx(i0, j1, nz)]!;
  const v11 = mLog[idx(i1, j1, nz)]!;

  const v0 = v00 * (1 - tx) + v10 * tx;
  const v1 = v01 * (1 - tx) + v11 * tx;
  return v0 * (1 - ty) + v1 * ty;
}

export type ModelRasterMask = {
  isVisible: (xM: number, zM: number) => boolean;
};

export type ModelRasterOptions = {
  logLo: number;
  logHi: number;
  colorScale: ResistivityColorScale;
  /** Níveis discretos na barra (estilo RES2DINV). */
  colorLevels?: number;
  displaySmoothPasses?: number;
  mask?: ModelRasterMask;
  /** Cor de fundo fora da máscara [r,g,b]. */
  maskRgb?: [number, number, number];
  /**
   * full = malha invertida completa (sem trapézio);
   * coverage = limita profundidade pela cobertura das leituras (suavizada).
   */
  maskMode?: "full" | "coverage";
};

/**
 * Gera RGBA para a área do modelo (interpolação bilinear + quantização por nível).
 */
export function rasterizeModelSection(
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  widthPx: number,
  heightPx: number,
  opts: ModelRasterOptions,
): Uint8ClampedArray {
  const w = Math.max(2, Math.floor(widthPx));
  const h = Math.max(2, Math.floor(heightPx));
  const rgba = new Uint8ClampedArray(w * h * 4);

  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z0 = zEdges[0]!;
  const z1 = zEdges[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = (z1 - z0) / Math.max(1, nz);

  const smoothPasses = opts.displaySmoothPasses ?? 2;
  const smoothed =
    smoothPasses > 0
      ? smoothLogModelForDisplay(mLog, nx, nz, smoothPasses)
      : mLog;

  const levels = Math.max(8, opts.colorLevels ?? 24);
  const maskRgb = opts.maskRgb ?? [248, 250, 252];
  const { logLo, logHi } = opts;

  for (let py = 0; py < h; py++) {
    const zM = z0 + ((py + 0.5) / h) * (z1 - z0);
    const fj = zM / dz - 0.5;

    for (let px = 0; px < w; px++) {
      const xM = x0 + ((px + 0.5) / w) * (x1 - x0);
      const fi = (xM - x0) / dx - 0.5;
      const o = (py * w + px) * 4;

      if (
        opts.maskMode !== "full" &&
        opts.mask &&
        !opts.mask.isVisible(xM, zM)
      ) {
        rgba[o] = maskRgb[0]!;
        rgba[o + 1] = maskRgb[1]!;
        rgba[o + 2] = maskRgb[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const logR = bilinearLogRho(smoothed, nx, nz, fi, fj);
      const rho = 10 ** logR;
      const tRaw = rhoToNormalized(rho, logLo, logHi);
      const t = Math.round(tRaw * (levels - 1)) / Math.max(1, levels - 1);
      const [r, g, b] = paletteColor(opts.colorScale.palette, t);
      rgba[o] = r | 0;
      rgba[o + 1] = g | 0;
      rgba[o + 2] = b | 0;
      rgba[o + 3] = 255;
    }
  }

  return rgba;
}
