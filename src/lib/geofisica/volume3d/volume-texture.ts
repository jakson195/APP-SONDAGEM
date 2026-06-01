/**
 * Converte fatia ou secção em ImageData RGBA para textura Three.js.
 */

import {
  applyLogBoundsScale,
  defaultColorScale,
  paletteColor,
  resolveLogBounds,
  rhoToNormalized,
  type ResistivityColorScale,
} from "../dipolo2d/colormap";
import type { VolumeRhoFilter } from "./volume-rho-filter";
import { logRhoInFilter } from "./volume-rho-filter";
import type { Dipolo2DInvertResult } from "../dipolo2d/types";
import { resolveModelLogBounds } from "../dipolo2d/dipolo-pseudo-draw";
import { rasterizeModelSection } from "../dipolo2d/model-section-render";
import type { ResistivityVolume3D } from "./volume3d-types";

/** Resolução da textura 3D alinhada à malha invertida (como no canvas 2D). */
export function sectionTextureDimensions(result: Dipolo2DInvertResult): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(64, result.nx * 8),
    height: Math.max(64, result.nz * 8),
  };
}

export function sliceToRgba(
  slice: Float32Array,
  nx: number,
  ny: number,
  colorScale: ResistivityColorScale = defaultColorScale,
  rhoFilter?: VolumeRhoFilter,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(nx * ny * 4);
  const valid = slice.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return rgba;

  const logLo = Math.min(...valid);
  const logHi = Math.max(...valid);
  const { logLo: lo, logHi: hi } = applyLogBoundsScale(logLo, logHi, colorScale);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = slice[i + j * nx]!;
      const o = (j * nx + i) * 4;
      if (!Number.isFinite(v)) {
        rgba[o + 3] = 0;
        continue;
      }
      if (rhoFilter && !logRhoInFilter(v, rhoFilter)) {
        rgba[o + 3] = 0;
        continue;
      }
      const rho = 10 ** v;
      const t = rhoToNormalized(rho, lo, hi);
      const [r, g, b] = paletteColor(colorScale.palette, t);
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 220;
    }
  }
  return rgba;
}

/** Textura RGBA da secção — mesma lógica do perfil 2D (P8–P92, 24 níveis). */
export function sectionToRgba(
  result: Dipolo2DInvertResult,
  widthPx?: number,
  heightPx?: number,
  colorScale: ResistivityColorScale = defaultColorScale,
): Uint8ClampedArray {
  const { mLog10, nx, nz, xEdgesM, zEdgesM } = result;
  const dims = sectionTextureDimensions(result);
  const w = Math.max(2, widthPx ?? dims.width);
  const h = Math.max(2, heightPx ?? dims.height);

  const allRhos = Array.from(mLog10, (v) => 10 ** v).filter(Number.isFinite);
  const modelBounds = resolveModelLogBounds(allRhos);
  const { logLo, logHi } = colorScale.auto
    ? { logLo: modelBounds.logLo, logHi: modelBounds.logHi }
    : resolveLogBounds(allRhos, colorScale);

  return rasterizeModelSection(
    mLog10,
    nx,
    nz,
    xEdgesM,
    zEdgesM,
    w,
    h,
    {
      logLo,
      logHi,
      colorScale,
      colorLevels: 24,
      displaySmoothPasses: 2,
      maskMode: "full",
    },
  );
}

export function rgbaToDataTextureSource(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  return { data: rgba, width, height };
}

export function volumeDepthIndex(volume: ResistivityVolume3D, depthM: number): number {
  const k = Math.floor(depthM / volume.cellSizeM.z);
  return Math.max(0, Math.min(volume.nz - 1, k));
}
