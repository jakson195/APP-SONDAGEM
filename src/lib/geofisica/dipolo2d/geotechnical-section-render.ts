/**
 * Renderização suave da secção interpretativa (trapézio + classes por ρ).
 */

import {
  bilinearLogRho,
  buildModelZCoverProfile,
  smoothLogModelForDisplay,
  zCoverInterpolated,
} from "./model-section-render";
import {
  classifyRhoOhmM,
  type ResistivityNormProfile,
} from "./resistivity-norms-br";
import type { Dipolo2DReading } from "./types";

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return [148, 163, 184];
}

export type GeotechRasterResult = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  classMap: Uint8Array;
};

/**
 * Secção interpretativa rasterizada: ρ suavizada → classe geotécnica, trapézio de cobertura.
 */
export function rasterizeGeotechnicalSection(
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  widthPx: number,
  heightPx: number,
  norm: ResistivityNormProfile,
  readings: Dipolo2DReading[],
  factorDepth: number,
): GeotechRasterResult {
  const w = Math.max(2, Math.floor(widthPx));
  const h = Math.max(2, Math.floor(heightPx));
  const rgba = new Uint8ClampedArray(w * h * 4);
  const classMap = new Uint8Array(w * h);

  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z0 = zEdges[0]!;
  const z1 = zEdges[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = (z1 - z0) / Math.max(1, nz);

  const classRgb = norm.classes.map((c) => parseHexColor(c.cor));
  const maskRgb: [number, number, number] = [255, 255, 255];

  const zCoverProfile =
    readings.length > 0
      ? buildModelZCoverProfile(readings, x0, x1, nx, z1, factorDepth)
      : null;

  const smoothed = smoothLogModelForDisplay(mLog, nx, nz, 3, 0.3);

  for (let py = 0; py < h; py++) {
    const zM = z0 + ((py + 0.5) / h) * (z1 - z0);
    const fj = (zM - z0) / dz - 0.5;

    for (let px = 0; px < w; px++) {
      const xM = x0 + ((px + 0.5) / w) * (x1 - x0);
      const fi = (xM - x0) / dx - 0.5;
      const o = (py * w + px) * 4;
      const ci = py * w + px;

      if (zCoverProfile) {
        const zCov = zCoverInterpolated(zCoverProfile, xM, x0, dx, nx);
        if (zM > zCov + dz * 0.2) {
          rgba[o] = maskRgb[0]!;
          rgba[o + 1] = maskRgb[1]!;
          rgba[o + 2] = maskRgb[2]!;
          rgba[o + 3] = 255;
          classMap[ci] = 255;
          continue;
        }
      }

      const logR = bilinearLogRho(smoothed, nx, nz, fi, fj);
      const rho = 10 ** logR;
      const band = classifyRhoOhmM(rho, norm);
      const classIdx = norm.classes.findIndex((c) => c.id === band.id);
      const idx = classIdx >= 0 ? classIdx : 0;
      classMap[ci] = idx;

      const [r, g, b] = classRgb[idx] ?? classRgb[0]!;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }

  applySmoothContactLines(rgba, classMap, w, h, 0.35);

  return { rgba, width: w, height: h, classMap };
}

/** Contatos finos e suaves entre classes (sem grelha de células). */
function applySmoothContactLines(
  rgba: Uint8ClampedArray,
  classMap: Uint8Array,
  w: number,
  h: number,
  blend = 0.72,
) {
  const stroke = [17, 24, 39] as const;

  for (let py = 0; py < h - 1; py++) {
    for (let px = 0; px < w - 1; px++) {
      const i = py * w + px;
      const a = classMap[i]!;
      if (a === 255) continue;
      const right = classMap[i + 1]!;
      const down = classMap[i + w]!;
      if (right !== 255 && right !== a) {
        for (const k of [i, i + 1]) {
          const o = k * 4;
          rgba[o] = (rgba[o]! * (1 - blend) + stroke[0] * blend) | 0;
          rgba[o + 1] = (rgba[o + 1]! * (1 - blend) + stroke[1] * blend) | 0;
          rgba[o + 2] = (rgba[o + 2]! * (1 - blend) + stroke[2] * blend) | 0;
        }
      }
      if (down !== 255 && down !== a) {
        for (const k of [i, i + w]) {
          const o = k * 4;
          rgba[o] = (rgba[o]! * (1 - blend) + stroke[0] * blend) | 0;
          rgba[o + 1] = (rgba[o + 1]! * (1 - blend) + stroke[1] * blend) | 0;
          rgba[o + 2] = (rgba[o + 2]! * (1 - blend) + stroke[2] * blend) | 0;
        }
      }
    }
  }
}

/** Caminho do trapézio de cobertura (superfície → profundidade máxima por x). */
export function pathTrapezoidCoverage(
  ctx: CanvasRenderingContext2D,
  zCoverProfile: Float64Array,
  x0: number,
  x1: number,
  nx: number,
  z0: number,
  sx: (x: number) => number,
  sy: (z: number) => number,
) {
  const dx = (x1 - x0) / Math.max(1, nx);
  ctx.beginPath();
  ctx.moveTo(sx(x0), sy(z0));
  ctx.lineTo(sx(x1), sy(z0));
  const steps = Math.max(nx * 3, 32);
  for (let s = steps; s >= 0; s--) {
    const u = s / steps;
    const xM = x0 + (x1 - x0) * u;
    const zCov = zCoverInterpolated(zCoverProfile, xM, x0, dx, nx);
    ctx.lineTo(sx(xM), sy(zCov));
  }
  ctx.closePath();
}

/** Contorno do trapézio de cobertura (estilo pseudoseção). */
export function strokeTrapezoidCoverage(
  ctx: CanvasRenderingContext2D,
  zCoverProfile: Float64Array,
  x0: number,
  x1: number,
  nx: number,
  z0: number,
  sx: (x: number) => number,
  sy: (z: number) => number,
) {
  pathTrapezoidCoverage(ctx, zCoverProfile, x0, x1, nx, z0, sx, sy);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function sampleLayerAt(
  layerId: Int32Array,
  nx: number,
  nz: number,
  fi: number,
  fj: number,
): number {
  const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
  const i1 = Math.min(nx - 1, i0 + 1);
  const j0 = Math.max(0, Math.min(nz - 1, Math.floor(fj)));
  const j1 = Math.min(nz - 1, j0 + 1);
  const tx = Math.max(0, Math.min(1, fi - i0));
  const ty = Math.max(0, Math.min(1, fj - j0));

  const votes = new Map<number, number>();
  const corners: [number, number, number][] = [
    [i0, j0, (1 - tx) * (1 - ty)],
    [i1, j0, tx * (1 - ty)],
    [i0, j1, (1 - tx) * ty],
    [i1, j1, tx * ty],
  ];
  for (const [i, j, w] of corners) {
    const lid = layerId[i * nz + j]!;
    if (lid < 0) continue;
    votes.set(lid, (votes.get(lid) ?? 0) + w);
  }
  let best = -1;
  let bestW = 0;
  for (const [lid, w] of votes) {
    if (w > bestW) {
      bestW = w;
      best = lid;
    }
  }
  if (best >= 0) return best;
  return layerId[i0 * nz + j0]! >= 0 ? layerId[i0 * nz + j0]! : 0;
}

/**
 * Rasteriza a malha interpretativa (layerGrid) com amostragem suave — sem máscara branca interna.
 */
export function rasterizeLayerGridSection(
  layerId: Int32Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  widthPx: number,
  heightPx: number,
  classColors: [number, number, number][],
): GeotechRasterResult {
  const w = Math.max(2, Math.floor(widthPx));
  const h = Math.max(2, Math.floor(heightPx));
  const rgba = new Uint8ClampedArray(w * h * 4);
  const classMap = new Uint8Array(w * h);

  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z0 = zEdges[0]!;
  const z1 = zEdges[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = (z1 - z0) / Math.max(1, nz);

  for (let py = 0; py < h; py++) {
    const zM = z0 + ((py + 0.5) / h) * (z1 - z0);
    const fj = (zM - z0) / dz - 0.5;

    for (let px = 0; px < w; px++) {
      const xM = x0 + ((px + 0.5) / w) * (x1 - x0);
      const fi = (xM - x0) / dx - 0.5;
      const o = (py * w + px) * 4;
      const ci = py * w + px;

      const lid = sampleLayerAt(layerId, nx, nz, fi, fj);
      classMap[ci] = lid >= 0 ? lid : 255;
      if (lid < 0) {
        rgba[o] = 255;
        rgba[o + 1] = 255;
        rgba[o + 2] = 255;
        rgba[o + 3] = 255;
        continue;
      }

      const [r, g, b] = classColors[lid] ?? classColors[0]!;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }

  applySmoothContactLines(rgba, classMap, w, h, 0.12);

  return { rgba, width: w, height: h, classMap };
}
