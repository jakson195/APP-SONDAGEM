/**
 * Fatias verticais e estatísticas do volume voxel.
 */

import type { ResistivityVolume3D } from "./volume3d-types";

function volumeIndex(
  i: number,
  j: number,
  k: number,
  nx: number,
  ny: number,
): number {
  return i + j * nx + k * nx * ny;
}

/** Fatia vertical constante-X (índice i). */
export function extractVerticalSliceX(
  volume: ResistivityVolume3D,
  indexI: number,
): Float32Array {
  const { nx, ny, nz, logRho } = volume;
  const i = Math.max(0, Math.min(nx - 1, indexI));
  const slice = new Float32Array(ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      slice[j + k * ny] = logRho[volumeIndex(i, j, k, nx, ny)] ?? NaN;
    }
  }
  return slice;
}

/** Fatia vertical constante-Y (índice j). */
export function extractVerticalSliceY(
  volume: ResistivityVolume3D,
  indexJ: number,
): Float32Array {
  const { nx, ny, nz, logRho } = volume;
  const j = Math.max(0, Math.min(ny - 1, indexJ));
  const slice = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      slice[i + k * nx] = logRho[volumeIndex(i, j, k, nx, ny)] ?? NaN;
    }
  }
  return slice;
}

export function volumeLogRhoStats(volume: ResistivityVolume3D): {
  min: number;
  max: number;
  mean: number;
  p10: number;
  p90: number;
} | null {
  const valid = [...volume.logRho].filter(Number.isFinite);
  if (valid.length === 0) return null;
  valid.sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    min: valid[0]!,
    max: valid[valid.length - 1]!,
    mean: sum / valid.length,
    p10: valid[Math.floor(valid.length * 0.1)]!,
    p90: valid[Math.floor(valid.length * 0.9)]!,
  };
}

export function worldXToIndex(volume: ResistivityVolume3D, xM: number): number {
  const { boundsM, nx } = volume;
  const t = (xM - boundsM.minX) / (boundsM.maxX - boundsM.minX);
  return Math.max(0, Math.min(nx - 1, Math.floor(t * nx)));
}

export function worldYToIndex(volume: ResistivityVolume3D, yM: number): number {
  const { boundsM, ny } = volume;
  const t = (yM - boundsM.minY) / (boundsM.maxY - boundsM.minY);
  return Math.max(0, Math.min(ny - 1, Math.floor(t * ny)));
}

export function indexToWorldX(volume: ResistivityVolume3D, i: number): number {
  return volume.boundsM.minX + (i + 0.5) * volume.cellSizeM.x;
}

export function indexToWorldY(volume: ResistivityVolume3D, j: number): number {
  return volume.boundsM.minY + (j + 0.5) * volume.cellSizeM.y;
}
