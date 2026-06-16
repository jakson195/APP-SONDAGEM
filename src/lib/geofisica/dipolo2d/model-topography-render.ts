/**
 * Modelo invertido com topografia (estilo RES2DINV):
 * eixo Y = cota (m), eixo X = distância (topo), secção acompanha o terreno.
 */

import { paletteColor, rhoToNormalized } from "./colormap";
import { quantizeDisplayT } from "./res2dinv-colormap";
import type { ResistivityColorScale } from "./colormap";
import {
  bilinearLogRho,
  cellLogRhoAt,
  smoothLogModelForDisplay,
  zCoverInterpolated,
  type ModelRasterOptions,
} from "./model-section-render";
import { interpolateTopographyAt } from "./parse-topography";
import type { TopographyPoint } from "./topography-types";
import type { Dipolo2DReading } from "./types";

export type TopographyElevBounds = {
  xPlot0: number;
  xPlot1: number;
  elevBottom: number;
  elevTop: number;
};

const SKY_RGB: [number, number, number] = [248, 250, 252];
const MASK_RGB: [number, number, number] = [255, 255, 255];

export function resolveTopographyElevBounds(
  topography: TopographyPoint[],
  x0: number,
  x1: number,
  maxDepthM: number,
): TopographyElevBounds {
  const sorted = [...topography].sort((a, b) => a.stationM - b.stationM);
  const xPlot0 = Math.max(0, Math.min(x0, sorted[0]!.stationM));
  const xPlot1 = Math.max(x1, sorted[sorted.length - 1]!.stationM);
  let elevTop = -Infinity;
  let elevBottom = Infinity;
  const n = Math.max(48, Math.ceil((xPlot1 - xPlot0) / 2));
  for (let s = 0; s <= n; s++) {
    const xm = xPlot0 + ((xPlot1 - xPlot0) * s) / n;
    const surf = interpolateTopographyAt(sorted, xm);
    if (surf == null) continue;
    elevTop = Math.max(elevTop, surf);
    elevBottom = Math.min(elevBottom, surf - maxDepthM);
  }
  if (!Number.isFinite(elevTop) || !Number.isFinite(elevBottom)) {
    elevTop = 100;
    elevBottom = 80;
  }
  const span = Math.max(1, elevTop - elevBottom);
  return {
    xPlot0,
    xPlot1,
    elevBottom: elevBottom - span * 0.02,
    elevTop: elevTop + span * 0.03,
  };
}

export function surfaceElevationAt(
  topography: TopographyPoint[],
  xM: number,
): number | null {
  return interpolateTopographyAt(topography, xM);
}

/** Trapézio de cobertura em coordenadas de cota (topo = terreno). */
export function pathTopographyTrapezoid(
  ctx: CanvasRenderingContext2D,
  topography: TopographyPoint[],
  zCoverProfile: Float64Array | null,
  bounds: TopographyElevBounds,
  x0: number,
  x1: number,
  nx: number,
  zMax: number,
  sx: (x: number) => number,
  syElev: (elev: number) => number,
) {
  const { xPlot0, xPlot1 } = bounds;
  const dx = (x1 - x0) / Math.max(1, nx);
  const steps = Math.max(nx * 3, 48);

  ctx.beginPath();
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const xM = xPlot0 + (xPlot1 - xPlot0) * u;
    const surf = surfaceElevationAt(topography, xM);
    if (surf == null) continue;
    const px = sx(xM);
    const py = syElev(surf);
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let s = steps; s >= 0; s--) {
    const u = s / steps;
    const xM = xPlot0 + (xPlot1 - xPlot0) * u;
    const surf = surfaceElevationAt(topography, xM);
    if (surf == null) continue;
    const zCov =
      zCoverProfile != null
        ? zCoverInterpolated(zCoverProfile, xM, x0, dx, nx)
        : zMax;
    ctx.lineTo(sx(xM), syElev(surf - zCov));
  }
  ctx.closePath();
}

export function strokeTopographySurface(
  ctx: CanvasRenderingContext2D,
  topography: TopographyPoint[],
  bounds: TopographyElevBounds,
  sx: (x: number) => number,
  syElev: (elev: number) => number,
) {
  const { xPlot0, xPlot1 } = bounds;
  const steps = Math.max(120, Math.ceil((xPlot1 - xPlot0) / 2));
  ctx.beginPath();
  let started = false;
  for (let s = 0; s <= steps; s++) {
    const xM = xPlot0 + ((xPlot1 - xPlot0) * s) / steps;
    const surf = surfaceElevationAt(topography, xM);
    if (surf == null) continue;
    const px = sx(xM);
    const py = syElev(surf);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Posições A,B,M,N reconstruídas a partir das leituras dipolo-dipolo. */
export function uniqueElectrodePositionsFromReadings(
  readings: Dipolo2DReading[],
): number[] {
  const set = new Set<number>();
  for (const r of readings) {
    if (r.excluded) continue;
    const a = r.aM;
    const n = r.n;
    if (!(a > 0) || !(n >= 1)) continue;
    const sep = n * a;
    const centerAB = r.stationM - sep / 2;
    const centerMN = r.stationM + sep / 2;
    for (const x of [
      centerAB - a / 2,
      centerAB + a / 2,
      centerMN - a / 2,
      centerMN + a / 2,
    ]) {
      set.add(Math.round(x * 1000) / 1000);
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function drawElectrodeDotsOnSurface(
  ctx: CanvasRenderingContext2D,
  electrodeXM: number[],
  topography: TopographyPoint[],
  sx: (x: number) => number,
  syElev: (elev: number) => number,
) {
  ctx.fillStyle = "#111827";
  for (const xM of electrodeXM) {
    const surf = surfaceElevationAt(topography, xM);
    if (surf == null) continue;
    const px = sx(xM);
    const py = syElev(surf);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function rasterizeModelWithTopography(
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  widthPx: number,
  heightPx: number,
  topography: TopographyPoint[],
  bounds: TopographyElevBounds,
  opts: ModelRasterOptions & {
    zCoverProfile?: Float64Array | null;
    useCoverageMask?: boolean;
  },
): Uint8ClampedArray {
  const w = Math.max(2, Math.floor(widthPx));
  const h = Math.max(2, Math.floor(heightPx));
  const rgba = new Uint8ClampedArray(w * h * 4);

  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z1 = zEdges[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = z1 / Math.max(1, nz);

  const { xPlot0, xPlot1, elevBottom, elevTop } = bounds;
  const elevSpan = Math.max(1e-6, elevTop - elevBottom);

  const smoothPasses = opts.displaySmoothPasses ?? 0;
  const smoothed =
    smoothPasses > 0
      ? smoothLogModelForDisplay(mLog, nx, nz, smoothPasses)
      : mLog;

  const levels = Math.max(8, opts.colorLevels ?? 24);
  const { logLo, logHi } = opts;
  const zCoverProfile = opts.zCoverProfile ?? null;
  const useCoverage = opts.useCoverageMask ?? false;

  for (let py = 0; py < h; py++) {
    const elevM = elevTop - ((py + 0.5) / h) * elevSpan;

    for (let px = 0; px < w; px++) {
      const xM = xPlot0 + ((px + 0.5) / w) * (xPlot1 - xPlot0);
      const o = (py * w + px) * 4;
      const surf = surfaceElevationAt(topography, xM);

      if (surf == null) {
        rgba[o] = MASK_RGB[0]!;
        rgba[o + 1] = MASK_RGB[1]!;
        rgba[o + 2] = MASK_RGB[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const depth = surf - elevM;

      if (depth < 0) {
        rgba[o] = SKY_RGB[0]!;
        rgba[o + 1] = SKY_RGB[1]!;
        rgba[o + 2] = SKY_RGB[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const zCov =
        useCoverage && zCoverProfile != null
          ? zCoverInterpolated(zCoverProfile, xM, x0, dx, nx)
          : z1;

      if (depth > zCov + dz * 0.15) {
        rgba[o] = MASK_RGB[0]!;
        rgba[o + 1] = MASK_RGB[1]!;
        rgba[o + 2] = MASK_RGB[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      if (xM < x0 - dx * 0.5 || xM > x1 + dx * 0.5 || depth > z1 + dz * 0.5) {
        rgba[o] = MASK_RGB[0]!;
        rgba[o + 1] = MASK_RGB[1]!;
        rgba[o + 2] = MASK_RGB[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const fi = (xM - x0) / dx - 0.5;
      const fj = depth / dz - 0.5;

      if (fi < -0.5 || fi > nx - 0.5 || fj < -0.5 || fj > nz - 0.5) {
        rgba[o] = MASK_RGB[0]!;
        rgba[o + 1] = MASK_RGB[1]!;
        rgba[o + 2] = MASK_RGB[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const logR =
        (opts.renderMode ?? "cells") === "cells"
          ? cellLogRhoAt(smoothed, nx, nz, fi, fj)
          : bilinearLogRho(smoothed, nx, nz, fi, fj);
      const rho = 10 ** logR;
      const tRaw = opts.normalizeRho
        ? opts.normalizeRho(rho)
        : rhoToNormalized(rho, logLo, logHi);
      const t = quantizeDisplayT(tRaw, levels);
      const [r, g, b] = paletteColor(opts.colorScale.palette, t);
      rgba[o] = r | 0;
      rgba[o + 1] = g | 0;
      rgba[o + 2] = b | 0;
      rgba[o + 3] = 255;
    }
  }

  return rgba;
}

export function formatElevTick(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

export function formatDistTick(v: number): string {
  if (v >= 100) return v.toFixed(0);
  return v.toFixed(1);
}
